begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select set_config('guest.cfi',(select id::text from public.profiles where email='pilot.one@example.test'),true);
select set_config('guest.student',(select id::text from public.profiles where email='instructor.one@example.test'),true);
select set_config('guest.other',(select id::text from public.profiles where email='platform.admin@example.test'),true);
select set_config('guest.auth_count',(select count(*)::text from auth.users),true);
insert into public.saved_people(id,user_id,role,display_name,cert_number) values
 ('52000000-0000-4000-8000-000000000001',current_setting('guest.cfi')::uuid,'student','Existing People Student','GUEST-1'),
 ('52000000-0000-4000-8000-000000000002',current_setting('guest.cfi')::uuid,'student','Registered Student','GUEST-2'),
 ('52000000-0000-4000-8000-000000000003',current_setting('guest.other')::uuid,'student','Other CFI Student','GUEST-3');
insert into public.saved_person_account_links(saved_person_id,owner_user_id,linked_user_id)
 values('52000000-0000-4000-8000-000000000002',current_setting('guest.cfi')::uuid,current_setting('guest.other')::uuid);
select set_config('request.jwt.claim.sub',current_setting('guest.cfi'),true);
set local role authenticated;
insert into public.cfi_schedule_student_grants(cfi_user_id,saved_person_id,student_user_id)
 values(auth.uid(),'52000000-0000-4000-8000-000000000002',current_setting('guest.other')::uuid);
select lives_ok($$select public.set_cfi_person_access('52000000-0000-4000-8000-000000000001',true)$$,'enroll existing People student without an account');
select throws_ok($$select public.set_cfi_person_access('52000000-0000-4000-8000-000000000003',true)$$,'42501',null,'cannot enroll another CFI person');
select throws_ok($$select public.set_cfi_person_access('52000000-0000-4000-8000-000000000002',true)$$,'22023',null,'existing account scheduling cannot be duplicated');
select is(jsonb_array_length(public.list_my_cfi_schedule_access_v2()),2,'owner sees mixed roster');
select is((select a->>'account_user_id' from jsonb_array_elements(public.list_my_cfi_schedule_access_v2()) a where a->>'storage_kind'='person'),null,'unlinked profile has no auth identity');
select throws_ok($$select * from private.cfi_person_events$$,'42501',null,'private storage is not directly exposed');
select is(public.save_cfi_person_availability(auth.uid(),'52000000-0000-4000-8000-000000000001','UTC','date',1,current_date,'[{"start_minute":600,"end_minute":720}]',false),1,'instructor can fill a date');
select is(public.save_cfi_person_availability(auth.uid(),'52000000-0000-4000-8000-000000000001','UTC','weekly',extract(isodow from current_date)::int,null,'[{"start_minute":420,"end_minute":960}]',true),3,'autofill preserves manual date');
select throws_ok($$select public.save_cfi_person_availability(auth.uid(),'52000000-0000-4000-8000-000000000001','UTC','weekly',1,null,'[{"start_minute":420,"end_minute":450}]',false)$$,'22023',null,'short availability rejected');
select throws_ok($$select public.save_cfi_person_availability(auth.uid(),'52000000-0000-4000-8000-000000000001','UTC','date',1,current_date+28,'[]',false)$$,'22023',null,'four week range enforced');
select lives_ok($$select public.update_cfi_person_settings(auth.uid(),'52000000-0000-4000-8000-000000000001','{"weeklySessions":2,"durationMin":150,"color":"#2563eb","useWeekOverride":true,"weekStart":"2026-09-14","weekSessions":1,"weekDurationMin":120}')$$,'instructor can set usual and week-specific targets');
select set_config('guest.changes',jsonb_build_array(
 jsonb_build_object('id','52000000-0000-4000-8000-000000000011','student_user_id','52000000-0000-4000-8000-000000000001','lesson_kind','flight','start_at','2026-09-14T07:00:00Z','end_at','2026-09-14T09:00:00Z','note','Guest private note','status','scheduled'),
 jsonb_build_object('id','52000000-0000-4000-8000-000000000012','student_user_id',current_setting('guest.other'),'lesson_kind','ground','start_at','2026-09-14T09:00:00Z','end_at','2026-09-14T11:00:00Z','note','Other private note','status','scheduled'))::text,true);
