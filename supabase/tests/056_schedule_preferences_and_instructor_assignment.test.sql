begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('schedule_collab.cfi',(select id::text from public.profiles where email='instructor.one@example.test'),true);
select set_config('schedule_collab.student',(select id::text from public.profiles where email='pilot.one@example.test'),true);
select set_config('schedule_collab.assigned',(select id::text from public.profiles where email='platform.admin@example.test'),true);
select set_config('schedule_collab.organization','10000000-0000-4000-8000-000000000001',true);
select set_config('schedule_collab.aircraft','30000000-0000-4000-8000-000000000001',true);

insert into public.organization_members(organization_id,user_id,role,teaching_role,added_by)
values(
  current_setting('schedule_collab.organization')::uuid,
  current_setting('schedule_collab.assigned')::uuid,
  'member','instructor',current_setting('schedule_collab.cfi')::uuid
)
on conflict(organization_id,user_id) do update set teaching_role='instructor';

insert into public.saved_people(id,user_id,role,display_name,cert_number)
values('56000000-0000-4000-8000-000000000001',current_setting('schedule_collab.cfi')::uuid,'student','Collaborative Schedule Student','COLLAB-1');
insert into public.saved_person_account_links(saved_person_id,owner_user_id,linked_user_id)
values('56000000-0000-4000-8000-000000000001',current_setting('schedule_collab.cfi')::uuid,current_setting('schedule_collab.student')::uuid);

select set_config('request.jwt.claim.sub',current_setting('schedule_collab.cfi'),true);
set local role authenticated;
insert into public.cfi_schedule_student_grants(cfi_user_id,saved_person_id,student_user_id)
values(auth.uid(),'56000000-0000-4000-8000-000000000001',current_setting('schedule_collab.student')::uuid);

select ok(
  exists(
    select 1 from jsonb_array_elements(public.get_cfi_schedule_collaboration('2026-10-19','2026-10-26')->'assignmentInstructors') instructor
    where instructor->>'user_id'=current_setting('schedule_collab.assigned')
  ),
  'a current instructor in the same organization can be selected'
);

select set_config('request.jwt.claim.sub',current_setting('schedule_collab.student'),true);
select lives_ok(
  format('select public.save_cfi_schedule_aircraft_preferences(%L,array[%L]::uuid[])',current_setting('schedule_collab.cfi'),current_setting('schedule_collab.aircraft')),
  'student can save multiple-choice aircraft preferences'
);
select is(
  (select preference->>'aircraft_id' from jsonb_array_elements(public.get_cfi_schedule_collaboration('2026-10-19','2026-10-26',current_setting('schedule_collab.cfi')::uuid)->'aircraftPreferences') preference limit 1),
  current_setting('schedule_collab.aircraft'),
  'student collaboration snapshot returns the saved aircraft preference'
);

select set_config('request.jwt.claim.sub',current_setting('schedule_collab.cfi'),true);
select set_config('schedule_collab.revision',public.get_cfi_schedule_snapshot_v2('2026-10-19','2026-10-26')->>'revision',true);
select lives_ok($$select public.publish_cfi_schedule_draft_v2(
  current_setting('schedule_collab.revision')::bigint,
  '56000000-0000-4000-8000-000000000010',
  jsonb_build_array(jsonb_build_object(
    'id','56000000-0000-4000-8000-000000000011',
    'student_user_id',current_setting('schedule_collab.student'),
    'lesson_kind','flight','aircraft_id',current_setting('schedule_collab.aircraft'),
    'assigned_instructor_user_id',current_setting('schedule_collab.assigned'),
    'start_at','2026-10-19T12:00:00Z','end_at','2026-10-19T14:00:00Z',
    'note','Assigned for another instructor','status','scheduled'))
)$$,'instructor can publish a lesson assigned to a colleague');
select is(
  (select metadata->>'occupies_instructor_time' from jsonb_array_elements(public.get_cfi_schedule_collaboration('2026-10-19','2026-10-26')->'assignmentMetadata') metadata where metadata->>'id'='56000000-0000-4000-8000-000000000011'),
  'false',
  'delegated lesson stays visible without occupying the scheduling instructor'
);

select set_config('request.jwt.claim.sub',current_setting('schedule_collab.assigned'),true);
select is(
  (select entry->>'id' from jsonb_array_elements(public.get_cfi_schedule_collaboration('2026-10-19','2026-10-26')->'assignedEntries') entry where entry->>'id'='56000000-0000-4000-8000-000000000011'),
  '56000000-0000-4000-8000-000000000011',
  'assigned instructor sees the delegated lesson on their schedule'
);

select set_config('request.jwt.claim.sub',current_setting('schedule_collab.student'),true);
select is(
  (select metadata->>'assigned_instructor_user_id' from jsonb_array_elements(public.get_cfi_schedule_collaboration('2026-10-19','2026-10-26',current_setting('schedule_collab.cfi')::uuid)->'assignmentMetadata') metadata where metadata->>'id'='56000000-0000-4000-8000-000000000011'),
  current_setting('schedule_collab.assigned'),
  'student sees which instructor is assigned'
);

reset role;
select * from finish();
rollback;
