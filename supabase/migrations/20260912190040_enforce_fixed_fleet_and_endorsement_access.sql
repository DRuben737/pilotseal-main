-- Fleet administration is never a regular-member capability. Organization
-- administrators always manage the fleet and can review organization-visible
-- endorsements, even if an older role template omitted those capabilities.
update public.organization_role_permissions
set permissions = array(
      select distinct permission
      from unnest(permissions) permission
      where permission <> 'fleet'
      order by permission
    ),
    updated_at = timezone('utc', now())
where role = 'member'
  and 'fleet' = any(permissions);

update public.organization_role_permissions
set permissions = array(
      select distinct permission
      from unnest(permissions || array['fleet', 'endorsements']::text[]) permission
      order by permission
    ),
    updated_at = timezone('utc', now())
where role = 'organization_admin'
  and not (permissions @> array['fleet', 'endorsements']::text[]);

create or replace function private.organization_permissions(
  p_organization_id uuid,
  p_user_id uuid default auth.uid()
)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_user_id is null then '{}'::text[]
    when private.is_platform_admin(p_user_id) then array['members', 'fleet', 'endorsements', 'notifications', 'audit']::text[]
    else coalesce((
      select case
        when member.role = 'owner' then array['members', 'fleet', 'endorsements', 'notifications', 'audit']::text[]
        when member.role = 'organization_admin' then array(
          select distinct permission
          from unnest(coalesce(role_permissions.permissions, '{}'::text[]) || array['fleet', 'endorsements']::text[]) permission
          order by permission
        )
        else array(
          select distinct permission
          from unnest(coalesce(role_permissions.permissions, '{}'::text[])) permission
          where permission <> 'fleet'
          order by permission
        )
      end
      from public.organization_members member
      left join public.organization_role_permissions role_permissions
        on role_permissions.organization_id = member.organization_id
       and role_permissions.role = member.role
      where member.organization_id = p_organization_id
        and member.user_id = p_user_id
    ), '{}'::text[])
  end;
$$;

create or replace function public.set_organization_role_permissions(
  p_organization_id uuid,
  p_role text,
  p_permissions text[]
)
returns public.organization_role_permissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_permissions text[];
  updated_settings public.organization_role_permissions;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;
  if not (
    private.organization_role(p_organization_id, auth.uid()) = 'owner'
    or private.is_platform_admin(auth.uid())
  ) then
    raise exception 'Only the organization owner can change role permissions.' using errcode = '42501';
  end if;
  if p_role not in ('organization_admin', 'member') then
    raise exception 'Role must be organization_admin or member.' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct permission order by permission), '{}'::text[])
  into normalized_permissions
  from unnest(coalesce(p_permissions, '{}'::text[])) permission;

  if not normalized_permissions <@ array['members', 'fleet', 'endorsements', 'notifications', 'audit']::text[] then
    raise exception 'One or more role permissions are invalid.' using errcode = '22023';
  end if;

  if p_role = 'member' then
    normalized_permissions := array_remove(normalized_permissions, 'fleet');
  else
    select array_agg(distinct permission order by permission)
    into normalized_permissions
    from unnest(normalized_permissions || array['fleet', 'endorsements']::text[]) permission;
  end if;

  insert into public.organization_role_permissions (organization_id, role, permissions, updated_by, updated_at)
  values (p_organization_id, p_role, normalized_permissions, auth.uid(), timezone('utc', now()))
  on conflict (organization_id, role) do update
    set permissions = excluded.permissions,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
  returning * into updated_settings;

  return updated_settings;
end;
$$;

revoke all on function public.set_organization_role_permissions(uuid, text, text[]) from public, anon;
grant execute on function public.set_organization_role_permissions(uuid, text, text[]) to authenticated;

comment on function private.organization_permissions(uuid, uuid) is
  'Returns effective organization capabilities. Fleet is restricted to Owner/Admin; Admin always receives Fleet and Endorsements.';

-- Use the authenticated-safe fixed manager predicate in Fleet RLS. The more
-- general capability helper intentionally is not executable through the Data API.
drop policy if exists aircraft_insert_authorized on public.aircraft;
create policy aircraft_insert_authorized on public.aircraft for insert to authenticated
with check (
  (visibility = 'private' and owner_user_id = (select auth.uid()) and organization_id is null)
  or (visibility = 'organization' and organization_id is not null and (select private.is_organization_manager(organization_id)))
  or (visibility = 'shared' and organization_id is null and (select private.is_platform_admin()))
);

drop policy if exists aircraft_update_authorized on public.aircraft;
create policy aircraft_update_authorized on public.aircraft for update to authenticated
using (
  (visibility = 'private' and owner_user_id = (select auth.uid()))
  or (visibility = 'organization' and organization_id is not null and (select private.is_organization_manager(organization_id)))
  or (visibility = 'shared' and organization_id is null and (select private.is_platform_admin()))
)
with check (
  (visibility = 'private' and owner_user_id = (select auth.uid()) and organization_id is null)
  or (visibility = 'organization' and organization_id is not null and (select private.is_organization_manager(organization_id)))
  or (visibility = 'shared' and organization_id is null and (select private.is_platform_admin()))
);

