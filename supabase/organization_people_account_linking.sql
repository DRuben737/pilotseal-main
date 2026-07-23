-- Organization roster records exist independently from Auth accounts. A verified
-- account may claim a pending record only when its email matches exactly.

create table if not exists public.organization_people (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (char_length(btrim(email)) between 3 and 320),
  normalized_email text generated always as (lower(btrim(email))) stored,
  organization_display_name text,
  teaching_role text check (teaching_role is null or teaching_role in ('instructor', 'student')),
  internal_id text,
  notes text,
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'linked', 'archived')),
  added_by uuid references auth.users(id) on delete set null,
  linked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint organization_people_link_state_check check (
    (status = 'linked' and user_id is not null and linked_at is not null)
    or (status in ('pending', 'archived') and user_id is null)
  ),
  unique (organization_id, normalized_email)
);

create unique index if not exists organization_people_org_user_idx
on public.organization_people (organization_id, user_id)
where user_id is not null;

create index if not exists organization_people_pending_email_idx
on public.organization_people (normalized_email, created_at)
where status = 'pending';

create index if not exists organization_people_added_by_idx
on public.organization_people (added_by)
where added_by is not null;

alter table public.organization_people enable row level security;
revoke all on public.organization_people from public, anon, authenticated;

drop policy if exists organization_people_deny_direct_access on public.organization_people;
create policy organization_people_deny_direct_access
on public.organization_people
for select
to authenticated
using (false);

create or replace function private.sync_organization_person_from_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_display_name text;
begin
  if tg_op = 'DELETE' then
    update public.organization_people
    set user_id = null,
        status = 'archived',
        linked_at = null,
        updated_at = timezone('utc', now())
    where organization_id = old.organization_id
      and user_id = old.user_id;
    return old;
  end if;

  select auth_users.email, profiles.display_name
  into v_email, v_display_name
  from auth.users as auth_users
  left join public.profiles as profiles on profiles.id = auth_users.id
  where auth_users.id = new.user_id;

  if v_email is null then
    return new;
  end if;

  insert into public.organization_people (
    organization_id,
    email,
    organization_display_name,
    teaching_role,
    user_id,
    status,
    added_by,
    linked_at
  ) values (
    new.organization_id,
    v_email,
    nullif(btrim(coalesce(v_display_name, '')), ''),
    new.teaching_role,
    new.user_id,
    'linked',
    new.added_by,
    timezone('utc', now())
  )
  on conflict (organization_id, normalized_email) do update
  set user_id = excluded.user_id,
      status = 'linked',
      linked_at = coalesce(public.organization_people.linked_at, excluded.linked_at),
      teaching_role = excluded.teaching_role,
      organization_display_name = coalesce(
        nullif(btrim(public.organization_people.organization_display_name), ''),
        excluded.organization_display_name
      ),
      updated_at = timezone('utc', now());

  return new;
end;
$$;

drop trigger if exists sync_organization_person_from_member on public.organization_members;
create trigger sync_organization_person_from_member
after insert or update of teaching_role or delete on public.organization_members
for each row execute function private.sync_organization_person_from_member();

insert into public.organization_people (
  organization_id,
  email,
  organization_display_name,
  teaching_role,
  user_id,
  status,
  added_by,
  linked_at,
  created_at,
  updated_at
)
select
  members.organization_id,
  auth_users.email,
  nullif(btrim(coalesce(profiles.display_name, '')), ''),
  members.teaching_role,
  members.user_id,
  'linked',
  members.added_by,
  members.created_at,
  members.created_at,
  members.updated_at
from public.organization_members as members
join auth.users as auth_users on auth_users.id = members.user_id
left join public.profiles as profiles on profiles.id = members.user_id
where auth_users.email is not null
on conflict (organization_id, normalized_email) do update
set user_id = excluded.user_id,
    status = 'linked',
    linked_at = coalesce(public.organization_people.linked_at, excluded.linked_at),
    teaching_role = excluded.teaching_role,
    updated_at = timezone('utc', now());

