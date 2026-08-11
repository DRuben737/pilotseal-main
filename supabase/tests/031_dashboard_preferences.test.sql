begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

select has_table(
  'public',
  'dashboard_preferences',
  'dashboard preferences table exists'
);

select is(
  (
    select relrowsecurity
    from pg_class
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname = 'dashboard_preferences'
  ),
  true,
  'dashboard preferences use RLS'
);

select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles where email = 'pilot.one@example.test'),
  true
);
set local role authenticated;

select lives_ok(
  format(
    'insert into public.dashboard_preferences (user_id, quick_action_ids) values (%L, array[''records'', ''notifications''])',
    (select id::text from public.profiles where email = 'pilot.one@example.test')
  ),
  'first user can save their dashboard preferences'
);

select is(
  (select count(*) from public.dashboard_preferences),
  1::bigint,
  'first user sees their own dashboard preferences'
);

select is(
  (select quick_action_ids from public.dashboard_preferences limit 1),
  array['records', 'notifications']::text[],
  'first user reads their selected quick actions'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles where email = 'instructor.one@example.test'),
  true
);
set local role authenticated;

select is(
  (select count(*) from public.dashboard_preferences),
  0::bigint,
  'second user cannot see the first user dashboard preferences'
);

select lives_ok(
  format(
    'insert into public.dashboard_preferences (user_id, quick_action_ids) values (%L, array[''flight_brief''])',
    (select id::text from public.profiles where email = 'instructor.one@example.test')
  ),
  'second user can independently save dashboard preferences'
);

reset role;

select is(
  (select count(*) from public.dashboard_preferences),
  2::bigint,
  'dashboard preferences are stored independently for both users'
);

select * from finish();
rollback;
