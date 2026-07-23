-- Platform-admin aircraft may be made available to multiple organizations without
-- changing ownership or duplicating the aircraft record.

create table if not exists public.aircraft_organization_assignments (
  aircraft_id uuid not null references public.aircraft(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (aircraft_id, organization_id)
);

create index if not exists aircraft_organization_assignments_org_idx
on public.aircraft_organization_assignments (organization_id, aircraft_id);

create table if not exists public.aircraft_organization_assignment_audit_logs (
  id uuid primary key default gen_random_uuid(),
  aircraft_id uuid references public.aircraft(id) on delete set null,
  aircraft_tail_number text not null,
  organization_id uuid references public.organizations(id) on delete set null,
  organization_name text not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('assigned', 'unassigned')),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists aircraft_assignment_audit_created_idx
on public.aircraft_organization_assignment_audit_logs (created_at desc);

alter table public.aircraft_organization_assignments enable row level security;
alter table public.aircraft_organization_assignment_audit_logs enable row level security;

revoke all on public.aircraft_organization_assignments from public, anon, authenticated;
revoke all on public.aircraft_organization_assignment_audit_logs from public, anon, authenticated;
grant select on public.aircraft_organization_assignments to authenticated;

create or replace function private.can_use_aircraft_in_organization(
  p_aircraft_id uuid,
  p_organization_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_organization_member(p_organization_id, p_user_id)
    and exists (
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
            from public.aircraft_organization_assignments as assignments
            where assignments.aircraft_id = aircraft.id
              and assignments.organization_id = p_organization_id
          )
        )
    );
$$;

create or replace function private.can_manage_aircraft_mx(
  p_aircraft_id uuid,
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
    from public.aircraft
    where aircraft.id = p_aircraft_id
      and (
        (
          aircraft.visibility = 'organization'
          and aircraft.organization_id is not null
          and private.is_organization_manager(aircraft.organization_id, p_user_id)
        )
        or exists (
          select 1
          from public.aircraft_organization_assignments as assignments
          where assignments.aircraft_id = aircraft.id
            and private.is_organization_manager(assignments.organization_id, p_user_id)
        )
      )
  );
$$;

revoke all on function private.can_use_aircraft_in_organization(uuid, uuid, uuid) from public;
revoke all on function private.can_manage_aircraft_mx(uuid, uuid) from public;
grant usage on schema private to anon, authenticated;
grant execute on function private.can_use_aircraft_in_organization(uuid, uuid, uuid) to anon, authenticated;
grant execute on function private.can_manage_aircraft_mx(uuid, uuid) to authenticated;

drop policy if exists aircraft_assignments_select_authorized on public.aircraft_organization_assignments;
create policy aircraft_assignments_select_authorized
on public.aircraft_organization_assignments for select to authenticated
using (
  (select private.is_platform_admin())
  or (select private.is_organization_member(organization_id))
);

drop policy if exists "aircraft_select_visible" on public.aircraft;
create policy "aircraft_select_visible"
on public.aircraft for select to anon, authenticated
using (
  visibility = 'shared'
  or owner_user_id = (select auth.uid())
  or (organization_id is not null and (select private.is_organization_member(organization_id)))
  or exists (
    select 1
    from public.aircraft_organization_assignments as assignments
    where assignments.aircraft_id = aircraft.id
      and (select private.is_organization_member(assignments.organization_id))
  )
  or (select private.is_platform_admin())
);

drop policy if exists "organization_maintenance_select_member" on public.organization_aircraft_maintenance;
create policy "organization_maintenance_select_member"
on public.organization_aircraft_maintenance for select to authenticated
using (
  exists (
    select 1
    from public.aircraft
    where aircraft.id = organization_aircraft_maintenance.aircraft_id
      and (
        (aircraft.organization_id is not null and (select private.is_organization_member(aircraft.organization_id)))
        or exists (
          select 1
          from public.aircraft_organization_assignments as assignments
          where assignments.aircraft_id = aircraft.id
            and (select private.is_organization_member(assignments.organization_id))
        )
      )
  )
  or (select private.is_platform_admin())
);

drop policy if exists "organization_maintenance_insert_manager" on public.organization_aircraft_maintenance;
create policy "organization_maintenance_insert_manager"
on public.organization_aircraft_maintenance for insert to authenticated
with check ((select private.can_manage_aircraft_mx(aircraft_id)));

drop policy if exists "organization_maintenance_update_manager" on public.organization_aircraft_maintenance;
create policy "organization_maintenance_update_manager"
on public.organization_aircraft_maintenance for update to authenticated
using ((select private.can_manage_aircraft_mx(aircraft_id)))
with check ((select private.can_manage_aircraft_mx(aircraft_id)));

drop policy if exists aircraft_inspections_select_member on public.aircraft_inspection_assignments;
create policy aircraft_inspections_select_member
on public.aircraft_inspection_assignments for select to authenticated
using (exists (
  select 1
  from public.organization_inspection_definitions as definitions
  where definitions.id = aircraft_inspection_assignments.definition_id
    and (select private.can_use_aircraft_in_organization(
      aircraft_inspection_assignments.aircraft_id,
      definitions.organization_id
    ))
));

