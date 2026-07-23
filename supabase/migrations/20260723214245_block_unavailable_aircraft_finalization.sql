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
    if not private.can_use_aircraft_in_organization(
      target.aircraft_id,
      target.organization_id,
      auth.uid()
    ) then
      raise exception 'The selected aircraft is not available in this organization.' using errcode = '42501';
    end if;
    select * into aircraft_row from public.aircraft where id = target.aircraft_id;
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
      and definitions.organization_id = target.organization_id
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

revoke all on function public.finalize_flight_brief(uuid, text, numeric, timestamptz, numeric)
  from public, anon;
grant execute on function public.finalize_flight_brief(uuid, text, numeric, timestamptz, numeric)
  to authenticated;
