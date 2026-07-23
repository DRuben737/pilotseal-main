-- Atomic bulk organization access management for Platform Super Admin aircraft.

create or replace function public.bulk_update_platform_aircraft_organizations(
  p_aircraft_ids uuid[],
  p_organization_ids uuid[],
  p_mode text
)
returns table (
  aircraft_id uuid,
  before_count integer,
  changed_count integer,
  after_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_aircraft public.aircraft%rowtype;
  v_aircraft_id uuid;
  v_organization_id uuid;
  v_organization_name text;
  v_aircraft_count integer;
  v_organization_count integer;
  v_changed integer;
  v_pair_changed integer;
  v_before integer;
  v_after integer;
begin
  if v_actor_id is null or not private.is_platform_admin(v_actor_id) then
    raise exception 'Platform administrator access is required.' using errcode = '42501';
  end if;
  if p_mode not in ('add', 'remove') then
    raise exception 'Bulk assignment mode must be add or remove.' using errcode = '22023';
  end if;
  if p_aircraft_ids is null or cardinality(p_aircraft_ids) = 0 then
    raise exception 'Select at least one aircraft.' using errcode = '22023';
  end if;
  if cardinality(p_aircraft_ids) > 200 then
    raise exception 'A maximum of 200 aircraft may be updated at once.' using errcode = '22023';
  end if;
  if p_organization_ids is null or cardinality(p_organization_ids) = 0 then
    raise exception 'Select at least one organization.' using errcode = '22023';
  end if;
  if array_position(p_aircraft_ids, null) is not null
    or array_position(p_organization_ids, null) is not null then
    raise exception 'Aircraft and organization IDs cannot be empty.' using errcode = '22023';
  end if;

  select count(distinct requested_id) into v_aircraft_count
  from unnest(p_aircraft_ids) requested(requested_id);
  if v_aircraft_count <> cardinality(p_aircraft_ids) then
    raise exception 'Duplicate aircraft IDs are not allowed.' using errcode = '22023';
  end if;

  select count(distinct requested_id) into v_organization_count
  from unnest(p_organization_ids) requested(requested_id);
  if v_organization_count <> cardinality(p_organization_ids) then
    raise exception 'Duplicate organization IDs are not allowed.' using errcode = '22023';
  end if;
  if (
    select count(*) from public.organizations
    where id = any(p_organization_ids)
  ) <> v_organization_count then
    raise exception 'One or more selected organizations no longer exist.' using errcode = '23503';
  end if;

  v_aircraft_count := 0;
  for v_aircraft in
    select aircraft.*
    from public.aircraft
    where aircraft.id = any(p_aircraft_ids)
    order by aircraft.id
    for update
  loop
    v_aircraft_count := v_aircraft_count + 1;
    if v_aircraft.visibility <> 'private'
      or v_aircraft.organization_id is not null
      or v_aircraft.owner_user_id is distinct from v_actor_id then
      raise exception 'Every selected aircraft must be a private aircraft owned by your account.'
        using errcode = '42501';
    end if;
  end loop;
  if v_aircraft_count <> cardinality(p_aircraft_ids) then
    raise exception 'One or more selected aircraft no longer exist.' using errcode = 'P0002';
  end if;

  foreach v_aircraft_id in array p_aircraft_ids loop
    select count(*) into v_before
    from public.aircraft_organization_assignments
    where public.aircraft_organization_assignments.aircraft_id = v_aircraft_id;
    v_changed := 0;

    foreach v_organization_id in array p_organization_ids loop
      select name into v_organization_name
      from public.organizations
      where id = v_organization_id;

      if p_mode = 'add' then
        insert into public.aircraft_organization_assignments (
          aircraft_id, organization_id, assigned_by
        ) values (
          v_aircraft_id, v_organization_id, v_actor_id
        ) on conflict on constraint aircraft_organization_assignments_pkey do nothing;
        get diagnostics v_pair_changed = row_count;
      else
        delete from public.aircraft_organization_assignments
        where public.aircraft_organization_assignments.aircraft_id = v_aircraft_id
          and public.aircraft_organization_assignments.organization_id = v_organization_id;
        get diagnostics v_pair_changed = row_count;
      end if;

      if v_pair_changed = 1 then
        insert into public.aircraft_organization_assignment_audit_logs (
          aircraft_id,
          aircraft_tail_number,
          organization_id,
          organization_name,
          actor_user_id,
          action
        )
        select
          aircraft.id,
          aircraft.tail_number,
          v_organization_id,
          v_organization_name,
          v_actor_id,
          case when p_mode = 'add' then 'assigned' else 'unassigned' end
        from public.aircraft
        where aircraft.id = v_aircraft_id;
        v_changed := v_changed + 1;
      end if;
    end loop;

    select count(*) into v_after
    from public.aircraft_organization_assignments
    where public.aircraft_organization_assignments.aircraft_id = v_aircraft_id;

    aircraft_id := v_aircraft_id;
    before_count := v_before;
    changed_count := v_changed;
    after_count := v_after;
    return next;
  end loop;
end;
$$;

revoke all on function public.bulk_update_platform_aircraft_organizations(uuid[], uuid[], text)
  from public, anon, authenticated;
grant execute on function public.bulk_update_platform_aircraft_organizations(uuid[], uuid[], text)
  to authenticated;

-- Tighten the existing single-aircraft replacement RPC to the same ownership rule.
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
  where public.aircraft.id = p_aircraft_id
  for update;
  if not found then
    raise exception 'Aircraft not found.' using errcode = 'P0002';
  end if;
  if v_aircraft.visibility <> 'private'
    or v_aircraft.organization_id is not null
    or v_aircraft.owner_user_id is distinct from v_actor_id then
    raise exception 'Only a private aircraft owned by your account can be assigned.'
      using errcode = '42501';
  end if;

  v_requested_count := cardinality(v_organization_ids);
  select count(*) into v_existing_count
  from public.organizations
  where id = any(v_organization_ids);
  if v_existing_count <> v_requested_count then
    raise exception 'One or more selected organizations no longer exist.' using errcode = '23503';
  end if;

  insert into public.aircraft_organization_assignment_audit_logs (
    aircraft_id, aircraft_tail_number, organization_id, organization_name, actor_user_id, action
  )
  select v_aircraft.id, v_aircraft.tail_number, assignments.organization_id,
    organizations.name, v_actor_id, 'unassigned'
  from public.aircraft_organization_assignments assignments
  join public.organizations on organizations.id = assignments.organization_id
  where assignments.aircraft_id = v_aircraft.id
    and not (assignments.organization_id = any(v_organization_ids));

  delete from public.aircraft_organization_assignments
  where aircraft_id = v_aircraft.id
    and not (organization_id = any(v_organization_ids));

  with inserted as (
    insert into public.aircraft_organization_assignments (aircraft_id, organization_id, assigned_by)
    select v_aircraft.id, organizations.id, v_actor_id
    from public.organizations
    where organizations.id = any(v_organization_ids)
    on conflict (aircraft_id, organization_id) do nothing
    returning organization_id
  )
  insert into public.aircraft_organization_assignment_audit_logs (
    aircraft_id, aircraft_tail_number, organization_id, organization_name, actor_user_id, action
  )
  select v_aircraft.id, v_aircraft.tail_number, inserted.organization_id,
    organizations.name, v_actor_id, 'assigned'
  from inserted
  join public.organizations on organizations.id = inserted.organization_id;

  return v_organization_ids;
end;
$$;

revoke all on function public.set_platform_aircraft_organizations(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.set_platform_aircraft_organizations(uuid, uuid[])
  to authenticated;

create or replace function public.list_aircraft_assignment_audit(
  p_organization_id uuid default null,
  p_limit integer default 100
)
returns table (
  id uuid,
  aircraft_id uuid,
  aircraft_tail_number text,
  organization_id uuid,
  organization_name text,
  actor_user_id uuid,
  action text,
  created_at timestamptz
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
  if p_limit < 1 or p_limit > 500 then
    raise exception 'Limit must be between 1 and 500.' using errcode = '22023';
  end if;
  if not private.is_platform_admin(auth.uid()) then
    if p_organization_id is null
      or not private.can_manage_organization(p_organization_id, auth.uid()) then
      raise exception 'Organization manager access is required.' using errcode = '42501';
    end if;
  end if;

  return query
  select logs.id, logs.aircraft_id, logs.aircraft_tail_number,
    logs.organization_id, logs.organization_name, logs.actor_user_id,
    logs.action, logs.created_at
  from public.aircraft_organization_assignment_audit_logs logs
  where p_organization_id is null or logs.organization_id = p_organization_id
  order by logs.created_at desc
  limit p_limit;
end;
$$;

revoke all on function public.list_aircraft_assignment_audit(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.list_aircraft_assignment_audit(uuid, integer)
  to authenticated;
