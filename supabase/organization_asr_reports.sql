-- Internal Air Safety Event Report (ASR) workflow.
-- Run after organization_aircraft_reports.sql and unified_notification_inbox.sql.

alter table public.organization_reports
  add column if not exists reference_number text,
  add column if not exists supersedes_report_id uuid references public.organization_reports(id) on delete set null,
  add column if not exists revision_number integer not null default 1;

alter table public.organization_reports
  drop constraint if exists organization_reports_status_check;
alter table public.organization_reports
  add constraint organization_reports_status_check
  check (status in ('draft', 'submitted', 'in_review', 'closed', 'superseded'));

create unique index if not exists organization_reports_reference_unique
on public.organization_reports (reference_number)
where reference_number is not null;

alter table public.organization_report_events
  drop constraint if exists organization_report_events_event_type_check;
alter table public.organization_report_events
  add constraint organization_report_events_event_type_check
  check (event_type in (
    'submitted', 'instructor_signed', 'grounded', 'reviewed', 'closed',
    'asr_submitted', 'review_requested', 'risk_rated',
    'training_review_completed', 'maintenance_review_completed',
    'safety_review_completed', 'revision_created', 'linked'
  ));

create table if not exists public.organization_report_reviewer_assignments (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  capability text not null check (capability in (
    'training_reviewer', 'maintenance_reviewer', 'safety_reviewer'
  )),
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (organization_id, user_id, capability)
);

create table if not exists public.organization_asr_options (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category text not null check (category in (
    'occurrence_type', 'nature_of_flight', 'phase_of_flight', 'maneuver',
    'training_area', 'program', 'day_night', 'flight_conditions',
    'precipitation', 'intensity', 'external_agency'
  )),
  value text not null check (char_length(btrim(value)) between 1 and 120),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, category, value)
);

