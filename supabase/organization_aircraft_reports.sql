-- Organization report intake and aircraft discrepancy workflow.
-- Prerequisites: organizations.sql, organization_people_account_linking.sql,
-- aircraft_multi_organization_assignments.sql, mx_preflight_records.sql,
-- and unified_notification_inbox.sql.

create table if not exists public.organization_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  report_type text not null check (report_type in ('aircraft_discrepancy', 'asr')),
  status text not null default 'submitted'
    check (status in ('submitted', 'in_review', 'closed')),
  submitted_by uuid not null references auth.users(id) on delete restrict,
  submitted_by_name text not null,
  client_request_id uuid not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  closed_at timestamptz,
  unique (organization_id, submitted_by, client_request_id)
);

create table if not exists public.aircraft_discrepancy_reports (
  report_id uuid primary key references public.organization_reports(id) on delete cascade,
  aircraft_id uuid not null references public.aircraft(id) on delete restrict,
  aircraft_tail_number text not null,
  report_date date not null,
  student_person_id uuid references public.organization_people(id) on delete set null,
  student_name text,
  instructor_person_id uuid references public.organization_people(id) on delete set null,
  instructor_name text,
  flight_hobbs_end numeric check (flight_hobbs_end is null or flight_hobbs_end >= 0),
  maintenance_hobbs_end numeric check (maintenance_hobbs_end is null or maintenance_hobbs_end >= 0),
  flight_duration numeric check (flight_duration is null or flight_duration >= 0),
  discrepancy_type text not null check (discrepancy_type in (
    'Wings', 'Fuselage', 'Main Rotor', 'Tail Rotor', 'Propeller',
    'Flight Controls', 'Engine', 'Fuel', 'Landing Gear',
    'Electrical/Lighting', 'Flight Instrument', 'Hobbs', 'Pitot Static',
    'Radio', 'Navigation', 'EFIS', 'Transponder/ADS-B', 'Auto Pilot'
  )),
  description text not null check (char_length(btrim(description)) between 3 and 5000),
  is_asr_submitted boolean,
  is_deferrable boolean,
  is_aircraft_down boolean,
  is_credit_applied boolean,
  instructor_signed_by uuid references auth.users(id) on delete set null,
  instructor_signed_name text,
  instructor_signed_at timestamptz,
  processed_by uuid references auth.users(id) on delete set null,
  processed_by_name text,
  credit_authorized_by uuid references auth.users(id) on delete set null,
  credit_authorized_name text,
  credit_authorized_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.organization_report_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.organization_reports(id) on delete cascade,
  event_type text not null check (event_type in (
    'submitted', 'instructor_signed', 'grounded', 'reviewed', 'closed'
  )),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_name text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists organization_reports_org_created_idx
on public.organization_reports (organization_id, created_at desc);
create index if not exists organization_reports_submitter_created_idx
on public.organization_reports (submitted_by, created_at desc);
create index if not exists aircraft_discrepancy_aircraft_idx
on public.aircraft_discrepancy_reports (aircraft_id, report_date desc);
create index if not exists organization_report_events_report_idx
on public.organization_report_events (report_id, created_at);

-- Match the friendly browser validation at the database boundary so direct RPC
-- callers and future integrations cannot create inconsistent reports.
create or replace function private.validate_aircraft_discrepancy_report_input()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_description_length integer := char_length(btrim(new.description));
begin
  if v_description_length < 3 or v_description_length > 5000 then
    raise exception 'Describe what happened using between 3 and 5000 characters.'
      using errcode = '22023';
  end if;

  if new.report_date > current_date then
    raise exception 'The report date cannot be in the future.'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_aircraft_discrepancy_report_input
on public.aircraft_discrepancy_reports;
create trigger validate_aircraft_discrepancy_report_input
before insert or update of report_date, description
on public.aircraft_discrepancy_reports
for each row
execute function private.validate_aircraft_discrepancy_report_input();

revoke all on function private.validate_aircraft_discrepancy_report_input()
from public, anon, authenticated;

alter table public.organization_reports enable row level security;
alter table public.aircraft_discrepancy_reports enable row level security;
alter table public.organization_report_events enable row level security;

revoke all on public.organization_reports from public, anon, authenticated;
revoke all on public.aircraft_discrepancy_reports from public, anon, authenticated;
revoke all on public.organization_report_events from public, anon, authenticated;
grant select on public.organization_reports to authenticated;
grant select on public.aircraft_discrepancy_reports to authenticated;
grant select on public.organization_report_events to authenticated;

create or replace function private.organization_report_actor_name(
  p_organization_id uuid,
  p_user_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select nullif(btrim(person.organization_display_name), '')
      from public.organization_people person
      where person.organization_id = p_organization_id
        and person.user_id = p_user_id
        and person.status = 'linked'
      limit 1
    ),
    (select nullif(btrim(profile.display_name), '') from public.profiles profile where profile.id = p_user_id),
    (select auth_user.email::text from auth.users auth_user where auth_user.id = p_user_id),
    'Organization member'
  );