drop policy if exists aircraft_inspections_insert_manager on public.aircraft_inspection_assignments;
create policy aircraft_inspections_insert_manager
on public.aircraft_inspection_assignments for insert to authenticated
with check (exists (
  select 1
  from public.organization_inspection_definitions as definitions
  where definitions.id = aircraft_inspection_assignments.definition_id
    and (select private.is_organization_manager(definitions.organization_id))
    and (select private.can_use_aircraft_in_organization(
      aircraft_inspection_assignments.aircraft_id,
      definitions.organization_id
    ))
));

drop policy if exists aircraft_inspections_update_manager on public.aircraft_inspection_assignments;
create policy aircraft_inspections_update_manager
on public.aircraft_inspection_assignments for update to authenticated
using (exists (
  select 1
  from public.organization_inspection_definitions as definitions
  where definitions.id = aircraft_inspection_assignments.definition_id
    and (select private.is_organization_manager(definitions.organization_id))
    and (select private.can_use_aircraft_in_organization(
      aircraft_inspection_assignments.aircraft_id,
      definitions.organization_id
    ))
))
with check (exists (
  select 1
  from public.organization_inspection_definitions as definitions
  where definitions.id = aircraft_inspection_assignments.definition_id
    and (select private.is_organization_manager(definitions.organization_id))
    and (select private.can_use_aircraft_in_organization(
      aircraft_inspection_assignments.aircraft_id,
      definitions.organization_id
    ))
));

drop policy if exists aircraft_inspections_delete_manager on public.aircraft_inspection_assignments;
create policy aircraft_inspections_delete_manager
on public.aircraft_inspection_assignments for delete to authenticated
using (exists (
  select 1
  from public.organization_inspection_definitions as definitions
  where definitions.id = aircraft_inspection_assignments.definition_id
    and (select private.is_organization_manager(definitions.organization_id))
    and (select private.can_use_aircraft_in_organization(
      aircraft_inspection_assignments.aircraft_id,
      definitions.organization_id
    ))
));