create table if not exists public.asr_reports (
  report_id uuid primary key references public.organization_reports(id) on delete cascade,
  reference_serial bigint generated always as identity unique,
  source_discrepancy_report_id uuid references public.organization_reports(id) on delete set null,
  aircraft_id uuid references public.aircraft(id) on delete restrict,
  aircraft_tail_number text,
  aircraft_type text,
  occurrence_date date,
  occurrence_local_time time,
  type_of_occurrence text,
  description text,
  report_data jsonb not null default '{}'::jsonb,
  reporter_title text,
  reporter_signed_by uuid references auth.users(id) on delete set null,
  reporter_signed_name text,
  reporter_signed_at timestamptz,
  risk_score integer check (risk_score is null or risk_score in (
    1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 15, 16, 20, 25
  )),
  risk_rated_by uuid references auth.users(id) on delete set null,
  risk_rated_name text,
  risk_rated_at timestamptz,
  training_review_required boolean not null default false,
  training_comments text,
  training_signed_by uuid references auth.users(id) on delete set null,
  training_signed_name text,
  training_signed_title text,
  training_signed_at timestamptz,
  maintenance_review_required boolean not null default false,
  maintenance_comments text,
  maintenance_action jsonb not null default '{}'::jsonb,
  maintenance_signed_by uuid references auth.users(id) on delete set null,
  maintenance_signed_name text,
  maintenance_signed_title text,
  maintenance_signed_at timestamptz,
  safety_comments text,
  hazard_log_reference text,
  internal_investigation_reference text,
  safety_signed_by uuid references auth.users(id) on delete set null,
  safety_signed_name text,
  safety_signed_title text,
  safety_signed_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.asr_external_notifications (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.asr_reports(report_id) on delete cascade,
  agency text not null check (char_length(btrim(agency)) between 1 and 120),
  notified_on date,
  contact_information text,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.organization_report_links (
  report_id uuid not null references public.organization_reports(id) on delete cascade,
  related_report_id uuid not null references public.organization_reports(id) on delete cascade,
  relationship_type text not null check (relationship_type in ('asr_discrepancy')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (report_id, related_report_id, relationship_type),
  check (report_id <> related_report_id)
);

create index if not exists asr_reports_aircraft_occurrence_idx
on public.asr_reports (aircraft_id, occurrence_date desc);
create index if not exists asr_external_notifications_report_idx
on public.asr_external_notifications (report_id, sort_order);
create index if not exists report_reviewer_assignments_user_idx
on public.organization_report_reviewer_assignments (user_id, organization_id);

alter table public.organization_report_reviewer_assignments enable row level security;
alter table public.organization_asr_options enable row level security;
alter table public.asr_reports enable row level security;
alter table public.asr_external_notifications enable row level security;
alter table public.organization_report_links enable row level security;

revoke all on public.organization_report_reviewer_assignments from public, anon, authenticated;
revoke all on public.organization_asr_options from public, anon, authenticated;
revoke all on public.asr_reports from public, anon, authenticated;
revoke all on public.asr_external_notifications from public, anon, authenticated;
revoke all on public.organization_report_links from public, anon, authenticated;
grant select on public.organization_report_reviewer_assignments to authenticated;
grant select, insert, update, delete on public.organization_asr_options to authenticated;
grant select on public.asr_reports to authenticated;
grant select on public.asr_external_notifications to authenticated;
grant select on public.organization_report_links to authenticated;

create or replace function private.has_report_reviewer_capability(
  p_organization_id uuid,
  p_capability text,
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
    from public.organization_report_reviewer_assignments assignment
    where assignment.organization_id = p_organization_id
      and assignment.user_id = p_user_id
      and assignment.capability = p_capability
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
    left join public.asr_reports asr on asr.report_id = report.id
    where report.id = p_report_id
      and (
        report.submitted_by = p_user_id
        or (
          report.status <> 'draft'
          and (
            private.can_manage_organization(report.organization_id, p_user_id)
            or instructor.user_id = p_user_id
            or (
              report.report_type = 'asr'
              and (
                private.has_report_reviewer_capability(
                  report.organization_id, 'safety_reviewer', p_user_id
                )
                or (
                  asr.training_review_required
                  and private.has_report_reviewer_capability(
                    report.organization_id, 'training_reviewer', p_user_id
                  )
                )
                or (
                  asr.maintenance_review_required
                  and private.has_report_reviewer_capability(
                    report.organization_id, 'maintenance_reviewer', p_user_id
                  )
                )
              )
            )
          )
        )
      )
  );
$$;

revoke all on function private.has_report_reviewer_capability(uuid, text, uuid) from public;
revoke all on function private.can_read_organization_report(uuid, uuid) from public;
grant execute on function private.has_report_reviewer_capability(uuid, text, uuid) to authenticated;
grant execute on function private.can_read_organization_report(uuid, uuid) to authenticated;

drop policy if exists report_reviewer_assignments_select_member
on public.organization_report_reviewer_assignments;
create policy report_reviewer_assignments_select_member
on public.organization_report_reviewer_assignments for select to authenticated
using ((select private.is_organization_member(organization_id, auth.uid())));

drop policy if exists organization_asr_options_select_member on public.organization_asr_options;
create policy organization_asr_options_select_member
on public.organization_asr_options for select to authenticated
using ((select private.is_organization_member(organization_id, auth.uid())));
drop policy if exists organization_asr_options_insert_manager on public.organization_asr_options;
create policy organization_asr_options_insert_manager
on public.organization_asr_options for insert to authenticated
with check ((select private.can_manage_organization(organization_id, auth.uid())));
drop policy if exists organization_asr_options_update_manager on public.organization_asr_options;
create policy organization_asr_options_update_manager
on public.organization_asr_options for update to authenticated
using ((select private.can_manage_organization(organization_id, auth.uid())))
with check ((select private.can_manage_organization(organization_id, auth.uid())));
drop policy if exists organization_asr_options_delete_manager on public.organization_asr_options;
create policy organization_asr_options_delete_manager
on public.organization_asr_options for delete to authenticated
using ((select private.can_manage_organization(organization_id, auth.uid())));

drop policy if exists asr_reports_select_authorized on public.asr_reports;
create policy asr_reports_select_authorized
on public.asr_reports for select to authenticated
using ((select private.can_read_organization_report(report_id, auth.uid())));
drop policy if exists asr_external_notifications_select_authorized
on public.asr_external_notifications;
create policy asr_external_notifications_select_authorized
on public.asr_external_notifications for select to authenticated
using ((select private.can_read_organization_report(report_id, auth.uid())));
drop policy if exists organization_report_links_select_authorized
on public.organization_report_links;
create policy organization_report_links_select_authorized
on public.organization_report_links for select to authenticated
using (
  (select private.can_read_organization_report(report_id, auth.uid()))
  or (select private.can_read_organization_report(related_report_id, auth.uid()))
);

create or replace function private.seed_organization_asr_options(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.organization_asr_options (
    organization_id, category, value, sort_order
  )
  select p_organization_id, defaults.category, defaults.value, defaults.sort_order
  from (values
    ('occurrence_type', 'Mechanical', 10),
    ('occurrence_type', 'Training', 20),
    ('occurrence_type', 'Weather', 30),
    ('occurrence_type', 'A/C Documents', 40),
    ('occurrence_type', 'Air Prox', 50),
    ('occurrence_type', 'Precautionary Landing', 60),
    ('nature_of_flight', 'Training', 10),
    ('nature_of_flight', 'MX Check', 20),
    ('nature_of_flight', 'PAX', 30),
    ('nature_of_flight', 'Ferry', 40),
    ('nature_of_flight', 'Other', 50),
    ('phase_of_flight', 'Parked', 10),
    ('phase_of_flight', 'Start', 20),
    ('phase_of_flight', 'Taxi', 30),
    ('phase_of_flight', 'Hover', 40),
    ('phase_of_flight', 'Take-off', 50),
    ('phase_of_flight', 'Climb', 60),
    ('phase_of_flight', 'Cruise', 70),
    ('phase_of_flight', 'Descent', 80),
    ('phase_of_flight', 'Approach', 90),
    ('phase_of_flight', 'Landing', 100),
    ('phase_of_flight', 'Shutdown', 110),
    ('phase_of_flight', 'Maneuver Practice', 120),
    ('phase_of_flight', 'Other', 130),
    ('maneuver', 'NA', 10),
    ('maneuver', 'Straight and Level', 20),
    ('maneuver', 'Take-Off', 30),
    ('maneuver', 'Landing', 40),
    ('maneuver', 'Pattern/Circuit', 50),
    ('maneuver', 'Quick Stop', 60),
    ('maneuver', 'Slope', 70),
    ('maneuver', 'Hovering', 80),
    ('maneuver', 'Confined Area', 90),
    ('maneuver', 'Pinnacle', 100),
    ('maneuver', 'Autorotation', 110),
    ('maneuver', 'Advanced Autorotation', 120),
    ('maneuver', 'Instrument Procedures', 130),
    ('training_area', 'Alpha', 10),
    ('training_area', 'Foxtrot', 20),
    ('training_area', 'Airport', 30),
    ('training_area', 'Airport Spot', 40),
    ('program', 'FAA', 10),
    ('program', 'EASA', 20),
    ('program', 'MTP', 30),
    ('program', 'MX', 40),
    ('day_night', 'Day', 10),
    ('day_night', 'Evening Twilight', 20),
    ('day_night', 'Night', 30),
    ('flight_conditions', 'VMC', 10),
    ('flight_conditions', 'IMC', 20),
    ('precipitation', 'Rain', 10),
    ('precipitation', 'Snow', 20),
    ('precipitation', 'Sleet', 30),
    ('precipitation', 'Hail', 40),
    ('intensity', 'Light', 10),
    ('intensity', 'Moderate', 20),
    ('intensity', 'Severe', 30),
    ('external_agency', 'FAA', 10),
    ('external_agency', 'NTSB', 20),
    ('external_agency', 'EASA', 30),
    ('external_agency', 'Manufacturer', 40),
    ('external_agency', 'Wildlife Strike Rpt', 50)
  ) as defaults(category, value, sort_order)
  on conflict (organization_id, category, value) do nothing;
end;
$$;

create or replace function private.seed_new_organization_asr_options()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_organization_asr_options(new.id);
  return new;
end;
$$;

drop trigger if exists seed_new_organization_asr_options on public.organizations;
create trigger seed_new_organization_asr_options
after insert on public.organizations
for each row execute function private.seed_new_organization_asr_options();

do $$
declare
  organization_record record;
begin
  for organization_record in select id from public.organizations loop
    perform private.seed_organization_asr_options(organization_record.id);
  end loop;
end
$$;

create or replace function public.set_organization_report_reviewer_capability(
  p_organization_id uuid,
  p_user_id uuid,
  p_capability text,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not private.can_manage_organization(p_organization_id, auth.uid()) then
    raise exception 'Only organization owners and administrators can assign report reviewers.'
      using errcode = '42501';
  end if;
  if p_capability not in (
    'training_reviewer', 'maintenance_reviewer', 'safety_reviewer'
  ) then
    raise exception 'Invalid reviewer capability.' using errcode = '22023';
  end if;
  if not private.is_organization_member(p_organization_id, p_user_id) then
    raise exception 'Reviewer must be an organization member.' using errcode = '22023';
  end if;

  if p_enabled then
    insert into public.organization_report_reviewer_assignments (
      organization_id, user_id, capability, assigned_by
    ) values (
      p_organization_id, p_user_id, p_capability, auth.uid()
    ) on conflict (organization_id, user_id, capability) do nothing;
  else
    delete from public.organization_report_reviewer_assignments
    where organization_id = p_organization_id
      and user_id = p_user_id
      and capability = p_capability;
  end if;
end;
$$;

create or replace function public.save_asr_draft(
  p_organization_id uuid,
  p_report_id uuid,
  p_client_request_id uuid,
  p_report_data jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report_id uuid;
  v_aircraft_id uuid;
  v_aircraft_tail text;
  v_aircraft_type text;
  v_source_report_id uuid;
  v_actor_name text;
begin
  if auth.uid() is null
    or not private.is_organization_member(p_organization_id, auth.uid()) then
    raise exception 'Organization membership is required.' using errcode = '42501';
  end if;
  if p_report_data is null or jsonb_typeof(p_report_data) <> 'object' then
    raise exception 'ASR report data must be a JSON object.' using errcode = '22023';
  end if;

  v_aircraft_id := nullif(p_report_data->>'aircraft_id', '')::uuid;
  if v_aircraft_id is not null then
    if not private.can_use_aircraft_in_organization(
      v_aircraft_id, p_organization_id, auth.uid()
    ) then
      raise exception 'This aircraft is not available to the organization.'
        using errcode = '42501';
    end if;
    select aircraft.tail_number, model.name
    into v_aircraft_tail, v_aircraft_type
    from public.aircraft aircraft
    left join public.aircraft_models model on model.id = aircraft.model_id
    where aircraft.id = v_aircraft_id;
  else
    v_aircraft_tail := nullif(btrim(p_report_data->>'aircraft_registration'), '');
    v_aircraft_type := nullif(btrim(p_report_data->>'aircraft_type'), '');
  end if;

  v_source_report_id := nullif(p_report_data->>'source_discrepancy_report_id', '')::uuid;
  if v_source_report_id is not null and not exists (
    select 1
    from public.organization_reports source_report
    where source_report.id = v_source_report_id
      and source_report.organization_id = p_organization_id
      and source_report.report_type = 'aircraft_discrepancy'
      and private.can_read_organization_report(source_report.id, auth.uid())
  ) then
    raise exception 'The linked aircraft discrepancy report is not valid.'
      using errcode = '22023';
  end if;

  v_actor_name := private.organization_report_actor_name(p_organization_id, auth.uid());
  if p_report_id is null then
    insert into public.organization_reports (
      organization_id, report_type, status, submitted_by,
      submitted_by_name, client_request_id
    ) values (
      p_organization_id, 'asr', 'draft', auth.uid(),
      v_actor_name, coalesce(p_client_request_id, gen_random_uuid())
    )
    on conflict (organization_id, submitted_by, client_request_id)
    do update set updated_at = timezone('utc', now())
    returning id into v_report_id;

    insert into public.asr_reports (
      report_id, source_discrepancy_report_id, aircraft_id,
      aircraft_tail_number, aircraft_type, occurrence_date,
      occurrence_local_time, type_of_occurrence, description,
      report_data, reporter_title
    ) values (
      v_report_id, v_source_report_id, v_aircraft_id,
      v_aircraft_tail, v_aircraft_type,
      nullif(p_report_data->>'occurrence_date', '')::date,
      nullif(p_report_data->>'occurrence_local_time', '')::time,
      nullif(btrim(p_report_data->>'type_of_occurrence'), ''),
      nullif(btrim(p_report_data->>'description'), ''),
      p_report_data,
      nullif(btrim(p_report_data->>'reporter_title'), '')
    )
    on conflict (report_id) do nothing;
  else
    select report.id into v_report_id
    from public.organization_reports report
    where report.id = p_report_id
      and report.organization_id = p_organization_id
      and report.report_type = 'asr'
      and report.status = 'draft'
      and report.submitted_by = auth.uid()
    for update;
    if v_report_id is null then
      raise exception 'Only the owner can edit this ASR draft.' using errcode = '42501';
    end if;
  end if;

  update public.asr_reports
  set source_discrepancy_report_id = v_source_report_id,
      aircraft_id = v_aircraft_id,
      aircraft_tail_number = v_aircraft_tail,
      aircraft_type = v_aircraft_type,
      occurrence_date = nullif(p_report_data->>'occurrence_date', '')::date,
      occurrence_local_time = nullif(p_report_data->>'occurrence_local_time', '')::time,
      type_of_occurrence = nullif(btrim(p_report_data->>'type_of_occurrence'), ''),
      description = nullif(btrim(p_report_data->>'description'), ''),
      report_data = p_report_data,
      reporter_title = nullif(btrim(p_report_data->>'reporter_title'), ''),
      updated_at = timezone('utc', now())
  where report_id = v_report_id;
  update public.organization_reports
  set updated_at = timezone('utc', now())
  where id = v_report_id;

  return v_report_id;
end;
$$;

create or replace function public.submit_asr_report(
  p_report_id uuid,
  p_create_discrepancy boolean default false,
  p_discrepancy_type text default null,
  p_discrepancy_description text default null,
  p_ground_aircraft boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.organization_reports;
  v_asr public.asr_reports;
  v_data jsonb;
  v_actor_name text;
  v_reference text;
  v_discrepancy_report_id uuid;
  v_reviewer record;
  v_organization_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  select * into v_report
  from public.organization_reports where id = p_report_id for update;
  select * into v_asr
  from public.asr_reports where report_id = p_report_id for update;
  if v_report.id is null or v_asr.report_id is null
    or v_report.report_type <> 'asr'
    or v_report.status <> 'draft'
    or v_report.submitted_by <> auth.uid() then
    raise exception 'Only the owner can submit this ASR draft.' using errcode = '42501';
  end if;

  v_data := v_asr.report_data;
  if v_asr.occurrence_date is null
    or v_asr.occurrence_local_time is null
    or v_asr.type_of_occurrence is null
    or nullif(btrim(v_data->>'nature_of_flight'), '') is null
    or nullif(btrim(v_data->>'phase_of_flight'), '') is null
    or nullif(btrim(v_data->>'aircraft_commander_name'), '') is null
    or char_length(btrim(coalesce(v_asr.description, ''))) < 3
    or nullif(btrim(v_asr.reporter_title), '') is null then
    raise exception 'Occurrence date/time, occurrence and flight types, phase, aircraft commander, description, and reporter title are required.'
      using errcode = '22023';
  end if;
  if v_asr.aircraft_id is null
    and coalesce((v_data->>'no_aircraft')::boolean, false) = false
    and (v_asr.aircraft_tail_number is null or v_asr.aircraft_type is null) then
    raise exception 'Select an organization aircraft, enter an external aircraft, or mark aircraft not applicable.'
      using errcode = '22023';
  end if;

  v_actor_name := private.organization_report_actor_name(
    v_report.organization_id, auth.uid()
  );
  v_reference := 'ASR-' || extract(year from v_asr.occurrence_date)::integer::text
    || '-' || lpad(v_asr.reference_serial::text, 6, '0');

  update public.asr_reports
  set reporter_signed_by = auth.uid(),
      reporter_signed_name = v_actor_name,
      reporter_signed_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where report_id = p_report_id;
  update public.organization_reports
  set status = 'submitted',
      reference_number = v_reference,
      updated_at = timezone('utc', now())
  where id = p_report_id;

  if v_asr.source_discrepancy_report_id is not null then
    v_discrepancy_report_id := v_asr.source_discrepancy_report_id;
  elsif p_create_discrepancy then
    if v_asr.aircraft_id is null then
      raise exception 'An organization aircraft is required to create a discrepancy.'
        using errcode = '22023';
    end if;
    v_discrepancy_report_id := public.submit_aircraft_discrepancy_report(
      v_report.organization_id,
      gen_random_uuid(),
      v_asr.aircraft_id,
      v_asr.occurrence_date,
      nullif(v_data->>'student_person_id', '')::uuid,
      nullif(v_data->>'instructor_person_id', '')::uuid,
      null, null, null,
      p_discrepancy_type,
      coalesce(nullif(btrim(p_discrepancy_description), ''), v_asr.description),
      p_ground_aircraft
    );
    update public.asr_reports
    set source_discrepancy_report_id = v_discrepancy_report_id
    where report_id = p_report_id;
  elsif p_ground_aircraft then
    raise exception 'Grounding from an ASR requires creating a linked discrepancy.'
      using errcode = '22023';
  end if;

  if v_discrepancy_report_id is not null then
    insert into public.organization_report_links (
      report_id, related_report_id, relationship_type, created_by
    ) values (
      p_report_id, v_discrepancy_report_id, 'asr_discrepancy', auth.uid()
    ) on conflict do nothing;
    update public.aircraft_discrepancy_reports
    set is_asr_submitted = true,
        updated_at = timezone('utc', now())
    where report_id = v_discrepancy_report_id;
    insert into public.organization_report_events (
      report_id, event_type, actor_user_id, actor_name, details
    ) values (
      p_report_id, 'linked', auth.uid(), v_actor_name,
      jsonb_build_object('related_report_id', v_discrepancy_report_id)
    );
  end if;

  insert into public.organization_report_events (
    report_id, event_type, actor_user_id, actor_name, details
  ) values (
    p_report_id, 'asr_submitted', auth.uid(), v_actor_name,
    jsonb_build_object('reference_number', v_reference)
  );

  select organization.name into v_organization_name
  from public.organizations organization where organization.id = v_report.organization_id;
  for v_reviewer in
    select distinct member.user_id
    from public.organization_members member
    left join public.organization_report_reviewer_assignments assignment
      on assignment.organization_id = member.organization_id
     and assignment.user_id = member.user_id
     and assignment.capability = 'safety_reviewer'
    where member.organization_id = v_report.organization_id
      and (
        member.role in ('owner', 'organization_admin')
        or assignment.user_id is not null
      )
      and member.user_id <> auth.uid()
  loop
    perform private.create_user_notification(
      v_reviewer.user_id,
      'New ASR submitted',
      v_reference || ': ' || left(v_asr.description, 220),
      'organization', 'high', v_report.organization_id, v_organization_name,
      '/dashboard/reports?type=asr&reportId=' || p_report_id::text,
      'asr:' || p_report_id::text || ':submitted:' || v_reviewer.user_id::text,
      auth.uid()
    );
  end loop;
  return p_report_id;
end;
$$;

create or replace function public.configure_asr_review(
  p_report_id uuid,
  p_risk_score integer,
  p_training_required boolean,
  p_maintenance_required boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.organization_reports;
  v_asr public.asr_reports;
  v_actor_name text;
  v_organization_name text;
  v_reviewer record;
begin
  select * into v_report from public.organization_reports
  where id = p_report_id for update;
  select * into v_asr from public.asr_reports
  where report_id = p_report_id for update;
  if v_report.id is null or v_asr.report_id is null
    or v_report.status not in ('submitted', 'in_review') then
    raise exception 'ASR is not available for review.' using errcode = '22023';
  end if;
  if not private.has_report_reviewer_capability(
    v_report.organization_id, 'safety_reviewer', auth.uid()
  ) then
    raise exception 'Safety reviewer capability is required.' using errcode = '42501';
  end if;
  if p_risk_score is null
    or p_risk_score not in (1,2,3,4,5,6,8,9,10,12,15,16,20,25) then
    raise exception 'Invalid ASR risk score.' using errcode = '22023';
  end if;

  v_actor_name := private.organization_report_actor_name(
    v_report.organization_id, auth.uid()
  );
  update public.asr_reports
  set risk_score = p_risk_score,
      risk_rated_by = auth.uid(),
      risk_rated_name = v_actor_name,
      risk_rated_at = timezone('utc', now()),
      training_review_required = p_training_required,
      maintenance_review_required = p_maintenance_required,
      updated_at = timezone('utc', now())
  where report_id = p_report_id;
  update public.organization_reports
  set status = 'in_review', updated_at = timezone('utc', now())
  where id = p_report_id;

  insert into public.organization_report_events (
    report_id, event_type, actor_user_id, actor_name, details
  ) values (
    p_report_id, 'review_requested', auth.uid(), v_actor_name,
    jsonb_build_object(
      'risk_score', p_risk_score,
      'risk_band', case
        when p_risk_score <= 6 then 'low'
        when p_risk_score <= 12 then 'medium'
        else 'high'
      end,
      'training_required', p_training_required,
      'maintenance_required', p_maintenance_required
    )
  );

  select organization.name into v_organization_name
  from public.organizations organization where organization.id = v_report.organization_id;
  for v_reviewer in
    select assignment.user_id, assignment.capability
    from public.organization_report_reviewer_assignments assignment
    where assignment.organization_id = v_report.organization_id
      and (
        (p_training_required and assignment.capability = 'training_reviewer')
        or (p_maintenance_required and assignment.capability = 'maintenance_reviewer')
      )
  loop
    perform private.create_user_notification(
      v_reviewer.user_id,
      'ASR review requested',
      coalesce(v_report.reference_number, 'ASR') || ': '
        || case when v_reviewer.capability = 'training_reviewer'
          then 'Head of Training review'
          else 'Maintenance review'
        end || ' is requested.',
      'organization', 'high', v_report.organization_id, v_organization_name,
      '/dashboard/reports?type=asr&reportId=' || p_report_id::text,
      'asr:' || p_report_id::text || ':review:' || v_reviewer.capability
        || ':' || v_reviewer.user_id::text,
      auth.uid()
    );
  end loop;
end;
$$;

create or replace function public.complete_asr_training_review(
  p_report_id uuid,
  p_comments text,
  p_title text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.organization_reports;
  v_asr public.asr_reports;
  v_actor_name text;
begin
  select * into v_report from public.organization_reports where id = p_report_id;
  select * into v_asr from public.asr_reports where report_id = p_report_id for update;
  if v_report.id is null or not v_asr.training_review_required
    or v_report.status <> 'in_review' then
    raise exception 'Training review is not requested for this ASR.' using errcode = '22023';
  end if;
  if not private.has_report_reviewer_capability(
    v_report.organization_id, 'training_reviewer', auth.uid()
  ) then
    raise exception 'Training reviewer capability is required.' using errcode = '42501';
  end if;
  if nullif(btrim(p_comments), '') is null or nullif(btrim(p_title), '') is null then
    raise exception 'Training comments and title are required.' using errcode = '22023';
  end if;
  v_actor_name := private.organization_report_actor_name(
    v_report.organization_id, auth.uid()
  );
  update public.asr_reports
  set training_comments = btrim(p_comments),
      training_signed_by = auth.uid(),
      training_signed_name = v_actor_name,
      training_signed_title = btrim(p_title),
      training_signed_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where report_id = p_report_id;
  insert into public.organization_report_events (
    report_id, event_type, actor_user_id, actor_name
  ) values (
    p_report_id, 'training_review_completed', auth.uid(), v_actor_name
  );
end;
$$;

create or replace function public.complete_asr_maintenance_review(
  p_report_id uuid,
  p_comments text,
  p_title text,
  p_maintenance_action jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.organization_reports;
  v_asr public.asr_reports;
  v_actor_name text;
begin
  select * into v_report from public.organization_reports where id = p_report_id;
  select * into v_asr from public.asr_reports where report_id = p_report_id for update;
  if v_report.id is null or not v_asr.maintenance_review_required
    or v_report.status <> 'in_review' then
    raise exception 'Maintenance review is not requested for this ASR.' using errcode = '22023';
  end if;
  if not private.has_report_reviewer_capability(
    v_report.organization_id, 'maintenance_reviewer', auth.uid()
  ) then
    raise exception 'Maintenance reviewer capability is required.' using errcode = '42501';
  end if;
  if nullif(btrim(p_comments), '') is null or nullif(btrim(p_title), '') is null then
    raise exception 'Maintenance comments and title are required.' using errcode = '22023';
  end if;
  v_actor_name := private.organization_report_actor_name(
    v_report.organization_id, auth.uid()
  );
  update public.asr_reports
  set maintenance_comments = btrim(p_comments),
      maintenance_action = coalesce(p_maintenance_action, '{}'::jsonb),
      maintenance_signed_by = auth.uid(),
      maintenance_signed_name = v_actor_name,
      maintenance_signed_title = btrim(p_title),
      maintenance_signed_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where report_id = p_report_id;
  insert into public.organization_report_events (
    report_id, event_type, actor_user_id, actor_name
  ) values (
    p_report_id, 'maintenance_review_completed', auth.uid(), v_actor_name
  );
end;
$$;

create or replace function public.close_asr_report(
  p_report_id uuid,
  p_safety_comments text,
  p_hazard_log_reference text,
  p_internal_investigation_reference text,
  p_title text,
  p_external_notifications jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.organization_reports;
  v_asr public.asr_reports;
  v_actor_name text;
  v_organization_name text;
  v_notification jsonb;
  v_index integer := 0;
begin
  select * into v_report from public.organization_reports
  where id = p_report_id for update;
  select * into v_asr from public.asr_reports
  where report_id = p_report_id for update;
  if v_report.id is null or v_asr.report_id is null
    or v_report.status <> 'in_review' then
    raise exception 'ASR is not ready for closure.' using errcode = '22023';
  end if;
  if not private.has_report_reviewer_capability(
    v_report.organization_id, 'safety_reviewer', auth.uid()
  ) then
    raise exception 'Safety reviewer capability is required.' using errcode = '42501';
  end if;
  if v_asr.risk_score is null then
    raise exception 'Event risk rating is required before closure.' using errcode = '22023';
  end if;
  if v_asr.training_review_required and v_asr.training_signed_at is null then
    raise exception 'Requested Head of Training review is incomplete.' using errcode = '22023';
  end if;
  if v_asr.maintenance_review_required and v_asr.maintenance_signed_at is null then
    raise exception 'Requested Maintenance review is incomplete.' using errcode = '22023';
  end if;
  if nullif(btrim(p_safety_comments), '') is null
    or nullif(btrim(p_title), '') is null then
    raise exception 'Safety comments and title are required.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_external_notifications, '[]'::jsonb)) <> 'array' then
    raise exception 'External notifications must be an array.' using errcode = '22023';
  end if;

  v_actor_name := private.organization_report_actor_name(
    v_report.organization_id, auth.uid()
  );
  update public.asr_reports
  set safety_comments = btrim(p_safety_comments),
      hazard_log_reference = nullif(btrim(p_hazard_log_reference), ''),
      internal_investigation_reference = nullif(btrim(p_internal_investigation_reference), ''),
      safety_signed_by = auth.uid(),
      safety_signed_name = v_actor_name,
      safety_signed_title = btrim(p_title),
      safety_signed_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where report_id = p_report_id;

  delete from public.asr_external_notifications where report_id = p_report_id;
  for v_notification in
    select value from jsonb_array_elements(coalesce(p_external_notifications, '[]'::jsonb))
  loop
    if nullif(btrim(v_notification->>'agency'), '') is null then
      raise exception 'Agency is required for every external notification.'
        using errcode = '22023';
    end if;
    insert into public.asr_external_notifications (
      report_id, agency, notified_on, contact_information, sort_order
    ) values (
      p_report_id,
      btrim(v_notification->>'agency'),
      nullif(v_notification->>'notified_on', '')::date,
      nullif(btrim(v_notification->>'contact_information'), ''),
      v_index
    );
    v_index := v_index + 1;
  end loop;

  update public.organization_reports
  set status = 'closed',
      closed_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = p_report_id;
  insert into public.organization_report_events (
    report_id, event_type, actor_user_id, actor_name
  ) values (
    p_report_id, 'safety_review_completed', auth.uid(), v_actor_name
  ), (
    p_report_id, 'closed', auth.uid(), v_actor_name
  );

  if v_report.submitted_by <> auth.uid() then
    select organization.name into v_organization_name
    from public.organizations organization where organization.id = v_report.organization_id;
    perform private.create_user_notification(
      v_report.submitted_by,
      'ASR closed',
      coalesce(v_report.reference_number, 'ASR') || ' was reviewed and closed.',
      'organization', 'normal', v_report.organization_id, v_organization_name,
      '/dashboard/reports?type=asr&reportId=' || p_report_id::text,
      'asr:' || p_report_id::text || ':closed',
      auth.uid()
    );
  end if;
end;
$$;

create or replace function public.create_asr_revision(
  p_report_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.organization_reports;
  v_source_asr public.asr_reports;
  v_new_report_id uuid;
  v_actor_name text;
begin
  select * into v_source from public.organization_reports
  where id = p_report_id for update;
  select * into v_source_asr from public.asr_reports
  where report_id = p_report_id;
  if v_source.id is null or v_source_asr.report_id is null
    or v_source.status not in ('submitted', 'in_review', 'closed') then
    raise exception 'Only a submitted ASR can be revised.' using errcode = '22023';
  end if;
  if v_source.submitted_by <> auth.uid()
    and not private.can_manage_organization(v_source.organization_id, auth.uid()) then
    raise exception 'You cannot revise this ASR.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A revision reason is required.' using errcode = '22023';
  end if;
  v_actor_name := private.organization_report_actor_name(
    v_source.organization_id, auth.uid()
  );

  insert into public.organization_reports (
    organization_id, report_type, status, submitted_by, submitted_by_name,
    client_request_id, supersedes_report_id, revision_number
  ) values (
    v_source.organization_id, 'asr', 'draft', auth.uid(), v_actor_name,
    gen_random_uuid(), p_report_id, v_source.revision_number + 1
  ) returning id into v_new_report_id;
  insert into public.asr_reports (
    report_id, source_discrepancy_report_id, aircraft_id,
    aircraft_tail_number, aircraft_type, occurrence_date,
    occurrence_local_time, type_of_occurrence, description,
    report_data, reporter_title
  ) values (
    v_new_report_id, v_source_asr.source_discrepancy_report_id,
    v_source_asr.aircraft_id, v_source_asr.aircraft_tail_number,
    v_source_asr.aircraft_type, v_source_asr.occurrence_date,
    v_source_asr.occurrence_local_time, v_source_asr.type_of_occurrence,
    v_source_asr.description, v_source_asr.report_data,
    v_source_asr.reporter_title
  );
  update public.organization_reports
  set status = 'superseded', updated_at = timezone('utc', now())
  where id = p_report_id;
  insert into public.organization_report_events (
    report_id, event_type, actor_user_id, actor_name, details
  ) values (
    p_report_id, 'revision_created', auth.uid(), v_actor_name,
    jsonb_build_object('new_report_id', v_new_report_id, 'reason', btrim(p_reason))
  );
  return v_new_report_id;
end;
$$;

revoke all on function public.set_organization_report_reviewer_capability(
  uuid, uuid, text, boolean
) from public, anon;
revoke all on function public.save_asr_draft(uuid, uuid, uuid, jsonb) from public, anon;
revoke all on function public.submit_asr_report(uuid, boolean, text, text, boolean)
from public, anon;
revoke all on function public.configure_asr_review(uuid, integer, boolean, boolean)
from public, anon;
revoke all on function public.complete_asr_training_review(uuid, text, text)
from public, anon;
revoke all on function public.complete_asr_maintenance_review(uuid, text, text, jsonb)
from public, anon;
revoke all on function public.close_asr_report(uuid, text, text, text, text, jsonb)
from public, anon;
revoke all on function public.create_asr_revision(uuid, text) from public, anon;

grant execute on function public.set_organization_report_reviewer_capability(
  uuid, uuid, text, boolean
) to authenticated;
grant execute on function public.save_asr_draft(uuid, uuid, uuid, jsonb) to authenticated;
grant execute on function public.submit_asr_report(uuid, boolean, text, text, boolean)
to authenticated;
grant execute on function public.configure_asr_review(uuid, integer, boolean, boolean)
to authenticated;
grant execute on function public.complete_asr_training_review(uuid, text, text)
to authenticated;
grant execute on function public.complete_asr_maintenance_review(uuid, text, text, jsonb)
to authenticated;
grant execute on function public.close_asr_report(uuid, text, text, text, text, jsonb)
to authenticated;
grant execute on function public.create_asr_revision(uuid, text) to authenticated;
