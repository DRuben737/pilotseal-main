begin;
create extension if not exists pgtap with schema extensions;
select plan(29);
select set_config('schedule_test.cfi', (select id::text from public.profiles where email = 'pilot.one@example.test'), true);
select set_config('schedule_test.student', (select id::text from public.profiles where email = 'instructor.one@example.test'), true);
select set_config('schedule_test.other', (select id::text from public.profiles where email = 'platform.admin@example.test'), true);
insert into public.saved_people(id,user_id,role,display_name,cert_number) values
 ('50000000-0000-4000-8000-000000000001',current_setting('schedule_test.cfi')::uuid,'student','Draft student','DRAFT-1'),
 ('50000000-0000-4000-8000-000000000002',current_setting('schedule_test.cfi')::uuid,'student','Other student','DRAFT-2');
insert into public.saved_person_account_links(saved_person_id,owner_user_id,linked_user_id) values
 ('50000000-0000-4000-8000-000000000001',current_setting('schedule_test.cfi')::uuid,current_setting('schedule_test.student')::uuid),
 ('50000000-0000-4000-8000-000000000002',current_setting('schedule_test.cfi')::uuid,current_setting('schedule_test.other')::uuid);
select set_config('request.jwt.claim.sub',current_setting('schedule_test.cfi'),true);
set local role authenticated;
insert into public.cfi_schedule_student_grants(cfi_user_id,saved_person_id,student_user_id) values
 (auth.uid(),'50000000-0000-4000-8000-000000000001',current_setting('schedule_test.student')::uuid),
 (auth.uid(),'50000000-0000-4000-8000-000000000002',current_setting('schedule_test.other')::uuid);
insert into public.cfi_schedule_events(id,cfi_user_id,student_user_id,start_at,end_at) values
 ('50000000-0000-4000-8000-000000000011',auth.uid(),current_setting('schedule_test.other')::uuid,'2026-09-14 07:00Z','2026-09-14 09:00Z'),
 ('50000000-0000-4000-8000-000000000012',auth.uid(),current_setting('schedule_test.student')::uuid,'2026-09-14 09:00Z','2026-09-14 11:00Z'),
 ('50000000-0000-4000-8000-000000000013',auth.uid(),current_setting('schedule_test.student')::uuid,'2026-09-14 11:00Z','2026-09-14 13:00Z'),
 ('50000000-0000-4000-8000-000000000014',auth.uid(),current_setting('schedule_test.other')::uuid,'2026-09-15 09:00Z','2026-09-15 11:00Z');
select is(jsonb_array_length(public.get_cfi_schedule_editor_snapshot('2026-09-14','2026-09-21')->'entries'),4,'editor snapshot contains the CFI lessons');
select set_config('schedule_test.revision',(public.get_cfi_schedule_editor_snapshot('2026-09-14','2026-09-21')->>'revision'),true);
select set_config('schedule_test.changes',jsonb_build_array(
 jsonb_build_object('id','50000000-0000-4000-8000-000000000012','student_user_id',current_setting('schedule_test.student'),'lesson_kind','flight','start_at','2026-09-14T10:00:00Z','end_at','2026-09-14T12:00:00Z','note','','status','scheduled'),
 jsonb_build_object('id','50000000-0000-4000-8000-000000000013','student_user_id',current_setting('schedule_test.student'),'lesson_kind','flight','start_at','2026-09-14T12:00:00Z','end_at','2026-09-14T14:00:00Z','note','','status','scheduled'))::text,true);
select lives_ok($$select public.publish_cfi_schedule_draft(current_setting('schedule_test.revision')::bigint,'50000000-0000-4000-8000-000000000020',current_setting('schedule_test.changes')::jsonb)$$,'publishing shifted middle and later lessons is atomic');
select is((select start_at from public.cfi_schedule_events where id='50000000-0000-4000-8000-000000000012'),'2026-09-14 10:00Z'::timestamptz,'middle lesson moved');
select is((select start_at from public.cfi_schedule_events where id='50000000-0000-4000-8000-000000000013'),'2026-09-14 12:00Z'::timestamptz,'later lesson moved without intermediate overlap failure');
select is((select start_at from public.cfi_schedule_events where id='50000000-0000-4000-8000-000000000011'),'2026-09-14 07:00Z'::timestamptz,'earlier lesson remains unchanged');
select is((select start_at from public.cfi_schedule_events where id='50000000-0000-4000-8000-000000000014'),'2026-09-15 09:00Z'::timestamptz,'other day remains unchanged');
reset role;
select is((select count(*) from public.notifications where dedupe_key like 'cfi-schedule-publish:50000000-0000-4000-8000-000000000020:%'),1::bigint,'multiple changes produce one notification for the affected student');
select is((select recipient_user_id from public.notifications where dedupe_key like 'cfi-schedule-publish:50000000-0000-4000-8000-000000000020:%'),current_setting('schedule_test.student')::uuid,'unaffected student and CFI are not notified');
set local role authenticated;
select lives_ok($$select public.publish_cfi_schedule_draft(current_setting('schedule_test.revision')::bigint,'50000000-0000-4000-8000-000000000020',current_setting('schedule_test.changes')::jsonb)$$,'retrying the same publication is idempotent');
select throws_ok($$select public.publish_cfi_schedule_draft(current_setting('schedule_test.revision')::bigint,'50000000-0000-4000-8000-000000000021',current_setting('schedule_test.changes')::jsonb)$$,'PT409',null,'stale revision cannot overwrite a newer schedule');
select set_config('schedule_test.revision',(public.get_cfi_schedule_editor_snapshot('2026-09-14','2026-09-21')->>'revision'),true);
select throws_ok($$select public.publish_cfi_schedule_draft(current_setting('schedule_test.revision')::bigint,'50000000-0000-4000-8000-000000000022',jsonb_set(current_setting('schedule_test.changes')::jsonb,'{0,end_at}','"2026-09-14T13:00:00Z"'))$$,'23P01',null,'invalid final overlaps roll back the whole batch');
select is((select end_at from public.cfi_schedule_events where id='50000000-0000-4000-8000-000000000012'),'2026-09-14 12:00Z'::timestamptz,'a failed publication leaves event data unchanged');
select is(public.get_cfi_schedule_editor_snapshot('2026-09-14','2026-09-21')->>'revision',current_setting('schedule_test.revision'),'failed publication leaves revision unchanged');
reset role;
select is((select count(*) from private.cfi_schedule_batch_context),0::bigint,'no batch suppression context survives success or rollback');
select is((select count(*) from public.notifications where dedupe_key like 'cfi-schedule-publish:%'),1::bigint,'retries and rejected publications send no extra notifications');

