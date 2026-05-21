alter table if exists public.complaints
rename to complaints_legacy;

drop table if exists public.complaint_transcript_turns cascade;
drop table if exists public.complaint_evidence cascade;
drop table if exists public.complaint_locations cascade;

create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique,
  category text not null,
  problem_type text not null,
  description text not null,
  summary text not null,
  caller_name text null,
  language text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint complaints_category_check check (category in ('SANITATION', 'POTHOLE', 'POWER_OUTAGE')),
  constraint complaints_status_check check (status in ('open', 'in_progress', 'resolved'))
);

create table public.complaint_locations (
  complaint_id uuid primary key references public.complaints(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  accuracy double precision null,
  altitude double precision null,
  altitude_accuracy double precision null,
  heading double precision null,
  speed double precision null,
  captured_at timestamptz not null,
  mocked boolean null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.complaint_evidence (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  evidence_type text not null default 'photo',
  public_url text not null,
  storage_bucket text null,
  storage_path text null,
  created_at timestamptz not null default now(),
  constraint complaint_evidence_type_check check (evidence_type in ('photo')),
  constraint complaint_evidence_one_photo_per_complaint unique (complaint_id, evidence_type)
);

create table public.complaint_transcript_turns (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  turn_index integer not null,
  speaker text not null,
  content text not null default '',
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint complaint_transcript_turns_speaker_check check (speaker in ('citizen', 'agent', 'system', 'tool', 'unknown')),
  constraint complaint_transcript_turns_unique_turn unique (complaint_id, turn_index)
);

create index complaints_v2_created_at_idx
  on public.complaints (created_at desc);

create index complaints_v2_category_created_at_idx
  on public.complaints (category, created_at desc);

create index complaints_v2_status_created_at_idx
  on public.complaints (status, created_at desc);

create index complaint_evidence_complaint_id_idx
  on public.complaint_evidence (complaint_id);

create index complaint_transcript_turns_complaint_turn_idx
  on public.complaint_transcript_turns (complaint_id, turn_index);

drop trigger if exists complaints_set_updated_at on public.complaints;
create trigger complaints_set_updated_at
before update on public.complaints
for each row
execute function public.set_updated_at();

alter table public.complaints enable row level security;
alter table public.complaint_locations enable row level security;
alter table public.complaint_evidence enable row level security;
alter table public.complaint_transcript_turns enable row level security;

drop policy if exists "No public complaint access during phase 1" on public.complaints;
create policy "No public complaint access during phase 1"
on public.complaints
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "No public complaint location access during phase 1" on public.complaint_locations;
create policy "No public complaint location access during phase 1"
on public.complaint_locations
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "No public complaint evidence access during phase 1" on public.complaint_evidence;
create policy "No public complaint evidence access during phase 1"
on public.complaint_evidence
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "No public complaint transcript access during phase 1" on public.complaint_transcript_turns;
create policy "No public complaint transcript access during phase 1"
on public.complaint_transcript_turns
for all
to anon, authenticated
using (false)
with check (false);

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

insert into public.complaints (
  id,
  ticket_number,
  category,
  problem_type,
  description,
  summary,
  caller_name,
  language,
  status,
  created_at,
  updated_at
)
select
  id,
  ticket_number,
  category,
  problem_type,
  description,
  summary,
  caller_name,
  language,
  status,
  created_at,
  updated_at
from public.complaints_legacy
on conflict (id) do nothing;

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
  raw_payload,
  created_at
)
select
  id,
  latitude,
  longitude,
  location_accuracy,
  altitude,
  altitude_accuracy,
  heading,
  speed,
  to_timestamp(location_timestamp::double precision / 1000.0),
  location_mocked,
  jsonb_build_object(
    'coords',
    jsonb_build_object(
      'latitude', latitude,
      'longitude', longitude,
      'accuracy', location_accuracy,
      'altitude', altitude,
      'altitudeAccuracy', altitude_accuracy,
      'heading', heading,
      'speed', speed
    ),
    'timestamp', location_timestamp,
    'mocked', location_mocked
  ),
  created_at
from public.complaints_legacy
on conflict (complaint_id) do nothing;

insert into public.complaint_evidence (
  complaint_id,
  evidence_type,
  public_url,
  created_at
)
select
  id,
  'photo',
  photo_url,
  created_at
from public.complaints_legacy
where photo_url is not null
on conflict (complaint_id, evidence_type) do nothing;

insert into public.complaint_transcript_turns (
  complaint_id,
  turn_index,
  speaker,
  content,
  raw_payload,
  created_at
)
select
  legacy.id,
  transcript_item.ordinality::integer - 1,
  case
    when transcript_item.value->>'role' = 'user' then 'citizen'
    when transcript_item.value->>'role' = 'assistant' then 'agent'
    when transcript_item.value->>'role' = 'system' then 'system'
    else 'unknown'
  end,
  coalesce(
    transcript_item.value->>'text',
    transcript_item.value->>'transcript',
    ''
  ),
  transcript_item.value,
  legacy.created_at
from public.complaints_legacy legacy
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(legacy.transcript) = 'array' then legacy.transcript
    else '[]'::jsonb
  end
) with ordinality as transcript_item(value, ordinality)
on conflict (complaint_id, turn_index) do nothing;

drop table if exists public.complaints_legacy cascade;
