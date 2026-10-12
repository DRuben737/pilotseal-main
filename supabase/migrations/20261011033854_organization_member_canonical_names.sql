create or replace function public.list_organization_members(p_organization_id uuid)
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
