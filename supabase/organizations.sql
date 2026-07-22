create schema if not exists private;

revoke all on schema private from public;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.organizations alter column created_by drop not null;
alter table public.organizations drop constraint if exists organizations_created_by_fkey;
alter table public.organizations
  add constraint organizations_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'organization_admin', 'member')),
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (organization_id, user_id)
);

create unique index if not exists organization_members_one_owner_idx
on public.organization_members (organization_id)
where role = 'owner';

create index if not exists organization_members_user_idx
on public.organization_members (user_id, organization_id);

alter table public.aircraft
  add column if not exists organization_id uuid references public.organizations(id) on delete restrict;

alter table public.aircraft
  drop constraint if exists aircraft_visibility_check;

alter table public.aircraft
  add constraint aircraft_visibility_check
  check (visibility in ('shared', 'private', 'organization'));

alter table public.aircraft
  drop constraint if exists aircraft_scope_check;

alter table public.aircraft
  add constraint aircraft_scope_check
  check (
    (visibility = 'shared' and organization_id is null)
    or (visibility = 'private' and owner_user_id is not null and organization_id is null)
    or (visibility = 'organization' and organization_id is not null and owner_user_id is null)
  ) not valid;

alter table public.aircraft validate constraint aircraft_scope_check;

create index if not exists aircraft_organization_idx
on public.aircraft (organization_id)
where organization_id is not null;

create table if not exists public.organization_aircraft_maintenance (
  aircraft_id uuid primary key references public.aircraft(id) on delete cascade,
  hundred_hour_due_hours numeric,
  annual_due_date date,
  static_due_date date,
  transponder_due_date date,
  elt_due_date date,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function private.is_platform_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where profiles.id = p_user_id
      and profiles.role = 'admin'
  );
$$;

