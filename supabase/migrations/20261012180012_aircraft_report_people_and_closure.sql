-- Report-specific people are independent of the account submitting the report.
-- Existing records remain unknown rather than being backfilled from submitters.
alter table public.aircraft_discrepancy_reports
  add column if not exists found_by_person_id uuid
    references public.organization_people(id) on delete set null,
  add column if not exists found_by_name text;

comment on column public.aircraft_discrepancy_reports.found_by_person_id
  is 'Person explicitly selected as having found the issue; unknown for legacy records.';
comment on column public.aircraft_discrepancy_reports.found_by_name
  is 'Organization display name captured when the report was submitted.';

create or replace function private.validate_aircraft_discrepancy_report_input()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_timezone text := coalesce(nullif(current_setting('pilotseal.report_timezone', true), ''), 'UTC');
begin
  if char_length(btrim(new.description)) < 3 or char_length(btrim(new.description)) > 5000 then
    raise exception 'Enter a description between 3 and 5000 characters.' using errcode = '22023';
  end if;
  if new.report_date > timezone(v_timezone, now())::date then
    raise exception 'The report date cannot be in the future.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace function public.submit_aircraft_report(
  p_organization_id uuid,
  p_client_request_id uuid,
  p_aircraft_id uuid,
  p_report_date date,
  p_found_by_person_id uuid,
  p_report_timezone text,
  p_student_person_id uuid,
  p_instructor_person_id uuid,
  p_flight_hobbs_end numeric,
  p_maintenance_hobbs_end numeric,
  p_flight_duration numeric,
  p_discrepancy_type text,
  p_description text,
  p_ground_aircraft boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_found_name text;
  v_report_id uuid;
  v_previous_timezone text := current_setting('pilotseal.report_timezone', true);
begin
  if auth.uid() is null or not private.is_organization_member(p_organization_id, auth.uid()) then
    raise exception 'Organization membership is required.' using errcode = '42501';
  end if;
  if p_aircraft_id is null then
    raise exception 'Select an aircraft.' using errcode = '22023';
  end if;
  if p_found_by_person_id is null then
    raise exception 'Select who found the issue.' using errcode = '22023';
  end if;
  select coalesce(nullif(btrim(person.organization_display_name), ''), nullif(btrim(profile.display_name), ''), 'Organization person')
  into v_found_name
  from public.organization_people person
  left join public.profiles profile on profile.id = person.user_id
  where person.id = p_found_by_person_id
    and person.organization_id = p_organization_id
    and person.status in ('linked', 'pending')
  for share of person;
  if v_found_name is null then
    raise exception 'Select a person from this organization.' using errcode = '22023';
  end if;
  if p_discrepancy_type is null or p_discrepancy_type not in (
    'Wings', 'Fuselage', 'Main Rotor', 'Tail Rotor', 'Propeller',
    'Flight Controls', 'Engine', 'Fuel', 'Landing Gear',
    'Electrical/Lighting', 'Flight Instrument', 'Hobbs', 'Pitot Static',
    'Radio', 'Navigation', 'EFIS', 'Transponder/ADS-B', 'Auto Pilot'
  ) then
    raise exception 'Select an affected area.' using errcode = '22023';
  end if;
  if p_report_date is null then
    raise exception 'Enter a valid report date.' using errcode = '22023';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_report_timezone) then
    raise exception 'Invalid report time zone.' using errcode = '22023';
  end if;
  if p_description is null or char_length(btrim(p_description)) not between 3 and 5000 then
    raise exception 'Enter a description between 3 and 5000 characters.' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(array[p_flight_hobbs_end, p_maintenance_hobbs_end, p_flight_duration]) n
    where n < 0 or n::text in ('NaN', 'Infinity', '-Infinity')
  ) then
    raise exception 'Enter zero or a positive decimal number.' using errcode = '22023';
  end if;

  -- Serialize retries without changing a report that already exists.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_organization_id::text || ':' || auth.uid()::text || ':' || p_client_request_id::text, 0));
  select id into v_report_id from public.organization_reports
  where organization_id = p_organization_id and submitted_by = auth.uid()
    and client_request_id = p_client_request_id;
  if v_report_id is not null then return v_report_id; end if;

  perform set_config('pilotseal.report_timezone', p_report_timezone, true);
  v_report_id := public.submit_aircraft_discrepancy_report(
    p_organization_id, p_client_request_id, p_aircraft_id, p_report_date,
    p_student_person_id, p_instructor_person_id, p_flight_hobbs_end,
    p_maintenance_hobbs_end, p_flight_duration, p_discrepancy_type, p_description,
    coalesce(p_ground_aircraft, false));
  update public.aircraft_discrepancy_reports
  set found_by_person_id = p_found_by_person_id, found_by_name = v_found_name
  where report_id = v_report_id;
  perform set_config('pilotseal.report_timezone', coalesce(v_previous_timezone, ''), true);
  return v_report_id;