$$;

create or replace function private.can_read_organization_report(
  p_report_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_reports report
    left join public.aircraft_discrepancy_reports discrepancy
      on discrepancy.report_id = report.id
    left join public.organization_people instructor
      on instructor.id = discrepancy.instructor_person_id
    where report.id = p_report_id
      and (
        report.submitted_by = p_user_id
        or private.can_manage_organization(report.organization_id, p_user_id)
        or instructor.user_id = p_user_id
      )
  );
$$;

revoke all on function private.organization_report_actor_name(uuid, uuid) from public;
revoke all on function private.can_read_organization_report(uuid, uuid) from public;
grant execute on function private.organization_report_actor_name(uuid, uuid) to authenticated;
grant execute on function private.can_read_organization_report(uuid, uuid) to authenticated;

drop policy if exists organization_reports_select_authorized on public.organization_reports;
create policy organization_reports_select_authorized
on public.organization_reports for select to authenticated
using ((select private.can_read_organization_report(id, auth.uid())));

drop policy if exists aircraft_discrepancy_reports_select_authorized on public.aircraft_discrepancy_reports;
create policy aircraft_discrepancy_reports_select_authorized
on public.aircraft_discrepancy_reports for select to authenticated
using ((select private.can_read_organization_report(report_id, auth.uid())));

drop policy if exists organization_report_events_select_authorized on public.organization_report_events;
create policy organization_report_events_select_authorized
on public.organization_report_events for select to authenticated
using ((select private.can_read_organization_report(report_id, auth.uid())));

