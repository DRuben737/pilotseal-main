create unique index if not exists aircraft_tail_number_organization_unique_idx
  on public.aircraft (organization_id, upper(btrim(tail_number)))
  where visibility = 'organization' and organization_id is not null;

create index if not exists aircraft_model_id_idx
  on public.aircraft (model_id)
  where model_id is not null;

create index if not exists aircraft_meter_readings_organization_idx
  on public.aircraft_meter_readings (organization_id, observed_at desc);

alter table public.organization_aircraft_maintenance
  add column if not exists operational_status_note text;

create or replace function private.ensure_aircraft_grounding_note()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  discrepancy_reason text;
begin
  if new.operational_status = 'grounded'
    and char_length(btrim(coalesce(new.operational_status_note, ''))) < 3
  then
    select 'Discrepancy report: ' || left(btrim(discrepancy.description), 500)
      into discrepancy_reason
      from public.aircraft_discrepancy_reports as discrepancy
      join public.organization_reports as report
        on report.id = discrepancy.report_id
      where discrepancy.aircraft_id = new.aircraft_id
        and discrepancy.is_aircraft_down is true
      order by report.created_at desc
      limit 1;

    new.operational_status_note := coalesce(
      discrepancy_reason,
      'Grounded by an organization report or maintenance action.'
    );
  elsif new.operational_status = 'available' then
    new.operational_status_note := null;
  end if;

  return new;
end;
$$;

drop trigger if exists ensure_aircraft_grounding_note
  on public.organization_aircraft_maintenance;

create trigger ensure_aircraft_grounding_note
before insert or update of operational_status, operational_status_note
on public.organization_aircraft_maintenance
for each row
execute function private.ensure_aircraft_grounding_note();

alter table public.organization_aircraft_maintenance
  drop constraint if exists organization_aircraft_maintenance_grounded_note_check;

alter table public.organization_aircraft_maintenance
  add constraint organization_aircraft_maintenance_grounded_note_check
  check (
    operational_status <> 'grounded'
    or char_length(btrim(coalesce(operational_status_note, ''))) >= 3
  );

drop function if exists public.save_organization_aircraft_atomic(
  uuid,
  uuid,
  uuid,
  text,
  numeric,
  numeric,
  numeric,
  numeric,
  date,
  date,
  date,
  date,
  date,
  date,
  text,
  text,
  numeric,
  timestamptz,
  text
);

