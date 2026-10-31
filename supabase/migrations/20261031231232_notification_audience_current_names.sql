-- Keep the notification picker aligned with the canonical names shown in
-- organization member management, and always derive organization audiences
-- from current membership state.
create or replace function public.get_notification_publication_audience(
  p_organization_id uuid default null
)
returns table(user_id uuid, display_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (
    case when p_organization_id is null then private.is_platform_admin(auth.uid())
      else private.has_organization_permission(p_organization_id, 'notifications', auth.uid()) end
  ) then
    raise exception 'Publishing permission required' using errcode = '42501';
  end if;

  if p_organization_id is null then
    return query
    select profiles.id,
      coalesce(nullif(btrim(profiles.display_name), ''), nullif(btrim(auth_users.email), ''), 'Member')::text
    from public.profiles as profiles
    left join auth.users as auth_users on auth_users.id = profiles.id
    order by 2, profiles.id;
    return;
  end if;

  return query
  select members.user_id,
    coalesce(
      organization_person.display_name,
      nullif(btrim(self_person.display_name), ''),
      nullif(btrim(profiles.display_name), ''),
      nullif(btrim(auth_users.email), ''),
      'Member'
    )::text
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
    and (members.teaching_role is distinct from 'student' or members.student_status = 'active')
  order by 2, members.user_id;
end;
$$;

create or replace function public.get_notification_publication_audience_groups(
  p_organization_id uuid default null
)
returns table(user_id uuid, display_name text, group_keys text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (
    case when p_organization_id is null then private.is_platform_admin(auth.uid())
      else private.has_organization_permission(p_organization_id, 'notifications', auth.uid()) end
  ) then
    raise exception 'Publishing permission required' using errcode = '42501';
  end if;

  if p_organization_id is null then
    return query
    select profiles.id,
      coalesce(nullif(btrim(profiles.display_name), ''), nullif(btrim(auth_users.email), ''), 'Member')::text,
      array[case when profiles.role = 'admin' then 'administrators' else 'members' end]::text[]
    from public.profiles as profiles
    left join auth.users as auth_users on auth_users.id = profiles.id
    order by 2, profiles.id;
    return;
  end if;

  return query
  select members.user_id,
    coalesce(
      organization_person.display_name,
      nullif(btrim(self_person.display_name), ''),
      nullif(btrim(profiles.display_name), ''),
      nullif(btrim(auth_users.email), ''),
      'Member'
    )::text,
    array[
      case when members.teaching_role = 'instructor' then 'instructors'
        when members.teaching_role = 'student' then 'students'
        else 'unassigned' end
    ]::text[]
    || case when members.role in ('owner', 'organization_admin')
      then array['administrators']::text[] else '{}'::text[] end
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
    and (members.teaching_role is distinct from 'student' or members.student_status = 'active')
  order by 2, members.user_id;
end;
$$;

revoke all on function public.get_notification_publication_audience(uuid) from public, anon;
revoke all on function public.get_notification_publication_audience_groups(uuid) from public, anon;
grant execute on function public.get_notification_publication_audience(uuid) to authenticated;
grant execute on function public.get_notification_publication_audience_groups(uuid) to authenticated;
