-- Draft lifecycle, linked-member identity, and richer pilot certificate privileges.

alter table public.saved_person_certificates
  add column if not exists certificate_level text,
  add column if not exists additional_privileges jsonb not null default '[]'::jsonb;

alter table public.saved_person_certificates
  drop constraint if exists saved_person_certificates_certificate_level_check;
alter table public.saved_person_certificates
  add constraint saved_person_certificates_certificate_level_check
  check (
    certificate_level is null
    or certificate_level in ('Student', 'Private', 'Commercial', 'ATP')
  );

alter table public.saved_person_certificates
  drop constraint if exists saved_person_certificates_additional_privileges_check;
alter table public.saved_person_certificates
  add constraint saved_person_certificates_additional_privileges_check
  check (jsonb_typeof(additional_privileges) = 'array');

create or replace function public.delete_asr_draft(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.organization_reports;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select * into v_report
  from public.organization_reports
  where id = p_report_id
  for update;

  if not found
    or v_report.submitted_by <> auth.uid()
    or v_report.report_type <> 'asr'
    or v_report.status <> 'draft' then
    raise exception 'Only your unsubmitted ASR draft can be deleted.' using errcode = '42501';
  end if;

  delete from public.organization_reports where id = p_report_id;
end;
$$;

revoke all on function public.delete_asr_draft(uuid) from public, anon;
grant execute on function public.delete_asr_draft(uuid) to authenticated;

-- Instructors see every current organization member as an endorsement candidate.
-- If the instructor already linked a private saved-person entry to that account,
-- their curated full name and certificate data remain the preferred presentation.
drop function if exists public.list_organization_students(uuid);
create function public.list_organization_students(p_organization_id uuid)
returns table (
  student_user_id uuid,
  person_id uuid,
  saved_person_id uuid,
  formal_name text,
  account_nickname text,
  effective_certificate_number text,
  certificate_source text,
  endorsement_ready boolean,
  certificate_conflict boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (
    private.is_organization_instructor(p_organization_id, auth.uid())
    or private.can_manage_organization(p_organization_id, auth.uid())
  ) then
    raise exception 'Only organization instructors and administrators can view organization members.' using errcode = '42501';
  end if;

  return query
  select
    members.user_id,
    members.user_id,
    instructor_person.id,
    nullif(btrim(self_person.display_name), '')::text,
    coalesce(
      nullif(btrim(profiles.display_name), ''),
      nullif(btrim(self_person.display_name), ''),
      nullif(btrim(organization_person.organization_display_name), ''),
      'Member'
    )::text,
    case
      when student_certificate.number_count = 1 then student_certificate.certificate_number
      when student_certificate.number_count > 1 then null
      else coalesce(instructor_certificate.certificate_number, nullif(btrim(instructor_person.cert_number), ''))
    end::text,
    case
      when student_certificate.number_count = 1 then 'canonical_profile'
      when student_certificate.number_count > 1 then 'conflict'
      when coalesce(instructor_certificate.certificate_number, nullif(btrim(instructor_person.cert_number), '')) is not null then 'saved_people'
      else 'missing'
    end::text,
    (
      nullif(btrim(self_person.display_name), '') is not null
      and coalesce(student_certificate.number_count, 0) <= 1
    ),
    coalesce(student_certificate.number_count, 0) > 1
  from public.organization_members as members
  left join public.organization_people as organization_person
    on organization_person.organization_id = members.organization_id
   and organization_person.user_id = members.user_id
   and organization_person.status = 'linked'
  left join public.profiles as profiles on profiles.id = members.user_id
  left join public.saved_people as self_person
    on self_person.id = profiles.self_person_id
   and self_person.user_id = members.user_id
  left join public.saved_person_account_links as account_link
    on account_link.owner_user_id = auth.uid()
   and account_link.linked_user_id = members.user_id
  left join public.saved_people as instructor_person
    on instructor_person.id = account_link.saved_person_id
   and instructor_person.user_id = auth.uid()
  left join lateral (
    select certificates.certificate_number
    from public.saved_person_certificates as certificates
    where certificates.user_id = auth.uid()
      and certificates.person_id = instructor_person.id
      and certificates.certificate_type = 'pilot'
    order by certificates.updated_at desc nulls last, certificates.created_at desc
    limit 1
  ) as instructor_certificate on true
  left join lateral (
    select
      count(distinct lower(btrim(certificates.certificate_number))) filter (
        where nullif(btrim(certificates.certificate_number), '') is not null
      )::integer as number_count,
      min(btrim(certificates.certificate_number)) filter (
        where nullif(btrim(certificates.certificate_number), '') is not null
      )::text as certificate_number
    from public.saved_person_certificates as certificates
    where certificates.user_id = members.user_id
      and certificates.person_id = self_person.id
      and certificates.certificate_type = 'pilot'
  ) as student_certificate on true
  where members.organization_id = p_organization_id
  order by coalesce(
    profiles.display_name,
    self_person.display_name,
    organization_person.organization_display_name,
    'Member'
  );
end;
$$;

revoke all on function public.list_organization_students(uuid) from public, anon;
grant execute on function public.list_organization_students(uuid) to authenticated;

create or replace function public.create_endorsement_record(
  p_id uuid, p_organization_id uuid, p_student_id uuid, p_student_name text,
  p_student_cert_number text, p_instructor_name text, p_instructor_cert_number text,
  p_endorsement_date text, p_template_titles text[], p_storage_path text,
  p_file_size_bytes integer, p_supersedes_record_id uuid default null
)
returns public.endorsement_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_user_id uuid;
  v_saved_student_id uuid;
  v_requested_student_name text := nullif(btrim(p_student_name), '');
  v_requested_student_cert_number text := nullif(btrim(p_student_cert_number), '');
  v_student_name text := nullif(btrim(p_student_name), '');
  v_student_cert_number text := nullif(btrim(p_student_cert_number), '');
  v_linked_certificate_count integer := 0;
  v_organization_id uuid;
  v_instructor_period_id uuid;
  v_student_period_id uuid;
  v_previous public.endorsement_records;
  v_result public.endorsement_records;
begin
  if auth.uid() is null then raise exception 'You must be signed in.' using errcode = '42501'; end if;
  if p_id is null or nullif(btrim(p_instructor_name), '') is null or nullif(btrim(p_storage_path), '') is null then
    raise exception 'Member, instructor, record ID, and PDF path are required.' using errcode = '22023';
  end if;
  if split_part(p_storage_path, '/', 1) <> auth.uid()::text then
    raise exception 'The PDF path must belong to the signed-in user.' using errcode = '42501';
  end if;

  if p_student_id is not null then
    select
      link.linked_user_id,
      case when link.linked_user_id is null
        then nullif(btrim(person.display_name), '')
        else nullif(btrim(linked_self.display_name), '')
      end,
      case
        when linked_certificate.number_count = 1 then linked_certificate.certificate_number
        when linked_certificate.number_count > 1 then null
        else coalesce(owner_certificate.certificate_number, nullif(btrim(person.cert_number), ''))
      end,
      coalesce(linked_certificate.number_count, 0)
    into v_student_user_id, v_student_name, v_student_cert_number, v_linked_certificate_count
    from public.saved_people as person
    left join public.saved_person_account_links as link
      on link.saved_person_id = person.id
     and link.owner_user_id = auth.uid()
    left join public.profiles as linked_profile on linked_profile.id = link.linked_user_id
    left join public.saved_people as linked_self
      on linked_self.id = linked_profile.self_person_id
     and linked_self.user_id = link.linked_user_id
    left join lateral (
      select certificate.certificate_number
      from public.saved_person_certificates as certificate
      where certificate.user_id = auth.uid()
        and certificate.person_id = person.id
        and certificate.certificate_type = 'pilot'
        and nullif(btrim(certificate.certificate_number), '') is not null
      order by certificate.updated_at desc nulls last, certificate.created_at desc
      limit 1
    ) as owner_certificate on true
    left join lateral (
      select
        count(distinct lower(btrim(certificate.certificate_number))) filter (
          where nullif(btrim(certificate.certificate_number), '') is not null
        )::integer as number_count,
        min(btrim(certificate.certificate_number)) filter (
          where nullif(btrim(certificate.certificate_number), '') is not null
        )::text as certificate_number
      from public.saved_person_certificates as certificate
      where certificate.user_id = link.linked_user_id
        and certificate.person_id = linked_self.id
        and certificate.certificate_type = 'pilot'
    ) as linked_certificate on true
    where person.id = p_student_id
      and person.user_id = auth.uid()
      and person.role = 'student';

    if found then
      v_saved_student_id := p_student_id;
    else
      select
        profile.id,
        nullif(btrim(self_person.display_name), ''),
        case when certificate.number_count = 1 then certificate.certificate_number else null end,
        coalesce(certificate.number_count, 0)
      into v_student_user_id, v_student_name, v_student_cert_number, v_linked_certificate_count
      from public.profiles profile
      join public.saved_people self_person
        on self_person.id = profile.self_person_id
       and self_person.user_id = profile.id
      left join lateral (
        select
          count(distinct lower(btrim(item.certificate_number))) filter (
            where nullif(btrim(item.certificate_number), '') is not null
          )::integer as number_count,
          min(btrim(item.certificate_number)) filter (
            where nullif(btrim(item.certificate_number), '') is not null
          )::text as certificate_number
        from public.saved_person_certificates item
        where item.user_id = profile.id
          and item.person_id = self_person.id
          and item.certificate_type = 'pilot'
      ) certificate on true
      where profile.id = p_student_id
        and private.can_edit_student_profile(auth.uid(), profile.id, p_organization_id);

      if not found then
        raise exception 'Complete the student formal profile before issuing this endorsement.' using errcode = 'P0002';
      end if;
      v_saved_student_id := null;
    end if;
    if v_student_name is null then
      raise exception 'A formal Saved People name is required for endorsements.' using errcode = '22023';
    end if;
    if v_linked_certificate_count > 1 then
      raise exception 'The linked student account has conflicting pilot certificate numbers.' using errcode = '22023';
    end if;
    if v_requested_student_name is distinct from v_student_name
      or v_requested_student_cert_number is distinct from v_student_cert_number then
      raise exception 'The formal student profile changed. Reselect the student before printing.' using errcode = '40001';
    end if;
  end if;

  if v_student_name is null then
    raise exception 'A student name is required.' using errcode = '22023';
  end if;

  -- Organization visibility is evidence derived from identity and membership,
  -- never a destination selected by the instructor. Keep the parameter only for
  -- backward-compatible clients and deliberately do not trust it.
  if v_student_user_id is not null then
    select instructor_member.organization_id, instructor_period.id, student_period.id
      into v_organization_id, v_instructor_period_id, v_student_period_id
    from public.organization_members as instructor_member
    join public.organization_members as student_member
      on student_member.organization_id = instructor_member.organization_id
     and student_member.user_id = v_student_user_id
    join public.organization_membership_periods as instructor_period
      on instructor_period.organization_id = instructor_member.organization_id
     and instructor_period.user_id = instructor_member.user_id
     and instructor_period.left_at is null
    join public.organization_membership_periods as student_period
      on student_period.organization_id = student_member.organization_id
     and student_period.user_id = student_member.user_id
     and student_period.left_at is null
    where instructor_member.user_id = auth.uid()
      and instructor_member.teaching_role = 'instructor'
    order by instructor_member.organization_id
    limit 1;
  end if;

  if p_supersedes_record_id is not null then
    select * into v_previous from public.endorsement_records
    where id = p_supersedes_record_id and user_id = auth.uid() for update;
    if not found then raise exception 'The original endorsement record was not found.' using errcode = 'P0002'; end if;
  end if;

  insert into public.endorsement_records (
    id, user_id, organization_id, student_id, student_user_id,
    instructor_membership_period_id, student_membership_period_id, scope_status,
    supersedes_record_id, student_name, student_cert_number, instructor_name,
    instructor_cert_number, endorsement_date, template_titles, storage_path, file_size_bytes
  ) values (
    p_id, auth.uid(), v_organization_id, v_saved_student_id, v_student_user_id,
    v_instructor_period_id, v_student_period_id,
    case when v_organization_id is null then 'personal' else 'confirmed' end,
    p_supersedes_record_id, v_student_name, v_student_cert_number,
    btrim(p_instructor_name), nullif(btrim(p_instructor_cert_number), ''),
    p_endorsement_date, coalesce(p_template_titles, '{}'::text[]), p_storage_path, p_file_size_bytes
  ) returning * into v_result;
  return v_result;
end;
$$;

revoke all on function public.create_endorsement_record(uuid, uuid, uuid, text, text, text, text, text, text[], text, integer, uuid)
  from public, anon;
grant execute on function public.create_endorsement_record(uuid, uuid, uuid, text, text, text, text, text, text[], text, integer, uuid)
  to authenticated;

-- A record belongs to its issuing instructor. Organization visibility is
-- derived at read time from the linked student identity and both users'
-- membership periods at the immutable issuance timestamp. This also makes a
-- historical record visible after a later account link without rewriting it.
create or replace function private.endorsement_shared_with_organization(
  p_record_id uuid,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.endorsement_records as record
    join public.organization_membership_periods as instructor_period
      on instructor_period.organization_id = p_organization_id
     and instructor_period.user_id = record.user_id
     and instructor_period.joined_at <= record.created_at
     and (instructor_period.left_at is null or instructor_period.left_at >= record.created_at)
    join public.organization_membership_periods as student_period
      on student_period.organization_id = p_organization_id
     and student_period.user_id = record.student_user_id
     and student_period.joined_at <= record.created_at
     and (student_period.left_at is null or student_period.left_at >= record.created_at)
    where record.id = p_record_id
      and record.student_user_id is not null
  )
$$;

revoke all on function private.endorsement_shared_with_organization(uuid, uuid)
  from public, anon, authenticated;

create or replace function private.can_view_endorsement_through_organization(
  p_record_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members as viewer
    where viewer.user_id = p_user_id
      and (
        private.can_manage_organization(viewer.organization_id, p_user_id)
        or private.is_organization_instructor(viewer.organization_id, p_user_id)
      )
      and private.endorsement_shared_with_organization(p_record_id, viewer.organization_id)
  )
$$;

revoke all on function private.can_view_endorsement_through_organization(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.can_view_endorsement_through_organization(uuid, uuid)
  to authenticated;

drop policy if exists endorsement_records_select_authorized on public.endorsement_records;
create policy endorsement_records_select_authorized
on public.endorsement_records for select to authenticated
using (
  user_id = (select auth.uid())
  or student_user_id = (select auth.uid())
  or private.can_view_endorsement_through_organization(id, (select auth.uid()))
  or (scope_status = 'pending_review' and (select private.is_platform_admin()))
);

do $$
begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists endorsement_records_files_select_authorized on storage.objects';
    execute $policy$
      create policy endorsement_records_files_select_authorized
      on storage.objects for select to authenticated
      using (
        bucket_id = 'endorsement-records'
        and exists (
          select 1
          from public.endorsement_records as record
          where record.storage_path = name
            and (
              record.user_id = (select auth.uid())
              or record.student_user_id = (select auth.uid())
              or private.can_view_endorsement_through_organization(record.id, (select auth.uid()))
              or (record.scope_status = 'pending_review' and (select private.is_platform_admin()))
            )
        )
      )
    $policy$;
  end if;
end
$$;

create or replace function public.list_organization_endorsement_records(p_organization_id uuid)
returns setof public.endorsement_records
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (
    private.can_manage_organization(p_organization_id, auth.uid())
    or private.is_organization_instructor(p_organization_id, auth.uid())
  ) then
    raise exception 'Organization instructor or administrator access is required.' using errcode = '42501';
  end if;

  return query
  select record.*
  from public.endorsement_records as record
  where private.endorsement_shared_with_organization(record.id, p_organization_id)
  order by record.created_at desc;
end;
$$;

revoke all on function public.list_organization_endorsement_records(uuid) from public, anon;
grant execute on function public.list_organization_endorsement_records(uuid) to authenticated;

-- Linked account data enriches the instructor's saved person at read time. The
-- student's source rows remain owned and editable only by the student.
create or replace function public.list_my_linked_person_certificates()
returns table (
  id uuid,
  user_id uuid,
  person_id uuid,
  linked_user_id uuid,
  linked_display_name text,
  certificate_type text,
  certificate_number text,
  ratings text[],
  issue_date date,
  last_event_date date,
  event_type text,
  certificate_level text,
  additional_privileges jsonb,
  is_default_for_endorsements boolean,
  notes text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  return query
  select
    certificate.id,
    certificate.user_id,
    link.saved_person_id,
    link.linked_user_id,
    coalesce(nullif(btrim(self_person.display_name), ''), nullif(btrim(profile.display_name), ''), 'Linked student')::text,
    certificate.certificate_type,
    certificate.certificate_number,
    certificate.ratings,
    certificate.issue_date,
    certificate.last_event_date,
    certificate.event_type,
    certificate.certificate_level,
    certificate.additional_privileges,
    false,
    certificate.notes,
    certificate.created_at,
    certificate.updated_at
  from public.saved_person_account_links as link
  join public.profiles as profile on profile.id = link.linked_user_id
  join public.saved_people as self_person
    on self_person.id = profile.self_person_id
   and self_person.user_id = link.linked_user_id
  join public.saved_person_certificates as certificate
    on certificate.user_id = link.linked_user_id
   and certificate.person_id = self_person.id
  where link.owner_user_id = auth.uid()
  order by link.saved_person_id, certificate.created_at desc;
end;
$$;

revoke all on function public.list_my_linked_person_certificates() from public, anon;
grant execute on function public.list_my_linked_person_certificates() to authenticated;

create or replace function public.list_my_endorsement_people()
returns table (
  saved_person_id uuid,
  linked_user_id uuid,
  formal_name text,
  account_nickname text,
  saved_certificate_number text,
  effective_certificate_number text,
  certificate_source text,
  endorsement_ready boolean,
  certificate_conflict boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  return query
  select
    person.id,
    link.linked_user_id,
    case when link.linked_user_id is null
      then nullif(btrim(person.display_name), '')
      else nullif(btrim(self_person.display_name), '')
    end::text,
    case when link.linked_user_id is null then null else coalesce(
      nullif(btrim(profile.display_name), ''),
      nullif(btrim(self_person.display_name), ''),
      'Linked account'
    ) end::text,
    coalesce(owner_certificate.certificate_number, nullif(btrim(person.cert_number), ''))::text,
    case
      when student_certificate.number_count = 1 then student_certificate.certificate_number
      when student_certificate.number_count > 1 then null
      else coalesce(owner_certificate.certificate_number, nullif(btrim(person.cert_number), ''))
    end::text,
    case
      when student_certificate.number_count = 1 then 'canonical_profile'
      when student_certificate.number_count > 1 then 'conflict'
      when coalesce(owner_certificate.certificate_number, nullif(btrim(person.cert_number), '')) is not null then 'saved_people'
      else 'missing'
    end::text,
    (
      nullif(btrim(person.display_name), '') is not null
      and coalesce(student_certificate.number_count, 0) <= 1
    ),
    coalesce(student_certificate.number_count, 0) > 1
  from public.saved_people as person
  left join public.saved_person_account_links as link
    on link.owner_user_id = auth.uid()
   and link.saved_person_id = person.id
  left join public.profiles as profile on profile.id = link.linked_user_id
  left join public.saved_people as self_person
    on self_person.id = profile.self_person_id
   and self_person.user_id = link.linked_user_id
  left join lateral (
    select certificate.certificate_number
    from public.saved_person_certificates as certificate
    where certificate.user_id = auth.uid()
      and certificate.person_id = person.id
      and certificate.certificate_type = 'pilot'
      and nullif(btrim(certificate.certificate_number), '') is not null
    order by certificate.updated_at desc nulls last, certificate.created_at desc
    limit 1
  ) as owner_certificate on true
  left join lateral (
    select
      count(distinct lower(btrim(certificate.certificate_number))) filter (
        where nullif(btrim(certificate.certificate_number), '') is not null
      )::integer as number_count,
      min(btrim(certificate.certificate_number)) filter (
        where nullif(btrim(certificate.certificate_number), '') is not null
      )::text as certificate_number
    from public.saved_person_certificates as certificate
    where certificate.user_id = link.linked_user_id
      and certificate.person_id = self_person.id
      and certificate.certificate_type = 'pilot'
  ) as student_certificate on true
  where person.user_id = auth.uid()
    and person.role = 'student'
  order by person.display_name, person.created_at;
end;
$$;

revoke all on function public.list_my_endorsement_people() from public, anon;
grant execute on function public.list_my_endorsement_people() to authenticated;

-- A new brief is inserted and finalized inside one database transaction. Any
-- validation or meter-update failure rolls the insert back, leaving no half brief.
create or replace function public.create_and_finalize_flight_brief(
  p_input jsonb,
  p_meter_type text default null,
  p_meter_value numeric default null,
  p_observed_at timestamptz default null,
  p_planned_meter_increase numeric default null
)
returns public.flight_briefs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_input jsonb := coalesce(p_input, '{}'::jsonb);
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if jsonb_typeof(v_input) <> 'object' then
    raise exception 'Flight brief input must be an object.' using errcode = '22023';
  end if;

  insert into public.flight_briefs (
    created_by, organization_id, aircraft_id, aircraft_tail_number,
    student_name, instructor_name, flight_date, etd, eta, ete, flight_rules,
    route, status, brief_data, weather_snapshot, notam_snapshot, wb_snapshot
  ) values (
    auth.uid(), nullif(v_input->>'organization_id', '')::uuid,
    nullif(v_input->>'aircraft_id', '')::uuid,
    coalesce(v_input->>'aircraft_tail_number', ''),
    coalesce(v_input->>'student_name', ''),
    coalesce(v_input->>'instructor_name', ''),
    nullif(v_input->>'flight_date', '')::date,
    nullif(v_input->>'etd', ''), nullif(v_input->>'eta', ''),
    nullif(v_input->>'ete', '')::numeric, nullif(v_input->>'flight_rules', ''),
    nullif(v_input->>'route', ''), 'draft',
    coalesce(v_input->'brief_data', '{}'::jsonb),
    coalesce(v_input->'weather_snapshot', '{}'::jsonb),
    coalesce(v_input->'notam_snapshot', '{}'::jsonb),
    coalesce(v_input->'wb_snapshot', '{}'::jsonb)
  ) returning id into v_id;

  return public.finalize_flight_brief(
    v_id, p_meter_type, p_meter_value, p_observed_at, p_planned_meter_increase
  );
end;
$$;

revoke all on function public.create_and_finalize_flight_brief(jsonb, text, numeric, timestamptz, numeric)
  from public, anon;
grant execute on function public.create_and_finalize_flight_brief(jsonb, text, numeric, timestamptz, numeric)
  to authenticated;

drop policy if exists flight_briefs_select_authorized on public.flight_briefs;
create policy flight_briefs_select_authorized
on public.flight_briefs for select to authenticated
using (
  created_by = (select auth.uid())
  or (
    status in ('finalized', 'superseded')
    and organization_id is not null
    and (
      (select private.can_manage_organization(organization_id))
      or (select private.is_organization_instructor(organization_id))
    )
  )
);
