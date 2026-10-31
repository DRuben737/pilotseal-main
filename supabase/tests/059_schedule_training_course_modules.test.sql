begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table(
  'public',
  'cfi_schedule_event_course_modules',
  'account-backed schedule course modules exist'
);
select has_table(
  'private',
  'cfi_person_event_course_modules',
  'People-backed schedule course modules exist'
);
select has_function(
  'public',
  'list_my_schedule_training_courses',
  array[]::text[],
  'instructors can load assigned course modules for Schedule'
);
select has_function(
  'public',
  'publish_cfi_schedule_draft_v4',
  array['bigint', 'uuid', 'jsonb'],
  'Schedule publishing accepts course modules'
);
select has_function(
  'public',
  'list_my_schedule_training_course_modules',
  array['timestamp with time zone', 'timestamp with time zone', 'uuid'],
  'lesson course module snapshots can be loaded'
);

select set_config(
  'schedule_course.cfi',
  (select id::text from public.profiles where email = 'instructor.one@example.test'),
  true
);
select set_config(
  'schedule_course.student',
  (select id::text from public.profiles where email = 'pilot.one@example.test'),
  true
);
select set_config(
  'schedule_course.admin',
  (select id::text from public.profiles where email = 'platform.admin@example.test'),
  true
);
select set_config(
  'schedule_course.organization',
  '10000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'schedule_course.aircraft',
  '30000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'schedule_course.course',
  (
    select id::text
    from public.training_courses
    where stable_key = 'usats.instrument-rating-airplane-single-engine-land.rev-0'
  ),
  true
);
select set_config(
  'schedule_course.module',
  (
    select module.id::text
    from public.training_course_modules module
    where module.course_id = current_setting('schedule_course.course')::uuid
      and module.module_number = 8
  ),
  true
);

insert into public.organization_members (
  organization_id,
  user_id,
  role,
  teaching_role,
  added_by
) values
  (
    current_setting('schedule_course.organization')::uuid,
    current_setting('schedule_course.cfi')::uuid,
    'member',
    'instructor',
    current_setting('schedule_course.admin')::uuid
  ),
  (
    current_setting('schedule_course.organization')::uuid,
    current_setting('schedule_course.student')::uuid,
    'member',
    'student',
    current_setting('schedule_course.admin')::uuid
  )
on conflict (organization_id, user_id) do update
set role = excluded.role,
    teaching_role = excluded.teaching_role;

insert into public.organization_training_courses (organization_id, course_id)
values (
  current_setting('schedule_course.organization')::uuid,
  current_setting('schedule_course.course')::uuid
)
on conflict (organization_id, course_id) do update set enabled = true;

insert into public.saved_people (id, user_id, role, display_name, cert_number)
values (
  '59000000-0000-4000-8000-000000000001',
  current_setting('schedule_course.cfi')::uuid,
  'student',
  'USATS Schedule Student',
  'USATS-SCHEDULE-1'
);

insert into public.saved_person_account_links (
  saved_person_id,
  owner_user_id,
  linked_user_id
) values (
  '59000000-0000-4000-8000-000000000001',
  current_setting('schedule_course.cfi')::uuid,
  current_setting('schedule_course.student')::uuid
);

insert into public.cfi_schedule_student_grants (
  cfi_user_id,
  saved_person_id,
  student_user_id
) values (
  current_setting('schedule_course.cfi')::uuid,
  '59000000-0000-4000-8000-000000000001',
  current_setting('schedule_course.student')::uuid
);

select set_config(
  'request.jwt.claim.sub',
  current_setting('schedule_course.cfi'),
  true
);
set local role authenticated;

select is(
  jsonb_array_length(public.list_my_schedule_training_courses()),
  1,
  'the organization instructor sees the assigned USATS course'
);
select is(
  jsonb_array_length(
    public.list_my_schedule_training_courses()->0->'modules'
  ),
  33,
  'the Schedule picker receives all 33 modules'
);

select set_config(
  'schedule_course.revision',
  public.get_cfi_schedule_snapshot_v2(
    '2026-10-25',
    '2026-10-27'
  )->>'revision',
  true
);

