-- Receipt rows are people, not permission roles. Resolve names from the same
-- organization and account identity sources used by the audience picker.
create or replace function public.get_notification_publication_report(p_id uuid)
returns table(
  user_id uuid,
  display_name text,
  displayed_at timestamptz,
  read_at timestamptz,
  acknowledged_at timestamptz,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  publication public.notification_publications%rowtype;
begin
  select *
  into publication
  from public.notification_publications
  where id = p_id;

  if not found or auth.uid() is null or not (
    case
      when publication.organization_id is null then private.is_platform_admin(auth.uid())
      else private.has_organization_permission(publication.organization_id, 'notifications', auth.uid())
    end
  ) then
    raise exception 'Publishing permission required' using errcode = '42501';
  end if;

  return query
  select
    notification.recipient_user_id,
    coalesce(
      organization_person.display_name,
      nullif(btrim(self_person.display_name), ''),
      nullif(btrim(profile.display_name), ''),
      nullif(btrim(auth_user.email), ''),
      'Unknown user'
    )::text,
    delivery.displayed_at,
    notification_read.read_at::timestamptz,
    delivery.acknowledged_at,
    delivery.completed_at
  from public.notifications as notification
  left join public.profiles as profile
    on profile.id = notification.recipient_user_id
  left join public.saved_people as self_person
    on self_person.id = profile.self_person_id
   and self_person.user_id = notification.recipient_user_id
  left join auth.users as auth_user
    on auth_user.id = notification.recipient_user_id
  left join lateral (
    select nullif(btrim(person.organization_display_name), '') as display_name
    from public.organization_people as person
    where person.organization_id = publication.organization_id
      and person.user_id = notification.recipient_user_id
      and person.status <> 'archived'
    order by person.linked_at desc nulls last, person.created_at desc
    limit 1
  ) as organization_person on publication.organization_id is not null
  left join public.notification_delivery_states as delivery
    on delivery.notification_id = notification.id
   and delivery.user_id = notification.recipient_user_id
  left join public.notification_reads as notification_read
    on notification_read.notification_id = notification.id
   and notification_read.user_id = notification.recipient_user_id
  where notification.publication_id = p_id
    and notification.publication_revision = publication.revision
  order by 2, notification.recipient_user_id;
end;
$$;

-- Do not use a permission role as a person's name in either picker variant.
-- Email remains the last identifiable value before an explicit unknown state.
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
      coalesce(nullif(btrim(profiles.display_name), ''), nullif(btrim(auth_users.email), ''), 'Unknown user')::text
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
      'Unknown user'
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
      coalesce(nullif(btrim(profiles.display_name), ''), nullif(btrim(auth_users.email), ''), 'Unknown user')::text,
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
      'Unknown user'
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

revoke all on function public.get_notification_publication_report(uuid) from public, anon;
revoke all on function public.get_notification_publication_audience(uuid) from public, anon;
revoke all on function public.get_notification_publication_audience_groups(uuid) from public, anon;
grant execute on function public.get_notification_publication_report(uuid) to authenticated;
grant execute on function public.get_notification_publication_audience(uuid) to authenticated;
grant execute on function public.get_notification_publication_audience_groups(uuid) to authenticated;