drop policy if exists aircraft_delete_authorized on public.aircraft;
create policy aircraft_delete_authorized on public.aircraft for delete to authenticated
using (
  (visibility = 'private' and owner_user_id = (select auth.uid()))
  or (visibility = 'organization' and organization_id is not null and (select private.is_organization_manager(organization_id)))
  or (visibility = 'shared' and organization_id is null and (select private.is_platform_admin()))
);

drop policy if exists aircraft_models_insert_authorized on public.aircraft_models;
create policy aircraft_models_insert_authorized on public.aircraft_models for insert to authenticated
with check (
  (organization_id is null and (select private.is_platform_admin()))
  or (organization_id is not null and (select private.is_organization_manager(organization_id)))
);

drop policy if exists aircraft_models_update_authorized on public.aircraft_models;
create policy aircraft_models_update_authorized on public.aircraft_models for update to authenticated
using (
  (organization_id is null and (select private.is_platform_admin()))
  or (organization_id is not null and (select private.is_organization_manager(organization_id)))
)
with check (
  (organization_id is null and (select private.is_platform_admin()))
  or (organization_id is not null and (select private.is_organization_manager(organization_id)))
);

drop policy if exists aircraft_models_delete_authorized on public.aircraft_models;
create policy aircraft_models_delete_authorized on public.aircraft_models for delete to authenticated
using (
  (organization_id is null and (select private.is_platform_admin()))
  or (organization_id is not null and (select private.is_organization_manager(organization_id)))
);

drop policy if exists organization_inspections_insert_manager on public.organization_inspection_definitions;
create policy organization_inspections_insert_manager on public.organization_inspection_definitions for insert to authenticated
with check ((select private.is_organization_manager(organization_id)) and created_by = (select auth.uid()));

drop policy if exists organization_inspections_update_manager on public.organization_inspection_definitions;
create policy organization_inspections_update_manager on public.organization_inspection_definitions for update to authenticated
using ((select private.is_organization_manager(organization_id)))
with check ((select private.is_organization_manager(organization_id)));

drop policy if exists organization_inspections_delete_manager on public.organization_inspection_definitions;
create policy organization_inspections_delete_manager on public.organization_inspection_definitions for delete to authenticated
using ((select private.is_organization_manager(organization_id)));

drop policy if exists aircraft_inspections_insert_manager on public.aircraft_inspection_assignments;
create policy aircraft_inspections_insert_manager on public.aircraft_inspection_assignments for insert to authenticated
with check (exists (
  select 1 from public.organization_inspection_definitions definitions
  where definitions.id = definition_id
    and (select private.is_organization_manager(definitions.organization_id))
    and (select private.can_use_aircraft_in_organization(aircraft_id, definitions.organization_id))
));

drop policy if exists aircraft_inspections_update_manager on public.aircraft_inspection_assignments;
create policy aircraft_inspections_update_manager on public.aircraft_inspection_assignments for update to authenticated
using (exists (
  select 1 from public.organization_inspection_definitions definitions
  where definitions.id = definition_id
    and (select private.is_organization_manager(definitions.organization_id))
    and (select private.can_use_aircraft_in_organization(aircraft_id, definitions.organization_id))
))
with check (exists (
  select 1 from public.organization_inspection_definitions definitions
  where definitions.id = definition_id
    and (select private.is_organization_manager(definitions.organization_id))
    and (select private.can_use_aircraft_in_organization(aircraft_id, definitions.organization_id))
));

drop policy if exists aircraft_inspections_delete_manager on public.aircraft_inspection_assignments;
create policy aircraft_inspections_delete_manager on public.aircraft_inspection_assignments for delete to authenticated
using (exists (
  select 1 from public.organization_inspection_definitions definitions
  where definitions.id = definition_id
    and (select private.is_organization_manager(definitions.organization_id))
    and (select private.can_use_aircraft_in_organization(aircraft_id, definitions.organization_id))
));

drop policy if exists aircraft_meter_readings_select_authorized on public.aircraft_meter_readings;
create policy aircraft_meter_readings_select_authorized on public.aircraft_meter_readings for select to authenticated
using (
  submitted_by = (select auth.uid())
  or (select private.is_organization_manager(organization_id))
);

drop policy if exists endorsement_change_requests_select_authorized on public.endorsement_template_change_requests;
create policy endorsement_change_requests_select_authorized
on public.endorsement_template_change_requests
for select
to authenticated
using (
  (select private.is_platform_admin())
  or (select private.is_organization_manager(organization_id))
);
