-- Global aircraft models power the public Weight & Balance tool.
-- Keep the anon policy free of membership helper calls: anon cannot execute
-- the private organization helpers and PostgreSQL does not guarantee OR
-- short-circuit evaluation inside RLS predicates.

drop policy if exists aircraft_models_select_visible on public.aircraft_models;
drop policy if exists aircraft_models_select_global_public on public.aircraft_models;
drop policy if exists aircraft_models_select_authenticated on public.aircraft_models;

create policy aircraft_models_select_global_public
on public.aircraft_models
for select
to anon
using (organization_id is null);

create policy aircraft_models_select_authenticated
on public.aircraft_models
for select
to authenticated
using (
  organization_id is null
  or (
    organization_id is not null
    and (select private.is_organization_member(aircraft_models.organization_id))
  )
  or (select private.is_platform_admin())
);
