drop policy if exists "aircraft_read" on public.aircraft;
drop policy if exists "aircraft_read_all" on public.aircraft;
drop policy if exists "aircraft_authenticated_insert" on public.aircraft;
drop policy if exists "aircraft_insert_admin" on public.aircraft;
drop policy if exists "aircraft_admin_update" on public.aircraft;
drop policy if exists "aircraft_update_admin" on public.aircraft;
drop policy if exists "aircraft_admin_delete" on public.aircraft;
drop policy if exists "aircraft_delete_admin" on public.aircraft;
drop policy if exists "aircraft_select_visible" on public.aircraft;

create policy "aircraft_select_visible"
on public.aircraft
for select
to anon, authenticated
using (
  visibility = 'shared'
  or owner_user_id = (select auth.uid())
  or exists (
    select 1
    from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'admin'
  )
);
