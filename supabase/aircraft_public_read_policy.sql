-- Keep the public shared-aircraft registry readable without exposing
-- organization assignment rows to anonymous visitors.
drop policy if exists "aircraft_select_visible" on public.aircraft;
drop policy if exists "aircraft_select_shared_anon" on public.aircraft;
drop policy if exists "aircraft_select_authenticated" on public.aircraft;

create policy "aircraft_select_shared_anon"
on public.aircraft
for select
to anon
using (visibility = 'shared');

create policy "aircraft_select_authenticated"
on public.aircraft
for select
to authenticated
using (
  visibility = 'shared'
  or owner_user_id = (select auth.uid())
  or (
    organization_id is not null
    and (select private.is_organization_member(organization_id))
  )
  or exists (
    select 1
    from public.aircraft_organization_assignments as assignments
    where assignments.aircraft_id = aircraft.id
      and (select private.is_organization_member(assignments.organization_id))
  )
  or (select private.is_platform_admin())
);

grant select on public.aircraft to anon, authenticated;
