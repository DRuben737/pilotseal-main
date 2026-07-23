-- Organization MX master data and immutable preflight records.
-- Safe to re-run after the prerequisite organization migrations.

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.is_organization_manager(
  p_organization_id uuid,
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
    from public.organization_members
    where organization_id = p_organization_id
      and user_id = p_user_id
      and role in ('owner', 'organization_admin')
  );
$$;

revoke all on function private.is_organization_manager(uuid, uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_organization_manager(uuid, uuid) to authenticated;

-- Organization fleet writes belong to organization owners/admins, not platform admins.
drop policy if exists "organization_maintenance_insert_manager" on public.organization_aircraft_maintenance;
create policy "organization_maintenance_insert_manager"
on public.organization_aircraft_maintenance for insert to authenticated
with check (exists (
  select 1 from public.aircraft
  where aircraft.id = organization_aircraft_maintenance.aircraft_id
    and aircraft.organization_id is not null
    and (select private.is_organization_manager(aircraft.organization_id))
));
drop policy if exists "organization_maintenance_update_manager" on public.organization_aircraft_maintenance;
create policy "organization_maintenance_update_manager"
on public.organization_aircraft_maintenance for update to authenticated
using (exists (
  select 1 from public.aircraft
  where aircraft.id = organization_aircraft_maintenance.aircraft_id
    and aircraft.organization_id is not null
    and (select private.is_organization_manager(aircraft.organization_id))
))
with check (exists (
  select 1 from public.aircraft
  where aircraft.id = organization_aircraft_maintenance.aircraft_id
    and aircraft.organization_id is not null
    and (select private.is_organization_manager(aircraft.organization_id))
));

drop policy if exists "aircraft_insert_authorized" on public.aircraft;
create policy "aircraft_insert_authorized"
on public.aircraft for insert to authenticated
with check (
  (visibility = 'private' and owner_user_id = (select auth.uid()) and organization_id is null)
  or (visibility = 'organization' and organization_id is not null and (select private.is_organization_manager(organization_id)))
  or (visibility = 'shared' and organization_id is null and (select private.is_platform_admin()))
);
drop policy if exists "aircraft_update_authorized" on public.aircraft;
create policy "aircraft_update_authorized"
on public.aircraft for update to authenticated
using (
  (visibility = 'private' and owner_user_id = (select auth.uid()))
  or (visibility = 'organization' and organization_id is not null and (select private.is_organization_manager(organization_id)))
  or (visibility = 'shared' and organization_id is null and (select private.is_platform_admin()))
)
with check (
  (visibility = 'private' and owner_user_id = (select auth.uid()) and organization_id is null)
  or (visibility = 'organization' and organization_id is not null and (select private.is_organization_manager(organization_id)))
  or (visibility = 'shared' and organization_id is null and (select private.is_platform_admin()))
);
drop policy if exists "aircraft_delete_authorized" on public.aircraft;
create policy "aircraft_delete_authorized"
on public.aircraft for delete to authenticated
using (
  (visibility = 'private' and owner_user_id = (select auth.uid()))
  or (visibility = 'organization' and organization_id is not null and (select private.is_organization_manager(organization_id)))
  or (visibility = 'shared' and organization_id is null and (select private.is_platform_admin()))
);

drop policy if exists aircraft_models_insert_authorized on public.aircraft_models;
create policy aircraft_models_insert_authorized
on public.aircraft_models for insert to authenticated
with check (
  (organization_id is null and (select private.is_platform_admin()))
  or (organization_id is not null and (select private.is_organization_manager(organization_id)))
);
drop policy if exists aircraft_models_update_authorized on public.aircraft_models;
create policy aircraft_models_update_authorized
on public.aircraft_models for update to authenticated
using (
  (organization_id is null and (select private.is_platform_admin()))
  or (organization_id is not null and (select private.is_organization_manager(organization_id)))
)
with check (
  (organization_id is null and (select private.is_platform_admin()))
  or (organization_id is not null and (select private.is_organization_manager(organization_id)))
);
drop policy if exists aircraft_models_delete_authorized on public.aircraft_models;
create policy aircraft_models_delete_authorized
on public.aircraft_models for delete to authenticated
using (
  (organization_id is null and (select private.is_platform_admin()))
  or (organization_id is not null and (select private.is_organization_manager(organization_id)))
);

alter table public.organization_aircraft_maintenance
  add column if not exists current_meter_type text,
  add column if not exists current_meter_value numeric,
  add column if not exists meter_observed_at timestamptz,
  add column if not exists meter_source text,
  add column if not exists adsb_due_date date,
  add column if not exists registration_due_date date,
  add column if not exists operational_status text not null default 'available';

alter table public.organization_aircraft_maintenance
  drop constraint if exists organization_aircraft_maintenance_meter_type_check;
alter table public.organization_aircraft_maintenance
  add constraint organization_aircraft_maintenance_meter_type_check
  check (current_meter_type is null or current_meter_type in ('hobbs', 'tach'));

alter table public.organization_aircraft_maintenance
  drop constraint if exists organization_aircraft_maintenance_meter_value_check;
alter table public.organization_aircraft_maintenance
  add constraint organization_aircraft_maintenance_meter_value_check
  check (current_meter_value is null or current_meter_value >= 0);

alter table public.organization_aircraft_maintenance
  drop constraint if exists organization_aircraft_maintenance_status_check;
alter table public.organization_aircraft_maintenance
  add constraint organization_aircraft_maintenance_status_check
  check (operational_status in ('available', 'away', 'in_maintenance', 'grounded'));

create table if not exists public.organization_inspection_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 120),
  basis text not null check (basis in ('calendar', 'hobbs', 'tach', 'whichever_first')),
  model_id uuid references public.aircraft_models(id) on delete restrict,
  warning_days integer check (warning_days is null or warning_days >= 0),
  warning_hours numeric check (warning_hours is null or warning_hours >= 0),
  notes text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, name)
);

