-- Make quarantined endorsement review actionable and decouple Flight Brief
-- organization sharing from aircraft ownership.

create table if not exists public.legacy_endorsement_review_audit (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.endorsement_records(id) on delete restrict,
  reviewer_user_id uuid not null references auth.users(id) on delete restrict,
  decision text not null check (decision in ('personal', 'confirmed', 'defer')),
  student_user_id uuid references auth.users(id) on delete restrict,
  evidence_kind text not null check (evidence_kind in ('not_applicable', 'membership_periods', 'reviewer_attestation')),
  note text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists legacy_endorsement_review_audit_record_idx
  on public.legacy_endorsement_review_audit (record_id, created_at desc);

alter table public.legacy_endorsement_review_audit enable row level security;
drop policy if exists legacy_endorsement_review_audit_platform_select
  on public.legacy_endorsement_review_audit;
create policy legacy_endorsement_review_audit_platform_select
on public.legacy_endorsement_review_audit for select to authenticated
using ((select private.is_platform_admin()));

revoke all on public.legacy_endorsement_review_audit from public, anon, authenticated;
grant select on public.legacy_endorsement_review_audit to authenticated;

create or replace function public.get_legacy_endorsement_review_context(p_record_id uuid)
returns table (
  record_id uuid,
  organization_id uuid,
  organization_name text,
  linked_student_user_id uuid,
  linked_student_name text,
  linked_student_email text,
  account_linked boolean,
  organization_student boolean,
  student_period_at_record uuid,
  instructor_period_at_record uuid,
  requires_historical_attestation boolean,
  blocker text
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

  return query
  with target as (
    select record.*,
           link.linked_user_id,
           profile.display_name as linked_name,
           profile.email as linked_email
    from public.endorsement_records record
    left join public.saved_person_account_links link
      on link.saved_person_id = record.student_id
     and link.owner_user_id = record.user_id
    left join public.profiles profile on profile.id = link.linked_user_id
    where record.id = p_record_id and record.scope_status = 'pending_review'
  ), evidence as (
    select target.*,
      exists (
        select 1 from public.organization_members member
        where member.organization_id = target.organization_id
          and member.user_id = target.linked_user_id
          and member.teaching_role = 'student'
      ) or exists (
        select 1 from public.organization_people person
        where person.organization_id = target.organization_id
          and person.user_id = target.linked_user_id
          and person.teaching_role = 'student'
          and person.status in ('linked', 'left')
      ) as is_org_student,
      (
        select period.id from public.organization_membership_periods period
        where period.organization_id = target.organization_id
          and period.user_id = target.linked_user_id
          and period.joined_at <= target.created_at
          and (period.left_at is null or period.left_at >= target.created_at)
        order by period.joined_at desc limit 1
      ) as student_period,
      (
        select period.id from public.organization_membership_periods period
        where period.organization_id = target.organization_id
          and period.user_id = target.user_id
          and period.joined_at <= target.created_at
          and (period.left_at is null or period.left_at >= target.created_at)
        order by period.joined_at desc limit 1
      ) as instructor_period
    from target
  )
  select evidence.id,
         evidence.organization_id,
         organization.name,
         evidence.linked_user_id,
         evidence.linked_name,
         evidence.linked_email,
         evidence.linked_user_id is not null,
         evidence.is_org_student,
         evidence.student_period,
         evidence.instructor_period,
         evidence.student_period is null or evidence.instructor_period is null,
         case
           when evidence.linked_user_id is null then 'Link this saved student to their verified platform account first.'
           when not evidence.is_org_student then 'The linked account must be a current or historical student member of this organization.'
           when evidence.student_period is null or evidence.instructor_period is null then 'Membership periods do not cover the original record time. Confirm documentary evidence in the review drawer.'
           else null
         end
  from evidence
  join public.organizations organization on organization.id = evidence.organization_id;
end;
$$;

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
  if p_decision <> 'defer' and nullif(btrim(p_note), '') is null then
    raise exception 'A review note is required.' using errcode = '22023';
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
        raise exception 'Membership periods do not cover the original record time. Confirm documentary evidence to continue.' using errcode = '42501';
      end if;
      if length(btrim(p_note)) < 12 then
        raise exception 'Describe the historical membership evidence in at least 12 characters.' using errcode = '22023';
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
        legacy_review_note = btrim(p_note)
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

revoke all on function public.get_legacy_endorsement_review_context(uuid) from public, anon;
revoke all on function public.review_legacy_endorsement_scope_v2(uuid, text, text, boolean) from public, anon;
revoke all on function public.review_legacy_endorsement_scope(uuid, text, uuid, text) from authenticated;
grant execute on function public.get_legacy_endorsement_review_context(uuid) to authenticated;
grant execute on function public.review_legacy_endorsement_scope_v2(uuid, text, text, boolean) to authenticated;

create table if not exists public.flight_brief_organization_shares (
  id uuid primary key default gen_random_uuid(),
  source_brief_id uuid not null references public.flight_briefs(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  shared_brief_id uuid not null references public.flight_briefs(id) on delete restrict,
  shared_by uuid not null references auth.users(id) on delete restrict,
  shared_at timestamptz not null default timezone('utc', now()),
  unique (source_brief_id, organization_id)
);

alter table public.flight_brief_organization_shares enable row level security;
drop policy if exists flight_brief_organization_shares_select_authorized
  on public.flight_brief_organization_shares;
create policy flight_brief_organization_shares_select_authorized
on public.flight_brief_organization_shares for select to authenticated
using (
  shared_by = (select auth.uid())
  or (select private.is_organization_manager(organization_id))
  or (select private.is_organization_instructor(organization_id))
);
revoke all on public.flight_brief_organization_shares from public, anon, authenticated;
grant select on public.flight_brief_organization_shares to authenticated;

create or replace function public.share_personal_flight_brief_with_organization(
  p_brief_id uuid,
  p_organization_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.flight_briefs;
  v_shared_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;
  if private.active_membership_period_id(p_organization_id, auth.uid()) is null then
    raise exception 'Current organization membership is required.' using errcode = '42501';
  end if;

  select * into v_source from public.flight_briefs
  where id = p_brief_id
    and created_by = auth.uid()
    and organization_id is null
    and status in ('finalized', 'superseded')
  for share;
  if not found then
    raise exception 'Finalized Personal Flight Brief not found.' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.flight_brief_organization_shares
    where source_brief_id = p_brief_id and organization_id = p_organization_id
  ) then
    raise exception 'This Flight Brief has already been shared with that organization.' using errcode = '23505';
  end if;

  insert into public.flight_briefs (
    created_by, organization_id, aircraft_id, aircraft_tail_number,
    student_name, instructor_name, flight_date, etd, eta, ete, flight_rules, route,
    status, revision_number, supersedes_id, brief_data, mx_snapshot,
    weather_snapshot, notam_snapshot, wb_snapshot, finalized_at
  ) values (
    auth.uid(), p_organization_id, v_source.aircraft_id, v_source.aircraft_tail_number,
    v_source.student_name, v_source.instructor_name, v_source.flight_date,
    v_source.etd, v_source.eta, v_source.ete, v_source.flight_rules, v_source.route,
    v_source.status, v_source.revision_number, null, v_source.brief_data, v_source.mx_snapshot,
    v_source.weather_snapshot, v_source.notam_snapshot, v_source.wb_snapshot, v_source.finalized_at
  ) returning id into v_shared_id;

  insert into public.flight_brief_organization_shares (
    source_brief_id, organization_id, shared_brief_id, shared_by
  ) values (p_brief_id, p_organization_id, v_shared_id, auth.uid());

  return v_shared_id;
end;
$$;

revoke all on function public.share_personal_flight_brief_with_organization(uuid, uuid) from public, anon;
grant execute on function public.share_personal_flight_brief_with_organization(uuid, uuid) to authenticated;

-- An organization-scoped draft is already an organization record. Current
-- managers and instructors can see it; former members retain only their own rows.
drop policy if exists flight_briefs_select_authorized on public.flight_briefs;
create policy flight_briefs_select_authorized
on public.flight_briefs for select to authenticated
using (
  created_by = (select auth.uid())
  or (
    organization_id is not null
    and membership_period_id is not null
    and (
      (select private.is_organization_manager(organization_id))
      or (select private.is_organization_instructor(organization_id))
    )
  )
);
