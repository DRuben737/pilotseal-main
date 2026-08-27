-- Company registrations require platform approval. Organization membership
-- invitations are one-time, email-bound capabilities and never trust signup
-- metadata for authorization.

create table public.organization_registration_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  requested_name text not null check (char_length(btrim(requested_name)) between 2 and 120),
  requester_email text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default timezone('utc', now()),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_reason text check (review_reason is null or char_length(btrim(review_reason)) between 3 and 500),
  organization_id uuid references public.organizations(id) on delete set null,
  check (
    (status = 'pending' and reviewed_at is null and reviewed_by is null and review_reason is null and organization_id is null)
    or (status = 'rejected' and reviewed_at is not null and review_reason is not null and organization_id is null)
    or (status = 'approved' and reviewed_at is not null and review_reason is not null and organization_id is not null)
  )
);

create unique index organization_registration_requests_pending_user_idx
  on public.organization_registration_requests (requester_user_id)
  where status = 'pending';
create index organization_registration_requests_review_queue_idx
  on public.organization_registration_requests (status, submitted_at);

alter table public.organization_registration_requests enable row level security;
revoke all on public.organization_registration_requests from public, anon, authenticated;
grant select on public.organization_registration_requests to authenticated;
create policy organization_registration_requests_select_authorized
on public.organization_registration_requests for select to authenticated
using (
  requester_user_id = auth.uid()
  or private.is_platform_admin(auth.uid())
);

create or replace function private.create_signup_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if coalesce(new.raw_user_meta_data ->> 'account_type', 'personal') <> 'company' then
    return new;
  end if;

  v_name := btrim(coalesce(new.raw_user_meta_data ->> 'company_name', ''));
  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Company name must be between 2 and 120 characters.';
  end if;

  insert into public.organization_registration_requests (
    requester_user_id, requested_name, requester_email
  ) values (
    new.id, v_name, lower(btrim(coalesce(new.email, '')))
  );
  return new;
end;
$$;
revoke all on function private.create_signup_organization() from public, anon, authenticated;

create or replace function public.list_platform_organization_requests(p_status text default null)
returns table (
  id uuid,
  requester_user_id uuid,
  requested_name text,
  requester_email text,
  email_verified boolean,
  status text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  review_reason text,
  organization_id uuid,
  reviewer_email text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_platform_admin(auth.uid()) then
    raise exception 'Platform administrator access is required.' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('pending', 'approved', 'rejected') then
    raise exception 'Invalid request status.' using errcode = '22023';
  end if;
  return query
  select request.id, request.requester_user_id, request.requested_name,
    request.requester_email, users.email_confirmed_at is not null,
    request.status, request.submitted_at, request.reviewed_at,
    request.review_reason, request.organization_id, reviewer.email
  from public.organization_registration_requests request
  join auth.users users on users.id = request.requester_user_id
  left join public.profiles reviewer on reviewer.id = request.reviewed_by
  where p_status is null or request.status = p_status
  order by (request.status = 'pending') desc, request.submitted_at desc;
end;
$$;

create or replace function public.review_organization_registration_request(
  p_request_id uuid,
  p_decision text,
  p_reason text
)
returns public.organization_registration_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.organization_registration_requests;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_org_id uuid;
  v_actor_email text;
  v_verified boolean;
begin
  if auth.uid() is null or not private.is_platform_admin(auth.uid()) then
    raise exception 'Platform administrator access is required.' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected.' using errcode = '22023';
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    raise exception 'Reason must be between 3 and 500 characters.' using errcode = '22023';
  end if;

  select * into v_request
  from public.organization_registration_requests
  where id = p_request_id
  for update;
  if not found or v_request.status <> 'pending' then
    raise exception 'This registration request is no longer pending.' using errcode = 'P0002';
  end if;

  select users.email_confirmed_at is not null into v_verified
  from auth.users users where users.id = v_request.requester_user_id;

  if p_decision = 'approved' then
    if not coalesce(v_verified, false) then
      raise exception 'The requester must verify their email before approval.' using errcode = '42501';
    end if;
    if exists (
      select 1 from public.organization_members members
      join public.organizations organizations on organizations.id = members.organization_id
      where members.user_id = v_request.requester_user_id
        and members.role = 'owner'
        and lower(btrim(organizations.name)) = lower(btrim(v_request.requested_name))
    ) then
      raise exception 'This requester already owns an organization with that name.' using errcode = '23505';
    end if;

    insert into public.organizations (name, created_by)
    values (v_request.requested_name, v_request.requester_user_id)
    returning id into v_org_id;
    insert into public.organization_members (organization_id, user_id, role, added_by)
    values (v_org_id, v_request.requester_user_id, 'owner', auth.uid());

    select email into v_actor_email from public.profiles where id = auth.uid();
    insert into public.platform_organization_audit_logs (
      organization_id, organization_name, actor_user_id, actor_email,
      owner_user_id, owner_email, action, reason
    ) values (
      v_org_id, v_request.requested_name, auth.uid(), v_actor_email,
      v_request.requester_user_id, v_request.requester_email, 'created', v_reason
    );
  end if;

  update public.organization_registration_requests
  set status = p_decision,
      reviewed_by = auth.uid(),
      reviewed_at = timezone('utc', now()),
      review_reason = v_reason,
      organization_id = v_org_id
  where id = p_request_id
  returning * into v_request;

  perform private.create_user_notification(
    v_request.requester_user_id,
    case when p_decision = 'approved' then 'Organization approved' else 'Organization request reviewed' end,
    case when p_decision = 'approved'
      then v_request.requested_name || ' is now active.'
      else v_request.requested_name || ' was not approved. Reason: ' || v_reason end,
    'organization',
    case when p_decision = 'approved' then 'normal' else 'high' end,
    v_org_id,
    v_request.requested_name,
    '/dashboard',
    'organization-registration:' || v_request.id::text || ':' || p_decision,
    auth.uid()
  );
  return v_request;
end;
$$;

create table public.organization_member_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  organization_person_id uuid not null references public.organization_people(id) on delete cascade,
  invited_email text not null,
  normalized_email text generated always as (lower(btrim(invited_email))) stored,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null default (timezone('utc', now()) + interval '14 days'),
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  check (expires_at > invited_at),
  check (
    (status = 'pending' and accepted_by is null and accepted_at is null and revoked_at is null)
    or (status = 'accepted' and accepted_by is not null and accepted_at is not null)
    or (status in ('revoked', 'expired') and accepted_by is null and accepted_at is null)
  )
);
create unique index organization_member_invitations_active_email_idx
  on public.organization_member_invitations (organization_id, normalized_email)
  where status = 'pending';
