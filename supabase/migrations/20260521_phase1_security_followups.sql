create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop policy if exists "Public can view complaint evidence" on storage.objects;

drop policy if exists "No public complaint access during phase 1" on public.complaints;
create policy "No public complaint access during phase 1"
on public.complaints
for all
to anon, authenticated
using (false)
with check (false);
