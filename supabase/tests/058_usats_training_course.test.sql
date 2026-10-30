begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public', 'training_courses', 'training course catalog exists');
select has_table('public', 'training_course_modules', 'course modules exist');
select has_table('public', 'training_module_line_items', 'module line items exist');
select has_table('public', 'organization_training_courses', 'organization course assignments exist');
select has_function(
  'public',
  'list_organization_training_courses',
  array['uuid'],
  'organization members can load assigned courses'
);

select is(
  (select count(*)::integer
   from public.training_courses
   where stable_key = 'usats.instrument-rating-airplane-single-engine-land.rev-0'),
  1,
  'the USATS Instrument Rating course is seeded once'
);

select is(
  (select count(*)::integer
   from public.training_course_modules module
   join public.training_courses course on course.id = module.course_id
   where course.stable_key = 'usats.instrument-rating-airplane-single-engine-land.rev-0'),
  33,
  'the course preserves all 33 modules'
);

select is(
  (select count(*)::integer
   from public.training_module_line_items item
   join public.training_course_modules module on module.id = item.module_id
   join public.training_courses course on course.id = module.course_id
   where course.stable_key = 'usats.instrument-rating-airplane-single-engine-land.rev-0'),
  350,
  'the course preserves all 350 scored line items'
);

select is(
  (select stage_number::integer
   from public.training_course_modules module
   join public.training_courses course on course.id = module.course_id
   where course.stable_key = 'usats.instrument-rating-airplane-single-engine-land.rev-0'
     and module.module_number = 9),
  1,
  'Module 9 remains in Stage 1'
);

select is(
  (select stage_number::integer
   from public.training_course_modules module
   join public.training_courses course on course.id = module.course_id
   where course.stable_key = 'usats.instrument-rating-airplane-single-engine-land.rev-0'
     and module.module_number = 10),
  2,
  'Module 10 begins Stage 2'
);

select results_eq(
  $$
    select item.position::integer, item.item_text, item.minimum_score::integer
    from public.training_module_line_items item
    join public.training_course_modules module on module.id = item.module_id
    join public.training_courses course on course.id = module.course_id
    where course.stable_key = 'usats.instrument-rating-airplane-single-engine-land.rev-0'
      and module.module_number = 8
      and item.position in (7, 8)
    order by item.position
  $$,
  $$ values
    (7, 'Intercepting and Tracking Satellite Based Navigational Systems'::text, 3),
    (8, 'Intercepting and Tracking Arcs'::text, 3)
  $$,
  'Module 8 keeps satellite tracking and arc tracking as separate scored items'
);

insert into public.organization_training_courses (organization_id, course_id)
select
  '10000000-0000-4000-8000-000000000001'::uuid,
  course.id
from public.training_courses course
where course.stable_key = 'usats.instrument-rating-airplane-single-engine-land.rev-0'
on conflict (organization_id, course_id) do update set enabled = true;

select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles where email = 'pilot.one@example.test'),
  true
);
set local role authenticated;

select is(
  jsonb_array_length(public.list_organization_training_courses(
    '10000000-0000-4000-8000-000000000001'
  )),
  1,
  'an organization member can load the assigned course'
);

select is(
  jsonb_array_length(
    public.list_organization_training_courses(
      '10000000-0000-4000-8000-000000000001'
    )->0->'modules'
  ),
  33,
  'the organization course response contains every module'
);

select is(
  jsonb_array_length(
    (
      select module
      from jsonb_array_elements(
        public.list_organization_training_courses(
          '10000000-0000-4000-8000-000000000001'
        )->0->'modules'
      ) module
      where module->>'module_number' = '8'
    )->'line_items'
  ),
  11,
  'the organization course response contains both separate Module 8 items'
);

select throws_ok(
  $$ select count(*) from public.training_courses $$,
  '42501',
  'permission denied for table training_courses',
  'course tables are not directly exposed to authenticated clients'
);

select * from finish();
rollback;
