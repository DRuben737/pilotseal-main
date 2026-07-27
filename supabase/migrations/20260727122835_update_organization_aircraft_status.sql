-- Remote migration history version: 20260727122835.
create or replace function public.update_organization_aircraft_status(
  p_organization_id uuid,
  p_aircraft_id uuid,
  p_operational_status text,
  p_operational_status_note text
)
returns table (
  operational_status text,
  operational_status_note text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text := nullif(btrim(coalesce(p_operational_status_note, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Sign in before changing aircraft status.' using errcode = '42501';
  end if;

  if p_organization_id is null
    or not private.is_organization_manager(p_organization_id, auth.uid())
  then
    raise exception 'Only an organization Owner or Admin can change aircraft status.'
      using errcode = '42501';
  end if;

  if p_operational_status not in ('available', 'away', 'in_maintenance', 'grounded') then
    raise exception 'Choose a valid aircraft status.' using errcode = '22023';
  end if;

  if p_operational_status = 'grounded'
    and char_length(coalesce(v_note, '')) < 3
  then
    raise exception 'Enter at least 3 characters explaining why this aircraft is grounded.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.aircraft
    where aircraft.id = p_aircraft_id
      and (
        (
          aircraft.visibility = 'organization'
          and aircraft.organization_id = p_organization_id
        )
        or exists (
          select 1
          from public.aircraft_organization_assignments as assignment
          where assignment.aircraft_id = aircraft.id
            and assignment.organization_id = p_organization_id
        )
      )
  ) then
    raise exception 'This aircraft is not available to the selected organization.'
      using errcode = '42501';
  end if;

  insert into public.organization_aircraft_maintenance (
    aircraft_id,
    operational_status,
    operational_status_note,
    updated_by,
    updated_at
  )
  values (
    p_aircraft_id,
    p_operational_status,
    v_note,
    auth.uid(),
    timezone('utc', now())
  )
  on conflict (aircraft_id) do update
  set operational_status = excluded.operational_status,
      operational_status_note = excluded.operational_status_note,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;

  return query
  select
    maintenance.operational_status,
    maintenance.operational_status_note,
    maintenance.updated_at
  from public.organization_aircraft_maintenance as maintenance
  where maintenance.aircraft_id = p_aircraft_id;
end;
$$;

revoke all on function public.update_organization_aircraft_status(uuid, uuid, text, text)
from public, anon;
grant execute on function public.update_organization_aircraft_status(uuid, uuid, text, text)
to authenticated, service_role;

comment on function public.update_organization_aircraft_status(uuid, uuid, text, text)
is 'Updates only operational status and note for organization-owned or assigned aircraft.';
