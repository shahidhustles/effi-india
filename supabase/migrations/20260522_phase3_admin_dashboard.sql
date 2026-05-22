create table if not exists public.admin_access (
  email text primary key,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_access_email_lowercase check (email = lower(email))
);

drop trigger if exists admin_access_set_updated_at on public.admin_access;
create trigger admin_access_set_updated_at
before update on public.admin_access
for each row
execute function public.set_updated_at();

alter table public.admin_access enable row level security;

drop policy if exists "Admins can view own access row" on public.admin_access;
create policy "Admins can view own access row"
on public.admin_access
for select
to authenticated
using (
  is_active
  and email = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
);

grant select on public.admin_access to authenticated;

drop policy if exists "Users can view own complaints" on public.complaints;
drop policy if exists "Admins can view complaints" on public.complaints;
drop policy if exists "Users and admins can view complaints" on public.complaints;
create policy "Users and admins can view complaints"
on public.complaints
for select
to authenticated
using (
  (select auth.uid()) = user_id
  or exists (
    select 1
    from public.admin_access
    where admin_access.is_active
      and admin_access.email = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
  )
);

drop policy if exists "Admins can update complaint status" on public.complaints;
create policy "Admins can update complaint status"
on public.complaints
for update
to authenticated
using (
  exists (
    select 1
    from public.admin_access
    where admin_access.is_active
      and admin_access.email = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
  )
)
with check (
  exists (
    select 1
    from public.admin_access
    where admin_access.is_active
      and admin_access.email = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
  )
);

drop policy if exists "Users can view own complaint locations" on public.complaint_locations;
drop policy if exists "Admins can view complaint locations" on public.complaint_locations;
drop policy if exists "Users and admins can view complaint locations" on public.complaint_locations;
create policy "Users and admins can view complaint locations"
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
  or exists (
    select 1
    from public.admin_access
    where admin_access.is_active
      and admin_access.email = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
  )
);

drop policy if exists "Users can view own complaint evidence" on public.complaint_evidence;
drop policy if exists "Admins can view complaint evidence" on public.complaint_evidence;
drop policy if exists "Users and admins can view complaint evidence" on public.complaint_evidence;
create policy "Users and admins can view complaint evidence"
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
  or exists (
    select 1
    from public.admin_access
    where admin_access.is_active
      and admin_access.email = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
  )
);

drop policy if exists "Admins can view complaint transcripts" on public.complaint_transcript_turns;
create policy "Admins can view complaint transcripts"
on public.complaint_transcript_turns
for select
to authenticated
using (
  exists (
    select 1
    from public.admin_access
    where admin_access.is_active
      and admin_access.email = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
  )
);

revoke update on public.complaints from authenticated;
grant update (status) on public.complaints to authenticated;
grant select on public.complaints to authenticated;
grant select on public.complaint_locations to authenticated;
grant select on public.complaint_evidence to authenticated;
grant select on public.complaint_transcript_turns to authenticated;

create or replace function public.get_admin_complaint_feed()
returns table (
  id uuid,
  ticket_number text,
  category text,
  problem_type text,
  summary text,
  caller_name text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  latitude double precision,
  longitude double precision,
  photo_url text,
  cluster_count integer,
  is_cluster_priority boolean,
  priority_label text
)
language sql
set search_path = public
as $$
  with feed as (
    select
      c.id,
      c.ticket_number,
      c.category,
      c.problem_type,
      c.summary,
      c.caller_name,
      c.status,
      c.created_at,
      c.updated_at,
      loc.latitude,
      loc.longitude,
      evidence.public_url as photo_url,
      (
        select count(distinct c2.user_id)::integer
        from public.complaints as c2
        inner join public.complaint_locations as loc2
          on loc2.complaint_id = c2.id
        where c2.category = c.category
          and c2.problem_type = c.problem_type
          and c2.status <> 'resolved'
          and c2.user_id is not null
          and (
            6371000 * acos(
              least(
                1.0,
                greatest(
                  -1.0,
                  cos(radians(loc.latitude)) *
                  cos(radians(loc2.latitude)) *
                  cos(radians(loc2.longitude) - radians(loc.longitude)) +
                  sin(radians(loc.latitude)) *
                  sin(radians(loc2.latitude))
                )
              )
            )
          ) <= 100
      ) as cluster_count
    from public.complaints as c
    left join public.complaint_locations as loc
      on loc.complaint_id = c.id
    left join lateral (
      select public_url
      from public.complaint_evidence
      where complaint_evidence.complaint_id = c.id
      order by created_at asc
      limit 1
    ) as evidence on true
  )
  select
    feed.id,
    feed.ticket_number,
    feed.category,
    feed.problem_type,
    feed.summary,
    feed.caller_name,
    feed.status,
    feed.created_at,
    feed.updated_at,
    feed.latitude,
    feed.longitude,
    feed.photo_url,
    coalesce(feed.cluster_count, 0) as cluster_count,
    coalesce(feed.cluster_count, 0) >= 2 as is_cluster_priority,
    case when coalesce(feed.cluster_count, 0) >= 2 then 'Escalated' else 'Standard' end as priority_label
  from feed
  order by
    case
      when feed.status = 'open' and coalesce(feed.cluster_count, 0) >= 2 then 0
      when feed.status = 'open' then 1
      when feed.status = 'in_progress' then 2
      else 3
    end,
    coalesce(feed.cluster_count, 0) desc,
    feed.created_at desc
  limit 500;
$$;

revoke all on function public.get_admin_complaint_feed() from public;
grant execute on function public.get_admin_complaint_feed() to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'complaints'
  ) then
    alter publication supabase_realtime add table public.complaints;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'complaint_evidence'
  ) then
    alter publication supabase_realtime add table public.complaint_evidence;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'complaint_locations'
  ) then
    alter publication supabase_realtime add table public.complaint_locations;
  end if;
end $$;
