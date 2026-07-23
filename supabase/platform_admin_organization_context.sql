-- Platform administrators manage organizations through platform RPCs. They should
-- not be presented as synthetic members of every organization in the normal
-- organization selector.

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
  select
    organizations.id,
    organizations.name,
    organization_members.role as member_role,
    organizations.created_at
  from public.organization_members
  join public.organizations
    on organizations.id = organization_members.organization_id
  where auth.uid() is not null
    and organization_members.user_id = auth.uid()
  order by organizations.name;
$$;

revoke all on function public.get_my_organizations() from public, anon, authenticated;
grant execute on function public.get_my_organizations() to authenticated;
