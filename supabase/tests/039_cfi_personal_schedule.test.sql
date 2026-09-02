begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

select has_table('public', 'cfi_schedule_student_grants', 'schedule grants table exists');
select has_table('public', 'cfi_schedule_week_overrides', 'weekly overrides table exists');
select has_table('public', 'cfi_schedule_availability_override_dates', 'availability override dates table exists');
select has_table('public', 'cfi_schedule_availability_slots', 'availability slots table exists');
select has_table('public', 'cfi_schedule_unavailable_blocks', 'unavailable blocks table exists');
select has_table('public', 'cfi_schedule_events', 'schedule events table exists');
select has_column('public', 'dashboard_preferences', 'enabled_feature_ids', 'dashboard preferences store optional features');
select has_column('public', 'notification_preferences', 'schedule_notifications_enabled', 'schedule notifications have an independent preference');
select has_function('public', 'move_cfi_schedule_day', array['uuid', 'timestamp with time zone', 'timestamp with time zone', 'text', 'text', 'text'], 'day cascade RPC exists');
select is((select relrowsecurity from pg_class join pg_namespace on pg_namespace.oid = pg_class.relnamespace where pg_namespace.nspname = 'public' and pg_class.relname = 'cfi_schedule_student_grants'), true, 'schedule grants use RLS');
select is((select relrowsecurity from pg_class join pg_namespace on pg_namespace.oid = pg_class.relnamespace where pg_namespace.nspname = 'public' and pg_class.relname = 'cfi_schedule_events'), true, 'schedule events use RLS');

select set_config('pilotseal_test.cfi_id', (select id::text from public.profiles where email = 'pilot.one@example.test'), false);
select set_config('pilotseal_test.student_one_id', (select id::text from public.profiles where email = 'instructor.one@example.test'), false);
select set_config('pilotseal_test.student_two_id', (select id::text from public.profiles where email = 'platform.admin@example.test'), false);

insert into public.saved_people (id, user_id, role, display_name, cert_number)
values
  ('49000000-0000-4000-8000-000000000001', current_setting('pilotseal_test.cfi_id')::uuid, 'student', 'Schedule Student One', 'SCH-1'),
  ('49000000-0000-4000-8000-000000000002', current_setting('pilotseal_test.cfi_id')::uuid, 'student', 'Schedule Student Two', 'SCH-2');

insert into public.saved_person_account_links (saved_person_id, owner_user_id, linked_user_id)
values
  ('49000000-0000-4000-8000-000000000001', current_setting('pilotseal_test.cfi_id')::uuid, current_setting('pilotseal_test.student_one_id')::uuid),
  ('49000000-0000-4000-8000-000000000002', current_setting('pilotseal_test.cfi_id')::uuid, current_setting('pilotseal_test.student_two_id')::uuid);

select set_config('request.jwt.claim.sub', current_setting('pilotseal_test.cfi_id'), true);
set local role authenticated;

select lives_ok(
  $$insert into public.dashboard_preferences (user_id, quick_action_ids, enabled_feature_ids)
    values (auth.uid(), array['records'], array['cfi_schedule'])$$,
  'a user can enable the optional schedule feature'
);
select is((select enabled_feature_ids from public.dashboard_preferences where user_id = auth.uid()), array['cfi_schedule']::text[], 'enabled feature is persisted');

select lives_ok(
  $$insert into public.cfi_schedule_student_grants
    (cfi_user_id, saved_person_id, student_user_id, default_weekly_sessions, default_duration_min)
    values
    (auth.uid(), '49000000-0000-4000-8000-000000000001', current_setting('pilotseal_test.student_one_id')::uuid, 3, 120),
    (auth.uid(), '49000000-0000-4000-8000-000000000002', current_setting('pilotseal_test.student_two_id')::uuid, 2, 120)$$,
  'CFI can batch grant schedule access to linked students'
);
select is((select count(*) from public.cfi_schedule_student_grants), 2::bigint, 'CFI sees both schedule grants');
select is((select count(*) from public.list_my_cfi_schedule_access()), 2::bigint, 'CFI access RPC lists both students');

select lives_ok(
  $$insert into public.cfi_schedule_unavailable_blocks (cfi_user_id, start_at, end_at, note)
    values (auth.uid(), '2026-09-08 14:00:00+00', '2026-09-08 16:00:00+00', 'Aircraft unavailable')$$,
  'CFI can add an unavailable block'
);

