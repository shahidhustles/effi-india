create or replace function public.create_complaint_ticket(complaint_payload jsonb)
returns table (complaint_id uuid, ticket_number text)
language plpgsql
set search_path = public
as $$
declare
  inserted_complaint_id uuid;
  inserted_ticket_number text;
  transcript_turn jsonb;
  turn_ordinal integer;
begin
  insert into public.complaints as c (
    ticket_number,
    category,
    problem_type,
    description,
    summary,
    caller_name,
    language,
    status
  )
  values (
    complaint_payload->>'ticket_number',
    complaint_payload->>'category',
    complaint_payload->>'problem_type',
    complaint_payload->>'description',
    complaint_payload->>'summary',
    complaint_payload->>'caller_name',
    complaint_payload->>'language',
    coalesce(complaint_payload->>'status', 'open')
  )
  returning c.id, c.ticket_number
  into inserted_complaint_id, inserted_ticket_number;

  insert into public.complaint_locations (
    complaint_id,
    latitude,
    longitude,
    accuracy,
    altitude,
    altitude_accuracy,
    heading,
    speed,
    captured_at,
    mocked,
    raw_payload
  )
  values (
    inserted_complaint_id,
    (complaint_payload->'location'->'coords'->>'latitude')::double precision,
    (complaint_payload->'location'->'coords'->>'longitude')::double precision,
    nullif(complaint_payload->'location'->'coords'->>'accuracy', '')::double precision,
    nullif(complaint_payload->'location'->'coords'->>'altitude', '')::double precision,
    nullif(complaint_payload->'location'->'coords'->>'altitudeAccuracy', '')::double precision,
    nullif(complaint_payload->'location'->'coords'->>'heading', '')::double precision,
    nullif(complaint_payload->'location'->'coords'->>'speed', '')::double precision,
    to_timestamp(((complaint_payload->'location'->>'timestamp')::double precision) / 1000.0),
    case
      when complaint_payload->'location' ? 'mocked'
        then (complaint_payload->'location'->>'mocked')::boolean
      else null
    end,
    coalesce(complaint_payload->'location', '{}'::jsonb)
  );

  if nullif(complaint_payload->>'photo_url', '') is not null then
    insert into public.complaint_evidence (
      complaint_id,
      evidence_type,
      public_url,
      storage_bucket,
      storage_path
    )
    values (
      inserted_complaint_id,
      'photo',
      complaint_payload->>'photo_url',
      complaint_payload->>'storage_bucket',
      complaint_payload->>'storage_path'
    );
  end if;

  if jsonb_typeof(complaint_payload->'transcript_turns') = 'array' then
    for transcript_turn, turn_ordinal in
      select value, ordinality::integer
      from jsonb_array_elements(complaint_payload->'transcript_turns') with ordinality
    loop
      insert into public.complaint_transcript_turns (
        complaint_id,
        turn_index,
        speaker,
        content,
        raw_payload
      )
      values (
        inserted_complaint_id,
        coalesce((transcript_turn->>'turn_index')::integer, turn_ordinal - 1),
        coalesce(transcript_turn->>'speaker', 'unknown'),
        coalesce(transcript_turn->>'content', ''),
        coalesce(transcript_turn->'raw_payload', transcript_turn)
      );
    end loop;
  end if;

  complaint_id := inserted_complaint_id;
  ticket_number := inserted_ticket_number;
  return next;
end;
$$;
