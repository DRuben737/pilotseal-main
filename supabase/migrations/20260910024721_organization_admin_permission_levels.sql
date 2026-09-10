create table if not exists public.organization_role_permissions (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role text not null check (role in ('organization_admin', 'member')),
  permissions text[] not null default '{}'::text[],
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (organization_id, role),
  constraint organization_role_permissions_values_check
    check (permissions <@ array['members', 'fleet', 'endorsements', 'notifications', 'audit']::text[])
);

insert into public.organization_role_permissions (organization_id, role, permissions)
select id, 'organization_admin', array['members', 'fleet', 'endorsements', 'notifications', 'audit']::text[]
from public.organizations
on conflict (organization_id, role) do nothing;

insert into public.organization_role_permissions (organization_id, role, permissions)
select id, 'member', '{}'::text[]
from public.organizations
on conflict (organization_id, role) do nothing;

create or replace function private.initialize_organization_role_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.organization_role_permissions (organization_id, role, permissions)
  values
    (new.id, 'organization_admin', array['members', 'fleet', 'endorsements', 'notifications', 'audit']::text[]),
    (new.id, 'member', '{}'::text[])
  on conflict (organization_id, role) do nothing;
  return new;
end;
$$;

drop trigger if exists initialize_organization_role_permissions on public.organizations;
create trigger initialize_organization_role_permissions
after insert on public.organizations
for each row execute function private.initialize_organization_role_permissions();

revoke all on function private.initialize_organization_role_permissions() from public, anon, authenticated, service_role;

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
        else coalesce(role_permissions.permissions, '{}'::text[])
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

create or replace function private.has_organization_permission(
  p_organization_id uuid,
  p_permission text,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_permission = any(array['members', 'fleet', 'endorsements', 'notifications', 'audit']::text[])
    and p_permission = any(coalesce(private.organization_permissions(p_organization_id, p_user_id), '{}'::text[]));
$$;

revoke all on function private.organization_permissions(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.has_organization_permission(uuid, text, uuid) from public, anon, authenticated, service_role;

-- Keep the existing validated RPC bodies while replacing their legacy
-- Owner/Admin gates with the capability assigned to the caller's role.
do $$
declare
  target record;
  definition text;
  updated_definition text;
begin
  for target in
    select * from (values
      ('public.add_organization_member_by_email(uuid,text)'::regprocedure, 'private.can_manage_organization(p_organization_id, auth.uid())', 'private.has_organization_permission(p_organization_id, ''members'', auth.uid())'),
      ('public.add_organization_person(uuid,text,text,text,text,text)'::regprocedure, 'private.can_manage_organization(p_organization_id, auth.uid())', 'private.has_organization_permission(p_organization_id, ''members'', auth.uid())'),
      ('public.create_organization_member_invitation(uuid,text,text,text,text,text)'::regprocedure, 'private.can_manage_organization(p_organization_id, auth.uid())', 'private.has_organization_permission(p_organization_id, ''members'', auth.uid())'),
      ('public.create_organization_member_invitation_v2(uuid,text,text,text,uuid,text,text)'::regprocedure, 'private.can_manage_organization(p_organization_id, auth.uid())', 'private.has_organization_permission(p_organization_id, ''members'', auth.uid())'),
      ('public.list_organization_member_invitations(uuid)'::regprocedure, 'private.can_manage_organization(p_organization_id, auth.uid())', 'private.has_organization_permission(p_organization_id, ''members'', auth.uid())'),
      ('public.list_organization_member_invitations_v2(uuid)'::regprocedure, 'private.can_manage_organization(p_organization_id, auth.uid())', 'private.has_organization_permission(p_organization_id, ''members'', auth.uid())'),
      ('public.list_organization_people(uuid)'::regprocedure, 'private.can_manage_organization(p_organization_id, auth.uid())', 'private.has_organization_permission(p_organization_id, ''members'', auth.uid())'),
      ('public.list_organization_students(uuid)'::regprocedure, 'private.can_manage_organization(p_organization_id, auth.uid())', 'private.has_organization_permission(p_organization_id, ''members'', auth.uid())'),
      ('public.set_organization_member_teaching_role(uuid,uuid,text)'::regprocedure, 'private.can_manage_organization(p_organization_id, auth.uid())', 'private.has_organization_permission(p_organization_id, ''members'', auth.uid())'),
      ('public.archive_pending_organization_person(uuid)'::regprocedure, 'private.can_manage_organization(v_person.organization_id, auth.uid())', 'private.has_organization_permission(v_person.organization_id, ''members'', auth.uid())'),
      ('public.update_organization_person(uuid,text,text,text,text)'::regprocedure, 'private.can_manage_organization(v_person.organization_id, auth.uid())', 'private.has_organization_permission(v_person.organization_id, ''members'', auth.uid())'),
      ('public.revoke_organization_member_invitation(uuid)'::regprocedure, 'private.can_manage_organization(v_invitation.organization_id, auth.uid())', 'private.has_organization_permission(v_invitation.organization_id, ''members'', auth.uid())'),
      ('public.remove_organization_member(uuid,uuid)'::regprocedure, 'not (caller_role = ''organization_admin'' and target_role = ''member'')', 'not (private.has_organization_permission(p_organization_id, ''members'', auth.uid()) and target_role = ''member'')'),
      ('public.save_organization_aircraft_atomic(uuid,uuid,uuid,text,numeric,numeric,numeric,numeric,date,date,date,date,date,date,text,text,text,numeric,timestamptz,text)'::regprocedure, 'private.is_organization_manager(p_organization_id, auth.uid())', 'private.has_organization_permission(p_organization_id, ''fleet'', auth.uid())'),
      ('public.update_organization_aircraft_status(uuid,uuid,text,text)'::regprocedure, 'private.is_organization_manager(p_organization_id, auth.uid())', 'private.has_organization_permission(p_organization_id, ''fleet'', auth.uid())'),
      ('public.correct_aircraft_meter(uuid,text,numeric,timestamptz,text)'::regprocedure, 'private.is_organization_manager(assignments.organization_id, auth.uid())', 'private.has_organization_permission(assignments.organization_id, ''fleet'', auth.uid())'),
      ('public.list_organization_endorsement_records(uuid)'::regprocedure, 'private.can_manage_organization(p_organization_id, auth.uid())', 'private.has_organization_permission(p_organization_id, ''endorsements'', auth.uid())'),
      ('public.submit_endorsement_template_change_request(uuid,uuid,text,jsonb)'::regprocedure, 'private.can_manage_organization(p_organization_id)', 'private.has_organization_permission(p_organization_id, ''endorsements'', auth.uid())'),
      ('public.list_aircraft_assignment_audit(uuid,integer)'::regprocedure, 'private.can_manage_organization(p_organization_id, auth.uid())', 'private.has_organization_permission(p_organization_id, ''audit'', auth.uid())')
    ) as targets(function_id, legacy_gate, permission_gate)
  loop
    definition := pg_catalog.pg_get_functiondef(target.function_id);
    updated_definition := replace(definition, target.legacy_gate, target.permission_gate);
    if definition = updated_definition then
      raise exception 'Expected permission gate was not found in %.', target.function_id;
    end if;
    execute updated_definition;
  end loop;
end;
$$;

alter table public.organization_role_permissions enable row level security;

drop policy if exists organization_role_permissions_select_member on public.organization_role_permissions;
create policy organization_role_permissions_select_member
on public.organization_role_permissions
for select
to authenticated
using (
  (select private.is_platform_admin())
  or (select private.is_organization_member(organization_id))
);

revoke all on table public.organization_role_permissions from public, anon;
grant select on table public.organization_role_permissions to authenticated;

drop policy if exists organization_members_select_authorized on public.organization_members;
create policy organization_members_select_authorized
on public.organization_members
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_platform_admin())
  or (select private.has_organization_permission(organization_id, 'members', auth.uid()))
);

