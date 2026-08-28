-- A linked student's self person and pilot certificate rows are the single
-- canonical identity. Instructors and organization managers edit them through
-- narrow audited RPCs; the underlying tables keep their owner-only RLS.

create table if not exists public.student_profile_change_log (
  id uuid primary key default gen_random_uuid(),
  student_user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete set null,
  change_kind text not null check (change_kind in ('formal_name', 'pilot_certificate', 'link_merge')),
  previous_value jsonb not null default '{}'::jsonb,
  next_value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists student_profile_change_log_student_idx
  on public.student_profile_change_log (student_user_id, created_at desc);

alter table public.student_profile_change_log enable row level security;
revoke all on public.student_profile_change_log from public, anon, authenticated;

create policy student_profile_change_log_student_read
on public.student_profile_change_log for select to authenticated
using ((select auth.uid()) = student_user_id);

grant select on public.student_profile_change_log to authenticated;

create or replace function private.can_edit_student_profile(
  p_actor_user_id uuid,
  p_student_user_id uuid,
  p_organization_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_actor_user_id is not null and (
    p_actor_user_id = p_student_user_id
    or private.is_platform_admin(p_actor_user_id)
    or exists (
      select 1
      from public.saved_person_account_links link
      where link.owner_user_id = p_actor_user_id
        and link.linked_user_id = p_student_user_id
    )
    or exists (
      select 1
      from public.organization_members actor_member
      join public.organization_members student_member
        on student_member.organization_id = actor_member.organization_id
       and student_member.user_id = p_student_user_id
      where actor_member.user_id = p_actor_user_id
        and (p_organization_id is null or actor_member.organization_id = p_organization_id)
        and (
          actor_member.teaching_role = 'instructor'
          or actor_member.role in ('owner', 'organization_admin')
        )
    )
  );
$$;

revoke all on function private.can_edit_student_profile(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function private.student_self_person_id(p_student_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select profile.self_person_id from public.profiles profile where profile.id = p_student_user_id),
    (select person.id from public.saved_people person
      where person.user_id = p_student_user_id and person.role = 'self'
      order by person.created_at limit 1)
  );
$$;

revoke all on function private.student_self_person_id(uuid) from public, anon, authenticated;

drop function if exists public.get_managed_student_profile(uuid, uuid);
create function public.get_managed_student_profile(
  p_student_user_id uuid,
  p_organization_id uuid default null
)
returns table (
  student_user_id uuid,
  formal_name text,
  account_nickname text,
  certificate_id uuid,
  certificate_number text,
  certificate_level text,
  ratings text[],
  additional_privileges jsonb,
  issue_date date,
  notes text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_edit_student_profile(auth.uid(), p_student_user_id, p_organization_id) then
    raise exception 'You do not have permission to view this student profile.' using errcode = '42501';
  end if;

  return query
  select p_student_user_id, nullif(btrim(self_person.display_name), ''),
    coalesce(nullif(btrim(profile.display_name), ''), 'Linked account')::text,
    certificate.id, nullif(btrim(certificate.certificate_number), ''),
    certificate.certificate_level, certificate.ratings,
    certificate.additional_privileges, certificate.issue_date,
    certificate.notes, certificate.updated_at
  from public.profiles profile
  left join public.saved_people self_person
    on self_person.id = private.student_self_person_id(p_student_user_id)
  left join public.saved_person_certificates certificate
    on certificate.user_id = p_student_user_id
   and certificate.person_id = self_person.id
   and certificate.certificate_type = 'pilot'
  where profile.id = p_student_user_id
  order by certificate.updated_at desc nulls last, certificate.created_at desc;
end;
$$;

revoke all on function public.get_managed_student_profile(uuid, uuid) from public, anon;
grant execute on function public.get_managed_student_profile(uuid, uuid) to authenticated;

create or replace function public.save_managed_student_profile(
  p_student_user_id uuid,
  p_organization_id uuid,
  p_formal_name text,
  p_certificate_id uuid default null,
  p_certificate_number text default null,
  p_certificate_level text default null,
  p_ratings text[] default '{}'::text[],
  p_additional_privileges jsonb default '[]'::jsonb,
  p_issue_date date default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_self_person_id uuid;
  v_certificate_id uuid;
  v_previous jsonb;
  v_next jsonb;
  v_name text := nullif(btrim(coalesce(p_formal_name, '')), '');
begin
  if not private.can_edit_student_profile(auth.uid(), p_student_user_id, p_organization_id) then
    raise exception 'You do not have permission to edit this student profile.' using errcode = '42501';
  end if;
  if v_name is null then
    raise exception 'A formal student name is required.' using errcode = '22023';
  end if;
  if p_certificate_level is not null and p_certificate_level not in ('Student', 'Private', 'Commercial', 'ATP') then
    raise exception 'Invalid pilot certificate level.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_additional_privileges, '[]'::jsonb)) <> 'array' then
    raise exception 'Additional privileges must be an array.' using errcode = '22023';
  end if;

  v_self_person_id := private.student_self_person_id(p_student_user_id);
  if v_self_person_id is null then
    insert into public.saved_people (user_id, role, display_name)
    values (p_student_user_id, 'self', v_name)
    returning id into v_self_person_id;
    update public.profiles set self_person_id = v_self_person_id where id = p_student_user_id;
  else
    select jsonb_build_object('formal_name', display_name) into v_previous
    from public.saved_people where id = v_self_person_id for update;
    update public.saved_people set display_name = v_name where id = v_self_person_id;
    if v_previous ->> 'formal_name' is distinct from v_name then
      insert into public.student_profile_change_log (
        student_user_id, actor_user_id, organization_id, change_kind, previous_value, next_value
      ) values (
        p_student_user_id, auth.uid(), p_organization_id, 'formal_name',
        coalesce(v_previous, '{}'::jsonb), jsonb_build_object('formal_name', v_name)
      );
    end if;
  end if;

  if nullif(btrim(coalesce(p_certificate_number, '')), '') is null
     and p_certificate_id is null
     and p_certificate_level is null
     and coalesce(array_length(p_ratings, 1), 0) = 0
     and coalesce(p_additional_privileges, '[]'::jsonb) = '[]'::jsonb then
    return null;
  end if;

  if p_certificate_id is not null then
    select to_jsonb(certificate) into v_previous
    from public.saved_person_certificates certificate
    where certificate.id = p_certificate_id
      and certificate.user_id = p_student_user_id
      and certificate.person_id = v_self_person_id
      and certificate.certificate_type = 'pilot'
    for update;
    if not found then
      raise exception 'Pilot certificate not found.' using errcode = 'P0002';
    end if;
    update public.saved_person_certificates
    set certificate_number = nullif(btrim(coalesce(p_certificate_number, '')), ''),
        certificate_level = p_certificate_level,
        ratings = coalesce(p_ratings, '{}'::text[]),
        additional_privileges = coalesce(p_additional_privileges, '[]'::jsonb),
        issue_date = p_issue_date,
        notes = nullif(btrim(coalesce(p_notes, '')), ''),
        updated_at = timezone('utc', now())
    where id = p_certificate_id
    returning id, to_jsonb(saved_person_certificates.*) into v_certificate_id, v_next;
  else
    insert into public.saved_person_certificates (
      user_id, person_id, certificate_type, certificate_number, certificate_level,
      ratings, additional_privileges, issue_date, notes
    ) values (
      p_student_user_id, v_self_person_id, 'pilot',
      nullif(btrim(coalesce(p_certificate_number, '')), ''), p_certificate_level,
      coalesce(p_ratings, '{}'::text[]), coalesce(p_additional_privileges, '[]'::jsonb),
      p_issue_date, nullif(btrim(coalesce(p_notes, '')), '')
    ) returning id, to_jsonb(saved_person_certificates.*) into v_certificate_id, v_next;
    v_previous := '{}'::jsonb;
  end if;

  -- A pilot certificate number belongs to the person, not to an individual
  -- rating row. Keep every pilot row on the same canonical number.
  update public.saved_person_certificates
  set certificate_number = nullif(btrim(coalesce(p_certificate_number, '')), ''),
      updated_at = timezone('utc', now())
  where user_id = p_student_user_id
    and person_id = v_self_person_id
    and certificate_type = 'pilot'
    and id <> v_certificate_id;

  insert into public.student_profile_change_log (
    student_user_id, actor_user_id, organization_id, change_kind, previous_value, next_value
  ) values (
    p_student_user_id, auth.uid(), p_organization_id, 'pilot_certificate',
    coalesce(v_previous, '{}'::jsonb), coalesce(v_next, '{}'::jsonb)
  );
  return v_certificate_id;
end;
$$;

revoke all on function public.save_managed_student_profile(uuid, uuid, text, uuid, text, text, text[], jsonb, date, text)
  from public, anon;
grant execute on function public.save_managed_student_profile(uuid, uuid, text, uuid, text, text, text[], jsonb, date, text)
  to authenticated;

create or replace function public.respond_saved_person_account_link_request(
  p_request_id uuid,
  p_accept boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.saved_person_account_link_requests;
  v_source_person public.saved_people;
  v_self_person_id uuid;
  v_profile_nickname text;
  v_source_certificate public.saved_person_certificates;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;
  select * into v_request from public.saved_person_account_link_requests
  where id = p_request_id for update;
  if not found or v_request.target_user_id <> auth.uid() or v_request.status <> 'pending' then
    raise exception 'Link request is no longer available.' using errcode = 'P0002';
  end if;

  if not p_accept then
    update public.saved_person_account_link_requests
    set status = 'rejected', responded_at = timezone('utc', now())
    where id = p_request_id;
    return;
  end if;

  select * into v_source_person from public.saved_people
  where id = v_request.saved_person_id and user_id = v_request.owner_user_id and role = 'student';
  if not found then raise exception 'Saved student not found.' using errcode = 'P0002'; end if;

  insert into public.saved_person_account_links (owner_user_id, saved_person_id, linked_user_id)
  values (v_request.owner_user_id, v_request.saved_person_id, v_request.target_user_id);

  select profile.self_person_id, profile.display_name
  into v_self_person_id, v_profile_nickname
  from public.profiles profile where profile.id = v_request.target_user_id for update;

  if v_self_person_id is null then
    insert into public.saved_people (user_id, role, display_name, cert_number)
    values (v_request.target_user_id, 'self', v_source_person.display_name, v_source_person.cert_number)
    returning id into v_self_person_id;
    update public.profiles set self_person_id = v_self_person_id where id = v_request.target_user_id;
  elsif exists (
    select 1 from public.saved_people person
    where person.id = v_self_person_id
      and (nullif(btrim(person.display_name), '') is null
        or lower(btrim(person.display_name)) = lower(btrim(coalesce(v_profile_nickname, ''))))
  ) then
    update public.saved_people set display_name = v_source_person.display_name
    where id = v_self_person_id;
  end if;

  if not exists (
    select 1 from public.saved_person_certificates certificate
    where certificate.user_id = v_request.target_user_id
      and certificate.person_id = v_self_person_id
      and certificate.certificate_type = 'pilot'
  ) then
    select * into v_source_certificate
    from public.saved_person_certificates certificate
    where certificate.user_id = v_request.owner_user_id
      and certificate.person_id = v_request.saved_person_id
      and certificate.certificate_type = 'pilot'
    order by certificate.updated_at desc nulls last, certificate.created_at desc
    limit 1;

    if found then
      insert into public.saved_person_certificates (
        user_id, person_id, certificate_type, certificate_number, ratings,
        issue_date, last_event_date, event_type, certificate_level,
        additional_privileges, notes
      ) values (
        v_request.target_user_id, v_self_person_id, 'pilot',
        v_source_certificate.certificate_number, v_source_certificate.ratings,
        v_source_certificate.issue_date, v_source_certificate.last_event_date,
        v_source_certificate.event_type, v_source_certificate.certificate_level,
        v_source_certificate.additional_privileges, v_source_certificate.notes
      );
    elsif nullif(btrim(coalesce(v_source_person.cert_number, '')), '') is not null then
      insert into public.saved_person_certificates (
        user_id, person_id, certificate_type, certificate_number
      ) values (
        v_request.target_user_id, v_self_person_id, 'pilot', v_source_person.cert_number
      );
    end if;
  end if;

  insert into public.student_profile_change_log (
    student_user_id, actor_user_id, change_kind, previous_value, next_value
  ) values (
    v_request.target_user_id, v_request.owner_user_id, 'link_merge',
    '{}'::jsonb,
    jsonb_build_object('saved_person_id', v_request.saved_person_id, 'formal_name', v_source_person.display_name)
  );

  update public.endorsement_records
  set student_user_id = v_request.target_user_id, updated_at = timezone('utc', now())
  where user_id = v_request.owner_user_id
    and student_id = v_request.saved_person_id
    and student_user_id is null;

  update public.saved_person_account_link_requests
  set status = 'accepted', responded_at = timezone('utc', now())
  where id = p_request_id;
end;
$$;

revoke all on function public.respond_saved_person_account_link_request(uuid, boolean) from public, anon;
grant execute on function public.respond_saved_person_account_link_request(uuid, boolean) to authenticated;

drop function if exists public.get_my_organizations();
create function public.get_my_organizations()
returns table (
  id uuid,
  name text,
  member_role text,
  teaching_role text,
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
    organizations.created_at
  from public.organization_members members
  join public.organizations organizations on organizations.id = members.organization_id
  where auth.uid() is not null and members.user_id = auth.uid()
  order by organizations.name;
$$;

revoke all on function public.get_my_organizations() from public, anon;
grant execute on function public.get_my_organizations() to authenticated;

create or replace function public.list_organization_members(p_organization_id uuid)
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
  if auth.uid() is null or not (
    private.can_manage_organization(p_organization_id, auth.uid())
    or private.is_organization_instructor(p_organization_id, auth.uid())
  ) then
    raise exception 'You do not have permission to view this organization''s members.' using errcode = '42501';
  end if;
  return query
  select members.user_id, auth_users.email::text, profiles.display_name::text,
    members.role, members.teaching_role, members.created_at
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

create or replace function public.list_organization_people(p_organization_id uuid)
returns table (
  id uuid, organization_id uuid, email text, organization_display_name text,
  profile_display_name text, teaching_role text, internal_id text, notes text,
  user_id uuid, status text, member_role text, created_at timestamptz, linked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (
    private.can_manage_organization(p_organization_id, auth.uid())
    or private.is_organization_instructor(p_organization_id, auth.uid())
    or private.is_platform_admin(auth.uid())
  ) then
    raise exception 'You do not have permission to view this organization roster.' using errcode = '42501';
  end if;
  return query
  select people.id, people.organization_id, people.email,
    people.organization_display_name, profiles.display_name,
    people.teaching_role, people.internal_id,
    case when private.can_manage_organization(p_organization_id, auth.uid())
      or private.is_platform_admin(auth.uid()) then people.notes else null end,
    people.user_id, people.status, members.role, people.created_at, people.linked_at
  from public.organization_people people
  left join public.profiles profiles on profiles.id = people.user_id
  left join public.organization_members members
    on members.organization_id = people.organization_id and members.user_id = people.user_id
  where people.organization_id = p_organization_id and people.status <> 'archived'
  order by case people.status when 'pending' then 0 else 1 end,
    lower(coalesce(people.organization_display_name, profiles.display_name, people.email));
end;
$$;

revoke all on function public.list_organization_people(uuid) from public, anon;
grant execute on function public.list_organization_people(uuid) to authenticated;