create or replace function public.save_organization_aircraft_atomic(
  p_organization_id uuid,
  p_aircraft_id uuid,
  p_model_id uuid,
  p_tail_number text,
  p_empty_weight numeric,
  p_empty_arm numeric,
  p_empty_lat_arm numeric,
  p_hundred_hour_due_hours numeric,
  p_annual_due_date date,
  p_static_due_date date,
  p_transponder_due_date date,
  p_elt_due_date date,
  p_adsb_due_date date,
  p_registration_due_date date,
  p_operational_status text,
  p_operational_status_note text,
  p_meter_type text,
  p_meter_value numeric,
  p_meter_observed_at timestamptz,
  p_meter_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  aircraft_record public.aircraft;
  saved_aircraft_id uuid;
  previous_meter_value numeric;
  can_edit_identity boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Sign in before saving organization aircraft.' using errcode = '42501';
  end if;

  if p_organization_id is null
    or not private.is_organization_manager(p_organization_id, auth.uid())
  then
    raise exception 'Only an organization Owner or Admin can save aircraft.'
      using errcode = '42501';
  end if;

  if p_operational_status not in ('available', 'away', 'in_maintenance', 'grounded') then
    raise exception 'Choose a valid aircraft availability status.' using errcode = '22023';
  end if;

  if p_operational_status = 'grounded'
    and char_length(btrim(coalesce(p_operational_status_note, ''))) < 3
  then
    raise exception 'Enter why this aircraft is grounded.' using errcode = '22023';
  end if;

  if p_hundred_hour_due_hours is not null and p_hundred_hour_due_hours < 0 then
    raise exception 'The next 100-hour due reading cannot be negative.' using errcode = '22023';
  end if;

  if p_aircraft_id is null then
    can_edit_identity := true;
  else
    select *
      into aircraft_record
      from public.aircraft
      where id = p_aircraft_id
      for update;

    if not found then
      raise exception 'Aircraft not found.' using errcode = 'P0002';
    end if;

    can_edit_identity :=
      aircraft_record.visibility = 'organization'
      and aircraft_record.organization_id = p_organization_id;

    if not can_edit_identity and not exists (
      select 1
      from public.aircraft_organization_assignments as assignment
      where assignment.aircraft_id = p_aircraft_id
        and assignment.organization_id = p_organization_id
    ) then
      raise exception 'This aircraft is not available to the selected organization.'
        using errcode = '42501';
    end if;
  end if;

  if can_edit_identity then
    if p_model_id is null or not exists (
      select 1
      from public.aircraft_models as model
      where model.id = p_model_id
        and (model.organization_id is null or model.organization_id = p_organization_id)
    ) then
      raise exception 'Choose an aircraft model available to this organization.'
        using errcode = '22023';
    end if;

    if btrim(coalesce(p_tail_number, '')) = '' then
      raise exception 'Enter the aircraft registration or tail number.'
        using errcode = '22023';
    end if;

    if p_empty_weight is null or p_empty_weight <= 0 then
      raise exception 'Basic empty weight must be greater than 0.' using errcode = '22023';
    end if;

    if p_empty_arm is null then
      raise exception 'Enter the basic empty-weight arm.' using errcode = '22023';
    end if;

    if p_aircraft_id is null then
      insert into public.aircraft (
        model_id,
        tail_number,
        name,
        empty_weight,
        empty_arm,
        empty_lat_arm,
        created_by,
        updated_by,
        owner_user_id,
        visibility,
        organization_id
      )
      values (
        p_model_id,
        upper(btrim(p_tail_number)),
        upper(btrim(p_tail_number)),
        p_empty_weight,
        p_empty_arm,
        p_empty_lat_arm,
        auth.uid(),
        auth.uid(),
        null,
        'organization',
        p_organization_id
      )
      returning id into saved_aircraft_id;
    else
      update public.aircraft
      set model_id = p_model_id,
          tail_number = upper(btrim(p_tail_number)),
          name = upper(btrim(p_tail_number)),
          empty_weight = p_empty_weight,
          empty_arm = p_empty_arm,
          empty_lat_arm = p_empty_lat_arm,
          updated_by = auth.uid(),
          updated_at = timezone('utc', now())
      where id = p_aircraft_id
      returning id into saved_aircraft_id;
    end if;
  else
    saved_aircraft_id := p_aircraft_id;
  end if;

  insert into public.organization_aircraft_maintenance (
    aircraft_id,
    hundred_hour_due_hours,
    annual_due_date,
    static_due_date,
    transponder_due_date,
    elt_due_date,
    adsb_due_date,
    registration_due_date,
    operational_status,
    operational_status_note,
    updated_by,
    updated_at
  )
  values (
    saved_aircraft_id,
    p_hundred_hour_due_hours,
    p_annual_due_date,
    p_static_due_date,
    p_transponder_due_date,
    p_elt_due_date,
    p_adsb_due_date,
    p_registration_due_date,
    p_operational_status,
    nullif(btrim(coalesce(p_operational_status_note, '')), ''),
    auth.uid(),
    timezone('utc', now())
  )
  on conflict (aircraft_id) do update
  set hundred_hour_due_hours = excluded.hundred_hour_due_hours,
      annual_due_date = excluded.annual_due_date,
      static_due_date = excluded.static_due_date,
      transponder_due_date = excluded.transponder_due_date,
      elt_due_date = excluded.elt_due_date,
      adsb_due_date = excluded.adsb_due_date,
      registration_due_date = excluded.registration_due_date,
      operational_status = excluded.operational_status,
      operational_status_note = excluded.operational_status_note,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;

  if p_meter_value is not null then
    if p_meter_type not in ('hobbs', 'tach')
      or p_meter_value < 0
      or p_meter_observed_at is null
      or char_length(btrim(coalesce(p_meter_reason, ''))) < 3
    then
      raise exception
        'Meter type, non-negative reading, observation time, and reason are required.'
        using errcode = '22023';
    end if;

    select current_meter_value
      into previous_meter_value
      from public.organization_aircraft_maintenance
      where aircraft_id = saved_aircraft_id
      for update;

    insert into public.aircraft_meter_readings (
      aircraft_id,
      organization_id,
      meter_type,
      previous_value,
      meter_value,
      observed_at,
      submitted_by,
      source,
      correction_reason
    )
    values (
      saved_aircraft_id,
      p_organization_id,
      p_meter_type,
      previous_meter_value,
      p_meter_value,
      p_meter_observed_at,
      auth.uid(),
      'admin',
      btrim(p_meter_reason)
    );

    update public.organization_aircraft_maintenance
    set current_meter_type = p_meter_type,
        current_meter_value = p_meter_value,
        meter_observed_at = p_meter_observed_at,
        meter_source = 'admin',
        meter_source_brief_id = null,
        updated_by = auth.uid(),
        updated_at = timezone('utc', now())
    where aircraft_id = saved_aircraft_id;
  end if;

  return saved_aircraft_id;
exception
  when unique_violation then
    raise exception 'This tail number is already in the organization fleet.'
      using errcode = '23505';
end;
$$;

revoke all on function public.save_organization_aircraft_atomic(
  uuid,
  uuid,
  uuid,
  text,
  numeric,
  numeric,
  numeric,
  numeric,
  date,
  date,
  date,
  date,
  date,
  date,
  text,
  text,
  text,
  numeric,
  timestamptz,
  text
) from public, anon;

grant execute on function public.save_organization_aircraft_atomic(
  uuid,
  uuid,
  uuid,
  text,
  numeric,
  numeric,
  numeric,
  numeric,
  date,
  date,
  date,
  date,
  date,
  date,
  text,
  text,
  text,
  numeric,
  timestamptz,
  text
) to authenticated, service_role;

comment on function public.save_organization_aircraft_atomic(
  uuid,
  uuid,
  uuid,
  text,
  numeric,
  numeric,
  numeric,
  numeric,
  date,
  date,
  date,
  date,
  date,
  date,
  text,
  text,
  text,
  numeric,
  timestamptz,
  text
) is
  'Atomically saves organization aircraft identity, shared maintenance status, and an optional audited meter correction.';