drop policy if exists organization_membership_periods_select_authorized on public.organization_membership_periods;
create policy organization_membership_periods_select_authorized
on public.organization_membership_periods
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_platform_admin())
  or (select private.has_organization_permission(organization_id, 'members', auth.uid()))
);

drop policy if exists endorsement_change_requests_select_authorized on public.endorsement_template_change_requests;
create policy endorsement_change_requests_select_authorized
on public.endorsement_template_change_requests
for select
to authenticated
using (
  (select private.is_platform_admin())
  or (select private.has_organization_permission(organization_id, 'endorsements', auth.uid()))
);

drop policy if exists aircraft_insert_authorized on public.aircraft;
create policy aircraft_insert_authorized on public.aircraft for insert to authenticated
with check (
  (visibility = 'private' and owner_user_id = (select auth.uid()) and organization_id is null)
  or (visibility = 'organization' and organization_id is not null and (select private.has_organization_permission(organization_id, 'fleet', auth.uid())))
  or (visibility = 'shared' and organization_id is null and (select private.is_platform_admin()))
);

drop policy if exists aircraft_update_authorized on public.aircraft;
create policy aircraft_update_authorized on public.aircraft for update to authenticated
using (
  (visibility = 'private' and owner_user_id = (select auth.uid()))
  or (visibility = 'organization' and organization_id is not null and (select private.has_organization_permission(organization_id, 'fleet', auth.uid())))
  or (visibility = 'shared' and organization_id is null and (select private.is_platform_admin()))
)
with check (
  (visibility = 'private' and owner_user_id = (select auth.uid()) and organization_id is null)
  or (visibility = 'organization' and organization_id is not null and (select private.has_organization_permission(organization_id, 'fleet', auth.uid())))
  or (visibility = 'shared' and organization_id is null and (select private.is_platform_admin()))
);

