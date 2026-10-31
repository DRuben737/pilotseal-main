begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select is(
  (select is_nullable from information_schema.columns
   where table_schema = 'public'
     and table_name = 'training_module_line_items'
     and column_name = 'minimum_score'),
  'YES',
  'a source line item may omit its minimum score'
);

select is(
  (select is_nullable from information_schema.columns
   where table_schema = 'public'
     and table_name = 'training_course_modules'
     and column_name = 'duration_hours'),
  'YES',
  'a source module may provide a duration range instead of one numeric duration'
);

select results_eq(
  $$
    select course.stable_key, count(module.id)::integer
    from public.training_courses course
    join public.training_course_modules module on module.course_id = course.id
    where course.stable_key in (
      'usats.instrument-rating-airplane-single-engine-land.ground.rev-0',
      'usats.commercial-pilot-airplane-single-engine-land.ground.rev-0',
      'usats.commercial-pilot-airplane-single-engine-land.flight.rev-0'
    )
    group by course.stable_key
    order by course.stable_key
  $$,
  $$ values
    ('usats.commercial-pilot-airplane-single-engine-land.flight.rev-0'::text, 43),
    ('usats.commercial-pilot-airplane-single-engine-land.ground.rev-0'::text, 18),
    ('usats.instrument-rating-airplane-single-engine-land.ground.rev-0'::text, 13)
  $$,
  'IR Ground and both CPL tracks preserve every source module'
);

select results_eq(
  $$
    select course.stable_key, module.module_number::integer, module.stage_number::integer
    from public.training_course_modules module
    join public.training_courses course on course.id = module.course_id
    where (course.stable_key, module.module_number) in (
      ('usats.instrument-rating-airplane-single-engine-land.ground.rev-0', 6),
      ('usats.instrument-rating-airplane-single-engine-land.ground.rev-0', 7),
      ('usats.commercial-pilot-airplane-single-engine-land.ground.rev-0', 6),
      ('usats.commercial-pilot-airplane-single-engine-land.ground.rev-0', 7),
      ('usats.commercial-pilot-airplane-single-engine-land.ground.rev-0', 12),
      ('usats.commercial-pilot-airplane-single-engine-land.ground.rev-0', 13),
      ('usats.commercial-pilot-airplane-single-engine-land.flight.rev-0', 13),
      ('usats.commercial-pilot-airplane-single-engine-land.flight.rev-0', 14),
      ('usats.commercial-pilot-airplane-single-engine-land.flight.rev-0', 25),
      ('usats.commercial-pilot-airplane-single-engine-land.flight.rev-0', 26)
    )
    order by course.stable_key, module.module_number
  $$,
  $$ values
    ('usats.commercial-pilot-airplane-single-engine-land.flight.rev-0'::text, 13, 1),
    ('usats.commercial-pilot-airplane-single-engine-land.flight.rev-0'::text, 14, 2),
    ('usats.commercial-pilot-airplane-single-engine-land.flight.rev-0'::text, 25, 2),
    ('usats.commercial-pilot-airplane-single-engine-land.flight.rev-0'::text, 26, 3),
    ('usats.commercial-pilot-airplane-single-engine-land.ground.rev-0'::text, 6, 1),
    ('usats.commercial-pilot-airplane-single-engine-land.ground.rev-0'::text, 7, 2),
    ('usats.commercial-pilot-airplane-single-engine-land.ground.rev-0'::text, 12, 2),
    ('usats.commercial-pilot-airplane-single-engine-land.ground.rev-0'::text, 13, 3),
    ('usats.instrument-rating-airplane-single-engine-land.ground.rev-0'::text, 6, 1),
    ('usats.instrument-rating-airplane-single-engine-land.ground.rev-0'::text, 7, 2)
  $$,
  'Stage remains the hierarchy inside each IR or CPL track'
);

select is(
  (select count(*)::integer
   from public.training_module_line_items item
   join public.training_course_modules module on module.id = item.module_id
   join public.training_courses course on course.id = module.course_id
   where course.stable_key = 'usats.commercial-pilot-airplane-single-engine-land.flight.rev-0'),
  542,
  'CPL Flight preserves every line item'
);

select results_eq(
  $$
    select item.item_text, item.minimum_score::integer
    from public.training_module_line_items item
    join public.training_course_modules module on module.id = item.module_id
    join public.training_courses course on course.id = module.course_id
    where course.stable_key = 'usats.commercial-pilot-airplane-single-engine-land.flight.rev-0'
      and module.module_number = 2
      and item.position = 3
  $$,
  $$ values ('Airport Operation'::text, null::integer) $$,
  'CPL Module 2 preserves the source line item with no printed score'
);

select results_eq(
  $$
    select module.module_number::integer, item.item_text, item.minimum_score::integer
    from public.training_module_line_items item
    join public.training_course_modules module on module.id = item.module_id
    join public.training_courses course on course.id = module.course_id
    where course.stable_key = 'usats.commercial-pilot-airplane-single-engine-land.flight.rev-0'
      and module.module_number between 6 and 8
    order by module.module_number, item.position
  $$,
  $$ values
    (6, 'Solo Cross Country'::text, null::integer),
    (7, 'Solo Cross Country'::text, null::integer),
    (8, 'Solo Cross Country'::text, null::integer)
  $$,
  'the grouped Module 6-8 source entry expands without inventing scores'
);

select results_eq(
  $$
    select module.module_number::integer, module.duration_label, module.duration_hours
    from public.training_course_modules module
    join public.training_courses course on course.id = module.course_id
    where course.stable_key = 'usats.commercial-pilot-airplane-single-engine-land.flight.rev-0'
      and module.module_number in (33, 38)
    order by module.module_number
  $$,
  $$ values
    (33, '3.5-5.0 hours each'::text, null::numeric),
    (38, '3.5-5.0 hours each'::text, null::numeric)
  $$,
  'the grouped Module 33-38 duration range is preserved without inventing a single duration'
);

select ok(
  (select module.study_material like 'I. Pitot Static System%'
   from public.training_course_modules module
   join public.training_courses course on course.id = module.course_id
   where course.stable_key = 'usats.instrument-rating-airplane-single-engine-land.ground.rev-0'
     and module.module_number = 1),
  'IR Ground keeps the source Content outline'
);

select is(
  (select count(*)::integer
   from public.training_module_line_items item
   join public.training_course_modules module on module.id = item.module_id
   join public.training_courses course on course.id = module.course_id
   where course.stable_key in (
     'usats.instrument-rating-airplane-single-engine-land.ground.rev-0',
     'usats.commercial-pilot-airplane-single-engine-land.ground.rev-0'
   )),
  0,
  'Ground theory uses source Content and does not invent scored line items'
);

select * from finish();
rollback;