select set_config('request.jwt.claim.sub',current_setting('schedule_test.student'),true);
set local role authenticated;
select is(jsonb_array_length(public.get_cfi_schedule_editor_snapshot('2026-09-14','2026-09-21')->'entries'),0,'student cannot use editor snapshot to read another CFI private data');
select throws_ok($$select public.publish_cfi_schedule_draft(0,'50000000-0000-4000-8000-000000000023',current_setting('schedule_test.changes')::jsonb)$$,'42501',null,'student cannot publish changes to their CFI lessons');
select is(public.save_cfi_schedule_availability(current_setting('schedule_test.cfi')::uuid,'UTC','date',1,(now() at time zone 'UTC')::date,'[{"start_minute":600,"end_minute":720}]',false),1,'student can save a manual date exception');
select is(public.save_cfi_schedule_availability(current_setting('schedule_test.cfi')::uuid,'UTC','weekly',extract(isodow from now() at time zone 'UTC')::integer,null,'[{"start_minute":420,"end_minute":600}]',true),3,'autofill covers four matching weekdays but skips the manual exception');
select is((select count(*) from public.cfi_schedule_availability_override_dates where source='auto'),3::bigint,'auto-filled dates are distinguished from manual exceptions');
select is((select start_minute from public.cfi_schedule_availability_slots where scope='date' and availability_date=(now() at time zone 'UTC')::date),600,'manual date periods survive autofill');
select is(public.save_cfi_schedule_availability(current_setting('schedule_test.cfi')::uuid,'UTC','weekly',extract(isodow from now() at time zone 'UTC')::integer,null,'[{"start_minute":480,"end_minute":720}]',true),3,'repeat autofill updates generated dates without overwriting exceptions');
select is((select count(*) from public.cfi_schedule_availability_slots where scope='date' and start_minute=480),3::bigint,'repeat autofill replaces rather than duplicates generated slots');
reset role;
select is((select start_at from public.cfi_schedule_events where id='50000000-0000-4000-8000-000000000012'),'2026-09-14 10:00Z'::timestamptz,'availability changes never move a published lesson');
select is((select count(*) from public.notifications where dedupe_key like 'cfi-schedule-publish:%'),1::bigint,'availability updates do not notify the CFI or students');
insert into public.notification_preferences(user_id,schedule_notifications_enabled)
values(current_setting('schedule_test.student')::uuid,false) on conflict(user_id) do update set schedule_notifications_enabled=false;
select set_config('request.jwt.claim.sub',current_setting('schedule_test.cfi'),true);
set local role authenticated;
select isnt(public.get_cfi_schedule_editor_snapshot('2026-09-14','2026-09-21')->>'revision',current_setting('schedule_test.revision'),'student availability changes invalidate an old editor snapshot');
select throws_ok($$select public.publish_cfi_schedule_draft(current_setting('schedule_test.revision')::bigint,'50000000-0000-4000-8000-000000000024',current_setting('schedule_test.changes')::jsonb)$$,'PT409',null,'a draft based on old availability must be reviewed again');
select lives_ok($$select public.publish_cfi_schedule_draft((public.get_cfi_schedule_editor_snapshot('2026-09-14','2026-09-21')->>'revision')::bigint,'50000000-0000-4000-8000-000000000025',jsonb_set(current_setting('schedule_test.changes')::jsonb,'{0,note}','"Quiet update"'))$$,'publication succeeds when student notifications are disabled');
reset role;
select is((select count(*) from public.notifications where dedupe_key like 'cfi-schedule-publish:%'),1::bigint,'publication honors the student schedule notification preference');
select * from finish();
rollback;
