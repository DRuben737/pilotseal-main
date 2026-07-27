-- Require every future public function to opt into Data API execution. This
-- prevents a newly created SECURITY DEFINER function from becoming browser
-- callable through PostgreSQL's default PUBLIC execute grant.
alter default privileges for role postgres in schema public
revoke execute on functions from public, anon, authenticated;

-- This compatibility wrapper previously inherited authorization only through
-- add_organization_person(). Keep the nested check, and add an explicit guard
-- here so later changes to the delegated function cannot weaken this boundary.
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
    raise exception 'No verified registered account matches that email. Add this person from the updated organization roster instead.'
      using errcode = 'P0002';
  end if;
  select * into v_member
  from public.organization_members
  where organization_id = p_organization_id
    and user_id = v_person.user_id;
  return v_member;
end;
$$;

revoke all on function public.add_organization_member_by_email(uuid, text)
from public, anon;
grant execute on function public.add_organization_member_by_email(uuid, text)
to authenticated, service_role;