create index organization_member_invitations_org_idx
  on public.organization_member_invitations (organization_id, invited_at desc);

alter table public.organization_member_invitations enable row level security;
revoke all on public.organization_member_invitations from public, anon, authenticated;
create policy organization_member_invitations_deny_direct_access
on public.organization_member_invitations for select to authenticated using (false);

create or replace function public.create_organization_member_invitation(
  p_organization_id uuid,
  p_email text,
  p_display_name text default null,
  p_teaching_role text default null,
  p_internal_id text default null,
  p_notes text default null
)
returns table (
  invitation_id uuid,
  organization_person_id uuid,
  invited_email text,
  invite_token text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_token text;
  v_person public.organization_people;
  v_invitation public.organization_member_invitations;
begin
  if auth.uid() is null or not (
    private.can_manage_organization(p_organization_id, auth.uid())
    or private.is_platform_admin(auth.uid())
  ) then
    raise exception 'Only organization Owners and Admins can invite people.' using errcode = '42501';
  end if;
  if v_email = '' or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;
  if p_teaching_role is not null and p_teaching_role not in ('instructor', 'student') then
    raise exception 'Teaching role must be Instructor, Student, or empty.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_internal_id, '')) > 120 or char_length(coalesce(p_notes, '')) > 2000 then
    raise exception 'Internal ID or notes are too long.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.organization_members members
    join auth.users users on users.id = members.user_id
    where members.organization_id = p_organization_id and lower(btrim(users.email)) = v_email
  ) then
    raise exception 'This email is already an organization member.' using errcode = '23505';
  end if;

  insert into public.organization_people (
    organization_id, email, organization_display_name, teaching_role,
    internal_id, notes, status, added_by
  ) values (
    p_organization_id, v_email, nullif(btrim(coalesce(p_display_name, '')), ''),
    p_teaching_role, nullif(btrim(coalesce(p_internal_id, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''), 'pending', auth.uid()
  )
  on conflict (organization_id, normalized_email) do update
  set email = excluded.email,
      organization_display_name = excluded.organization_display_name,
      teaching_role = excluded.teaching_role,
      internal_id = excluded.internal_id,
      notes = excluded.notes,
      status = 'pending', user_id = null, linked_at = null,
      added_by = auth.uid(), updated_at = timezone('utc', now())
  where public.organization_people.status <> 'linked'
  returning * into v_person;
  if v_person.id is null then
    raise exception 'This person is already linked to the organization.' using errcode = '23505';
  end if;

  update public.organization_member_invitations
  set status = 'revoked', revoked_by = auth.uid(), revoked_at = timezone('utc', now())
  where organization_id = p_organization_id
    and normalized_email = v_email and status = 'pending';

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.organization_member_invitations (
    organization_id, organization_person_id, invited_email, token_hash, invited_by
  ) values (
    p_organization_id, v_person.id, v_email,
    encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid()
  ) returning * into v_invitation;

  return query select v_invitation.id, v_person.id, v_email, v_token, v_invitation.expires_at;
end;
$$;

create or replace function public.list_organization_member_invitations(p_organization_id uuid)
returns table (
  id uuid,
  organization_person_id uuid,
  invited_email text,
  status text,
  invited_at timestamptz,
  expires_at timestamptz,
  accepted_at timestamptz
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
    raise exception 'Organization administrator access is required.' using errcode = '42501';
  end if;
  return query
  select invitation.id, invitation.organization_person_id,
    invitation.invited_email,
    case when invitation.status = 'pending' and invitation.expires_at <= timezone('utc', now()) then 'expired' else invitation.status end,
    invitation.invited_at, invitation.expires_at, invitation.accepted_at
  from public.organization_member_invitations invitation
  where invitation.organization_id = p_organization_id
  order by invitation.invited_at desc;
end;
$$;

create or replace function public.get_organization_invitation(p_token text)
returns table (
  organization_name text,
  invited_email text,
  display_name text,
  teaching_role text,
  status text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select organizations.name, invitation.invited_email,
    people.organization_display_name, people.teaching_role,
    case when invitation.status = 'pending' and invitation.expires_at <= timezone('utc', now()) then 'expired' else invitation.status end,
    invitation.expires_at
  from public.organization_member_invitations invitation
  join public.organizations organizations on organizations.id = invitation.organization_id
  join public.organization_people people on people.id = invitation.organization_person_id
  where invitation.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
  limit 1;
$$;

create or replace function public.accept_organization_member_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.organization_member_invitations;
  v_email text;
  v_person public.organization_people;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;
  select lower(btrim(users.email)) into v_email
  from auth.users users
  where users.id = auth.uid() and users.email_confirmed_at is not null;
  if v_email is null then
    raise exception 'Verify your email before joining the organization.' using errcode = '42501';
  end if;

  select * into v_invitation
  from public.organization_member_invitations invitation
  where invitation.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
  for update;
  if not found or v_invitation.status <> 'pending' then
    raise exception 'This invitation is no longer available.' using errcode = 'P0002';
  end if;
  if v_invitation.expires_at <= timezone('utc', now()) then
    update public.organization_member_invitations set status = 'expired'
    where id = v_invitation.id;
    raise exception 'This invitation has expired.' using errcode = 'P0002';
  end if;
  if v_email <> v_invitation.normalized_email then
    raise exception 'This invitation belongs to a different verified email.' using errcode = '42501';
  end if;

  select * into v_person from public.organization_people
  where id = v_invitation.organization_person_id for update;
  if not found or v_person.status <> 'pending' then
    raise exception 'The invited roster entry is no longer available.' using errcode = 'P0002';
  end if;

  insert into public.organization_members (
    organization_id, user_id, role, teaching_role, added_by
  ) values (
    v_invitation.organization_id, auth.uid(), 'member', v_person.teaching_role, v_invitation.invited_by
  ) on conflict (organization_id, user_id) do update
    set teaching_role = excluded.teaching_role, updated_at = timezone('utc', now());

  update public.organization_people
  set user_id = auth.uid(), status = 'linked', linked_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = v_person.id;
  update public.organization_member_invitations
  set status = 'accepted', accepted_by = auth.uid(), accepted_at = timezone('utc', now())
  where id = v_invitation.id;
  return v_invitation.organization_id;
end;
$$;

create or replace function public.revoke_organization_member_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.organization_member_invitations;
begin
  select * into v_invitation from public.organization_member_invitations
  where id = p_invitation_id for update;
  if not found then raise exception 'Invitation not found.' using errcode = 'P0002'; end if;
  if auth.uid() is null or not (
    private.can_manage_organization(v_invitation.organization_id, auth.uid())
    or private.is_platform_admin(auth.uid())
  ) then
    raise exception 'Organization administrator access is required.' using errcode = '42501';
  end if;
  if v_invitation.status = 'pending' then
    update public.organization_member_invitations
    set status = 'revoked', revoked_by = auth.uid(), revoked_at = timezone('utc', now())
    where id = p_invitation_id;
  end if;
end;
$$;

-- The old exact-email claim operations bypass the invitation capability.
revoke execute on function public.add_organization_person(uuid, text, text, text, text, text) from authenticated;
revoke execute on function public.add_organization_member_by_email(uuid, text) from authenticated;
revoke execute on function public.claim_organization_person(uuid) from authenticated;

revoke all on function public.list_platform_organization_requests(text) from public, anon, authenticated;
revoke all on function public.review_organization_registration_request(uuid, text, text) from public, anon, authenticated;
revoke all on function public.create_organization_member_invitation(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.list_organization_member_invitations(uuid) from public, anon, authenticated;
revoke all on function public.get_organization_invitation(text) from public, anon, authenticated;
revoke all on function public.accept_organization_member_invitation(text) from public, anon, authenticated;
revoke all on function public.revoke_organization_member_invitation(uuid) from public, anon, authenticated;

grant execute on function public.list_platform_organization_requests(text) to authenticated;
grant execute on function public.review_organization_registration_request(uuid, text, text) to authenticated;
grant execute on function public.create_organization_member_invitation(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.list_organization_member_invitations(uuid) to authenticated;
grant execute on function public.get_organization_invitation(text) to anon, authenticated;
grant execute on function public.accept_organization_member_invitation(text) to authenticated;
grant execute on function public.revoke_organization_member_invitation(uuid) to authenticated;
grant all on public.organization_registration_requests to service_role;
grant all on public.organization_member_invitations to service_role;