drop policy if exists aircraft_delete_authorized on public.aircraft;
create policy aircraft_delete_authorized on public.aircraft for delete to authenticated
using (
  (visibility = 'private' and owner_user_id = (select auth.uid()))
  or (visibility = 'organization' and organization_id is not null and (select private.has_organization_permission(organization_id, 'fleet', auth.uid())))
  or (visibility = 'shared' and organization_id is null and (select private.is_platform_admin()))
);

drop policy if exists aircraft_models_insert_authorized on public.aircraft_models;
create policy aircraft_models_insert_authorized on public.aircraft_models for insert to authenticated
with check (
  (organization_id is null and (select private.is_platform_admin()))
  or (organization_id is not null and (select private.has_organization_permission(organization_id, 'fleet', auth.uid())))
);

drop policy if exists aircraft_models_update_authorized on public.aircraft_models;
create policy aircraft_models_update_authorized on public.aircraft_models for update to authenticated
using (
  (organization_id is null and (select private.is_platform_admin()))
  or (organization_id is not null and (select private.has_organization_permission(organization_id, 'fleet', auth.uid())))
)
with check (
  (organization_id is null and (select private.is_platform_admin()))
  or (organization_id is not null and (select private.has_organization_permission(organization_id, 'fleet', auth.uid())))
);

drop policy if exists aircraft_models_delete_authorized on public.aircraft_models;
create policy aircraft_models_delete_authorized on public.aircraft_models for delete to authenticated
using (
  (organization_id is null and (select private.is_platform_admin()))
  or (organization_id is not null and (select private.has_organization_permission(organization_id, 'fleet', auth.uid())))
);

drop policy if exists organization_inspections_insert_manager on public.organization_inspection_definitions;
create policy organization_inspections_insert_manager on public.organization_inspection_definitions for insert to authenticated
with check (
  (select private.has_organization_permission(organization_id, 'fleet', auth.uid()))
  and created_by = (select auth.uid())
);

drop policy if exists organization_inspections_update_manager on public.organization_inspection_definitions;
create policy organization_inspections_update_manager on public.organization_inspection_definitions for update to authenticated
using ((select private.has_organization_permission(organization_id, 'fleet', auth.uid())))
with check ((select private.has_organization_permission(organization_id, 'fleet', auth.uid())));

drop policy if exists organization_inspections_delete_manager on public.organization_inspection_definitions;
create policy organization_inspections_delete_manager on public.organization_inspection_definitions for delete to authenticated
using ((select private.has_organization_permission(organization_id, 'fleet', auth.uid())));

drop policy if exists aircraft_inspections_insert_manager on public.aircraft_inspection_assignments;
create policy aircraft_inspections_insert_manager on public.aircraft_inspection_assignments for insert to authenticated
with check (exists (
  select 1 from public.organization_inspection_definitions definitions
  where definitions.id = definition_id
    and (select private.has_organization_permission(definitions.organization_id, 'fleet', auth.uid()))
    and (select private.can_use_aircraft_in_organization(aircraft_id, definitions.organization_id))
));

drop policy if exists aircraft_inspections_update_manager on public.aircraft_inspection_assignments;
create policy aircraft_inspections_update_manager on public.aircraft_inspection_assignments for update to authenticated
using (exists (
  select 1 from public.organization_inspection_definitions definitions
  where definitions.id = definition_id
    and (select private.has_organization_permission(definitions.organization_id, 'fleet', auth.uid()))
    and (select private.can_use_aircraft_in_organization(aircraft_id, definitions.organization_id))
))
with check (exists (
  select 1 from public.organization_inspection_definitions definitions
  where definitions.id = definition_id
    and (select private.has_organization_permission(definitions.organization_id, 'fleet', auth.uid()))
    and (select private.can_use_aircraft_in_organization(aircraft_id, definitions.organization_id))
));

drop policy if exists aircraft_inspections_delete_manager on public.aircraft_inspection_assignments;
create policy aircraft_inspections_delete_manager on public.aircraft_inspection_assignments for delete to authenticated
using (exists (
  select 1 from public.organization_inspection_definitions definitions
  where definitions.id = definition_id
    and (select private.has_organization_permission(definitions.organization_id, 'fleet', auth.uid()))
    and (select private.can_use_aircraft_in_organization(aircraft_id, definitions.organization_id))
));

drop policy if exists aircraft_meter_readings_select_authorized on public.aircraft_meter_readings;
create policy aircraft_meter_readings_select_authorized on public.aircraft_meter_readings for select to authenticated
using (
  submitted_by = (select auth.uid())
  or (select private.has_organization_permission(organization_id, 'fleet', auth.uid()))
);