create or replace function public.list_organization_report_people(p_organization_id uuid)
returns table (
  person_id uuid,
  user_id uuid,
  display_name text,
  teaching_role text,
  status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not private.is_organization_member(p_organization_id, auth.uid()) then
    raise exception 'Organization membership is required.' using errcode = '42501';
  end if;

  return query
  select
    person.id,
    person.user_id,
    coalesce(
      nullif(btrim(person.organization_display_name), ''),
      nullif(btrim(profile.display_name), ''),
      'Organization person'
    )::text,
    person.teaching_role,
    person.status
  from public.organization_people person
  left join public.profiles profile on profile.id = person.user_id
  where person.organization_id = p_organization_id
    and person.status in ('pending', 'linked')
  order by lower(coalesce(person.organization_display_name, profile.display_name, 'Organization person'));
end;
$$;

create or replace function public.submit_aircraft_discrepancy_report(
  p_organization_id uuid,
  p_client_request_id uuid,
  p_aircraft_id uuid,
  p_report_date date,
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
  v_report_id uuid;
  v_aircraft_tail text;
  v_student_name text;
  v_instructor_name text;
  v_instructor_user_id uuid;
  v_actor_name text;
  v_organization_name text;
  v_member record;
begin
  if auth.uid() is null
    or not private.is_organization_member(p_organization_id, auth.uid()) then
    raise exception 'Organization membership is required.' using errcode = '42501';
  end if;
  if p_client_request_id is null or p_report_date is null then
    raise exception 'Request ID and report date are required.' using errcode = '22023';
  end if;
  if not private.can_use_aircraft_in_organization(p_aircraft_id, p_organization_id, auth.uid()) then
    raise exception 'This aircraft is not available to the organization.' using errcode = '42501';
  end if;
  if p_flight_hobbs_end < 0 or p_maintenance_hobbs_end < 0 or p_flight_duration < 0 then
    raise exception 'Hobbs readings and flight duration cannot be negative.' using errcode = '22023';
  end if;

  select aircraft.tail_number into v_aircraft_tail
  from public.aircraft aircraft where aircraft.id = p_aircraft_id;

  if p_student_person_id is not null then
    select coalesce(nullif(btrim(person.organization_display_name), ''), profile.display_name, 'Student')
    into v_student_name
    from public.organization_people person
    left join public.profiles profile on profile.id = person.user_id
    where person.id = p_student_person_id
      and person.organization_id = p_organization_id
      and person.teaching_role = 'student'
      and person.status in ('pending', 'linked');
    if v_student_name is null then
      raise exception 'The selected student is not valid for this organization.' using errcode = '22023';
    end if;
  end if;

  if p_instructor_person_id is not null then
    select
      coalesce(nullif(btrim(person.organization_display_name), ''), profile.display_name, 'Instructor'),
      person.user_id
    into v_instructor_name, v_instructor_user_id
    from public.organization_people person
    left join public.profiles profile on profile.id = person.user_id
    where person.id = p_instructor_person_id
      and person.organization_id = p_organization_id
      and person.teaching_role = 'instructor'
      and person.status in ('pending', 'linked');
    if v_instructor_name is null then
      raise exception 'The selected instructor is not valid for this organization.' using errcode = '22023';
    end if;
  end if;

  v_actor_name := private.organization_report_actor_name(p_organization_id, auth.uid());
  select organization.name into v_organization_name
  from public.organizations organization where organization.id = p_organization_id;

  insert into public.organization_reports (
    organization_id, report_type, status, submitted_by, submitted_by_name, client_request_id
  ) values (
    p_organization_id, 'aircraft_discrepancy', 'submitted',
    auth.uid(), v_actor_name, p_client_request_id
  )
  on conflict (organization_id, submitted_by, client_request_id)
  do update set client_request_id = excluded.client_request_id
  returning id into v_report_id;

  if exists (
    select 1 from public.aircraft_discrepancy_reports where report_id = v_report_id
  ) then
    return v_report_id;
  end if;

  insert into public.aircraft_discrepancy_reports (
    report_id, aircraft_id, aircraft_tail_number, report_date,
    student_person_id, student_name, instructor_person_id, instructor_name,
    flight_hobbs_end, maintenance_hobbs_end, flight_duration,
    discrepancy_type, description, is_aircraft_down
  ) values (
    v_report_id, p_aircraft_id, v_aircraft_tail, p_report_date,
    p_student_person_id, v_student_name, p_instructor_person_id, v_instructor_name,
    p_flight_hobbs_end, p_maintenance_hobbs_end, p_flight_duration,
    p_discrepancy_type, btrim(p_description),
    case when p_ground_aircraft then true else null end
  );

  insert into public.organization_report_events (
    report_id, event_type, actor_user_id, actor_name, details
  ) values (
    v_report_id, 'submitted', auth.uid(), v_actor_name,
    jsonb_build_object('ground_aircraft', p_ground_aircraft)
  );

  if p_ground_aircraft then
    insert into public.organization_aircraft_maintenance (
      aircraft_id, operational_status, operational_status_note, updated_by, updated_at
    ) values (
      p_aircraft_id,
      'grounded',
      'Discrepancy report: ' || left(btrim(p_description), 500),
      auth.uid(),
      timezone('utc', now())
    )
    on conflict (aircraft_id) do update
      set operational_status = 'grounded',
          operational_status_note = excluded.operational_status_note,
          updated_by = auth.uid(),
          updated_at = timezone('utc', now());

    insert into public.organization_report_events (
      report_id, event_type, actor_user_id, actor_name, details
    ) values (
      v_report_id, 'grounded', auth.uid(), v_actor_name,
      jsonb_build_object('aircraft_id', p_aircraft_id, 'tail_number', v_aircraft_tail)
    );
  end if;

  for v_member in
    select member.user_id
    from public.organization_members member
    where member.organization_id = p_organization_id
      and member.role in ('owner', 'organization_admin')
      and member.user_id <> auth.uid()
  loop
    perform private.create_user_notification(
      v_member.user_id,
      case when p_ground_aircraft then 'Aircraft grounded' else 'Aircraft discrepancy reported' end,
      v_aircraft_tail || ': ' || left(btrim(p_description), 240),
      'organization',
      case when p_ground_aircraft then 'critical' else 'high' end,
      p_organization_id,
      v_organization_name,
      '/dashboard/reports?reportId=' || v_report_id::text,
      'aircraft-report:' || v_report_id::text || ':submitted:' || v_member.user_id::text,
      auth.uid()
    );
  end loop;

  if v_instructor_user_id is not null and v_instructor_user_id <> auth.uid() then
    perform private.create_user_notification(
      v_instructor_user_id,
      'Aircraft report needs instructor signature',
      v_aircraft_tail || ': review and sign the submitted discrepancy report.',
      'organization', 'high', p_organization_id, v_organization_name,
      '/dashboard/reports?reportId=' || v_report_id::text,
      'aircraft-report:' || v_report_id::text || ':signature',
      auth.uid()
    );
  end if;

  return v_report_id;
end;
$$;

create or replace function public.sign_aircraft_discrepancy_report(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.organization_reports;
  v_discrepancy public.aircraft_discrepancy_reports;
  v_actor_name text;
  v_organization_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into v_report
  from public.organization_reports where id = p_report_id for update;
  select * into v_discrepancy
  from public.aircraft_discrepancy_reports where report_id = p_report_id for update;

  if v_report.id is null or v_discrepancy.report_id is null then
    raise exception 'Report not found.' using errcode = 'P0002';
  end if;
  if v_report.status = 'closed' then
    raise exception 'Closed reports cannot be signed.' using errcode = '22023';
  end if;
  if v_discrepancy.instructor_signed_at is not null then
    return;
  end if;
  if not exists (
    select 1 from public.organization_people person
    where person.id = v_discrepancy.instructor_person_id
      and person.organization_id = v_report.organization_id
      and person.user_id = auth.uid()
      and person.teaching_role = 'instructor'
      and person.status = 'linked'
  ) then
    raise exception 'Only the selected linked instructor can sign this report.' using errcode = '42501';
  end if;

  v_actor_name := private.organization_report_actor_name(v_report.organization_id, auth.uid());
  update public.aircraft_discrepancy_reports
  set instructor_signed_by = auth.uid(),
      instructor_signed_name = v_actor_name,
      instructor_signed_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where report_id = p_report_id;

  update public.organization_reports
  set updated_at = timezone('utc', now())
  where id = p_report_id;

  insert into public.organization_report_events (
    report_id, event_type, actor_user_id, actor_name
  ) values (
    p_report_id, 'instructor_signed', auth.uid(), v_actor_name
  );

  select organization.name into v_organization_name
  from public.organizations organization where organization.id = v_report.organization_id;
  if v_report.submitted_by <> auth.uid() then
    perform private.create_user_notification(
      v_report.submitted_by,
      'Aircraft report signed',
      v_discrepancy.aircraft_tail_number || ': the instructor signature was added.',
      'organization', 'normal', v_report.organization_id, v_organization_name,
      '/dashboard/reports?reportId=' || p_report_id::text,
      'aircraft-report:' || p_report_id::text || ':signed',
      auth.uid()
    );
  end if;
end;
$$;

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
  if p_status not in ('submitted', 'in_review', 'closed') then
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
      credit_authorized_by = case when p_credit_authorized then auth.uid() else null end,
      credit_authorized_name = case when p_credit_authorized then v_actor_name else null end,
      credit_authorized_at = case when p_credit_authorized then timezone('utc', now()) else null end,
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

revoke all on function public.list_organization_report_people(uuid) from public, anon;
revoke all on function public.submit_aircraft_discrepancy_report(
  uuid, uuid, uuid, date, uuid, uuid, numeric, numeric, numeric, text, text, boolean
) from public, anon;
revoke all on function public.sign_aircraft_discrepancy_report(uuid) from public, anon;
revoke all on function public.process_aircraft_discrepancy_report(
  uuid, text, uuid, boolean, boolean, boolean, boolean, boolean
) from public, anon;

grant execute on function public.list_organization_report_people(uuid) to authenticated;
grant execute on function public.submit_aircraft_discrepancy_report(
  uuid, uuid, uuid, date, uuid, uuid, numeric, numeric, numeric, text, text, boolean
) to authenticated;
grant execute on function public.sign_aircraft_discrepancy_report(uuid) to authenticated;
grant execute on function public.process_aircraft_discrepancy_report(
  uuid, text, uuid, boolean, boolean, boolean, boolean, boolean
) to authenticated;
