-- Historical membership confirmation is an explicit platform-admin attestation.
-- A written note remains optional; the audit row records the reviewer and time.
create or replace function public.review_legacy_endorsement_scope_v2(
  p_record_id uuid,
  p_decision text,
  p_note text,
  p_confirm_historical_evidence boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record public.endorsement_records;
  v_student_user_id uuid;
  v_student_period uuid;
  v_instructor_period uuid;
  v_is_org_student boolean;
  v_evidence_kind text := 'not_applicable';
begin
  if auth.uid() is null or not private.is_platform_admin(auth.uid()) then
    raise exception 'Platform administrator access is required.' using errcode = '42501';
  end if;
  if p_decision not in ('personal', 'confirmed', 'defer') then
    raise exception 'Decision must be personal, confirmed, or defer.' using errcode = '22023';
  end if;
  if p_decision = 'personal' and nullif(btrim(p_note), '') is null then
    raise exception 'A review note is required when moving a record to Personal.' using errcode = '22023';
  end if;

  select * into v_record from public.endorsement_records
  where id = p_record_id and scope_status = 'pending_review' for update;
  if not found then
    raise exception 'Pending legacy record not found.' using errcode = 'P0002';
  end if;

  if p_decision = 'confirmed' then
    select link.linked_user_id into v_student_user_id
    from public.saved_person_account_links link
    where link.saved_person_id = v_record.student_id
      and link.owner_user_id = v_record.user_id;

    if v_student_user_id is null then
      raise exception 'Link this saved student to their verified platform account first.' using errcode = '42501';
    end if;

    select (
      exists (
        select 1 from public.organization_members member
        where member.organization_id = v_record.organization_id
          and member.user_id = v_student_user_id
          and member.teaching_role = 'student'
      ) or exists (
        select 1 from public.organization_people person
        where person.organization_id = v_record.organization_id
          and person.user_id = v_student_user_id
          and person.teaching_role = 'student'
          and person.status in ('linked', 'left')
      )
    ) into v_is_org_student;

    if not coalesce(v_is_org_student, false) then
      raise exception 'The linked account must be a current or historical student member of this organization.' using errcode = '42501';
    end if;

    select id into v_student_period from public.organization_membership_periods
    where organization_id = v_record.organization_id and user_id = v_student_user_id
      and joined_at <= v_record.created_at and (left_at is null or left_at >= v_record.created_at)
    order by joined_at desc limit 1;
    select id into v_instructor_period from public.organization_membership_periods
    where organization_id = v_record.organization_id and user_id = v_record.user_id
      and joined_at <= v_record.created_at and (left_at is null or left_at >= v_record.created_at)
    order by joined_at desc limit 1;

    if v_student_period is null or v_instructor_period is null then
      if not p_confirm_historical_evidence then
        raise exception 'Confirm historical membership evidence to continue.' using errcode = '42501';
      end if;
      v_evidence_kind := 'reviewer_attestation';
    else
      v_evidence_kind := 'membership_periods';
    end if;

    update public.endorsement_records
    set student_user_id = v_student_user_id,
        student_membership_period_id = v_student_period,
        instructor_membership_period_id = v_instructor_period,
        scope_status = 'confirmed',
        legacy_reviewed_by = auth.uid(),
        legacy_reviewed_at = timezone('utc', now()),
        legacy_review_note = nullif(btrim(p_note), '')
    where id = p_record_id;
  elsif p_decision = 'personal' then
    update public.endorsement_records
    set organization_id = null,
        instructor_membership_period_id = null,
        student_membership_period_id = null,
        scope_status = 'personal',
        legacy_reviewed_by = auth.uid(),
        legacy_reviewed_at = timezone('utc', now()),
        legacy_review_note = btrim(p_note)
    where id = p_record_id;
  end if;

  insert into public.legacy_endorsement_review_audit (
    record_id, reviewer_user_id, decision, student_user_id, evidence_kind, note
  ) values (
    p_record_id, auth.uid(), p_decision,
    case when p_decision = 'confirmed' then v_student_user_id else null end,
    v_evidence_kind, nullif(btrim(p_note), '')
  );
end;
$$;

revoke all on function public.review_legacy_endorsement_scope_v2(uuid, text, text, boolean) from public, anon;
grant execute on function public.review_legacy_endorsement_scope_v2(uuid, text, text, boolean) to authenticated;