create or replace function public.list_organization_role_permissions(p_organization_id uuid)
returns table (role text, permissions text[], updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (
    private.organization_role(p_organization_id, auth.uid()) = 'owner'
    or private.is_platform_admin(auth.uid())
  ) then
    raise exception 'Only the organization owner can view role permission settings.' using errcode = '42501';
  end if;

  return query
  select settings.role, settings.permissions, settings.updated_at
  from public.organization_role_permissions settings
  where settings.organization_id = p_organization_id
  order by case settings.role when 'organization_admin' then 0 else 1 end;
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

revoke all on function public.list_organization_role_permissions(uuid) from public, anon;
revoke all on function public.set_organization_role_permissions(uuid, text, text[]) from public, anon;
grant execute on function public.list_organization_role_permissions(uuid) to authenticated;
grant execute on function public.set_organization_role_permissions(uuid, text, text[]) to authenticated;

create or replace function public.get_organization_notification_recipient_count(p_organization_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.has_organization_permission(p_organization_id, 'notifications', auth.uid()) then
    raise exception 'You do not have permission to publish organization notifications.' using errcode = '42501';
  end if;
  return (
    select count(*)
    from public.organization_members members
    where members.organization_id = p_organization_id
  );
end;
$$;

revoke all on function public.get_organization_notification_recipient_count(uuid) from public, anon;
grant execute on function public.get_organization_notification_recipient_count(uuid) to authenticated;

create or replace function public.create_organization_notification(
  p_organization_id uuid,
  p_title text,
  p_message text,
  p_priority text default 'normal',
  p_action_url text default '/dashboard/notifications'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  if auth.uid() is null or not private.has_organization_permission(p_organization_id, 'notifications', auth.uid()) then
    raise exception 'You do not have permission to publish organization notifications.' using errcode = '42501';
  end if;
  if nullif(btrim(p_title), '') is null or nullif(btrim(p_message), '') is null then
    raise exception 'Title and message are required.' using errcode = '22023';
  end if;
  if p_priority not in ('low', 'normal', 'high', 'critical') then
    raise exception 'Invalid notification priority.' using errcode = '22023';
  end if;

  insert into public.notifications (
    title, message, content, priority, status, is_active, scheduled_at,
    created_by, kind, recipient_user_id, organization_id, source_label, action_url
  )
  select btrim(p_title), btrim(p_message), btrim(p_message), p_priority, 'sent', true, now(),
    auth.uid(), 'organization', member.user_id, p_organization_id, organization.name,
    nullif(btrim(p_action_url), '')
  from public.organization_members member
  join public.organizations organization on organization.id = member.organization_id
  where member.organization_id = p_organization_id;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.create_organization_notification(uuid, text, text, text, text) from public, anon;
grant execute on function public.create_organization_notification(uuid, text, text, text, text) to authenticated;

drop function if exists public.get_my_organizations();
create function public.get_my_organizations()
returns table (
  id uuid,
  name text,
  member_role text,
  teaching_role text,
  permissions text[],
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select organizations.id, organizations.name,
    case when private.is_platform_admin(auth.uid()) then 'platform_admin'
      else members.role end::text,
    members.teaching_role,
    coalesce(private.organization_permissions(organizations.id, auth.uid()), '{}'::text[]),
    organizations.created_at
  from public.organization_members members
  join public.organizations organizations on organizations.id = members.organization_id
  where auth.uid() is not null and members.user_id = auth.uid()
  order by organizations.name;
$$;

revoke all on function public.get_my_organizations() from public, anon;
grant execute on function public.get_my_organizations() to authenticated;

drop function if exists public.list_organization_members(uuid);
create function public.list_organization_members(p_organization_id uuid)
returns table (
  user_id uuid,
  email text,
  display_name text,
  member_role text,
  teaching_role text,
  permissions text[],
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (
    private.has_organization_permission(p_organization_id, 'members', auth.uid())
    or private.is_organization_instructor(p_organization_id, auth.uid())
  ) then
    raise exception 'You do not have permission to view this organization''s members.' using errcode = '42501';
  end if;
  return query
  select members.user_id, auth_users.email::text, profiles.display_name::text,
    members.role, members.teaching_role,
    coalesce(private.organization_permissions(p_organization_id, members.user_id), '{}'::text[]),
    members.created_at
  from public.organization_members members
  join auth.users auth_users on auth_users.id = members.user_id
  left join public.profiles profiles on profiles.id = members.user_id
  where members.organization_id = p_organization_id
  order by case members.role when 'owner' then 0 when 'organization_admin' then 1 else 2 end,
    coalesce(profiles.display_name, auth_users.email);
end;
$$;

revoke all on function public.list_organization_members(uuid) from public, anon;
grant execute on function public.list_organization_members(uuid) to authenticated;
