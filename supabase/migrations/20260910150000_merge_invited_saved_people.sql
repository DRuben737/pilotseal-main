-- Reuse an instructor's existing Saved People row when an organization
-- invitation represents the same student, and provide an explicit repair RPC
-- for duplicates created by older invitation flows.

create or replace function public.create_organization_member_invitation_v3(
  p_organization_id uuid,
  p_email text,
  p_display_name text,
  p_teaching_role text,
  p_assigned_instructor_user_id uuid,
  p_existing_saved_person_id uuid,
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
  v_created record;
  v_selected_saved_person_id uuid := p_existing_saved_person_id;
  v_match_count integer := 0;
begin
  if p_existing_saved_person_id is not null then
    if p_teaching_role <> 'student'
       or p_assigned_instructor_user_id is null
       or not exists (
         select 1
         from public.saved_people person
         where person.id = p_existing_saved_person_id
           and person.user_id = p_assigned_instructor_user_id
           and person.role = 'student'
       ) then
      raise exception 'The selected Saved People student does not belong to the assigned instructor.'
        using errcode = '22023';
    end if;
    if exists (
      select 1
      from public.saved_person_account_links link
      where link.saved_person_id = p_existing_saved_person_id
        and link.owner_user_id = p_assigned_instructor_user_id
        and lower(btrim(coalesce((select users.email from auth.users users where users.id = link.linked_user_id), '')))
          <> lower(btrim(coalesce(p_email, '')))
    ) then
      raise exception 'The selected Saved People student is linked to a different account.'
        using errcode = '23505';
    end if;
  end if;

  select * into v_created
  from public.create_organization_member_invitation_v2(
    p_organization_id, p_email, p_display_name, p_teaching_role,
    p_assigned_instructor_user_id, p_internal_id, p_notes
  );

  if p_teaching_role = 'student'
     and p_assigned_instructor_user_id is not null
     and v_selected_saved_person_id is null then
    select count(*), min(person.id::text)::uuid
    into v_match_count, v_selected_saved_person_id
    from public.saved_people person
    where person.user_id = p_assigned_instructor_user_id
      and person.role = 'student'
      and person.id <> v_created.assigned_saved_person_id
      and lower(regexp_replace(btrim(person.display_name), '[[:space:]]+', ' ', 'g'))
        = lower(regexp_replace(btrim(coalesce(p_display_name, '')), '[[:space:]]+', ' ', 'g'))
      and not exists (
        select 1 from public.saved_person_account_links link
        where link.saved_person_id = person.id
      );
    if v_match_count <> 1 then
      v_selected_saved_person_id := null;
    end if;
  end if;

  if v_selected_saved_person_id is not null
     and v_selected_saved_person_id <> v_created.assigned_saved_person_id then
    update public.organization_member_invitations invitation
    set assigned_saved_person_id = v_selected_saved_person_id
    where invitation.id = v_created.invitation_id;

    -- The v2 call may have created a new empty shell. Remove it only when no
    -- earlier invitation or business record references it.
    delete from public.saved_people person
    where person.id = v_created.assigned_saved_person_id
      and person.user_id = p_assigned_instructor_user_id
      and person.role = 'student'
      and not exists (
        select 1 from public.organization_member_invitations invitation
        where invitation.assigned_saved_person_id = person.id
          and invitation.id <> v_created.invitation_id
      )
      and not exists (
        select 1 from public.saved_person_account_links link
        where link.saved_person_id = person.id
      )
      and not exists (
        select 1 from public.endorsement_records record
        where record.student_id = person.id
      )
      and not exists (
        select 1 from public.flight_briefs brief
        where brief.student_saved_person_id = person.id
      );

    v_created.assigned_saved_person_id := v_selected_saved_person_id;
  end if;

  return query select
    v_created.invitation_id::uuid,
    v_created.organization_person_id::uuid,
    v_created.invited_email::text,
    v_created.invite_token::text,
    v_created.expires_at::timestamptz,
    v_created.assigned_instructor_user_id::uuid,
    v_created.assigned_saved_person_id::uuid;
end;
$$;

create or replace function public.merge_saved_person_duplicate(
  p_keep_saved_person_id uuid,
  p_remove_saved_person_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_linked_user_id uuid;
begin
  if v_owner_id is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;
  if p_keep_saved_person_id = p_remove_saved_person_id then
    raise exception 'Choose two different Saved People records.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.saved_people person
    where person.id = p_keep_saved_person_id
      and person.user_id = v_owner_id and person.role = 'student'
  ) or not exists (
    select 1 from public.saved_people person
    where person.id = p_remove_saved_person_id
      and person.user_id = v_owner_id and person.role = 'student'
  ) then
    raise exception 'Both Saved People records must be your student records.'
      using errcode = '42501';
  end if;
  if exists (
    select 1 from public.saved_person_account_links link
    where link.saved_person_id = p_keep_saved_person_id
  ) then
    raise exception 'The record being kept is already linked to an account.'
      using errcode = '23505';
  end if;

  select link.linked_user_id into v_linked_user_id
  from public.saved_person_account_links link
  where link.saved_person_id = p_remove_saved_person_id
    and link.owner_user_id = v_owner_id
  for update;
  if v_linked_user_id is null then
    raise exception 'The duplicate record is not linked to a student account.'
      using errcode = '22023';
  end if;
  if exists (
    select 1 from private.cfi_person_student_grants grant_row
    where grant_row.saved_person_id = p_remove_saved_person_id
  ) then
    raise exception 'This legacy schedule record must be migrated before merging.'
      using errcode = '55000';
  end if;

  update public.saved_person_account_links
  set saved_person_id = p_keep_saved_person_id,
      linked_at = timezone('utc', now())
  where saved_person_id = p_remove_saved_person_id
    and owner_user_id = v_owner_id;

  delete from public.saved_person_account_link_requests keep_request
  using public.saved_person_account_link_requests remove_request
  where keep_request.owner_user_id = v_owner_id
    and keep_request.saved_person_id = p_keep_saved_person_id
    and remove_request.owner_user_id = v_owner_id
    and remove_request.saved_person_id = p_remove_saved_person_id
    and keep_request.target_user_id = remove_request.target_user_id;
  update public.saved_person_account_link_requests
  set saved_person_id = p_keep_saved_person_id
  where owner_user_id = v_owner_id
    and saved_person_id = p_remove_saved_person_id;

  update public.saved_person_certificates
  set person_id = p_keep_saved_person_id, updated_at = timezone('utc', now())
  where user_id = v_owner_id and person_id = p_remove_saved_person_id;
  update public.endorsement_records
  set student_id = p_keep_saved_person_id, student_user_id = v_linked_user_id,
      updated_at = timezone('utc', now())
  where user_id = v_owner_id and student_id = p_remove_saved_person_id;
  update public.flight_briefs
  set student_saved_person_id = p_keep_saved_person_id,
      student_user_id = coalesce(student_user_id, v_linked_user_id),
      updated_at = timezone('utc', now())
  where created_by = v_owner_id
    and student_saved_person_id = p_remove_saved_person_id;
  update public.cfi_schedule_student_grants
  set saved_person_id = p_keep_saved_person_id, updated_at = timezone('utc', now())
  where cfi_user_id = v_owner_id
    and saved_person_id = p_remove_saved_person_id;
  update public.organization_member_invitations
  set assigned_saved_person_id = p_keep_saved_person_id
  where assigned_instructor_user_id = v_owner_id
    and assigned_saved_person_id = p_remove_saved_person_id;

  delete from public.saved_people person
  where person.id = p_remove_saved_person_id and person.user_id = v_owner_id;
  if not found then
    raise exception 'The duplicate Saved People record could not be removed.'
      using errcode = 'P0002';
  end if;

  insert into public.student_profile_change_log (
    student_user_id, actor_user_id, organization_id, change_kind,
    previous_value, next_value
  ) values (
    v_linked_user_id, v_owner_id, null, 'link_merge',
    jsonb_build_object('removed_saved_person_id', p_remove_saved_person_id),
    jsonb_build_object('saved_person_id', p_keep_saved_person_id,
      'source', 'manual_duplicate_merge')
  );

  return p_keep_saved_person_id;
end;
$$;

revoke all on function public.create_organization_member_invitation_v3(
  uuid, text, text, text, uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.create_organization_member_invitation_v3(
  uuid, text, text, text, uuid, uuid, text, text
) to authenticated;

revoke all on function public.merge_saved_person_duplicate(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.merge_saved_person_duplicate(uuid, uuid)
  to authenticated;