select lives_ok(
  $$insert into public.cfi_schedule_events
    (cfi_user_id, student_user_id, lesson_kind, start_at, end_at, note)
    values
    (auth.uid(), current_setting('pilotseal_test.student_one_id')::uuid, 'flight', '2026-09-08 11:00:00+00', '2026-09-08 13:00:00+00', 'Own detail'),
    (auth.uid(), current_setting('pilotseal_test.student_two_id')::uuid, 'ground', '2026-09-09 11:00:00+00', '2026-09-09 13:00:00+00', 'Private detail')$$,
  'CFI can create non-overlapping lessons'
);
select throws_ok(
  $$insert into public.cfi_schedule_events
    (cfi_user_id, student_user_id, lesson_kind, start_at, end_at)
    values (current_setting('pilotseal_test.cfi_id')::uuid, current_setting('pilotseal_test.student_one_id')::uuid, 'flight', '2026-09-08 12:00:00+00', '2026-09-08 14:00:00+00')$$,
  '23P01',
  'This lesson overlaps another scheduled lesson.',
  'overlapping CFI lessons are rejected'
);
select lives_ok(
  $$insert into public.cfi_schedule_events
    (id, cfi_user_id, student_user_id, lesson_kind, start_at, end_at)
    values ('49000000-0000-4000-8000-000000000010', auth.uid(), current_setting('pilotseal_test.student_two_id')::uuid, 'flight', '2026-09-08 13:00:00+00', '2026-09-08 14:00:00+00')$$,
  'CFI can add a later lesson for cascade testing'
);
select is(
  public.move_cfi_schedule_day(
    (select id from public.cfi_schedule_events where student_user_id = current_setting('pilotseal_test.student_one_id')::uuid and start_at = '2026-09-08 11:00:00+00'),
    '2026-09-08 12:00:00+00',
    '2026-09-08 14:00:00+00',
    'flight',
    'Own detail',
    'UTC'
  ),
  2,
  'moving the first lesson pushes every later lesson that day'
);
select is(
  (select start_at from public.cfi_schedule_events where student_user_id = current_setting('pilotseal_test.student_one_id')::uuid and status = 'scheduled'),
  '2026-09-08 12:00:00+00'::timestamptz,
  'the first lesson moves to its requested time'
);
select is(
  (select start_at from public.cfi_schedule_events where id = '49000000-0000-4000-8000-000000000010'),
  '2026-09-08 14:00:00+00'::timestamptz,
  'the later lesson keeps its spacing and moves by the same amount'
);
delete from public.cfi_schedule_events where id = '49000000-0000-4000-8000-000000000010';
reset role;
select is((select count(*) from public.notifications where kind = 'schedule'), 3::bigint, 'lesson creation notifies only the affected students');

select set_config('request.jwt.claim.sub', current_setting('pilotseal_test.student_one_id'), true);
set local role authenticated;

select is((select count(*) from public.cfi_schedule_student_grants), 1::bigint, 'student sees only their own access grant');
select is((select caller_role from public.list_my_cfi_schedule_access() limit 1), 'student', 'student access context is identified');
select lives_ok(
  $$insert into public.cfi_schedule_availability_slots
    (cfi_user_id, student_user_id, scope, weekday, start_minute, end_minute, timezone)
    values (current_setting('pilotseal_test.cfi_id')::uuid, auth.uid(), 'weekly', 2, 420, 720, 'America/New_York')$$,
  'student can save a weekly availability period'
);
select throws_ok(
  $$insert into public.cfi_schedule_availability_slots
    (cfi_user_id, student_user_id, scope, weekday, start_minute, end_minute, timezone)
    values (current_setting('pilotseal_test.cfi_id')::uuid, auth.uid(), 'weekly', 3, 480, 540, 'America/New_York')$$,
  '23514',
  null,
  'availability shorter than two hours is rejected'
);
select lives_ok(
  $$insert into public.cfi_schedule_availability_override_dates
    (cfi_user_id, student_user_id, availability_date, timezone)
    values (current_setting('pilotseal_test.cfi_id')::uuid, auth.uid(), '2026-09-10', 'America/New_York')$$,
  'student can mark a date as an override even with no available periods'
);
select throws_ok(
  $$insert into public.cfi_schedule_events
    (cfi_user_id, student_user_id, lesson_kind, start_at, end_at)
    values (current_setting('pilotseal_test.cfi_id')::uuid, auth.uid(), 'flight', '2026-09-10 11:00:00+00', '2026-09-10 13:00:00+00')$$,
  '42501',
  null,
  'student cannot create a lesson'
);
select is((select count(*) from public.cfi_schedule_unavailable_blocks), 0::bigint, 'student cannot query CFI block rows directly');
select is(
  (select count(*) from public.list_cfi_schedule_entries(current_setting('pilotseal_test.cfi_id')::uuid, '2026-09-08 00:00:00+00', '2026-09-10 00:00:00+00')),
  3::bigint,
  'student privacy schedule includes own lesson, redacted busy lesson, and block'
);
select is(
  (select count(*) from public.list_cfi_schedule_entries(current_setting('pilotseal_test.cfi_id')::uuid, '2026-09-08 00:00:00+00', '2026-09-10 00:00:00+00') where student_name = 'Schedule Student One'),
  1::bigint,
  'student sees details for only their own lesson'
);
select is(
  (select count(*) from public.list_cfi_schedule_entries(current_setting('pilotseal_test.cfi_id')::uuid, '2026-09-08 00:00:00+00', '2026-09-10 00:00:00+00') where entry_type = 'unavailable'),
  2::bigint,
  'other lessons and CFI blocks are both redacted as unavailable'
);

select * from finish();
rollback;
