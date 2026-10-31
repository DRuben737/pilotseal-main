-- Keep former students in the organization for history while excluding them
-- from current student workflows and organization notification audiences.
alter table public.organization_members
  add column if not exists student_status text not null default 'active';

alter table public.organization_members
  drop constraint if exists organization_members_student_status_check;
alter table public.organization_members
  add constraint organization_members_student_status_check
  check (student_status in ('active', 'inactive'));

create index if not exists organization_members_active_students_idx
  on public.organization_members (organization_id, user_id)
  where teaching_role = 'student' and student_status = 'active';

drop function if exists public.list_organization_members(uuid);
create function public.list_organization_members(p_organization_id uuid)
returns table (
  user_id uuid,
  email text,
  display_name text,
  member_role text,
  teaching_role text,
  student_status text,
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
  select
    members.user_id,
    auth_users.email::text,
    coalesce(
      organization_person.display_name,
      nullif(btrim(self_person.display_name), ''),
      nullif(btrim(profiles.display_name), '')
    )::text,
    members.role,
    members.teaching_role,
    members.student_status,
    coalesce(private.organization_permissions(p_organization_id, members.user_id), '{}'::text[]),
    members.created_at
  from public.organization_members as members
  join auth.users as auth_users on auth_users.id = members.user_id
  left join public.profiles as profiles on profiles.id = members.user_id
  left join public.saved_people as self_person
    on self_person.id = profiles.self_person_id
   and self_person.user_id = members.user_id
  left join lateral (
    select nullif(btrim(people.organization_display_name), '') as display_name
    from public.organization_people as people
    where people.organization_id = members.organization_id
      and people.user_id = members.user_id
      and people.status <> 'archived'
    order by people.linked_at desc nulls last, people.created_at desc
    limit 1
  ) as organization_person on true
  where members.organization_id = p_organization_id
  order by
    case members.role when 'owner' then 0 when 'organization_admin' then 1 else 2 end,
    lower(coalesce(
      organization_person.display_name,
      nullif(btrim(self_person.display_name), ''),
      nullif(btrim(profiles.display_name), ''),
      auth_users.email
    ));
end;
$$;

revoke all on function public.list_organization_members(uuid) from public, anon;
grant execute on function public.list_organization_members(uuid) to authenticated;

create or replace function public.set_organization_student_status(
  p_organization_id uuid,
  p_user_id uuid,
  p_status text
)
returns public.organization_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_member public.organization_members;
begin
  if auth.uid() is null or not private.has_organization_permission(p_organization_id, 'members', auth.uid()) then
    raise exception 'People management permission is required.' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('active', 'inactive') then
    raise exception 'Student status must be active or inactive.' using errcode = '22023';
  end if;

  update public.organization_members
  set student_status = p_status,
      updated_at = timezone('utc', now())
  where organization_id = p_organization_id
    and user_id = p_user_id
    and teaching_role = 'student'
  returning * into updated_member;

  if not found then
    raise exception 'Active or inactive status can only be set for an organization student.' using errcode = 'P0002';
  end if;

  if p_status = 'inactive' then
    update public.notifications
    set is_active = false,
        withdrawn_at = coalesce(withdrawn_at, now())
    where organization_id = p_organization_id
      and recipient_user_id = p_user_id
      and withdrawn_at is null
      and scheduled_at > timezone('utc', now());
  end if;

  return updated_member;
end;
$$;

revoke all on function public.set_organization_student_status(uuid, uuid, text) from public, anon;
grant execute on function public.set_organization_student_status(uuid, uuid, text) to authenticated;

create or replace function public.list_organization_students(p_organization_id uuid)
returns table (
  student_user_id uuid,
  person_id uuid,
  saved_person_id uuid,
  formal_name text,
  account_nickname text,
  effective_certificate_number text,
  certificate_source text,
  endorsement_ready boolean,
  certificate_conflict boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (
    private.is_organization_instructor(p_organization_id, auth.uid())
    or private.has_organization_permission(p_organization_id, 'members', auth.uid())
  ) then
    raise exception 'Only organization instructors and administrators can view organization students.'
      using errcode = '42501';
  end if;

  return query
  select candidate.student_user_id, candidate.canonical_person_id,
    candidate.saved_person_id, candidate.formal_name,
    candidate.account_nickname, candidate.effective_certificate_number,
    candidate.certificate_source, candidate.endorsement_ready,
    candidate.certificate_conflict
  from public.list_my_student_candidates() candidate
  where p_organization_id = any(candidate.organization_ids)
    and exists (
      select 1
      from public.organization_members member
      where member.organization_id = p_organization_id
        and member.user_id = candidate.student_user_id
        and member.teaching_role = 'student'
        and member.student_status = 'active'
    )
  order by candidate.formal_name nulls last, candidate.identity_key;
end;
$$;

revoke all on function public.list_organization_students(uuid) from public, anon;
grant execute on function public.list_organization_students(uuid) to authenticated;

create or replace function public.get_notification_publication_audience(p_organization_id uuid default null)
returns table(user_id uuid, display_name text)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not (case when p_organization_id is null then private.is_platform_admin(auth.uid())
    else private.has_organization_permission(p_organization_id,'notifications',auth.uid()) end) then
    raise exception 'Publishing permission required' using errcode = '42501';
  end if;
  return query select p.id, coalesce(nullif(p.display_name,''),'Member') from public.profiles p
    where p_organization_id is null or exists(
      select 1 from public.organization_members m
      where m.organization_id = p_organization_id
        and m.user_id = p.id
        and (m.teaching_role is distinct from 'student' or m.student_status = 'active')
    )
    order by p.display_name, p.id;
end;
$$;

create or replace function public.get_notification_publication_audience_groups(p_organization_id uuid default null)
returns table(user_id uuid, display_name text, group_keys text[])
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not (case when p_organization_id is null then private.is_platform_admin(auth.uid())
    else private.has_organization_permission(p_organization_id,'notifications',auth.uid()) end) then
    raise exception 'Publishing permission required' using errcode = '42501';
  end if;
  return query
    select p.id, coalesce(nullif(p.display_name,''),'Member'),
      case when p_organization_id is null then
        array[case when p.role = 'admin' then 'administrators' else 'members' end]::text[]
      else
        array[case when m.teaching_role = 'instructor' then 'instructors'
          when m.teaching_role = 'student' then 'students' else 'unassigned' end]::text[]
        || case when m.role in ('owner','organization_admin') then array['administrators']::text[] else '{}'::text[] end
      end
    from public.profiles p
    left join public.organization_members m on m.user_id=p.id and m.organization_id=p_organization_id
    where p_organization_id is null
      or (m.user_id is not null and (m.teaching_role is distinct from 'student' or m.student_status = 'active'))
    order by p.display_name,p.id;
end;
$$;

revoke all on function public.get_notification_publication_audience(uuid) from public, anon;
revoke all on function public.get_notification_publication_audience_groups(uuid) from public, anon;
grant execute on function public.get_notification_publication_audience(uuid) to authenticated;
grant execute on function public.get_notification_publication_audience_groups(uuid) to authenticated;