end;
$$;

-- The legacy entry point remains available to existing server-side ASR flows,
-- but browser/API callers must supply a verified found-by person.
revoke execute on function public.submit_aircraft_discrepancy_report(
  uuid, uuid, uuid, date, uuid, uuid, numeric, numeric, numeric, text, text, boolean
) from public, anon, authenticated;
revoke all on function public.submit_aircraft_report(
  uuid, uuid, uuid, date, uuid, text, uuid, uuid, numeric, numeric, numeric, text, text, boolean
) from public, anon;
grant execute on function public.submit_aircraft_report(
  uuid, uuid, uuid, date, uuid, text, uuid, uuid, numeric, numeric, numeric, text, text, boolean
) to authenticated;

create or replace function public.close_aircraft_report(
  p_report_id uuid,
  p_expected_updated_at timestamptz,
  p_review jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.organization_reports;
  v_detail public.aircraft_discrepancy_reports;
  v_actor_name text;
  v_organization_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  select * into v_report from public.organization_reports where id = p_report_id for update;
  select * into v_detail from public.aircraft_discrepancy_reports where report_id = p_report_id for update;
  if v_report.id is null or v_detail.report_id is null then
    raise exception 'Report not found.' using errcode = 'P0002';
  end if;
  if not private.can_manage_organization(v_report.organization_id, auth.uid()) then
    raise exception 'You do not have permission to close this report.' using errcode = '42501';
  end if;
  if v_report.status = 'closed' then return; end if;
  if p_expected_updated_at is null or p_expected_updated_at is distinct from v_report.updated_at then
    raise exception 'This report changed. Reload it before closing.' using errcode = '22023';
  end if;
  if p_review is not null then
    if jsonb_typeof(p_review) <> 'object'
      or not p_review ?& array['status', 'instructorPersonId', 'asrSubmitted', 'deferrable', 'aircraftDown', 'creditApplied', 'creditAuthorized']
      or coalesce(p_review->>'status', '') not in ('submitted', 'in_review')
      or jsonb_typeof(p_review->'creditAuthorized') <> 'boolean'
      or exists (
        select 1 from unnest(array['asrSubmitted', 'deferrable', 'aircraftDown', 'creditApplied']) k
        where jsonb_typeof(p_review->k) not in ('boolean', 'null')
      ) then
      raise exception 'Invalid review changes.' using errcode = '22023';
    end if;
    if v_detail.credit_authorized_at is not null and not (p_review->>'creditAuthorized')::boolean then
      raise exception 'Existing flight credit authorization cannot be changed while closing.' using errcode = '22023';
    end if;
    perform public.process_aircraft_discrepancy_report(
      p_report_id, p_review->>'status', nullif(p_review->>'instructorPersonId', '')::uuid,
      (p_review->>'asrSubmitted')::boolean, (p_review->>'deferrable')::boolean,
      (p_review->>'aircraftDown')::boolean, (p_review->>'creditApplied')::boolean,
      (p_review->>'creditAuthorized')::boolean);
  end if;
  v_actor_name := private.organization_report_actor_name(v_report.organization_id, auth.uid());
  update public.organization_reports
  set status = 'closed', closed_at = timezone('utc', now()), updated_at = timezone('utc', now())
  where id = p_report_id;
  insert into public.organization_report_events(report_id, event_type, actor_user_id, actor_name)
  values (p_report_id, 'closed', auth.uid(), v_actor_name);
  select name into v_organization_name from public.organizations where id = v_report.organization_id;
  if v_report.submitted_by <> auth.uid() then
    perform private.create_user_notification(
      v_report.submitted_by, 'Aircraft report closed',
      v_detail.aircraft_tail_number || ': the report was closed.',
      'organization', 'normal', v_report.organization_id, v_organization_name,
      '/dashboard/reports?reportId=' || p_report_id::text,
      'aircraft-report:' || p_report_id::text || ':closed', auth.uid());
  end if;
end;
$$;
revoke all on function public.close_aircraft_report(uuid, timestamptz, jsonb) from public, anon;
grant execute on function public.close_aircraft_report(uuid, timestamptz, jsonb) to authenticated;

create or replace function public.process_aircraft_discrepancy_report(
  p_report_id uuid,
  p_status text,
  p_instructor_person_id uuid,
  p_asr_submitted boolean,
  p_deferrable boolean,
  p_aircraft_down boolean,
  p_credit_applied boolean,
  p_credit_authorized boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.organization_reports;
  v_discrepancy public.aircraft_discrepancy_reports;
  v_instructor_name text;
  v_instructor_user_id uuid;
  v_actor_name text;
  v_organization_name text;
  v_event_type text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('submitted', 'in_review') then
    raise exception 'Invalid report status.' using errcode = '22023';
  end if;

  select * into v_report
  from public.organization_reports where id = p_report_id for update;
  select * into v_discrepancy
  from public.aircraft_discrepancy_reports where report_id = p_report_id for update;
  if v_report.id is null or v_discrepancy.report_id is null then
    raise exception 'Report not found.' using errcode = 'P0002';
  end if;
  if not private.can_manage_organization(v_report.organization_id, auth.uid()) then
    raise exception 'Only organization owners and administrators can process reports.' using errcode = '42501';
  end if;
  if v_report.status = 'closed' then
    raise exception 'Closed reports are immutable.' using errcode = '22023';
  end if;

  if p_instructor_person_id is not null then
    select
      coalesce(nullif(btrim(person.organization_display_name), ''), profile.display_name, 'Instructor'),
      person.user_id
    into v_instructor_name, v_instructor_user_id
    from public.organization_people person
    left join public.profiles profile on profile.id = person.user_id
    where person.id = p_instructor_person_id
      and person.organization_id = v_report.organization_id
      and person.teaching_role = 'instructor'
      and person.status in ('pending', 'linked');
    if v_instructor_name is null then
      raise exception 'The selected instructor is not valid for this organization.' using errcode = '22023';
    end if;
  end if;
  if v_discrepancy.instructor_signed_at is not null
    and p_instructor_person_id is distinct from v_discrepancy.instructor_person_id then
    raise exception 'The instructor cannot be changed after signature.' using errcode = '22023';
  end if;

  v_actor_name := private.organization_report_actor_name(v_report.organization_id, auth.uid());
  update public.aircraft_discrepancy_reports
  set instructor_person_id = p_instructor_person_id,
      instructor_name = v_instructor_name,
      is_asr_submitted = p_asr_submitted,
      is_deferrable = p_deferrable,
      is_aircraft_down = p_aircraft_down,
      is_credit_applied = p_credit_applied,
      processed_by = auth.uid(),
      processed_by_name = v_actor_name,
      credit_authorized_by = case when p_credit_authorized then coalesce(credit_authorized_by, auth.uid()) else null end,
      credit_authorized_name = case when p_credit_authorized then coalesce(credit_authorized_name, v_actor_name) else null end,
      credit_authorized_at = case when p_credit_authorized then coalesce(credit_authorized_at, timezone('utc', now())) else null end,
      updated_at = timezone('utc', now())
  where report_id = p_report_id;

  update public.organization_reports
  set status = p_status,
      updated_at = timezone('utc', now()),
      closed_at = case when p_status = 'closed' then timezone('utc', now()) else null end
  where id = p_report_id;

  v_event_type := case when p_status = 'closed' then 'closed' else 'reviewed' end;
  insert into public.organization_report_events (
    report_id, event_type, actor_user_id, actor_name, details
  ) values (
    p_report_id, v_event_type, auth.uid(), v_actor_name,
    jsonb_build_object(
      'status', p_status,
      'asr_submitted', p_asr_submitted,
      'deferrable', p_deferrable,
      'aircraft_down', p_aircraft_down,
      'credit_applied', p_credit_applied,
      'credit_authorized', p_credit_authorized
    )
  );

  select organization.name into v_organization_name
  from public.organizations organization where organization.id = v_report.organization_id;

  if p_instructor_person_id is distinct from v_discrepancy.instructor_person_id
    and v_instructor_user_id is not null
    and v_instructor_user_id <> auth.uid() then
    perform private.create_user_notification(
      v_instructor_user_id,
      'Aircraft report needs instructor signature',
      v_discrepancy.aircraft_tail_number || ': review and sign the discrepancy report.',
      'organization', 'high', v_report.organization_id, v_organization_name,
      '/dashboard/reports?reportId=' || p_report_id::text,
      'aircraft-report:' || p_report_id::text || ':signature:' || v_instructor_user_id::text,
      auth.uid()
    );
  end if;

  if p_status = 'closed' and v_report.submitted_by <> auth.uid() then
    perform private.create_user_notification(
      v_report.submitted_by,
      'Aircraft report closed',
      v_discrepancy.aircraft_tail_number || ': the discrepancy report was closed.',
      'organization', 'normal', v_report.organization_id, v_organization_name,
      '/dashboard/reports?reportId=' || p_report_id::text,
      'aircraft-report:' || p_report_id::text || ':closed',
      auth.uid()
    );
  end if;
end;
$$;

notify pgrst, 'reload schema';
