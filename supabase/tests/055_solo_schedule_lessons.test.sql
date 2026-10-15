begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('solo_schedule.cfi',(select id::text from public.profiles where email='pilot.one@example.test'),true);
select set_config('solo_schedule.student',(select id::text from public.profiles where email='instructor.one@example.test'),true);
select set_config('solo_schedule.other_student',(select id::text from public.profiles where email='platform.admin@example.test'),true);
select set_config('solo_schedule.aircraft','30000000-0000-4000-8000-000000000001',true);

insert into private.cfi_schedule_revisions(cfi_user_id,revision)
values(current_setting('solo_schedule.cfi')::uuid,0)
on conflict(cfi_user_id) do update set revision=0;

insert into public.saved_people(id,user_id,role,display_name,cert_number)
values('55000000-0000-4000-8000-000000000001',current_setting('solo_schedule.cfi')::uuid,'student','Solo Schedule Student','SOLO-1');
insert into public.saved_person_account_links(saved_person_id,owner_user_id,linked_user_id)
values('55000000-0000-4000-8000-000000000001',current_setting('solo_schedule.cfi')::uuid,current_setting('solo_schedule.student')::uuid);
insert into public.saved_people(id,user_id,role,display_name,cert_number)
values('55000000-0000-4000-8000-000000000002',current_setting('solo_schedule.cfi')::uuid,'student','Concurrent Flight Student','SOLO-2');
insert into public.saved_person_account_links(saved_person_id,owner_user_id,linked_user_id)
values('55000000-0000-4000-8000-000000000002',current_setting('solo_schedule.cfi')::uuid,current_setting('solo_schedule.other_student')::uuid);

select set_config('request.jwt.claim.sub',current_setting('solo_schedule.cfi'),true);
set local role authenticated;
insert into public.cfi_schedule_student_grants(cfi_user_id,saved_person_id,student_user_id)
values(auth.uid(),'55000000-0000-4000-8000-000000000001',current_setting('solo_schedule.student')::uuid);
insert into public.cfi_schedule_student_grants(cfi_user_id,saved_person_id,student_user_id)
values(auth.uid(),'55000000-0000-4000-8000-000000000002',current_setting('solo_schedule.other_student')::uuid);

select set_config('solo_schedule.revision',public.get_cfi_schedule_snapshot_v2('2026-10-19','2026-10-26')->>'revision',true);
select lives_ok($$select public.publish_cfi_schedule_draft(
  current_setting('solo_schedule.revision')::bigint,
  '55000000-0000-4000-8000-000000000010',
  jsonb_build_array(jsonb_build_object(
    'id','55000000-0000-4000-8000-000000000011','student_user_id',current_setting('solo_schedule.student'),
    'lesson_kind','solo','aircraft_id',current_setting('solo_schedule.aircraft'),
    'start_at','2026-10-19T12:00:00Z','end_at','2026-10-19T14:00:00Z','note','Solo lesson','status','scheduled'))
)$$,'instructor can publish a Solo lesson');
select is((select lesson_kind from public.cfi_schedule_events where id='55000000-0000-4000-8000-000000000011'),'solo','published lesson keeps the Solo type');
select is((select aircraft_id from public.cfi_schedule_events where id='55000000-0000-4000-8000-000000000011'),current_setting('solo_schedule.aircraft')::uuid,'published Solo lesson keeps its aircraft');

select set_config('solo_schedule.revision',public.get_cfi_schedule_snapshot_v2('2026-10-19','2026-10-26')->>'revision',true);
select lives_ok($$select public.publish_cfi_schedule_draft(
  current_setting('solo_schedule.revision')::bigint,
  '55000000-0000-4000-8000-000000000014',
  jsonb_build_array(jsonb_build_object(
    'id','55000000-0000-4000-8000-000000000015','student_user_id',current_setting('solo_schedule.other_student'),
    'lesson_kind','ground','aircraft_id',null,
    'start_at','2026-10-19T12:00:00Z','end_at','2026-10-19T14:00:00Z','note','Concurrent instruction','status','scheduled'))
)$$,'instructor may teach another student during a Solo lesson');

select set_config('solo_schedule.revision',public.get_cfi_schedule_snapshot_v2('2026-10-19','2026-10-26')->>'revision',true);
select throws_ok($$select public.publish_cfi_schedule_draft(
  current_setting('solo_schedule.revision')::bigint,
  '55000000-0000-4000-8000-000000000016',
  jsonb_build_array(jsonb_build_object(
    'id','55000000-0000-4000-8000-000000000017','student_user_id',current_setting('solo_schedule.student'),
    'lesson_kind','ground','aircraft_id',null,
    'start_at','2026-10-19T12:00:00Z','end_at','2026-10-19T14:00:00Z','note','Student overlap','status','scheduled'))
)$$,'23P01','This lesson overlaps another scheduled lesson.','the same student cannot overlap their Solo lesson');

select set_config('solo_schedule.revision',public.get_cfi_schedule_snapshot_v2('2026-10-19','2026-10-26')->>'revision',true);
select throws_ok($$select public.publish_cfi_schedule_draft(
  current_setting('solo_schedule.revision')::bigint,
  '55000000-0000-4000-8000-000000000012',
  jsonb_build_array(jsonb_build_object(
    'id','55000000-0000-4000-8000-000000000013','student_user_id',current_setting('solo_schedule.student'),
    'lesson_kind','solo','aircraft_id',null,
    'start_at','2026-10-20T12:00:00Z','end_at','2026-10-20T14:00:00Z','note','','status','scheduled'))
)$$,'23514','Solo lessons require an aircraft.','Solo cannot publish without an aircraft');

select set_config('request.jwt.claim.sub',current_setting('solo_schedule.student'),true);
select is(
  (select e->>'lesson_kind' from jsonb_array_elements(public.get_cfi_schedule_snapshot_v2('2026-10-19','2026-10-26',current_setting('solo_schedule.cfi')::uuid)->'entries') e where e->>'id'='55000000-0000-4000-8000-000000000011'),
  'solo',
  'student sees the published Solo lesson'
);

reset role;
select * from finish();
rollback;