create table if not exists public.aircraft_inspection_assignments (
  id uuid primary key default gen_random_uuid(),
  definition_id uuid not null references public.organization_inspection_definitions(id) on delete cascade,
  aircraft_id uuid not null references public.aircraft(id) on delete cascade,
  due_date date,
  due_meter numeric check (due_meter is null or due_meter >= 0),
  notes text,
  is_active boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (definition_id, aircraft_id)
);

create or replace function private.validate_aircraft_inspection_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  definition_org uuid;
  definition_basis text;
  definition_model uuid;
  aircraft_org uuid;
  aircraft_model uuid;
begin
  select organization_id, basis, model_id
    into definition_org, definition_basis, definition_model
  from public.organization_inspection_definitions
  where id = new.definition_id;

  select organization_id, model_id
    into aircraft_org, aircraft_model
  from public.aircraft
  where id = new.aircraft_id and visibility = 'organization';

  if definition_org is null or aircraft_org is null or definition_org <> aircraft_org then
    raise exception 'Inspection and aircraft must belong to the same organization.' using errcode = '23514';
  end if;
  if definition_model is not null and definition_model <> aircraft_model then
    raise exception 'This inspection does not apply to the selected aircraft model.' using errcode = '23514';
  end if;
  if definition_basis = 'calendar' and new.due_date is null then
    raise exception 'A calendar inspection requires a due date.' using errcode = '23514';
  end if;
  if definition_basis in ('hobbs', 'tach') and new.due_meter is null then
    raise exception 'A meter inspection requires a due reading.' using errcode = '23514';
  end if;
  if definition_basis = 'whichever_first' and (new.due_date is null or new.due_meter is null) then
    raise exception 'A whichever-first inspection requires both a date and a meter reading.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_aircraft_inspection_assignment on public.aircraft_inspection_assignments;
create trigger validate_aircraft_inspection_assignment
before insert or update on public.aircraft_inspection_assignments
for each row execute function private.validate_aircraft_inspection_assignment();

