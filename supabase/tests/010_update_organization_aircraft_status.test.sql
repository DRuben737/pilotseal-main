begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

select has_function(
  'public',
  'update_organization_aircraft_status',
  array['uuid', 'uuid', 'text', 'text'],
  'dedicated aircraft status function exists'
);

insert into public.organization_aircraft_maintenance (
  aircraft_id,
  annual_due_date,
  current_meter_type,
  current_meter_value
)
values (
  '30000000-0000-4000-8000-000000000001',
  '2030-04-15',
  'hobbs',
  321.4
)
on conflict (aircraft_id) do update
set annual_due_date = excluded.annual_due_date,
    current_meter_type = excluded.current_meter_type,
    current_meter_value = excluded.current_meter_value;

select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles where email = 'pilot.one@example.test'),
  true
);
set local role authenticated;

select is(
  (select operational_status from public.update_organization_aircraft_status(
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'available',
    'Ready for dispatch'
  )),
  'available',
  'owner can mark aircraft available'
);

select is(
  (select operational_status from public.update_organization_aircraft_status(
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'away',
    'Cross-country flight'
  )),
  'away',
  'owner can mark aircraft away'
);

select is(
  (select operational_status from public.update_organization_aircraft_status(
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'in_maintenance',
    'Scheduled inspection'
  )),
  'in_maintenance',
  'owner can mark aircraft in maintenance'
);

select is(
  (select operational_status from public.update_organization_aircraft_status(
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'grounded',
    'Radio failure'
  )),
  'grounded',
  'owner can ground aircraft with a reason'
);

select is(
  (select operational_status_note from public.organization_aircraft_maintenance
    where aircraft_id = '30000000-0000-4000-8000-000000000001'),
  'Radio failure',
  'status note is saved'
);

select is(
  (select annual_due_date::text from public.organization_aircraft_maintenance
    where aircraft_id = '30000000-0000-4000-8000-000000000001'),
  '2030-04-15',
  'status update does not overwrite annual due date'
);

select is(
  (select current_meter_value from public.organization_aircraft_maintenance
    where aircraft_id = '30000000-0000-4000-8000-000000000001'),
  321.4::numeric,
  'status update does not overwrite meter value'
);

select throws_ok(
  $$select public.update_organization_aircraft_status(
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'grounded',
    'x'
  )$$,
  '22023',
  'Enter at least 3 characters explaining why this aircraft is grounded.',
  'grounded aircraft requires a useful reason'
);

select throws_ok(
  $$select public.update_organization_aircraft_status(
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'unknown',
    null
  )$$,
  '22023',
  'Choose a valid aircraft status.',
  'invalid status is rejected'
);

reset role;

insert into public.aircraft (
  id,
  model_id,
  tail_number,
  name,
  empty_weight,
  empty_arm,
  owner_user_id,
  visibility,
  created_by,
  updated_by
)
values (
  '30000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000001',
  'N001PS',
  'Assigned Local Trainer',
  1450,
  39.2,
  (select id from public.profiles where email = 'pilot.one@example.test'),
  'private',
  (select id from public.profiles where email = 'pilot.one@example.test'),
  (select id from public.profiles where email = 'pilot.one@example.test')
);

insert into public.aircraft_organization_assignments (
  aircraft_id,
  organization_id,
  assigned_by
)
values (
  '30000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  (select id from public.profiles where email = 'pilot.one@example.test')
);

select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles where email = 'pilot.one@example.test'),
  true
);
set local role authenticated;

select is(
  (select operational_status from public.update_organization_aircraft_status(
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000002',
    'away',
    'Assigned aircraft is away'
  )),
  'away',
  'organization owner can update an assigned aircraft'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles where email = 'instructor.one@example.test'),
  true
);
set local role authenticated;

select throws_ok(
  $$select public.update_organization_aircraft_status(
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'available',
    null
  )$$,
  '42501',
  'Only an organization Owner or Admin can change aircraft status.',
  'ordinary member cannot update aircraft status'
);

reset role;
set local role anon;

select throws_ok(
  $$select public.update_organization_aircraft_status(
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'available',
    null
  )$$,
  '42501',
  'permission denied for function update_organization_aircraft_status',
  'anonymous callers cannot execute the function'
);

reset role;

select is(
  (
    select count(*)::integer
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'update_organization_aircraft_status'
      and grantee = 'authenticated'
      and privilege_type = 'EXECUTE'
  ),
  1,
  'authenticated role has one explicit execute grant'
);

select * from finish();
rollback;
