create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text null,
  avatar_url text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

alter table public.profiles enable row level security;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    avatar_url = excluded.avatar_url,
    updated_at = now();

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

insert into public.profiles (id, full_name, avatar_url)
select
  users.id,
  coalesce(users.raw_user_meta_data->>'full_name', users.raw_user_meta_data->>'name'),
  users.raw_user_meta_data->>'avatar_url'
from auth.users as users
on conflict (id) do update
set
  full_name = excluded.full_name,
  avatar_url = excluded.avatar_url,
  updated_at = now();

alter table public.complaints
add column if not exists user_id uuid null references public.profiles(id) on delete set null;

create index if not exists complaints_user_id_created_at_idx
  on public.complaints (user_id, created_at desc);

drop policy if exists "No public complaint access during phase 1" on public.complaints;
drop policy if exists "No public complaint location access during phase 1" on public.complaint_locations;
drop policy if exists "No public complaint evidence access during phase 1" on public.complaint_evidence;
drop policy if exists "No public complaint transcript access during phase 1" on public.complaint_transcript_turns;

drop policy if exists "Profiles are viewable by owner" on public.profiles;
create policy "Profiles are viewable by owner"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "Profiles can be inserted by owner" on public.profiles;
create policy "Profiles can be inserted by owner"
on public.profiles
for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "Profiles can be updated by owner" on public.profiles;
create policy "Profiles can be updated by owner"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "Users can view own complaints" on public.complaints;
create policy "Users can view own complaints"
on public.complaints
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can view own complaint locations" on public.complaint_locations;
create policy "Users can view own complaint locations"
on public.complaint_locations
for select
to authenticated
using (
  exists (
    select 1
    from public.complaints
    where complaints.id = complaint_locations.complaint_id
      and complaints.user_id = (select auth.uid())
  )
);

drop policy if exists "Users can view own complaint evidence" on public.complaint_evidence;
create policy "Users can view own complaint evidence"
on public.complaint_evidence
for select
to authenticated
using (
  exists (
    select 1
    from public.complaints
    where complaints.id = complaint_evidence.complaint_id
      and complaints.user_id = (select auth.uid())
  )
);

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
  if nullif(complaint_payload->>'user_id', '') is null then
    raise exception 'user_id is required';
  end if;

  insert into public.complaints as c (
    user_id,
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
    (complaint_payload->>'user_id')::uuid,
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

revoke all on function public.create_complaint_ticket(jsonb) from public;
grant execute on function public.create_complaint_ticket(jsonb) to service_role;

create or replace function public.get_nearby_complaints(
  user_latitude double precision,
  user_longitude double precision,
  radius_meters integer default 2000
)
returns table (
  complaint_id uuid,
  ticket_number text,
  category text,
  summary text,
  status text,
  created_at timestamptz,
  distance_meters double precision
)
language sql
security definer
set search_path = public
as $$
  with scoped_complaints as (
    select
      c.id as complaint_id,
      c.ticket_number,
      c.category,
      c.summary,
      c.status,
      c.created_at,
      (
        6371000 * acos(
          least(
            1.0,
            greatest(
              -1.0,
              cos(radians(user_latitude)) *
              cos(radians(loc.latitude)) *
              cos(radians(loc.longitude) - radians(user_longitude)) +
              sin(radians(user_latitude)) *
              sin(radians(loc.latitude))
            )
          )
        )
      ) as distance_meters
    from public.complaints as c
    inner join public.complaint_locations as loc
      on loc.complaint_id = c.id
    where auth.uid() is not null
      and c.user_id is not null
      and c.user_id <> auth.uid()
  )
  select
    scoped_complaints.complaint_id,
    scoped_complaints.ticket_number,
    scoped_complaints.category,
    scoped_complaints.summary,
    scoped_complaints.status,
    scoped_complaints.created_at,
    scoped_complaints.distance_meters
  from scoped_complaints
  where scoped_complaints.distance_meters <= greatest(radius_meters, 0)
  order by scoped_complaints.distance_meters asc, scoped_complaints.created_at desc
  limit 100;
$$;

revoke all on function public.get_nearby_complaints(double precision, double precision, integer) from public;
grant execute on function public.get_nearby_complaints(double precision, double precision, integer) to authenticated;