select set_config('guest.revision',public.get_cfi_schedule_snapshot_v2('2026-09-14','2026-09-21')->>'revision',true);
select lives_ok($$select public.publish_cfi_schedule_draft(current_setting('guest.revision')::bigint,'52000000-0000-4000-8000-000000000020',current_setting('guest.changes')::jsonb)$$,'one atomic batch publishes both student kinds');
select lives_ok($$select public.publish_cfi_schedule_draft(current_setting('guest.revision')::bigint,'52000000-0000-4000-8000-000000000020',current_setting('guest.changes')::jsonb)$$,'mixed batch retry is idempotent');
select is(jsonb_array_length(public.get_cfi_schedule_snapshot_v2('2026-09-14','2026-09-21')->'entries'),2,'snapshot contains both lesson kinds');
reset role;
select is((select count(*)::text from auth.users),current_setting('guest.auth_count'),'no artificial user accounts created');
select is((select count(*) from public.notifications where dedupe_key like 'cfi-schedule-publish:52000000-0000-4000-8000-000000000020:%'),1::bigint,'only registered participant notified');
select is((select recipient_user_id from public.notifications where dedupe_key like 'cfi-schedule-publish:52000000-0000-4000-8000-000000000020:%'),current_setting('guest.other')::uuid,'no notification addressed to People ID');
select is((select start_minute from private.cfi_person_availability_slots where scope='date' and availability_date=current_date),600,'manual date survived autofill');
set local role authenticated;
select set_config('guest.revision',public.get_cfi_schedule_snapshot_v2('2026-09-14','2026-09-21')->>'revision',true);
select throws_ok($$select public.publish_cfi_schedule_draft(current_setting('guest.revision')::bigint,'52000000-0000-4000-8000-000000000021',jsonb_set(current_setting('guest.changes')::jsonb,'{0,end_at}','"2026-09-14T10:00:00Z"'))$$,'23P01',null,'cross-store overlap rejected atomically');
select is(public.get_cfi_schedule_snapshot_v2('2026-09-14','2026-09-21')->>'revision',current_setting('guest.revision'),'failed mixed batch leaves revision intact');
select throws_ok($$insert into public.cfi_schedule_events(cfi_user_id,student_user_id,start_at,end_at) values(auth.uid(),current_setting('guest.other')::uuid,'2026-09-14 08:00Z','2026-09-14 09:00Z')$$,'23P01',null,'old API cannot overlap People lessons');
select set_config('request.jwt.claim.sub',current_setting('guest.student'),true);
select throws_ok($$select public.get_cfi_schedule_snapshot_v2('2026-09-14','2026-09-21',current_setting('guest.cfi')::uuid)$$,'42501',null,'unlinked account cannot read schedule');
select throws_ok($$select public.save_cfi_person_availability(current_setting('guest.cfi')::uuid,'52000000-0000-4000-8000-000000000001','UTC','weekly',1,null,'[]',false)$$,'42501',null,'unlinked account cannot edit availability');
reset role;
insert into public.saved_person_account_links(saved_person_id,owner_user_id,linked_user_id)
 values('52000000-0000-4000-8000-000000000001',current_setting('guest.cfi')::uuid,current_setting('guest.student')::uuid);
