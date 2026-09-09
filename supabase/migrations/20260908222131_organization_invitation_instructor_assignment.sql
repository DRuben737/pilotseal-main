-- Student invitations can assign an organization instructor up front. The
-- invitation owns the pending instructor Saved People row; accepting the
-- invitation links that row to the student's verified account atomically.

alter table public.organization_member_invitations
  add column if not exists assigned_instructor_user_id uuid
    references auth.users(id) on delete set null,
  add column if not exists assigned_saved_person_id uuid
    references public.saved_people(id) on delete set null;

create index if not exists organization_member_invitations_instructor_idx
  on public.organization_member_invitations (
    organization_id, assigned_instructor_user_id, invited_at desc
  )
  where assigned_instructor_user_id is not null;

create or replace function public.create_organization_member_invitation_v2(
  p_organization_id uuid,
  p_email text,
  p_display_name text,
  p_teaching_role text,
  p_assigned_instructor_user_id uuid,
  p_internal_id text,
  p_notes text
)
returns table (
  invitation_id uuid,
  organization_person_id uuid,
  invited_email text,
  invite_token text,
  expires_at timestamptz,
  assigned_instructor_user_id uuid,
  assigned_saved_person_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_formal_name text := nullif(btrim(coalesce(p_display_name, '')), '');
  v_token text;
  v_person public.organization_people;
  v_invitation public.organization_member_invitations;
  v_saved_person_id uuid;
  v_registered_user_id uuid;
begin
  if auth.uid() is null or not (
    private.can_manage_organization(p_organization_id, auth.uid())
    or private.is_platform_admin(auth.uid())
  ) then
    raise exception 'Only organization Owners and Admins can invite people.'
      using errcode = '42501';
  end if;
  if v_email = '' or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;
  if p_teaching_role not in ('instructor', 'student') then
    raise exception 'Teaching role must be Instructor or Student.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_internal_id, '')) > 120
     or char_length(coalesce(p_notes, '')) > 2000 then
    raise exception 'Internal ID or notes are too long.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from public.organization_members members
    join auth.users users on users.id = members.user_id
    where members.organization_id = p_organization_id
      and lower(btrim(users.email)) = v_email
  ) then
    raise exception 'This email is already an organization member.' using errcode = '23505';
  end if;

  if p_teaching_role = 'student' then
    if v_formal_name is null then
      raise exception 'A formal student name is required.' using errcode = '22023';
    end if;
    if p_assigned_instructor_user_id is null or not exists (
      select 1
      from public.organization_members members
      where members.organization_id = p_organization_id
        and members.user_id = p_assigned_instructor_user_id
        and members.teaching_role = 'instructor'
    ) then
      raise exception 'Select a current organization instructor.' using errcode = '22023';
    end if;
  elsif p_assigned_instructor_user_id is not null then
    raise exception 'Only student invitations can assign an instructor.' using errcode = '22023';
  end if;

  insert into public.organization_people (
    organization_id, email, organization_display_name, teaching_role,
    internal_id, notes, status, added_by
  ) values (
    p_organization_id, v_email, v_formal_name, p_teaching_role,
    nullif(btrim(coalesce(p_internal_id, '')), ''),
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

  if p_teaching_role = 'student' then
    -- Reuse the instructor's already-linked student record for registered
    -- invitees, or the row created by the previous invitation when resending.
    select users.id into v_registered_user_id
    from auth.users users
    where lower(btrim(coalesce(users.email, ''))) = v_email
    order by users.created_at
    limit 1;

    if v_registered_user_id is not null then
      select links.saved_person_id into v_saved_person_id
      from public.saved_person_account_links links
      where links.owner_user_id = p_assigned_instructor_user_id
        and links.linked_user_id = v_registered_user_id;
    end if;

    if v_saved_person_id is null then
      select invitation.assigned_saved_person_id into v_saved_person_id
      from public.organization_member_invitations invitation
      where invitation.organization_id = p_organization_id
        and invitation.normalized_email = v_email
        and invitation.assigned_instructor_user_id = p_assigned_instructor_user_id
        and invitation.assigned_saved_person_id is not null
      order by invitation.invited_at desc
      limit 1;
    end if;

    if v_saved_person_id is null then
      insert into public.saved_people (user_id, role, display_name)
      values (p_assigned_instructor_user_id, 'student', v_formal_name)
      returning id into v_saved_person_id;
    else
      update public.saved_people
      set display_name = v_formal_name
      where id = v_saved_person_id
        and user_id = p_assigned_instructor_user_id
        and role = 'student';
      if not found then
        raise exception 'The assigned instructor student profile is invalid.'
          using errcode = 'P0002';
      end if;
    end if;
  end if;

  update public.organization_member_invitations
  set status = 'revoked', revoked_by = auth.uid(),
      revoked_at = timezone('utc', now())
  where organization_id = p_organization_id
    and normalized_email = v_email and status = 'pending';

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.organization_member_invitations (
    organization_id, organization_person_id, invited_email, token_hash,
    invited_by, assigned_instructor_user_id, assigned_saved_person_id
  ) values (
    p_organization_id, v_person.id, v_email,
    encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid(),
    p_assigned_instructor_user_id, v_saved_person_id
  ) returning * into v_invitation;

  return query select
    v_invitation.id, v_person.id, v_email, v_token, v_invitation.expires_at,
    v_invitation.assigned_instructor_user_id,
    v_invitation.assigned_saved_person_id;
end;
$$;

create or replace function public.list_organization_member_invitations_v2(
  p_organization_id uuid
)
returns table (
  id uuid,
  organization_person_id uuid,
  invited_email text,
  status text,
  invited_at timestamptz,
  expires_at timestamptz,
  accepted_at timestamptz,
  assigned_instructor_user_id uuid,
  assigned_instructor_name text,
  assigned_saved_person_id uuid
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
    case when invitation.status = 'pending'
      and invitation.expires_at <= timezone('utc', now())
      then 'expired' else invitation.status end,
    invitation.invited_at, invitation.expires_at, invitation.accepted_at,
    invitation.assigned_instructor_user_id,
    coalesce(nullif(btrim(instructor.display_name), ''), instructor.email),
    invitation.assigned_saved_person_id
  from public.organization_member_invitations invitation
  left join public.profiles instructor
    on instructor.id = invitation.assigned_instructor_user_id
  where invitation.organization_id = p_organization_id
  order by invitation.invited_at desc;
end;
$$;

create or replace function public.get_organization_invitation_v2(p_token text)
returns table (
  organization_name text,
  invited_email text,
  display_name text,
  teaching_role text,
  status text,
  expires_at timestamptz,
  assigned_instructor_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select organizations.name, invitation.invited_email,
    people.organization_display_name, people.teaching_role,
    case when invitation.status = 'pending'
      and invitation.expires_at <= timezone('utc', now())
      then 'expired' else invitation.status end,
    invitation.expires_at,
    coalesce(nullif(btrim(instructor.display_name), ''), instructor.email)
  from public.organization_member_invitations invitation
  join public.organizations organizations
    on organizations.id = invitation.organization_id
  join public.organization_people people
    on people.id = invitation.organization_person_id
  left join public.profiles instructor
    on instructor.id = invitation.assigned_instructor_user_id
  where invitation.token_hash = encode(
    extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex'
  )
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
  v_source_person public.saved_people;
  v_self_person_id uuid;
  v_profile_nickname text;
  v_profile_email text;
  v_source_certificate public.saved_person_certificates;
  v_effective_saved_person_id uuid;
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
  where invitation.token_hash = encode(
    extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex'
  )
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
    raise exception 'This invitation belongs to a different verified email.'
      using errcode = '42501';
  end if;

  select * into v_person
  from public.organization_people
  where id = v_invitation.organization_person_id
  for update;
  if not found or v_person.status <> 'pending' then
    raise exception 'The invited roster entry is no longer available.' using errcode = 'P0002';
  end if;

  if v_person.teaching_role = 'student'
     and v_invitation.assigned_instructor_user_id is not null then
    if not exists (
      select 1
      from public.organization_members members
      where members.organization_id = v_invitation.organization_id
        and members.user_id = v_invitation.assigned_instructor_user_id
        and members.teaching_role = 'instructor'
    ) then
      raise exception 'The assigned instructor is no longer available.'
        using errcode = 'P0002';
    end if;

    select * into v_source_person
    from public.saved_people
    where id = v_invitation.assigned_saved_person_id
      and user_id = v_invitation.assigned_instructor_user_id
      and role = 'student'
    for update;
    if not found then
      raise exception 'The assigned instructor student profile is no longer available.'
        using errcode = 'P0002';
    end if;

    select links.saved_person_id into v_effective_saved_person_id
    from public.saved_person_account_links links
    where links.owner_user_id = v_invitation.assigned_instructor_user_id
      and links.linked_user_id = auth.uid();

    if v_effective_saved_person_id is null then
      insert into public.saved_person_account_links (
        owner_user_id, saved_person_id, linked_user_id
      ) values (
        v_invitation.assigned_instructor_user_id,
        v_invitation.assigned_saved_person_id,
        auth.uid()
      );
      v_effective_saved_person_id := v_invitation.assigned_saved_person_id;
    end if;

    select profile.self_person_id, profile.display_name, profile.email
    into v_self_person_id, v_profile_nickname, v_profile_email
    from public.profiles profile
    where profile.id = auth.uid()
    for update;

    if v_self_person_id is null then
      insert into public.saved_people (user_id, role, display_name, cert_number)
      values (
        auth.uid(), 'self', v_source_person.display_name,
        v_source_person.cert_number
      )
      returning id into v_self_person_id;
      update public.profiles
      set self_person_id = v_self_person_id
      where id = auth.uid();
    elsif exists (
      select 1
      from public.saved_people person
      where person.id = v_self_person_id
        and private.is_placeholder_person_name(
          person.display_name, v_profile_email, v_profile_nickname
        )
    ) then
      update public.saved_people
      set display_name = v_source_person.display_name
      where id = v_self_person_id;
    end if;

    if not exists (
      select 1
      from public.saved_person_certificates certificate
      where certificate.user_id = auth.uid()
        and certificate.person_id = v_self_person_id
        and certificate.certificate_type = 'pilot'
    ) then
      select * into v_source_certificate
      from public.saved_person_certificates certificate
      where certificate.user_id = v_invitation.assigned_instructor_user_id
        and certificate.person_id = v_invitation.assigned_saved_person_id
        and certificate.certificate_type = 'pilot'
      order by certificate.updated_at desc nulls last,
        certificate.created_at desc
      limit 1;

      if found then
        insert into public.saved_person_certificates (
          user_id, person_id, certificate_type, certificate_number, ratings,
          issue_date, last_event_date, event_type, certificate_level,
          additional_privileges, notes
        ) values (
          auth.uid(), v_self_person_id, 'pilot',
          v_source_certificate.certificate_number,
          v_source_certificate.ratings, v_source_certificate.issue_date,
          v_source_certificate.last_event_date, v_source_certificate.event_type,
          v_source_certificate.certificate_level,
          v_source_certificate.additional_privileges,
          v_source_certificate.notes
        );
      elsif nullif(btrim(coalesce(v_source_person.cert_number, '')), '') is not null then
        insert into public.saved_person_certificates (
          user_id, person_id, certificate_type, certificate_number
        ) values (
          auth.uid(), v_self_person_id, 'pilot', v_source_person.cert_number
        );
      end if;
    end if;

    insert into public.student_profile_change_log (
      student_user_id, actor_user_id, organization_id, change_kind,
      previous_value, next_value
    ) values (
      auth.uid(), v_invitation.assigned_instructor_user_id,
      v_invitation.organization_id, 'link_merge', '{}'::jsonb,
      jsonb_build_object(
        'saved_person_id', v_effective_saved_person_id,
        'formal_name', v_source_person.display_name,
        'source', 'organization_invitation'
      )
    );

    update public.endorsement_records
    set student_user_id = auth.uid(), updated_at = timezone('utc', now())
    where user_id = v_invitation.assigned_instructor_user_id
      and student_id in (
        v_invitation.assigned_saved_person_id, v_effective_saved_person_id
      )
      and student_user_id is null;

    update public.cfi_schedule_student_grants
    set student_user_id = auth.uid(), updated_at = timezone('utc', now())
    where cfi_user_id = v_invitation.assigned_instructor_user_id
      and saved_person_id in (
        v_invitation.assigned_saved_person_id, v_effective_saved_person_id
      );

    update public.saved_person_account_link_requests
    set status = 'accepted', responded_at = timezone('utc', now())
    where owner_user_id = v_invitation.assigned_instructor_user_id
      and saved_person_id = v_effective_saved_person_id
      and target_user_id = auth.uid()
      and status = 'pending';
  end if;

  insert into public.organization_members (
    organization_id, user_id, role, teaching_role, added_by
  ) values (
    v_invitation.organization_id, auth.uid(), 'member',
    v_person.teaching_role, v_invitation.invited_by
  ) on conflict (organization_id, user_id) do update
    set teaching_role = excluded.teaching_role,
        updated_at = timezone('utc', now());

  update public.organization_people
  set user_id = auth.uid(), status = 'linked',
      linked_at = timezone('utc', now()), updated_at = timezone('utc', now())
  where id = v_person.id;

  update public.organization_member_invitations
  set status = 'accepted', accepted_by = auth.uid(),
      accepted_at = timezone('utc', now())
  where id = v_invitation.id;

  return v_invitation.organization_id;
end;
$$;

revoke all on function public.create_organization_member_invitation_v2(
  uuid, text, text, text, uuid, text, text
) from public, anon, authenticated;
revoke all on function public.list_organization_member_invitations_v2(uuid)
  from public, anon, authenticated;
revoke all on function public.get_organization_invitation_v2(text)
  from public, anon, authenticated;
revoke all on function public.accept_organization_member_invitation(text)
  from public, anon, authenticated;

grant execute on function public.create_organization_member_invitation_v2(
  uuid, text, text, text, uuid, text, text
) to authenticated;
grant execute on function public.list_organization_member_invitations_v2(uuid)
  to authenticated;
grant execute on function public.get_organization_invitation_v2(text)
  to anon, authenticated;
grant execute on function public.accept_organization_member_invitation(text)
  to authenticated;