create or replace function public.list_organization_people(p_organization_id uuid)
returns table (
  id uuid,
  organization_id uuid,
  email text,
  organization_display_name text,
  profile_display_name text,
  teaching_role text,
  internal_id text,
  notes text,
  user_id uuid,
  status text,
  member_role text,
  created_at timestamptz,
  linked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (
    private.can_manage_organization(p_organization_id, auth.uid())
    or private.is_platform_admin(auth.uid())
  ) then
    raise exception 'You do not have permission to view this organization roster.' using errcode = '42501';
  end if;

  return query
  select
    people.id,
    people.organization_id,
    people.email,
    people.organization_display_name,
    profiles.display_name,
    people.teaching_role,
    people.internal_id,
    people.notes,
    people.user_id,
    people.status,
    members.role,
    people.created_at,
    people.linked_at
  from public.organization_people as people
  left join public.profiles as profiles on profiles.id = people.user_id
  left join public.organization_members as members
    on members.organization_id = people.organization_id
   and members.user_id = people.user_id
  where people.organization_id = p_organization_id
    and people.status <> 'archived'
  order by
    case people.status when 'pending' then 0 else 1 end,
    lower(coalesce(people.organization_display_name, profiles.display_name, people.email));
end;
$$;

create or replace function public.add_organization_person(
  p_organization_id uuid,
  p_email text,
  p_display_name text default null,
  p_teaching_role text default null,
  p_internal_id text default null,
  p_notes text default null
)
returns public.organization_people
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_display_name text := nullif(btrim(coalesce(p_display_name, '')), '');
  v_teaching_role text := nullif(btrim(coalesce(p_teaching_role, '')), '');
  v_target_user_id uuid;
  v_person public.organization_people;
begin
  if auth.uid() is null or not (
    private.can_manage_organization(p_organization_id, auth.uid())
    or private.is_platform_admin(auth.uid())
  ) then
    raise exception 'Only organization Owners and Admins can add people.' using errcode = '42501';
  end if;
  if v_email = '' or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;
  if v_teaching_role is not null and v_teaching_role not in ('instructor', 'student') then
    raise exception 'Teaching role must be Instructor, Student, or empty.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_internal_id, '')) > 120 or char_length(coalesce(p_notes, '')) > 2000 then
    raise exception 'Internal ID or notes are too long.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('pilotseal.organization_person:' || p_organization_id::text || ':' || v_email, 0)
  );

  if exists (
    select 1 from public.organization_people
    where organization_id = p_organization_id
      and normalized_email = v_email
      and status <> 'archived'
  ) then
    raise exception 'This email is already on the organization roster.' using errcode = '23505';
  end if;

  select auth_users.id into v_target_user_id
  from auth.users as auth_users
  where lower(btrim(coalesce(auth_users.email, ''))) = v_email
    and auth_users.email_confirmed_at is not null
  order by auth_users.created_at
  limit 1;

  insert into public.organization_people (
    organization_id,
    email,
    organization_display_name,
    teaching_role,
    internal_id,
    notes,
    user_id,
    status,
    added_by,
    linked_at
  ) values (
    p_organization_id,
    v_email,
    v_display_name,
    v_teaching_role,
    nullif(btrim(coalesce(p_internal_id, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    v_target_user_id,
    case when v_target_user_id is null then 'pending' else 'linked' end,
    auth.uid(),
    case when v_target_user_id is null then null else timezone('utc', now()) end
  )
  on conflict (organization_id, normalized_email) do update
  set email = excluded.email,
      organization_display_name = excluded.organization_display_name,
      teaching_role = excluded.teaching_role,
      internal_id = excluded.internal_id,
      notes = excluded.notes,
      user_id = excluded.user_id,
      status = excluded.status,
      added_by = excluded.added_by,
      linked_at = excluded.linked_at,
      updated_at = timezone('utc', now())
  returning * into v_person;

  if v_target_user_id is not null then
    insert into public.organization_members (
      organization_id,
      user_id,
      role,
      teaching_role,
      added_by
    ) values (
      p_organization_id,
      v_target_user_id,
      'member',
      v_teaching_role,
      auth.uid()
    )
    on conflict (organization_id, user_id) do update
    set teaching_role = coalesce(
          public.organization_members.teaching_role,
          excluded.teaching_role
        ),
        updated_at = timezone('utc', now());
  end if;

  select * into v_person
  from public.organization_people
  where id = v_person.id;
  return v_person;
end;
$$;

create or replace function public.update_organization_person(
  p_person_id uuid,
  p_display_name text default null,
  p_teaching_role text default null,
  p_internal_id text default null,
  p_notes text default null
)
returns public.organization_people
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person public.organization_people;
  v_teaching_role text := nullif(btrim(coalesce(p_teaching_role, '')), '');
begin
  select * into v_person
  from public.organization_people
  where id = p_person_id
  for update;
  if not found then
    raise exception 'Organization person not found.' using errcode = 'P0002';
  end if;
  if auth.uid() is null or not (
    private.can_manage_organization(v_person.organization_id, auth.uid())
    or private.is_platform_admin(auth.uid())
  ) then
    raise exception 'Only organization Owners and Admins can update people.' using errcode = '42501';
  end if;
  if v_teaching_role is not null and v_teaching_role not in ('instructor', 'student') then
    raise exception 'Teaching role must be Instructor, Student, or empty.' using errcode = '22023';
  end if;

  update public.organization_people
  set organization_display_name = nullif(btrim(coalesce(p_display_name, '')), ''),
      teaching_role = v_teaching_role,
      internal_id = nullif(btrim(coalesce(p_internal_id, '')), ''),
      notes = nullif(btrim(coalesce(p_notes, '')), ''),
      updated_at = timezone('utc', now())
  where id = p_person_id
  returning * into v_person;

  if v_person.user_id is not null then
    update public.organization_members
    set teaching_role = v_teaching_role,
        updated_at = timezone('utc', now())
    where organization_id = v_person.organization_id
      and user_id = v_person.user_id;
  end if;
  return v_person;
end;
$$;

create or replace function public.archive_pending_organization_person(p_person_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person public.organization_people;
begin
  select * into v_person
  from public.organization_people
  where id = p_person_id
  for update;
  if not found then
    raise exception 'Organization person not found.' using errcode = 'P0002';
  end if;
  if auth.uid() is null or not (
    private.can_manage_organization(v_person.organization_id, auth.uid())
    or private.is_platform_admin(auth.uid())
  ) then
    raise exception 'Only organization Owners and Admins can remove pending people.' using errcode = '42501';
  end if;
  if v_person.status <> 'pending' or v_person.user_id is not null then
    raise exception 'Linked people must be removed through member management.' using errcode = '22023';
  end if;
  update public.organization_people
  set status = 'archived', updated_at = timezone('utc', now())
  where id = p_person_id;
end;
$$;

create or replace function public.list_my_available_organizations()
returns table (
  person_id uuid,
  organization_id uuid,
  organization_name text,
  organization_display_name text,
  teaching_role text,
  internal_id text,
  added_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;
  select lower(btrim(auth_users.email)) into v_email
  from auth.users as auth_users
  where auth_users.id = auth.uid()
    and auth_users.email_confirmed_at is not null;
  if v_email is null then
    return;
  end if;

  return query
  select
    people.id,
    people.organization_id,
    organizations.name,
    people.organization_display_name,
    people.teaching_role,
    people.internal_id,
    people.created_at
  from public.organization_people as people
  join public.organizations on organizations.id = people.organization_id
  where people.normalized_email = v_email
    and people.status = 'pending'
    and people.user_id is null
    and not exists (
      select 1 from public.organization_members as members
      where members.organization_id = people.organization_id
        and members.user_id = auth.uid()
    )
  order by lower(organizations.name), people.created_at;
end;
$$;

create or replace function public.claim_organization_person(p_person_id uuid)
returns public.organization_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_person public.organization_people;
  v_member public.organization_members;
  v_organization_name text;
  v_manager record;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;
  select lower(btrim(auth_users.email)) into v_email
  from auth.users as auth_users
  where auth_users.id = auth.uid()
    and auth_users.email_confirmed_at is not null;
  if v_email is null then
    raise exception 'Verify your email before linking an organization.' using errcode = '42501';
  end if;

  select * into v_person
  from public.organization_people
  where id = p_person_id
  for update;
  if not found or v_person.status <> 'pending' or v_person.user_id is not null then
    raise exception 'This organization link is no longer available.' using errcode = 'P0002';
  end if;
  if v_person.normalized_email <> v_email then
    raise exception 'This organization link belongs to a different verified email.' using errcode = '42501';
  end if;

  insert into public.organization_members (
    organization_id,
    user_id,
    role,
    teaching_role,
    added_by
  ) values (
    v_person.organization_id,
    auth.uid(),
    'member',
    v_person.teaching_role,
    v_person.added_by
  )
  on conflict (organization_id, user_id) do update
  set teaching_role = coalesce(
        public.organization_members.teaching_role,
        excluded.teaching_role
      ),
      updated_at = timezone('utc', now())
  returning * into v_member;

  update public.organization_people
  set user_id = auth.uid(),
      status = 'linked',
      linked_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = v_person.id;

  select name into v_organization_name
  from public.organizations
  where id = v_person.organization_id;

  for v_manager in
    select user_id
    from public.organization_members
    where organization_id = v_person.organization_id
      and role in ('owner', 'organization_admin')
      and user_id <> auth.uid()
  loop
    perform private.create_user_notification(
      v_manager.user_id,
      'Organization person linked',
      coalesce(v_person.organization_display_name, v_person.email) || ' linked a PilotSeal account to ' || v_organization_name || '.',
      'organization', 'normal', v_person.organization_id, v_organization_name,
      '/dashboard/organization',
      'organization-person:' || v_person.id::text || ':linked',
      auth.uid()
    );
  end loop;
  return v_member;
end;
$$;

-- Preserve the legacy exact-email operation for older clients while routing it
-- through the roster workflow.
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
  v_person public.organization_people;
  v_member public.organization_members;
begin
  if auth.uid() is null or not (
    private.can_manage_organization(p_organization_id, auth.uid())
    or private.is_platform_admin(auth.uid())
  ) then
    raise exception 'Only organization Owners and Admins can add members.'
      using errcode = '42501';
  end if;

  v_person := public.add_organization_person(
    p_organization_id,
    p_email,
    null,
    null,
    null,
    null
  );
  if v_person.user_id is null then
    raise exception 'No verified registered account matches that email. Add this person from the updated organization roster instead.' using errcode = 'P0002';
  end if;
  select * into v_member
  from public.organization_members
  where organization_id = p_organization_id
    and user_id = v_person.user_id;
  return v_member;
end;
$$;

drop function if exists public.list_organization_members(uuid);
create function public.list_organization_members(p_organization_id uuid)
returns table (
  user_id uuid,
  email text,
  display_name text,
  member_role text,
  teaching_role text,
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
  select
    members.user_id,
    auth_users.email::text,
    coalesce(nullif(btrim(people.organization_display_name), ''), profiles.display_name)::text,
    members.role,
    members.teaching_role,
    members.created_at
  from public.organization_members as members
  join auth.users as auth_users on auth_users.id = members.user_id
  left join public.profiles as profiles on profiles.id = members.user_id
  left join public.organization_people as people
    on people.organization_id = members.organization_id
   and people.user_id = members.user_id
   and people.status = 'linked'
  where members.organization_id = p_organization_id
  order by
    case members.role when 'owner' then 0 when 'organization_admin' then 1 else 2 end,
    lower(coalesce(people.organization_display_name, profiles.display_name, auth_users.email));
end;
$$;

create or replace function public.list_organization_students(p_organization_id uuid)
returns table (
  student_user_id uuid,
  person_id uuid,
  display_name text,
  certificate_number text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (
    private.is_organization_instructor(p_organization_id, auth.uid())
    or private.can_manage_organization(p_organization_id, auth.uid())
  ) then
    raise exception 'Only organization instructors and administrators can view organization students.' using errcode = '42501';
  end if;
  return query
  select
    members.user_id,
    self_person.id,
    coalesce(
      nullif(btrim(organization_person.organization_display_name), ''),
      nullif(btrim(self_person.display_name), ''),
      nullif(btrim(profiles.display_name), ''),
      'Student'
    )::text,
    coalesce(pilot_certificate.certificate_number, self_person.cert_number)::text
  from public.organization_members as members
  left join public.organization_people as organization_person
    on organization_person.organization_id = members.organization_id
   and organization_person.user_id = members.user_id
   and organization_person.status = 'linked'
  left join public.profiles as profiles on profiles.id = members.user_id
  left join public.saved_people as self_person
    on self_person.id = profiles.self_person_id and self_person.user_id = members.user_id
  left join lateral (
    select certificates.certificate_number
    from public.saved_person_certificates as certificates
    where certificates.user_id = members.user_id
      and certificates.person_id = self_person.id
      and certificates.certificate_type = 'pilot'
    order by certificates.updated_at desc nulls last, certificates.created_at desc
    limit 1
  ) as pilot_certificate on true
  where members.organization_id = p_organization_id
    and members.teaching_role = 'student'
  order by coalesce(
    organization_person.organization_display_name,
    self_person.display_name,
    profiles.display_name,
    'Student'
  );
end;
$$;

revoke all on function public.list_organization_people(uuid) from public, anon, authenticated;
revoke all on function public.add_organization_person(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.update_organization_person(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.archive_pending_organization_person(uuid) from public, anon, authenticated;
revoke all on function public.list_my_available_organizations() from public, anon, authenticated;
revoke all on function public.claim_organization_person(uuid) from public, anon, authenticated;
revoke all on function public.add_organization_member_by_email(uuid, text) from public, anon, authenticated;
revoke all on function public.list_organization_members(uuid) from public, anon, authenticated;
revoke all on function public.list_organization_students(uuid) from public, anon, authenticated;

grant execute on function public.list_organization_people(uuid) to authenticated;
grant execute on function public.add_organization_person(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.update_organization_person(uuid, text, text, text, text) to authenticated;
grant execute on function public.archive_pending_organization_person(uuid) to authenticated;
grant execute on function public.list_my_available_organizations() to authenticated;
grant execute on function public.claim_organization_person(uuid) to authenticated;
grant execute on function public.add_organization_member_by_email(uuid, text) to authenticated;
grant execute on function public.list_organization_members(uuid) to authenticated;
grant execute on function public.list_organization_students(uuid) to authenticated;

revoke all on function private.sync_organization_person_from_member() from public, anon, authenticated;
