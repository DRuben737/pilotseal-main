begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

-- Isolate this test from local records created through the browser.
delete from public.training_records;

select has_table('public', 'training_records', 'training records table exists');
select has_function(
  'public',
  'list_my_training_records',
  array[]::text[],
  'training records can be listed through the protected API'
);
select has_function(
  'public',
  'save_my_training_record',
  array['jsonb'],
  'instructors can save a scored training record'
);
select has_function(
  'public',
  'list_training_record_instructors',
  array['uuid'],
  'organization instructors can be selected for a record'
);
select has_function(
  'public',
  'list_organization_training_records',
  array['uuid'],
  'organization managers can list organization training records'
);
select has_function(
  'public',
  'delete_my_training_record',
  array['uuid'],
  'instructors can delete their training record'
);

select set_config(
  'training_record.cfi',
  (select id::text from public.profiles where email = 'cfi@example.test'),
  true
);
select set_config(
  'training_record.student',
  (select id::text from public.profiles where email = 'pilot.one@example.test'),
  true
);
select set_config('training_record.organization', '10000000-0000-4000-8000-000000000001', true);
select set_config(
  'training_record.admin',
  (select id::text from public.profiles where email = 'platform.admin@example.test'),
  true
);
select set_config(
  'training_record.course',
  (select id::text from public.training_courses where stable_key = 'usats.instrument-rating-airplane-single-engine-land.rev-0'),
  true
);
select set_config(
  'training_record.module',
  (
    select module.id::text
    from public.training_course_modules module
    where module.course_id = current_setting('training_record.course')::uuid
      and module.module_number = 1
  ),
  true
);
select set_config(
  'training_record.scores',
  (
    select jsonb_agg(jsonb_build_object(
      'line_item_id', item.id,
      'score', 4,
      'note', ''
    ))::text
    from public.training_module_line_items item
    where item.module_id = current_setting('training_record.module')::uuid
  ),
  true
);

insert into public.organization_members (
  organization_id, user_id, role, teaching_role, added_by
) values
  (
    current_setting('training_record.organization')::uuid,
    current_setting('training_record.cfi')::uuid,
    'member', 'instructor', current_setting('training_record.admin')::uuid
  ),
  (
    current_setting('training_record.organization')::uuid,
    current_setting('training_record.student')::uuid,
    'member', 'student', current_setting('training_record.admin')::uuid
  ),
  (
    current_setting('training_record.organization')::uuid,
    current_setting('training_record.admin')::uuid,
    'organization_admin', null, current_setting('training_record.admin')::uuid
  )
on conflict (organization_id, user_id) do update
set role = excluded.role, teaching_role = excluded.teaching_role;

insert into public.organization_training_courses (organization_id, course_id)
values (
  current_setting('training_record.organization')::uuid,
  current_setting('training_record.course')::uuid
)
on conflict (organization_id, course_id) do update set enabled = true;

insert into public.saved_people (id, user_id, role, display_name, cert_number)
values (
  '61000000-0000-4000-8000-000000000001',
  current_setting('training_record.cfi')::uuid,
  'student',
  'Training Record Student',
  'TR-TEST-1'
);

insert into public.saved_person_account_links (
  saved_person_id, owner_user_id, linked_user_id
) values (
  '61000000-0000-4000-8000-000000000001',
  current_setting('training_record.cfi')::uuid,
  current_setting('training_record.student')::uuid
);

select set_config('request.jwt.claim.sub', current_setting('training_record.cfi'), true);
set local role authenticated;

select lives_ok(
  $$
    select public.save_my_training_record(jsonb_build_object(
      'organization_id', current_setting('training_record.organization'),
      'instructor_user_id', current_setting('training_record.cfi'),
      'student_person_id', '61000000-0000-4000-8000-000000000001',
      'course_id', current_setting('training_record.course'),
      'course_module_id', current_setting('training_record.module'),
      'lesson_date', '2026-11-05',
      'aircraft_type', 'C172S',
      'aircraft_tail_number', 'N000PS',
      'category_sel', 1.2,
      'time_dual', 1.2,
      'condition_day', 1.2,
      'flight_duration', 1.2,
      'route_from', 'KISP',
      'route_to', 'KISP',
      'final_status', 'completed',
      'scores', current_setting('training_record.scores')::jsonb
    ))
  $$,
  'the assigned instructor saves a fully scored module'
);

select is(
  (public.list_my_training_records()->0->>'record_status'),
  'completed',
  'all required scores complete the record'
);
select is(
  (public.list_my_training_records()->0->>'final_status'),
  'completed',
  'the printed final status is stored explicitly'
);
select is(
  (public.list_my_training_records()->0->>'passed')::boolean,
  true,
  'scores at the TCO minimum mark the record satisfactory'
);
select is(
  public.list_my_training_records()->0->>'aircraft_type',
  'Ground',
  'oral and ground modules print Ground as the type'
);
select is(
  public.list_my_training_records()->0->>'aircraft_tail_number',
  'CLASSROOM',
  'oral and ground modules print CLASSROOM as the tail number'
);
select is(
  (public.list_my_training_records()->0->>'category_sel')::numeric,
  1.2::numeric,
  'SEL stores time instead of a selected flag'
);
select is(
  jsonb_array_length(public.list_my_training_records()->0->'scores'),
  4,
  'the saved record contains a snapshot of every Module 1 line item'
);

select set_config('request.jwt.claim.sub', current_setting('training_record.student'), true);

select is(
  jsonb_array_length(public.list_my_training_records()),
  1,
  'the linked student can read the completed record'
);

select throws_ok(
  $$ select public.list_organization_training_records(current_setting('training_record.organization')::uuid) $$,
  '42501',
  'Only an organization Owner or Admin can view all training records.',
  'a student cannot list all organization training records'
);

select set_config('request.jwt.claim.sub', current_setting('training_record.admin'), true);

select is(
  jsonb_array_length(
    public.list_organization_training_records(
      current_setting('training_record.organization')::uuid
    )
  ),
  1,
  'an organization admin can see the instructor-created training record'
);

select is(
  public.list_organization_training_records(
    current_setting('training_record.organization')::uuid
  )->0->>'student_name',
  'Training Record Student',
  'the organization list returns the student record snapshot'
);

select throws_ok(
  $$ select count(*) from public.training_records $$,
  '42501',
  'permission denied for table training_records',
  'authenticated clients cannot query the record table directly'
);

select * from finish();
rollback;
