create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.complaints (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique,
  category text not null,
  problem_type text not null,
  description text not null,
  summary text not null,
  caller_name text null,
  language text not null,
  latitude double precision not null,
  longitude double precision not null,
  location_accuracy double precision null,
  altitude double precision null,
  altitude_accuracy double precision null,
  heading double precision null,
  speed double precision null,
  location_timestamp bigint not null,
  location_mocked boolean null,
  photo_url text null,
  transcript jsonb not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint complaints_category_check check (category in ('SANITATION', 'POTHOLE', 'POWER_OUTAGE')),
  constraint complaints_status_check check (status in ('open', 'in_progress', 'resolved'))
);

create index if not exists complaints_created_at_idx
  on public.complaints (created_at desc);

create index if not exists complaints_category_created_at_idx
  on public.complaints (category, created_at desc);

create index if not exists complaints_status_created_at_idx
  on public.complaints (status, created_at desc);

drop trigger if exists complaints_set_updated_at on public.complaints;
create trigger complaints_set_updated_at
before update on public.complaints
for each row
execute function public.set_updated_at();

alter table public.complaints enable row level security;

insert into storage.buckets (id, name, public)
values ('complaint-evidence', 'complaint-evidence', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Public can view complaint evidence" on storage.objects;
create policy "Public can view complaint evidence"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'complaint-evidence');

drop policy if exists "Public can upload complaint evidence" on storage.objects;
create policy "Public can upload complaint evidence"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'complaint-evidence');