create table if not exists public.flight_briefs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete restrict,
  aircraft_id uuid references public.aircraft(id) on delete restrict,
  aircraft_tail_number text not null default '',
  student_name text not null default '',
  instructor_name text not null default '',
  flight_date date,
  etd text,
  eta text,
  ete numeric,
  flight_rules text,
  route text,
  status text not null default 'draft' check (status in ('draft', 'finalized', 'superseded')),
  revision_number integer not null default 1 check (revision_number > 0),
  supersedes_id uuid references public.flight_briefs(id) on delete restrict,
  brief_data jsonb not null default '{}'::jsonb check (jsonb_typeof(brief_data) = 'object'),
  mx_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(mx_snapshot) = 'object'),
  weather_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(weather_snapshot) = 'object'),
  notam_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(notam_snapshot) = 'object'),
  wb_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(wb_snapshot) = 'object'),
  finalized_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.aircraft_meter_readings (
  id uuid primary key default gen_random_uuid(),
  aircraft_id uuid not null references public.aircraft(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  meter_type text not null check (meter_type in ('hobbs', 'tach')),
  previous_value numeric,
  meter_value numeric not null check (meter_value >= 0),
  observed_at timestamptz not null,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  source text not null check (source in ('preflight', 'admin', 'maintenance')),
  flight_brief_id uuid references public.flight_briefs(id) on delete restrict,
  correction_reason text,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists aircraft_meter_readings_brief_idx
  on public.aircraft_meter_readings (flight_brief_id)
  where flight_brief_id is not null;
create index if not exists aircraft_meter_readings_aircraft_idx
  on public.aircraft_meter_readings (aircraft_id, observed_at desc);
create index if not exists flight_briefs_owner_idx
  on public.flight_briefs (created_by, created_at desc);
create index if not exists flight_briefs_org_idx
  on public.flight_briefs (organization_id, status, flight_date desc)
  where organization_id is not null;
create index if not exists flight_briefs_aircraft_idx
  on public.flight_briefs (aircraft_id, flight_date desc)
  where aircraft_id is not null;
create index if not exists inspection_definitions_org_idx
  on public.organization_inspection_definitions (organization_id, is_active, name);
create index if not exists inspection_assignments_aircraft_idx
  on public.aircraft_inspection_assignments (aircraft_id, is_active);

alter table public.organization_aircraft_maintenance
  add column if not exists meter_source_brief_id uuid references public.flight_briefs(id) on delete set null;

alter table public.organization_inspection_definitions enable row level security;
alter table public.aircraft_inspection_assignments enable row level security;
alter table public.flight_briefs enable row level security;
alter table public.aircraft_meter_readings enable row level security;

drop policy if exists organization_inspections_select_member on public.organization_inspection_definitions;
create policy organization_inspections_select_member
on public.organization_inspection_definitions for select to authenticated
using ((select private.is_organization_member(organization_id)));
drop policy if exists organization_inspections_insert_manager on public.organization_inspection_definitions;
create policy organization_inspections_insert_manager
on public.organization_inspection_definitions for insert to authenticated
with check ((select private.is_organization_manager(organization_id)) and created_by = (select auth.uid()));
drop policy if exists organization_inspections_update_manager on public.organization_inspection_definitions;
create policy organization_inspections_update_manager
on public.organization_inspection_definitions for update to authenticated
using ((select private.is_organization_manager(organization_id)))
with check ((select private.is_organization_manager(organization_id)));
drop policy if exists organization_inspections_delete_manager on public.organization_inspection_definitions;
create policy organization_inspections_delete_manager
on public.organization_inspection_definitions for delete to authenticated
using ((select private.is_organization_manager(organization_id)));

drop policy if exists aircraft_inspections_select_member on public.aircraft_inspection_assignments;
create policy aircraft_inspections_select_member
on public.aircraft_inspection_assignments for select to authenticated
using (exists (
  select 1 from public.aircraft
  where aircraft.id = aircraft_inspection_assignments.aircraft_id
    and aircraft.organization_id is not null
    and (select private.is_organization_member(aircraft.organization_id))
));
drop policy if exists aircraft_inspections_insert_manager on public.aircraft_inspection_assignments;
create policy aircraft_inspections_insert_manager
on public.aircraft_inspection_assignments for insert to authenticated
with check (exists (
  select 1 from public.aircraft
  where aircraft.id = aircraft_inspection_assignments.aircraft_id
    and aircraft.organization_id is not null
    and (select private.is_organization_manager(aircraft.organization_id))
));
drop policy if exists aircraft_inspections_update_manager on public.aircraft_inspection_assignments;
create policy aircraft_inspections_update_manager
on public.aircraft_inspection_assignments for update to authenticated
using (exists (
  select 1 from public.aircraft
  where aircraft.id = aircraft_inspection_assignments.aircraft_id
    and aircraft.organization_id is not null
    and (select private.is_organization_manager(aircraft.organization_id))
))
with check (exists (
  select 1 from public.aircraft
  where aircraft.id = aircraft_inspection_assignments.aircraft_id
    and aircraft.organization_id is not null
    and (select private.is_organization_manager(aircraft.organization_id))
));
drop policy if exists aircraft_inspections_delete_manager on public.aircraft_inspection_assignments;
create policy aircraft_inspections_delete_manager
on public.aircraft_inspection_assignments for delete to authenticated
using (exists (
  select 1 from public.aircraft
  where aircraft.id = aircraft_inspection_assignments.aircraft_id
    and aircraft.organization_id is not null
    and (select private.is_organization_manager(aircraft.organization_id))
));

drop policy if exists flight_briefs_select_authorized on public.flight_briefs;
create policy flight_briefs_select_authorized
on public.flight_briefs for select to authenticated
using (
  created_by = (select auth.uid())
  or (
    status in ('finalized', 'superseded')
    and organization_id is not null
    and (
      (select private.is_organization_manager(organization_id))
      or (
        (select private.is_organization_instructor(organization_id))
        and exists (
          select 1 from public.organization_members student_membership
          where student_membership.organization_id = flight_briefs.organization_id
            and student_membership.user_id = flight_briefs.created_by
            and student_membership.teaching_role = 'student'
        )
      )
    )
  )
);
drop policy if exists flight_briefs_insert_own on public.flight_briefs;
create policy flight_briefs_insert_own
on public.flight_briefs for insert to authenticated
with check (
  created_by = (select auth.uid())
  and status = 'draft'
  and (organization_id is null or (select private.is_organization_member(organization_id)))
);
drop policy if exists flight_briefs_update_own_draft on public.flight_briefs;
create policy flight_briefs_update_own_draft
on public.flight_briefs for update to authenticated
using (created_by = (select auth.uid()) and status = 'draft')
with check (created_by = (select auth.uid()) and status = 'draft');
drop policy if exists flight_briefs_delete_own_draft on public.flight_briefs;
create policy flight_briefs_delete_own_draft
on public.flight_briefs for delete to authenticated
using (created_by = (select auth.uid()) and status = 'draft');

drop policy if exists aircraft_meter_readings_select_authorized on public.aircraft_meter_readings;
create policy aircraft_meter_readings_select_authorized
on public.aircraft_meter_readings for select to authenticated
using (
  submitted_by = (select auth.uid())
  or (select private.is_organization_manager(organization_id))
);

-- Finalize is deliberately the only student path that can advance organization meter state.
create or replace function public.finalize_flight_brief(
  p_brief_id uuid,
  p_meter_type text default null,
  p_meter_value numeric default null,
  p_observed_at timestamptz default null,
  p_planned_meter_increase numeric default null
)
returns public.flight_briefs
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.flight_briefs;
  aircraft_row public.aircraft;
  maintenance_row public.organization_aircraft_maintenance;
  result public.flight_briefs;
  custom_items jsonb := '[]'::jsonb;
  status_label text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select * into target from public.flight_briefs where id = p_brief_id for update;
  if not found or target.created_by <> auth.uid() then
    raise exception 'Flight brief not found.' using errcode = 'P0002';
  end if;
  if target.status = 'finalized' then
    return target;
  end if;
  if target.status <> 'draft' then
    raise exception 'Only a draft flight brief can be finalized.' using errcode = '22023';
  end if;

  if target.organization_id is not null then
    if not private.is_organization_member(target.organization_id, auth.uid()) then
      raise exception 'You are no longer a member of this organization.' using errcode = '42501';
    end if;
    if target.aircraft_id is null then
      raise exception 'An organization flight brief requires an organization aircraft.' using errcode = '23502';
    end if;
    select * into aircraft_row from public.aircraft
      where id = target.aircraft_id
        and organization_id = target.organization_id
        and visibility = 'organization';
    if not found then
      raise exception 'The selected aircraft is not available in this organization.' using errcode = '42501';
    end if;
    if p_meter_type not in ('hobbs', 'tach') or p_meter_value is null or p_observed_at is null then
      raise exception 'Meter type, reading, and observation time are required.' using errcode = '22023';
    end if;
    if p_meter_value < 0 or (p_planned_meter_increase is not null and p_planned_meter_increase < 0) then
      raise exception 'Meter values cannot be negative.' using errcode = '22023';
    end if;

    insert into public.organization_aircraft_maintenance (aircraft_id)
      values (target.aircraft_id)
      on conflict (aircraft_id) do nothing;
    select * into maintenance_row from public.organization_aircraft_maintenance
      where aircraft_id = target.aircraft_id for update;

    if maintenance_row.operational_status <> 'available' then
      status_label := case maintenance_row.operational_status
        when 'grounded' then 'grounded'
        when 'in_maintenance' then 'in maintenance'
        when 'away' then 'away or unavailable'
        else 'unavailable'
      end;
      raise exception 'This aircraft cannot be dispatched because it is %. %',
        status_label,
        case
          when nullif(btrim(coalesce(maintenance_row.operational_status_note, '')), '') is null
            then 'Choose another aircraft or ask an organization admin to return it to service.'
          else btrim(maintenance_row.operational_status_note)
        end
        using errcode = '55000';
    end if;

    if maintenance_row.current_meter_value is not null and p_meter_value < maintenance_row.current_meter_value then
      raise exception 'The meter reading is lower than the current MX value (%).', maintenance_row.current_meter_value
        using errcode = '22023';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', assignments.id,
      'name', definitions.name,
      'basis', definitions.basis,
      'due_date', assignments.due_date,
      'due_meter', assignments.due_meter,
      'warning_days', definitions.warning_days,
      'warning_hours', definitions.warning_hours,
      'notes', coalesce(assignments.notes, definitions.notes)
    ) order by definitions.name), '[]'::jsonb)
    into custom_items
    from public.aircraft_inspection_assignments assignments
    join public.organization_inspection_definitions definitions on definitions.id = assignments.definition_id
    where assignments.aircraft_id = target.aircraft_id
      and assignments.is_active and definitions.is_active;

    insert into public.aircraft_meter_readings (
      aircraft_id, organization_id, meter_type, previous_value, meter_value,
      observed_at, submitted_by, source, flight_brief_id
    ) values (
      target.aircraft_id, target.organization_id, p_meter_type,
      maintenance_row.current_meter_value, p_meter_value,
      p_observed_at, auth.uid(), 'preflight', target.id
    ) on conflict (flight_brief_id) where flight_brief_id is not null do nothing;

    update public.organization_aircraft_maintenance
    set current_meter_type = p_meter_type,
        current_meter_value = p_meter_value,
        meter_observed_at = p_observed_at,
        meter_source = 'preflight',
        meter_source_brief_id = target.id,
        updated_by = auth.uid(),
        updated_at = timezone('utc', now())
    where aircraft_id = target.aircraft_id;

    target.mx_snapshot := jsonb_build_object(
      'aircraft_id', target.aircraft_id,
      'tail_number', aircraft_row.tail_number,
      'meter_type', p_meter_type,
      'meter_value', p_meter_value,
      'observed_at', p_observed_at,
      'planned_meter_increase', p_planned_meter_increase,
      'projected_return_meter', case when p_planned_meter_increase is null then null else p_meter_value + p_planned_meter_increase end,
      'hundred_hour_due_hours', maintenance_row.hundred_hour_due_hours,
      'annual_due_date', maintenance_row.annual_due_date,
      'static_due_date', maintenance_row.static_due_date,
      'transponder_due_date', maintenance_row.transponder_due_date,
      'elt_due_date', maintenance_row.elt_due_date,
      'adsb_due_date', maintenance_row.adsb_due_date,
      'registration_due_date', maintenance_row.registration_due_date,
      'operational_status', maintenance_row.operational_status,
      'operational_status_note', maintenance_row.operational_status_note,
      'maintenance_updated_at', maintenance_row.updated_at,
      'custom_inspections', custom_items
    );
    target.wb_snapshot := coalesce(target.wb_snapshot, '{}'::jsonb) || jsonb_build_object(
      'aircraft_empty_weight', aircraft_row.empty_weight,
      'aircraft_empty_arm', aircraft_row.empty_arm,
      'aircraft_empty_lat_arm', aircraft_row.empty_lat_arm,
      'aircraft_updated_at', aircraft_row.updated_at
    );
  end if;

  update public.flight_briefs
  set status = 'finalized',
      mx_snapshot = target.mx_snapshot,
      wb_snapshot = target.wb_snapshot,
      finalized_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = target.id
  returning * into result;

  if result.supersedes_id is not null then
    update public.flight_briefs
      set status = 'superseded', updated_at = timezone('utc', now())
      where id = result.supersedes_id
        and created_by = auth.uid()
        and status = 'finalized';
  end if;
  return result;