set local role authenticated;
select is(jsonb_array_length(public.list_my_cfi_schedule_access_v2()),1,'accepted link reveals existing schedule membership');
select set_config('guest.snapshot',public.get_cfi_schedule_snapshot_v2('2026-09-14','2026-09-21',current_setting('guest.cfi')::uuid)::text,true);
select is((select a->>'note' from jsonb_array_elements(current_setting('guest.snapshot')::jsonb->'entries') a where a->>'id'='52000000-0000-4000-8000-000000000011'),'Guest private note','linked student sees original lesson unchanged');
select is((select a->>'student_user_id' from jsonb_array_elements(current_setting('guest.snapshot')::jsonb->'entries') a where a->>'id'='52000000-0000-4000-8000-000000000011'),'52000000-0000-4000-8000-000000000001','stable People identity is retained');
select is((select a->>'note' from jsonb_array_elements(current_setting('guest.snapshot')::jsonb->'entries') a where a->>'id'='52000000-0000-4000-8000-000000000012'),'','other student private note redacted');
select is((select a->>'student_name' from jsonb_array_elements(current_setting('guest.snapshot')::jsonb->'entries') a where a->>'id'='52000000-0000-4000-8000-000000000012'),null,'other student name redacted');
select is(jsonb_array_length(current_setting('guest.snapshot')::jsonb->'slots'),5,'linked student inherits all saved availability');
select is(public.save_cfi_person_availability(current_setting('guest.cfi')::uuid,'52000000-0000-4000-8000-000000000001','UTC','date',1,current_date,'[]',false),1,'linked student can change own availability');
select throws_ok($$select public.set_cfi_person_access('52000000-0000-4000-8000-000000000001',false)$$,'42501',null,'student cannot alter CFI permissions');
select set_config('request.jwt.claim.sub',current_setting('guest.cfi'),true);
select throws_ok($$select public.publish_cfi_schedule_draft(current_setting('guest.revision')::bigint,'52000000-0000-4000-8000-000000000022',current_setting('guest.changes')::jsonb)$$,'PT409',null,'link and availability changes invalidate older draft');
select lives_ok($$select public.publish_cfi_schedule_draft((public.get_cfi_schedule_snapshot_v2('2026-09-14','2026-09-21')->>'revision')::bigint,'52000000-0000-4000-8000-000000000023',jsonb_set(current_setting('guest.changes')::jsonb,'{0,note}','"Updated after link"'))$$,'same original lesson remains editable after linking');
reset role;
select is((select recipient_user_id from public.notifications where dedupe_key like 'cfi-schedule-publish:52000000-0000-4000-8000-000000000023:%'),current_setting('guest.student')::uuid,'post-link notification resolves actual account');
select is((select count(*) from private.cfi_person_events),1::bigint,'linking did not copy lessons');
set local role authenticated;
select throws_ok($$insert into public.cfi_schedule_student_grants(cfi_user_id,saved_person_id,student_user_id) values(auth.uid(),'52000000-0000-4000-8000-000000000001',current_setting('guest.student')::uuid)$$,'22023',null,'old client cannot duplicate a linked People member');
select lives_ok($$select public.publish_cfi_schedule_draft((public.get_cfi_schedule_snapshot_v2('2026-09-14','2026-09-21')->>'revision')::bigint,'52000000-0000-4000-8000-000000000024',
 jsonb_set(jsonb_set(jsonb_set(jsonb_set(current_setting('guest.changes')::jsonb,'{0,start_at}','"2026-09-14T08:00:00Z"'),'{0,end_at}','"2026-09-14T10:00:00Z"'),'{1,start_at}','"2026-09-14T10:00:00Z"'),'{1,end_at}','"2026-09-14T12:00:00Z"'))$$,'mixed-store cascade validates final positions, not intermediate overlaps');
reset role;
select is((select start_at from private.cfi_person_events where id='52000000-0000-4000-8000-000000000011'),'2026-09-14 08:00Z'::timestamptz,'People lesson moves with mixed batch');
select is((select start_at from public.cfi_schedule_events where id='52000000-0000-4000-8000-000000000012'),'2026-09-14 10:00Z'::timestamptz,'account lesson is pushed in same batch');
delete from public.saved_person_account_links where saved_person_id='52000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub',current_setting('guest.student'),true);
set local role authenticated;
select throws_ok($$select public.get_cfi_schedule_snapshot_v2('2026-09-14','2026-09-21',current_setting('guest.cfi')::uuid)$$,'42501',null,'unlink immediately revokes access');
select set_config('request.jwt.claim.sub',current_setting('guest.cfi'),true);
select lives_ok($$select public.clear_cfi_person_date(auth.uid(),'52000000-0000-4000-8000-000000000001',current_date)$$,'CFI can restore weekly rule');
select lives_ok($$select public.set_cfi_person_access('52000000-0000-4000-8000-000000000001',false)$$,'CFI can disable membership without deleting history');
select is(jsonb_array_length(public.get_cfi_schedule_snapshot_v2('2026-09-14','2026-09-21')->'entries'),2,'disabled member lessons are preserved');
reset role;
select * from finish();
rollback;