create or replace function private.organization_role(
  p_organization_id uuid,
  p_user_id uuid default auth.uid()
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select organization_members.role
  from public.organization_members
  where organization_members.organization_id = p_organization_id
    and organization_members.user_id = p_user_id;
$$;

create or replace function private.is_organization_member(
  p_organization_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_members.organization_id = p_organization_id
      and organization_members.user_id = p_user_id
  );
$$;

create or replace function private.can_manage_organization(
  p_organization_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_admin(p_user_id)
    or coalesce(private.organization_role(p_organization_id, p_user_id), '') in ('owner', 'organization_admin');
$$;

revoke all on function private.is_platform_admin(uuid) from public;
revoke all on function private.organization_role(uuid, uuid) from public;
revoke all on function private.is_organization_member(uuid, uuid) from public;
revoke all on function private.can_manage_organization(uuid, uuid) from public;
grant usage on schema private to anon, authenticated;
grant execute on function private.is_platform_admin(uuid) to anon, authenticated;
grant execute on function private.organization_role(uuid, uuid) to authenticated;
grant execute on function private.is_organization_member(uuid, uuid) to authenticated;
grant execute on function private.can_manage_organization(uuid, uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_aircraft_maintenance enable row level security;
alter table public.aircraft enable row level security;

drop policy if exists "organizations_select_accessible" on public.organizations;
create policy "organizations_select_accessible"
on public.organizations
for select
to authenticated
using (
  (select private.is_platform_admin())
  or (select private.is_organization_member(id))
);

drop policy if exists "organization_members_select_authorized" on public.organization_members;
create policy "organization_members_select_authorized"
on public.organization_members
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_platform_admin())
  or (select private.can_manage_organization(organization_id))
);

drop policy if exists "organization_maintenance_select_member" on public.organization_aircraft_maintenance;
create policy "organization_maintenance_select_member"
on public.organization_aircraft_maintenance
for select
to authenticated
using (
  (select private.is_platform_admin())
  or exists (
    select 1
    from public.aircraft
    where aircraft.id = organization_aircraft_maintenance.aircraft_id
      and aircraft.organization_id is not null
      and (select private.is_organization_member(aircraft.organization_id))
  )
);

drop policy if exists "organization_maintenance_insert_manager" on public.organization_aircraft_maintenance;
create policy "organization_maintenance_insert_manager"
on public.organization_aircraft_maintenance
for insert
to authenticated
with check (
  exists (
    select 1
    from public.aircraft
    where aircraft.id = organization_aircraft_maintenance.aircraft_id
      and aircraft.organization_id is not null
      and (select private.can_manage_organization(aircraft.organization_id))
  )
);

drop policy if exists "organization_maintenance_update_manager" on public.organization_aircraft_maintenance;
create policy "organization_maintenance_update_manager"
on public.organization_aircraft_maintenance
for update
to authenticated
using (
  exists (
    select 1
    from public.aircraft
    where aircraft.id = organization_aircraft_maintenance.aircraft_id
      and aircraft.organization_id is not null
      and (select private.can_manage_organization(aircraft.organization_id))
  )
)
with check (
  exists (
    select 1
    from public.aircraft
    where aircraft.id = organization_aircraft_maintenance.aircraft_id
      and aircraft.organization_id is not null
      and (select private.can_manage_organization(aircraft.organization_id))
  )
);

drop policy if exists "aircraft_read" on public.aircraft;
drop policy if exists "aircraft_read_all" on public.aircraft;
drop policy if exists "aircraft_authenticated_insert" on public.aircraft;
drop policy if exists "aircraft_insert_admin" on public.aircraft;
drop policy if exists "aircraft_insert_owner_or_admin" on public.aircraft;
drop policy if exists "aircraft_admin_update" on public.aircraft;
drop policy if exists "aircraft_update_admin" on public.aircraft;
drop policy if exists "aircraft_update_owner_or_admin" on public.aircraft;
drop policy if exists "aircraft_admin_delete" on public.aircraft;
drop policy if exists "aircraft_delete_admin" on public.aircraft;
drop policy if exists "aircraft_delete_owner_or_admin" on public.aircraft;
drop policy if exists "aircraft_select_visible" on public.aircraft;
drop policy if exists "aircraft_insert_authorized" on public.aircraft;
drop policy if exists "aircraft_update_authorized" on public.aircraft;
drop policy if exists "aircraft_delete_authorized" on public.aircraft;
drop policy if exists "users can view own aircraft" on public.aircraft;
drop policy if exists "users can insert own aircraft" on public.aircraft;
drop policy if exists "users can update own aircraft" on public.aircraft;
drop policy if exists "users can delete own aircraft" on public.aircraft;

create policy "aircraft_select_visible"
on public.aircraft
for select
to anon, authenticated
using (
  visibility = 'shared'
  or owner_user_id = (select auth.uid())
  or (organization_id is not null and (select private.is_organization_member(organization_id)))
  or (select private.is_platform_admin())
);

create policy "aircraft_insert_authorized"
on public.aircraft
for insert
to authenticated
with check (
  (visibility = 'private' and owner_user_id = (select auth.uid()) and organization_id is null)
  or (visibility = 'organization' and organization_id is not null and (select private.can_manage_organization(organization_id)))
  or (visibility = 'shared' and organization_id is null and (select private.is_platform_admin()))
);

create policy "aircraft_update_authorized"
on public.aircraft
for update
to authenticated
using (
  (visibility = 'private' and owner_user_id = (select auth.uid()))
  or (visibility = 'organization' and organization_id is not null and (select private.can_manage_organization(organization_id)))
  or (select private.is_platform_admin())
)
with check (
  (visibility = 'private' and owner_user_id = (select auth.uid()) and organization_id is null)
  or (visibility = 'organization' and organization_id is not null and (select private.can_manage_organization(organization_id)))
  or (visibility = 'shared' and organization_id is null and (select private.is_platform_admin()))
);

create policy "aircraft_delete_authorized"
on public.aircraft
for delete
to authenticated
using (
  (visibility = 'private' and owner_user_id = (select auth.uid()))
  or (visibility = 'organization' and organization_id is not null and (select private.can_manage_organization(organization_id)))
  or (select private.is_platform_admin())
);

create or replace function public.get_my_organizations()
returns table (
  id uuid,
  name text,
  member_role text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select organizations.id, organizations.name,
    case
      when private.is_platform_admin(auth.uid()) then 'platform_admin'
      else organization_members.role
    end as member_role,
    organizations.created_at
  from public.organizations
  left join public.organization_members
    on organization_members.organization_id = organizations.id
   and organization_members.user_id = auth.uid()
  where auth.uid() is not null
    and (
      private.is_platform_admin(auth.uid())
      or organization_members.user_id = auth.uid()
    )
  order by organizations.name;
$$;

create or replace function public.list_organization_members(p_organization_id uuid)
returns table (
  user_id uuid,
  email text,
  display_name text,
  member_role text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.can_manage_organization(p_organization_id, auth.uid()) then
    raise exception 'You do not have permission to view this organization''s members.' using errcode = '42501';
  end if;

  return query
  select organization_members.user_id,
    auth_users.email::text,
    profiles.display_name::text,
    organization_members.role,
    organization_members.created_at
  from public.organization_members
  join auth.users as auth_users on auth_users.id = organization_members.user_id
  left join public.profiles as profiles on profiles.id = organization_members.user_id
  where organization_members.organization_id = p_organization_id
  order by
    case organization_members.role when 'owner' then 0 when 'organization_admin' then 1 else 2 end,
    coalesce(profiles.display_name, auth_users.email);
end;
$$;

create or replace function public.add_organization_member_by_email(
  p_organization_id uuid,
  p_email text
)
returns public.organization_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text;
  target_user_id uuid;
  inserted_member public.organization_members;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  caller_role := private.organization_role(p_organization_id, auth.uid());
  if not private.is_platform_admin(auth.uid()) and coalesce(caller_role, '') not in ('owner', 'organization_admin') then
    raise exception 'You do not have permission to add members.' using errcode = '42501';
  end if;

  select auth_users.id into target_user_id
  from auth.users as auth_users
  where lower(auth_users.email) = lower(trim(p_email))
  limit 1;

  if target_user_id is null then
    raise exception 'No registered account matches that email.' using errcode = 'P0002';
  end if;

  insert into public.organization_members (organization_id, user_id, role, added_by)
  values (p_organization_id, target_user_id, 'member', auth.uid())
  returning * into inserted_member;

  return inserted_member;
exception
  when unique_violation then
    raise exception 'This user is already a member of the organization.' using errcode = '23505';
end;
$$;

create or replace function public.set_organization_member_role(
  p_organization_id uuid,
  p_user_id uuid,
  p_role text
)
returns public.organization_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text;
  target_role text;
  updated_member public.organization_members;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;
  if p_role not in ('organization_admin', 'member') then
    raise exception 'Role must be organization_admin or member.' using errcode = '22023';
  end if;

  caller_role := private.organization_role(p_organization_id, auth.uid());
  if not private.is_platform_admin(auth.uid()) and caller_role <> 'owner' then
    raise exception 'Only the organization owner can change administrator roles.' using errcode = '42501';
  end if;

  target_role := private.organization_role(p_organization_id, p_user_id);
  if target_role is null then
    raise exception 'The user is not a member of this organization.' using errcode = 'P0002';
  end if;
  if target_role = 'owner' then
    raise exception 'Transfer ownership before changing the owner''s role.' using errcode = '42501';
  end if;

  update public.organization_members
  set role = p_role, updated_at = timezone('utc', now())
  where organization_id = p_organization_id and user_id = p_user_id
  returning * into updated_member;

  return updated_member;
end;
$$;

create or replace function public.remove_organization_member(
  p_organization_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text;
  target_role text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  caller_role := private.organization_role(p_organization_id, auth.uid());
  target_role := private.organization_role(p_organization_id, p_user_id);

  if target_role is null then
    raise exception 'The user is not a member of this organization.' using errcode = 'P0002';
  end if;
  if target_role = 'owner' then
    raise exception 'Transfer ownership before removing the owner.' using errcode = '42501';
  end if;
  if not private.is_platform_admin(auth.uid())
    and caller_role <> 'owner'
    and not (caller_role = 'organization_admin' and target_role = 'member') then
    raise exception 'You do not have permission to remove this member.' using errcode = '42501';
  end if;

  delete from public.organization_members
  where organization_id = p_organization_id and user_id = p_user_id;
end;
$$;

create or replace function public.transfer_organization_ownership(
  p_organization_id uuid,
  p_new_owner_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  select user_id into current_owner_id
  from public.organization_members
  where organization_id = p_organization_id and role = 'owner'
  for update;

  if current_owner_id is null then
    raise exception 'This organization does not have an owner.' using errcode = 'P0002';
  end if;
  if not private.is_platform_admin(auth.uid()) and current_owner_id <> auth.uid() then
    raise exception 'Only the current owner can transfer ownership.' using errcode = '42501';
  end if;
  if not private.is_organization_member(p_organization_id, p_new_owner_user_id) then
    raise exception 'The new owner must already be a member.' using errcode = 'P0002';
  end if;
  if current_owner_id = p_new_owner_user_id then
    return;
  end if;

  update public.organization_members
  set role = 'organization_admin', updated_at = timezone('utc', now())
  where organization_id = p_organization_id and user_id = current_owner_id;

  update public.organization_members
  set role = 'owner', updated_at = timezone('utc', now())
  where organization_id = p_organization_id and user_id = p_new_owner_user_id;
end;
$$;

create or replace function private.create_signup_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization_name text;
  new_organization_id uuid;
begin
  if coalesce(new.raw_user_meta_data ->> 'account_type', 'personal') <> 'company' then
    return new;
  end if;

  organization_name := trim(coalesce(new.raw_user_meta_data ->> 'company_name', ''));
  if char_length(organization_name) < 2 or char_length(organization_name) > 120 then
    raise exception 'Company name must be between 2 and 120 characters.';
  end if;

  insert into public.organizations (name, created_by)
  values (organization_name, new.id)
  returning id into new_organization_id;

  insert into public.organization_members (organization_id, user_id, role, added_by)
  values (new_organization_id, new.id, 'owner', new.id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_organization on auth.users;
create trigger on_auth_user_created_organization
after insert on auth.users
for each row execute procedure private.create_signup_organization();

create or replace function private.prevent_owner_account_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.organization_members
    where user_id = old.id and role = 'owner'
  ) then
    raise exception 'Transfer organization ownership before deleting this account.' using errcode = '23503';
  end if;
  return old;
end;
$$;

drop trigger if exists prevent_organization_owner_deletion on auth.users;
create trigger prevent_organization_owner_deletion
before delete on auth.users
for each row execute procedure private.prevent_owner_account_deletion();

revoke all on function public.get_my_organizations() from public, anon;
revoke all on function public.list_organization_members(uuid) from public, anon;
revoke all on function public.add_organization_member_by_email(uuid, text) from public, anon;
revoke all on function public.set_organization_member_role(uuid, uuid, text) from public, anon;
revoke all on function public.remove_organization_member(uuid, uuid) from public, anon;
revoke all on function public.transfer_organization_ownership(uuid, uuid) from public, anon;
grant execute on function public.get_my_organizations() to authenticated;
grant execute on function public.list_organization_members(uuid) to authenticated;
grant execute on function public.add_organization_member_by_email(uuid, text) to authenticated;
grant execute on function public.set_organization_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_organization_member(uuid, uuid) to authenticated;
grant execute on function public.transfer_organization_ownership(uuid, uuid) to authenticated;

revoke all on function private.create_signup_organization() from public, anon, authenticated;
revoke all on function private.prevent_owner_account_deletion() from public, anon, authenticated;

grant select on public.organizations to authenticated;
grant select on public.organization_members to authenticated;
grant select, insert, update, delete on public.organization_aircraft_maintenance to authenticated;
grant select on public.aircraft to anon, authenticated;
grant insert, update, delete on public.aircraft to authenticated;