select lives_ok(
  $$
    select public.publish_cfi_schedule_draft_v4(
      current_setting('schedule_course.revision')::bigint,
      '59000000-0000-4000-8000-000000000010',
      jsonb_build_array(
        jsonb_build_object(
          'id', '59000000-0000-4000-8000-000000000011',
          'student_user_id', current_setting('schedule_course.student'),
          'lesson_kind', 'flight',
          'aircraft_id', current_setting('schedule_course.aircraft'),
          'assigned_instructor_user_id', current_setting('schedule_course.cfi'),
          'start_at', '2026-10-26T15:00:00Z',
          'end_at', '2026-10-26T17:00:00Z',
          'note', '',
          'status', 'scheduled',
          'training_subjects', '[]'::jsonb,
          'training_course_modules', jsonb_build_array(
            jsonb_build_object(
              'course_module_id', current_setting('schedule_course.module'),
              'organization_id', current_setting('schedule_course.organization'),
              'position', 0,
              'personal_note', 'Practice both independent tracking items.'
            )
          )
        )
      )
    )
  $$,
  'the instructor publishes a lesson with a USATS course module'
);

select is(
  (
    select module_snapshot->'module'->>'module_number'
    from public.cfi_schedule_event_course_modules
    where event_id = '59000000-0000-4000-8000-000000000011'
  ),
  '8',
  'publishing pins the selected module number'
);
select is(
  (
    select jsonb_array_length(module_snapshot->'module'->'line_items')
    from public.cfi_schedule_event_course_modules
    where event_id = '59000000-0000-4000-8000-000000000011'
  ),
  11,
  'publishing pins every scored Module 8 line item'
);
select results_eq(
  $$
    select
      line_item->>'text',
      (line_item->>'minimum_score')::integer
    from public.cfi_schedule_event_course_modules link,
      jsonb_array_elements(link.module_snapshot->'module'->'line_items') line_item
    where link.event_id = '59000000-0000-4000-8000-000000000011'
      and (line_item->>'position')::integer in (7, 8)
    order by (line_item->>'position')::integer
  $$,
  $$ values
    ('Intercepting and Tracking Satellite Based Navigational Systems'::text, 3),
    ('Intercepting and Tracking Arcs'::text, 3)
  $$,
  'the scheduled snapshot preserves the two independent scored items'
);
select is(
  (
    select item->>'personal_note'
    from jsonb_array_elements(
      public.list_my_schedule_training_course_modules(
        '2026-10-25',
        '2026-10-27',
        current_setting('schedule_course.cfi')::uuid
      )
    ) item
    limit 1
  ),
  'Practice both independent tracking items.',
  'the lesson reloads its saved course module note'
);

select set_config(
  'schedule_course.revision',
  public.get_cfi_schedule_snapshot_v2(
    '2026-10-25',
    '2026-10-27'
  )->>'revision',
  true
);
select lives_ok(
  $$
    select public.publish_cfi_schedule_draft_v4(
      current_setting('schedule_course.revision')::bigint,
      '59000000-0000-4000-8000-000000000012',
      jsonb_build_array(
        jsonb_build_object(
          'id', '59000000-0000-4000-8000-000000000011',
          'student_user_id', current_setting('schedule_course.student'),
          'lesson_kind', 'flight',
          'aircraft_id', current_setting('schedule_course.aircraft'),
          'assigned_instructor_user_id', current_setting('schedule_course.cfi'),
          'start_at', '2026-10-26T15:00:00Z',
          'end_at', '2026-10-26T17:00:00Z',
          'note', '',
          'status', 'cancelled',
          'training_subjects', '[]'::jsonb,
          'training_course_modules', jsonb_build_array(
            jsonb_build_object(
              'course_module_id', current_setting('schedule_course.module'),
              'organization_id', current_setting('schedule_course.organization'),
              'position', 0,
              'personal_note', ''
            )
          )
        )
      )
    )
  $$,
  'cancelling the lesson clears the scheduled module link'
);
select is(
  (
    select count(*)::integer
    from public.cfi_schedule_event_course_modules
    where event_id = '59000000-0000-4000-8000-000000000011'
  ),
  0,
  'cancelled lessons do not retain active module links'
);

select * from finish();
rollback;
