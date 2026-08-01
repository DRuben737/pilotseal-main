begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

select has_table(
  'public',
  'personal_aircraft_inspections',
  'personal aircraft inspections table exists'
);

select has_function(
  'public',
  'save_personal_aircraft_inspections',
  array['uuid', 'jsonb'],
  'personal aircraft inspection save function exists'
);

select is(
  (
    select relrowsecurity
    from pg_class
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname = 'personal_aircraft_inspections'
  ),
  true,
  'personal aircraft inspections use RLS'
);

insert into public.saved_aircraft (user_id, aircraft_id)
values (
  (select id from public.profiles where email = 'pilot.one@example.test'),
  '30000000-0000-4000-8000-000000000001'
)
on conflict (user_id, aircraft_id) do nothing;

select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles where email = 'pilot.one@example.test'),
  true
);
set local role authenticated;

select lives_ok(
  $$select public.save_personal_aircraft_inspections(
    '30000000-0000-4000-8000-000000000001',
    '[
      {"name":"Registration","basis":"calendar","date_precision":"month","due_date":"2030-06-30","due_meter":null,"notes":"Renewal"},
      {"name":"50-hour inspection","basis":"tach","date_precision":"day","due_date":null,"due_meter":450.5,"notes":""}
    ]'::jsonb
  )$$,
  'owner can save calendar and meter inspections'
);

select is(
  (select count(*) from public.personal_aircraft_inspections),
  2::bigint,
  'both personal inspection items are saved'
);

select is(
  (
    select due_date::text
    from public.personal_aircraft_inspections
    where name = 'Registration'
  ),
  '2030-06-30',
  'registration stores the supplied month-end date'
);

select is(
  (
    select date_precision
    from public.personal_aircraft_inspections
    where name = 'Registration'
  ),
  'month',
  'registration remembers that the UI only requires month and year'
);

select is(
  (
    select due_meter
    from public.personal_aircraft_inspections
    where name = '50-hour inspection'
  ),
  450.5::numeric,
  'meter-based inspection stores its due reading'
);

select lives_ok(
  $$select public.save_personal_aircraft_inspections(
    '30000000-0000-4000-8000-000000000001',
    '[{"name":"Registration","basis":"calendar","date_precision":"month","due_date":"2031-07-31","due_meter":null,"notes":"Updated"}]'::jsonb
  )$$,
  'saving again replaces the personal inspection worksheet'
);

select is(
  (select count(*) from public.personal_aircraft_inspections),
  1::bigint,
  'removed worksheet rows are deleted'
);

select is(
  (select due_date::text from public.personal_aircraft_inspections),
  '2031-07-31',
  'updated registration due date is returned'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles where email = 'instructor.one@example.test'),
  true
);
set local role authenticated;

select is(
  (select count(*) from public.personal_aircraft_inspections),
  0::bigint,
  'another user cannot read personal inspection items'
);

select throws_ok(
  $$select public.save_personal_aircraft_inspections(
    '30000000-0000-4000-8000-000000000001',
    '[]'::jsonb
  )$$,
  '42501',
  'Aircraft is not saved to this account.',
  'another user cannot replace personal inspection items'
);

reset role;
set local role anon;

select throws_ok(
  $$select public.save_personal_aircraft_inspections(
    '30000000-0000-4000-8000-000000000001',
    '[]'::jsonb
  )$$,
  '42501',
  'permission denied for function save_personal_aircraft_inspections',
  'anonymous callers cannot execute the save function'
);

select * from finish();
rollback;
