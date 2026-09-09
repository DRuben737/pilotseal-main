begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('aircraft_schedule.cfi',(select id::text from public.profiles where email='pilot.one@example.test'),true);
select set_config('aircraft_schedule.student',(select id::text from public.profiles where email='instructor.one@example.test'),true);
select set_config('aircraft_schedule.aircraft','30000000-0000-4000-8000-000000000001',true);
select set_config('aircraft_schedule.other_student',(select id::text from public.profiles where email='platform.admin@example.test'),true);

insert into public.saved_people(id,user_id,role,display_name,cert_number)
values('54000000-0000-4000-8000-000000000001',current_setting('aircraft_schedule.cfi')::uuid,'student','Aircraft Schedule Student','AIR-1');
insert into public.saved_people(id,user_id,role,display_name,cert_number)
values('54000000-0000-4000-8000-000000000002',current_setting('aircraft_schedule.student')::uuid,'student','Other CFI Private Student','AIR-2');
insert into public.saved_person_account_links(saved_person_id,owner_user_id,linked_user_id)
values('54000000-0000-4000-8000-000000000001',current_setting('aircraft_schedule.cfi')::uuid,current_setting('aircraft_schedule.student')::uuid);
insert into public.saved_person_account_links(saved_person_id,owner_user_id,linked_user_id)
values('54000000-0000-4000-8000-000000000002',current_setting('aircraft_schedule.student')::uuid,current_setting('aircraft_schedule.other_student')::uuid);

select set_config('request.jwt.claim.sub',current_setting('aircraft_schedule.student'),true);
set local role authenticated;
insert into public.cfi_schedule_student_grants(cfi_user_id,saved_person_id,student_user_id)
values(auth.uid(),'54000000-0000-4000-8000-000000000002',current_setting('aircraft_schedule.other_student')::uuid);
insert into public.cfi_schedule_events(id,cfi_user_id,student_user_id,lesson_kind,aircraft_id,start_at,end_at,note)
values('54000000-0000-4000-8000-000000000009',auth.uid(),current_setting('aircraft_schedule.other_student')::uuid,'flight',current_setting('aircraft_schedule.aircraft')::uuid,'2026-09-14T12:00:00Z','2026-09-14T14:00:00Z','Other instructor private lesson');

select set_config('request.jwt.claim.sub',current_setting('aircraft_schedule.cfi'),true);
set local role authenticated;
insert into public.cfi_schedule_student_grants(cfi_user_id,saved_person_id,student_user_id)
values(auth.uid(),'54000000-0000-4000-8000-000000000001',current_setting('aircraft_schedule.student')::uuid);

select is(jsonb_array_length(public.list_my_schedule_aircraft()),1,'instructor sees organization aircraft');
select is(public.list_my_schedule_aircraft()->0->>'tail_number','N000PS','aircraft picker includes tail number');

reset role;
insert into public.organization_aircraft_maintenance(aircraft_id,operational_status,operational_status_note,updated_by)
values(current_setting('aircraft_schedule.aircraft')::uuid,'grounded','Local grounding test',current_setting('aircraft_schedule.cfi')::uuid)
on conflict(aircraft_id) do update set operational_status='grounded',operational_status_note='Local grounding test';

set local role authenticated;
select set_config('aircraft_schedule.revision',public.get_cfi_schedule_snapshot_v2('2026-09-14','2026-09-21')->>'revision',true);
select lives_ok($$select public.publish_cfi_schedule_draft(
  current_setting('aircraft_schedule.revision')::bigint,
  '54000000-0000-4000-8000-000000000010',
  jsonb_build_array(jsonb_build_object(
    'id','54000000-0000-4000-8000-000000000011','student_user_id',current_setting('aircraft_schedule.student'),
    'lesson_kind','flight','aircraft_id',current_setting('aircraft_schedule.aircraft'),
    'start_at','2026-09-14T12:00:00Z','end_at','2026-09-14T14:00:00Z','note','Flight note','status','scheduled'))
)$$,'grounded status warns but does not block a booking');
select is((select aircraft_id from public.cfi_schedule_events where id='54000000-0000-4000-8000-000000000011'),current_setting('aircraft_schedule.aircraft')::uuid,'published lesson retains selected aircraft');
select is((select e->>'aircraft_status' from jsonb_array_elements(public.get_cfi_schedule_snapshot_v2('2026-09-14','2026-09-21')->'entries') e where e->>'id'='54000000-0000-4000-8000-000000000011'),'grounded','owner snapshot exposes current status');
select is((select e->>'aircraft_conflict' from jsonb_array_elements(public.get_cfi_schedule_snapshot_v2('2026-09-14','2026-09-21')->'entries') e where e->>'id'='54000000-0000-4000-8000-000000000011'),'true','another instructor booking becomes a warning');
insert into public.cfi_schedule_unavailable_blocks(id,cfi_user_id,aircraft_id,start_at,end_at,note)
values('54000000-0000-4000-8000-000000000012',auth.uid(),current_setting('aircraft_schedule.aircraft')::uuid,'2026-09-15T12:00:00Z','2026-09-15T14:00:00Z','Private maintenance reason');

select set_config('request.jwt.claim.sub',current_setting('aircraft_schedule.student'),true);
select set_config('aircraft_schedule.student_snapshot',public.get_cfi_schedule_snapshot_v2('2026-09-14','2026-09-21',current_setting('aircraft_schedule.cfi')::uuid)::text,true);
select is((select e->>'aircraft_tail_number' from jsonb_array_elements(current_setting('aircraft_schedule.student_snapshot')::jsonb->'entries') e where e->>'id'='54000000-0000-4000-8000-000000000011'),'N000PS','student sees aircraft on own lesson');
select is((select e->>'aircraft_status' from jsonb_array_elements(current_setting('aircraft_schedule.student_snapshot')::jsonb->'entries') e where e->>'id'='54000000-0000-4000-8000-000000000011'),'grounded','student sees current aircraft status');
select is((select e->>'aircraft_tail_number' from jsonb_array_elements(current_setting('aircraft_schedule.student_snapshot')::jsonb->'entries') e where e->>'id'='54000000-0000-4000-8000-000000000012'),'N000PS','student sees which aircraft is unavailable');
select is((select e->>'note' from jsonb_array_elements(current_setting('aircraft_schedule.student_snapshot')::jsonb->'entries') e where e->>'id'='54000000-0000-4000-8000-000000000012'),'','aircraft block reason remains private');

reset role;
select * from finish();
rollback;
