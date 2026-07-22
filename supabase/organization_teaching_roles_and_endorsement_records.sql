-- Teaching roles, organization student lookup, and organization-visible endorsement records.

alter table public.organization_members
  add column if not exists teaching_role text;

alter table public.organization_members
  drop constraint if exists organization_members_teaching_role_check;
alter table public.organization_members
  add constraint organization_members_teaching_role_check
  check (teaching_role is null or teaching_role in ('instructor', 'student'));

create index if not exists organization_members_teaching_role_idx
  on public.organization_members (organization_id, teaching_role)
  where teaching_role is not null;

create or replace function private.is_organization_instructor(
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
    where organization_id = p_organization_id
      and user_id = p_user_id
      and teaching_role = 'instructor'
  );
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
  select organization_members.user_id,
    auth_users.email::text,
    profiles.display_name::text,
    organization_members.role,
    organization_members.teaching_role,
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

create or replace function public.set_organization_member_teaching_role(
  p_organization_id uuid,
  p_user_id uuid,
  p_teaching_role text
)
returns public.organization_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_member public.organization_members;
begin
  if auth.uid() is null or not private.can_manage_organization(p_organization_id, auth.uid()) then
    raise exception 'Only organization owners and administrators can assign teaching roles.' using errcode = '42501';
  end if;
  if p_teaching_role is not null and p_teaching_role not in ('instructor', 'student') then
    raise exception 'Teaching role must be instructor, student, or empty.' using errcode = '22023';
  end if;

  update public.organization_members
  set teaching_role = nullif(trim(coalesce(p_teaching_role, '')), ''),
      updated_at = timezone('utc', now())
  where organization_id = p_organization_id and user_id = p_user_id
  returning * into updated_member;

  if not found then
    raise exception 'Organization member not found.' using errcode = 'P0002';
  end if;
  return updated_member;
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
  select members.user_id,
    self_person.id,
    coalesce(nullif(trim(self_person.display_name), ''), nullif(trim(profiles.display_name), ''), 'Student')::text,
    coalesce(pilot_certificate.certificate_number, self_person.cert_number)::text
  from public.organization_members members
  left join public.profiles profiles on profiles.id = members.user_id
  left join public.saved_people self_person
    on self_person.id = profiles.self_person_id and self_person.user_id = members.user_id
  left join lateral (
    select certificates.certificate_number
    from public.saved_person_certificates certificates
    where certificates.user_id = members.user_id
      and certificates.person_id = self_person.id
      and certificates.certificate_type = 'pilot'
    order by certificates.updated_at desc nulls last, certificates.created_at desc
    limit 1
  ) pilot_certificate on true
  where members.organization_id = p_organization_id
    and members.teaching_role = 'student'
  order by coalesce(self_person.display_name, profiles.display_name, 'Student');
end;
$$;

revoke all on function public.list_organization_members(uuid) from public, anon;
grant execute on function public.list_organization_members(uuid) to authenticated;
revoke all on function public.set_organization_member_teaching_role(uuid, uuid, text) from public, anon;
grant execute on function public.set_organization_member_teaching_role(uuid, uuid, text) to authenticated;
revoke all on function public.list_organization_students(uuid) from public, anon;
grant execute on function public.list_organization_students(uuid) to authenticated;

alter table public.endorsement_records
  add column if not exists organization_id uuid references public.organizations(id) on delete restrict,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create index if not exists endorsement_records_organization_idx
  on public.endorsement_records (organization_id, created_at desc)
  where organization_id is not null;

create or replace function private.prepare_endorsement_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
    new.organization_id := old.organization_id;
    new.storage_path := old.storage_path;
    new.updated_at := timezone('utc', now());
    return new;
  end if;

  if new.user_id <> auth.uid() then
    raise exception 'Endorsement records can only be created for the signed-in user.' using errcode = '42501';
  end if;

  if new.organization_id is null then
    select organization_id into new.organization_id
    from public.organization_members
    where user_id = auth.uid()
    order by created_at, organization_id
    limit 1;
  elsif not private.is_organization_member(new.organization_id, auth.uid()) then
    raise exception 'You are not a member of this organization.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists prepare_endorsement_record on public.endorsement_records;
create trigger prepare_endorsement_record
before insert or update on public.endorsement_records
for each row execute function private.prepare_endorsement_record();

alter table public.endorsement_records enable row level security;
drop policy if exists endorsement_records_select_own on public.endorsement_records;
drop policy if exists endorsement_records_insert_own on public.endorsement_records;
drop policy if exists endorsement_records_update_own on public.endorsement_records;
drop policy if exists endorsement_records_delete_own on public.endorsement_records;

create policy endorsement_records_select_authorized
on public.endorsement_records for select to authenticated
using (
  (select auth.uid()) = user_id
  or (organization_id is not null and (select private.can_manage_organization(organization_id)))
);
create policy endorsement_records_insert_own
on public.endorsement_records for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and (organization_id is null or (select private.is_organization_member(organization_id)))
);
create policy endorsement_records_update_own
on public.endorsement_records for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy endorsement_records_delete_own
on public.endorsement_records for delete to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.endorsement_records from public, anon, authenticated;
grant select, insert, update, delete on public.endorsement_records to authenticated;

drop policy if exists endorsement_records_files_select_own on storage.objects;
drop policy if exists endorsement_records_files_select_authorized on storage.objects;
create policy endorsement_records_files_select_authorized
on storage.objects for select to authenticated
using (
  bucket_id = 'endorsement-records'
  and (
    (select auth.uid())::text = (storage.foldername(name))[1]
    or exists (
      select 1
      from public.endorsement_records records
      where records.storage_path = name
        and records.organization_id is not null
        and (select private.can_manage_organization(records.organization_id))
    )
  )
);
