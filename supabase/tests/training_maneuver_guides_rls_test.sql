begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public', 'organization_training_maneuver_guides', 'organization SOPM maneuver guides exist');
select has_table('public', 'instructor_training_maneuver_overrides', 'instructor maneuver overrides exist');
select has_function('private', 'can_read_organization_training_maneuver', array['uuid','uuid'], 'organization maneuver access helper exists');
select has_function('private', 'can_read_instructor_training_maneuver', array['uuid','uuid','uuid'], 'instructor maneuver access helper exists');

select set_config('maneuver_guide.cfi',(select id::text from public.profiles where email='instructor.one@example.test'),true);
select set_config('maneuver_guide.student',(select id::text from public.profiles where email='pilot.one@example.test'),true);
select set_config('maneuver_guide.admin',(select id::text from public.profiles where email='platform.admin@example.test'),true);
select set_config('maneuver_guide.organization','10000000-0000-4000-8000-000000000001',true);
select set_config('maneuver_guide.subject',(select id::text from public.training_subjects where stable_key='pvt.pa-v-b'),true);

insert into public.organization_members(organization_id,user_id,role,teaching_role,added_by)
values
  (current_setting('maneuver_guide.organization')::uuid,current_setting('maneuver_guide.admin')::uuid,'organization_admin','instructor',current_setting('maneuver_guide.admin')::uuid),
  (current_setting('maneuver_guide.organization')::uuid,current_setting('maneuver_guide.cfi')::uuid,'member','instructor',current_setting('maneuver_guide.admin')::uuid),
  (current_setting('maneuver_guide.organization')::uuid,current_setting('maneuver_guide.student')::uuid,'member','student',current_setting('maneuver_guide.admin')::uuid)
on conflict(organization_id,user_id) do update
set role=excluded.role, teaching_role=excluded.teaching_role;

select set_config('request.jwt.claim.sub',current_setting('maneuver_guide.admin'),true);
set local role authenticated;

select lives_ok($$
  insert into public.organization_training_maneuver_guides(
    organization_id,subject_id,component_key,title,revision_label,source_name,source_pages,
    applicable_aircraft,setup_items,fly_items,exit_items,callouts,updated_by
  ) values (
    current_setting('maneuver_guide.organization')::uuid,
    current_setting('maneuver_guide.subject')::uuid,
    'rls-test-maneuver','RLS Test Maneuver','July 2026','SOPM','66-67',
    array['C172'],array['Determine wind direction'],array['Maintain the ground track'],
    array['Exit on a 45 degree angle'],array['Wind identified'],auth.uid()
  )
$$, 'organization admin creates a maneuver guide');

select set_config('request.jwt.claim.sub',current_setting('maneuver_guide.cfi'),true);
update public.organization_training_maneuver_guides
set title='Unauthorized edit'
where organization_id=current_setting('maneuver_guide.organization')::uuid;
select is(
  (select title from public.organization_training_maneuver_guides
   where organization_id=current_setting('maneuver_guide.organization')::uuid
     and component_key='rls-test-maneuver'),
  'RLS Test Maneuver',
  'instructor cannot edit the organization template'
);

select lives_ok($$
  insert into public.instructor_training_maneuver_overrides(
    organization_id,instructor_user_id,subject_id,component_key,
    setup_notes,fly_notes,exit_notes,callouts,resources
  ) values (
    current_setting('maneuver_guide.organization')::uuid,auth.uid(),
    current_setting('maneuver_guide.subject')::uuid,'rls-test-maneuver',
    array['Use the west practice area'],array['Say the wind correction aloud'],
    array['Re-trim after cruise power'],array['Ground track first'],
    '[{"title":"Instructor video","url":"https://www.youtube.com/watch?v=test"}]'::jsonb
  )
$$, 'organization instructor creates an additive override');

reset role;
select private.grant_training_guide_access(
  current_setting('maneuver_guide.student')::uuid,
  current_setting('maneuver_guide.subject')::uuid,
  current_setting('maneuver_guide.cfi')::uuid,
  current_setting('maneuver_guide.organization')::uuid,
  timezone('utc', now())
);
delete from public.organization_members
where organization_id=current_setting('maneuver_guide.organization')::uuid
  and user_id=current_setting('maneuver_guide.student')::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('maneuver_guide.student'),true);
select is(
  (select count(*)::integer from public.organization_training_maneuver_guides
   where organization_id=current_setting('maneuver_guide.organization')::uuid
     and component_key='rls-test-maneuver'),
  1,
  'assigned student keeps organization SOPM access after membership ends'
);
select is(
  (select count(*)::integer from public.instructor_training_maneuver_overrides
   where instructor_user_id=current_setting('maneuver_guide.cfi')::uuid
     and component_key='rls-test-maneuver'),
  1,
  'assigned student reads only the assigned instructor maneuver guidance'
);
select throws_ok($$
  insert into public.instructor_training_maneuver_overrides(
    organization_id,instructor_user_id,subject_id,component_key
  ) values (
    current_setting('maneuver_guide.organization')::uuid,auth.uid(),
    current_setting('maneuver_guide.subject')::uuid,'s-turns'
  )
$$, '42501', null, 'student cannot create instructor maneuver guidance');

select set_config('request.jwt.claim.sub','99999999-9999-4999-8999-999999999999',true);
select is(
  (select count(*)::integer from public.organization_training_maneuver_guides),
  0,
  'unrelated authenticated user cannot read organization maneuver guides'
);
select is(
  (select count(*)::integer from public.instructor_training_maneuver_overrides),
  0,
  'unrelated authenticated user cannot read instructor maneuver guidance'
);

select * from finish();
rollback;
