begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('teaching.cfi',(select id::text from public.profiles where email='pilot.one@example.test'),true);
select set_config('teaching.other',(select id::text from public.profiles where email='instructor.one@example.test'),true);

select set_config('request.jwt.claim.sub',current_setting('teaching.cfi'),true);
set local role authenticated;
select lives_ok($$insert into public.cfi_schedule_teaching_rules(cfi_user_id,start_minute,latest_start_minute,end_minute,max_daily_span_min,weekdays)
  values(auth.uid(),480,840,900,360,array[1,3,5]::smallint[])$$,'instructor can customize teaching days and hours');
select is((select start_minute from public.cfi_schedule_teaching_rules where cfi_user_id=auth.uid()),480::smallint,'saved instructor start time is readable');
select throws_ok($$update public.cfi_schedule_teaching_rules set max_daily_span_min=540 where cfi_user_id=auth.uid()$$,'23514',null,'daily teaching span cannot exceed eight hours');
select throws_ok($$update public.cfi_schedule_teaching_rules set max_daily_teaching_min=540 where cfi_user_id=auth.uid()$$,'23514',null,'daily teaching total cannot exceed eight hours');
select lives_ok($$insert into public.cfi_schedule_time_off(cfi_user_id,start_at,end_at,note)
  values(auth.uid(),'2026-09-21T04:00:00Z','2026-09-24T04:00:00Z','Vacation')$$,'instructor can set a multi-day vacation');
select is((select count(*) from public.cfi_schedule_time_off where cfi_user_id=auth.uid()),1::bigint,'instructor sees own vacation');
select throws_ok($$insert into public.cfi_schedule_time_off(cfi_user_id,start_at,end_at)
  values(auth.uid(),'2026-09-24T04:00:00Z','2026-09-21T04:00:00Z')$$,'23514',null,'unavailable end must follow start');

select set_config('request.jwt.claim.sub',current_setting('teaching.other'),true);
select is((select count(*) from public.cfi_schedule_teaching_rules where cfi_user_id=current_setting('teaching.cfi')::uuid),0::bigint,'other users cannot read instructor rules');
select is((select count(*) from public.cfi_schedule_time_off where cfi_user_id=current_setting('teaching.cfi')::uuid),0::bigint,'other users cannot read private time-off reasons');
select throws_ok($$insert into public.cfi_schedule_time_off(cfi_user_id,start_at,end_at)
  values(current_setting('teaching.cfi')::uuid,'2026-09-25T04:00:00Z','2026-09-26T04:00:00Z')$$,'42501',null,'other users cannot add instructor time off');

reset role;
select * from finish();
rollback;
