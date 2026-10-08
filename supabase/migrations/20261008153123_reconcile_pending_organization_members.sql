-- Make the legacy exact-email add operation a safe reconciliation path for
-- verified accounts that still have a pending roster row or invitation.

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
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_target_user_id uuid;
  v_teaching_role text;
  v_member public.organization_members;
begin
  if auth.uid() is null or not (
    private.can_manage_organization(p_organization_id, auth.uid())
    or private.is_platform_admin(auth.uid())
  ) then
    raise exception 'Only organization Owners and Admins can add members.'
      using errcode = '42501';
  end if;
  if v_email = '' then
    raise exception 'Enter an email address.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'pilotseal.organization_member:' || p_organization_id::text || ':' || v_email,
      0
    )
  );

  select users.id into v_target_user_id
  from auth.users users
  where lower(btrim(coalesce(users.email, ''))) = v_email
    and users.email_confirmed_at is not null
  order by users.created_at
  limit 1;

  if v_target_user_id is null then
    raise exception 'No verified registered account matches that email.'
      using errcode = 'P0002';
  end if;

  select people.teaching_role into v_teaching_role
  from public.organization_people people
  where people.organization_id = p_organization_id
    and people.normalized_email = v_email
    and people.status <> 'archived'
  limit 1;

  insert into public.organization_members (
    organization_id, user_id, role, teaching_role, added_by
  ) values (
    p_organization_id, v_target_user_id, 'member', v_teaching_role, auth.uid()
  )
  on conflict (organization_id, user_id) do update
  set teaching_role = coalesce(
        public.organization_members.teaching_role,
        excluded.teaching_role
      ),
      updated_at = timezone('utc', now())
  returning * into v_member;

  -- A direct administrator add supersedes any unused email invitation. The
  -- member trigger has already linked the matching organization_people row.
  update public.organization_member_invitations invitations
  set status = 'revoked',
      revoked_by = auth.uid(),
      revoked_at = timezone('utc', now())
  where invitations.organization_id = p_organization_id
    and invitations.normalized_email = v_email
    and invitations.status = 'pending';

  return v_member;
end;
$$;

revoke all on function public.add_organization_member_by_email(uuid, text)
  from public, anon, authenticated;
grant execute on function public.add_organization_member_by_email(uuid, text)
  to authenticated;

-- Repair historical rows where membership exists but the roster entry and its
-- invitation were left pending.
update public.organization_people people
set user_id = users.id,
    status = 'linked',
    linked_at = coalesce(people.linked_at, members.created_at),
    updated_at = timezone('utc', now())
from public.organization_members members
join auth.users users on users.id = members.user_id
where people.organization_id = members.organization_id
  and people.normalized_email = lower(btrim(coalesce(users.email, '')))
  and people.status = 'pending'
  and people.user_id is null;

update public.organization_member_invitations invitations
set status = 'revoked',
    revoked_by = coalesce(members.added_by, people.added_by),
    revoked_at = timezone('utc', now())
from public.organization_people people
join public.organization_members members
  on members.organization_id = people.organization_id
 and members.user_id = people.user_id
where invitations.organization_person_id = people.id
  and invitations.status = 'pending'
  and people.status = 'linked';