end;
$$;

create or replace function public.create_flight_brief_revision(p_brief_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_record public.flight_briefs;
  new_id uuid;
begin
  select * into source_record from public.flight_briefs where id = p_brief_id;
  if not found or source_record.created_by <> auth.uid() or source_record.status not in ('finalized', 'superseded') then
    raise exception 'Only your finalized flight brief can be revised.' using errcode = '42501';
  end if;
  insert into public.flight_briefs (
    created_by, organization_id, aircraft_id, aircraft_tail_number,
    student_name, instructor_name, flight_date, etd, eta, ete, flight_rules, route,
    revision_number, supersedes_id, brief_data, weather_snapshot, notam_snapshot, wb_snapshot
  ) values (
    auth.uid(), source_record.organization_id, source_record.aircraft_id, source_record.aircraft_tail_number,
    source_record.student_name, source_record.instructor_name, source_record.flight_date,
    source_record.etd, source_record.eta, source_record.ete, source_record.flight_rules, source_record.route,
    source_record.revision_number + 1, source_record.id, source_record.brief_data,
    source_record.weather_snapshot, source_record.notam_snapshot, source_record.wb_snapshot
  ) returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.correct_aircraft_meter(
  p_aircraft_id uuid,
  p_meter_type text,
  p_meter_value numeric,
  p_observed_at timestamptz,
  p_reason text
)
returns public.organization_aircraft_maintenance
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization_id_value uuid;
  previous_value numeric;
  result public.organization_aircraft_maintenance;
begin
  select organization_id into organization_id_value
  from public.aircraft where id = p_aircraft_id and visibility = 'organization';
  if organization_id_value is null or not private.is_organization_manager(organization_id_value, auth.uid()) then
    raise exception 'Only organization owners and administrators can correct meter readings.' using errcode = '42501';
  end if;
  if p_meter_type not in ('hobbs', 'tach') or p_meter_value < 0 or p_observed_at is null or char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Meter type, non-negative reading, observation time, and reason are required.' using errcode = '22023';
  end if;
  insert into public.organization_aircraft_maintenance (aircraft_id)
    values (p_aircraft_id) on conflict (aircraft_id) do nothing;
  select current_meter_value into previous_value
    from public.organization_aircraft_maintenance where aircraft_id = p_aircraft_id for update;
  insert into public.aircraft_meter_readings (
    aircraft_id, organization_id, meter_type, previous_value, meter_value,
    observed_at, submitted_by, source, correction_reason
  ) values (
    p_aircraft_id, organization_id_value, p_meter_type, previous_value, p_meter_value,
    p_observed_at, auth.uid(), 'admin', trim(p_reason)
  );
  update public.organization_aircraft_maintenance
  set current_meter_type = p_meter_type,
      current_meter_value = p_meter_value,
      meter_observed_at = p_observed_at,
      meter_source = 'admin',
      meter_source_brief_id = null,
      updated_by = auth.uid(),
      updated_at = timezone('utc', now())
  where aircraft_id = p_aircraft_id returning * into result;
  return result;
end;
$$;

revoke all on public.organization_inspection_definitions from public, anon, authenticated;
revoke all on public.aircraft_inspection_assignments from public, anon, authenticated;
revoke all on public.flight_briefs from public, anon, authenticated;
revoke all on public.aircraft_meter_readings from public, anon, authenticated;
grant select, insert, update, delete on public.organization_inspection_definitions to authenticated;
grant select, insert, update, delete on public.aircraft_inspection_assignments to authenticated;
grant select, insert, update, delete on public.flight_briefs to authenticated;
grant select on public.aircraft_meter_readings to authenticated;

revoke all on function public.finalize_flight_brief(uuid, text, numeric, timestamptz, numeric) from public, anon;
grant execute on function public.finalize_flight_brief(uuid, text, numeric, timestamptz, numeric) to authenticated;
revoke all on function public.create_flight_brief_revision(uuid) from public, anon;
grant execute on function public.create_flight_brief_revision(uuid) to authenticated;
revoke all on function public.correct_aircraft_meter(uuid, text, numeric, timestamptz, text) from public, anon;
grant execute on function public.correct_aircraft_meter(uuid, text, numeric, timestamptz, text) to authenticated;