create or replace function public.list_organization_aircraft(p_organization_id uuid)
returns table (
  id uuid,
  model_id uuid,
  name text,
  tail_number text,
  updated_at timestamptz,
  owner_user_id uuid,
  organization_id uuid,
  visibility text,
  empty_weight numeric,
  empty_arm numeric,
  empty_lat_arm numeric,
  organization_access text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or (
    not private.is_platform_admin(auth.uid())
    and not private.is_organization_member(p_organization_id, auth.uid())
  ) then
    raise exception 'Organization membership is required.' using errcode = '42501';
  end if;

  return query
  select
    aircraft.id,
    aircraft.model_id,
    aircraft.name,
    aircraft.tail_number,
    aircraft.updated_at,
    aircraft.owner_user_id,
    aircraft.organization_id,
    aircraft.visibility,
    aircraft.empty_weight,
    aircraft.empty_arm,
    aircraft.empty_lat_arm,
    case
      when aircraft.organization_id = p_organization_id then 'owned'
      else 'assigned'
    end
  from public.aircraft
  where (
    aircraft.visibility = 'organization'
    and aircraft.organization_id = p_organization_id
  ) or exists (
    select 1
    from public.aircraft_organization_assignments as assignments
    where assignments.aircraft_id = aircraft.id
      and assignments.organization_id = p_organization_id
  )
  order by aircraft.tail_number;
end;
$$;

create or replace function public.set_platform_aircraft_organizations(
  p_aircraft_id uuid,
  p_organization_ids uuid[]
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_aircraft public.aircraft%rowtype;
  v_organization_ids uuid[];
  v_requested_count integer;
  v_existing_count integer;
begin
  if v_actor_id is null or not private.is_platform_admin(v_actor_id) then
    raise exception 'Platform administrator access is required.' using errcode = '42501';
  end if;

  select array_agg(distinct requested_id order by requested_id)
  into v_organization_ids
  from unnest(coalesce(p_organization_ids, array[]::uuid[])) as requested(requested_id)
  where requested_id is not null;
  v_organization_ids := coalesce(v_organization_ids, array[]::uuid[]);

  select * into v_aircraft
  from public.aircraft
  where aircraft.id = p_aircraft_id
  for update;

  if not found then
    raise exception 'Aircraft not found.' using errcode = 'P0002';
  end if;

  if v_aircraft.visibility <> 'private'
    or v_aircraft.organization_id is not null
    or v_aircraft.owner_user_id is null
    or not exists (
      select 1
      from public.profiles
      where profiles.id = v_aircraft.owner_user_id
        and profiles.role = 'admin'
    ) then
    raise exception 'Only a private aircraft owned by a Platform Super Admin can be assigned.'
      using errcode = '22023';
  end if;

  v_requested_count := cardinality(v_organization_ids);
  select count(*) into v_existing_count
  from public.organizations
  where id = any(v_organization_ids);
  if v_existing_count <> v_requested_count then
    raise exception 'One or more selected organizations no longer exist.' using errcode = '23503';
  end if;

  insert into public.aircraft_organization_assignment_audit_logs (
    aircraft_id,
    aircraft_tail_number,
    organization_id,
    organization_name,
    actor_user_id,
    action
  )
  select
    v_aircraft.id,
    v_aircraft.tail_number,
    assignments.organization_id,
    organizations.name,
    v_actor_id,
    'unassigned'
  from public.aircraft_organization_assignments as assignments
  join public.organizations on organizations.id = assignments.organization_id
  where assignments.aircraft_id = v_aircraft.id
    and not (assignments.organization_id = any(v_organization_ids));

  delete from public.aircraft_organization_assignments
  where aircraft_id = v_aircraft.id
    and not (organization_id = any(v_organization_ids));

  with inserted as (
    insert into public.aircraft_organization_assignments (
      aircraft_id,
      organization_id,
      assigned_by
    )
    select v_aircraft.id, organizations.id, v_actor_id
    from public.organizations
    where organizations.id = any(v_organization_ids)
    on conflict (aircraft_id, organization_id) do nothing
    returning organization_id
  )
  insert into public.aircraft_organization_assignment_audit_logs (
    aircraft_id,
    aircraft_tail_number,
    organization_id,
    organization_name,
    actor_user_id,
    action
  )
  select
    v_aircraft.id,
    v_aircraft.tail_number,
    inserted.organization_id,
    organizations.name,
    v_actor_id,
    'assigned'
  from inserted
  join public.organizations on organizations.id = inserted.organization_id;

  return v_organization_ids;
end;
$$;

revoke all on function public.list_organization_aircraft(uuid) from public, anon, authenticated;
revoke all on function public.set_platform_aircraft_organizations(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.list_organization_aircraft(uuid) to authenticated;
grant execute on function public.set_platform_aircraft_organizations(uuid, uuid[]) to authenticated;

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
  if not private.can_manage_aircraft_mx(p_aircraft_id, auth.uid()) then
    raise exception 'Only an authorized organization Owner or Admin can correct meter readings.' using errcode = '42501';
  end if;
  select coalesce(
    aircraft.organization_id,
    (
      select assignments.organization_id
      from public.aircraft_organization_assignments as assignments
      where assignments.aircraft_id = aircraft.id
        and private.is_organization_manager(assignments.organization_id, auth.uid())
      order by assignments.created_at
      limit 1
    )
  ) into organization_id_value
  from public.aircraft
  where aircraft.id = p_aircraft_id;
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

create or replace function private.notify_organization_aircraft_maintenance_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  aircraft_record record;
  organization_record record;
  member_record record;
  maintenance_detail text;
begin
  if tg_op = 'UPDATE' and
    new.hundred_hour_due_hours is not distinct from old.hundred_hour_due_hours and
    new.annual_due_date is not distinct from old.annual_due_date and
    new.static_due_date is not distinct from old.static_due_date and
    new.transponder_due_date is not distinct from old.transponder_due_date and
    new.elt_due_date is not distinct from old.elt_due_date then
    return new;
  end if;

  select aircraft.tail_number, aircraft.organization_id
  into aircraft_record
  from public.aircraft
  where aircraft.id = new.aircraft_id;

  maintenance_detail := concat_ws(' · ',
    case when new.hundred_hour_due_hours is not null then '100-hour at ' || new.hundred_hour_due_hours::text end,
    case when new.annual_due_date is not null then 'Annual ' || new.annual_due_date::text end,
    case when new.static_due_date is not null then 'Static ' || new.static_due_date::text end,
    case when new.transponder_due_date is not null then 'Transponder ' || new.transponder_due_date::text end,
    case when new.elt_due_date is not null then 'ELT ' || new.elt_due_date::text end
  );

  for organization_record in
    select organizations.id, organizations.name
    from public.organizations
    where organizations.id = aircraft_record.organization_id
    union
    select organizations.id, organizations.name
    from public.aircraft_organization_assignments as assignments
    join public.organizations on organizations.id = assignments.organization_id
    where assignments.aircraft_id = new.aircraft_id
  loop
    for member_record in
      select user_id
      from public.organization_members
      where organization_id = organization_record.id
    loop
      perform private.create_user_notification(
        member_record.user_id,
        'Aircraft maintenance updated',
        aircraft_record.tail_number || ': ' || coalesce(nullif(maintenance_detail, ''), 'No due dates recorded.'),
        'organization', 'normal', organization_record.id, organization_record.name,
        '/dashboard/my-aircraft',
        'aircraft-maintenance:' || new.aircraft_id::text || ':' || organization_record.id::text || ':' || extract(epoch from new.updated_at)::bigint::text,
        new.updated_by
      );
    end loop;
  end loop;
  return new;
end;
$$;
