begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users(id,email) values
 ('57000000-0000-4000-8000-000000000001','status-owner@example.test'),
 ('57000000-0000-4000-8000-000000000002','status-active@example.test'),
 ('57000000-0000-4000-8000-000000000003','status-inactive@example.test');
insert into public.profiles(id,email,display_name) values
 ('57000000-0000-4000-8000-000000000001','status-owner@example.test','Status Owner'),
 ('57000000-0000-4000-8000-000000000002','status-active@example.test','Active Student'),
 ('57000000-0000-4000-8000-000000000003','status-inactive@example.test','Inactive Student')
 on conflict(id) do update set display_name=excluded.display_name;
insert into public.organizations(id,name,created_by)
 values('57000000-0000-4000-8000-000000000010','Status School','57000000-0000-4000-8000-000000000001');
insert into public.organization_members(organization_id,user_id,role,teaching_role,student_status,added_by) values
 ('57000000-0000-4000-8000-000000000010','57000000-0000-4000-8000-000000000001','owner','instructor','active','57000000-0000-4000-8000-000000000001'),
 ('57000000-0000-4000-8000-000000000010','57000000-0000-4000-8000-000000000002','member','student','active','57000000-0000-4000-8000-000000000001'),
 ('57000000-0000-4000-8000-000000000010','57000000-0000-4000-8000-000000000003','member','student','active','57000000-0000-4000-8000-000000000001');

select set_config('request.jwt.claim.sub','57000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is((select count(*) from public.get_notification_publication_audience('57000000-0000-4000-8000-000000000010')),3::bigint,'all current members begin in the notification audience');
select lives_ok($$select public.save_notification_publication('57000000-0000-4000-8000-000000000010','Future status test','Synthetic message','normal','scheduled',now()+interval '1 hour')$$,'owner schedules a future notification');
select lives_ok($$select public.set_organization_student_status('57000000-0000-4000-8000-000000000010','57000000-0000-4000-8000-000000000003','inactive')$$,'owner marks a student inactive');
select is((select student_status from public.list_organization_members('57000000-0000-4000-8000-000000000010') where user_id='57000000-0000-4000-8000-000000000003'),'inactive','student status is persisted');
select is((select count(*) from public.get_notification_publication_audience('57000000-0000-4000-8000-000000000010')),2::bigint,'inactive student is excluded from automatic notification audience');
select is((select count(*) from public.get_notification_publication_audience_groups('57000000-0000-4000-8000-000000000010') where user_id='57000000-0000-4000-8000-000000000003'),0::bigint,'inactive student is absent from audience groups');
reset role;
select is((select count(*) from public.notifications where recipient_user_id='57000000-0000-4000-8000-000000000003' and title='Future status test' and withdrawn_at is not null),1::bigint,'pending future notification is withdrawn when student becomes inactive');
set local role authenticated;
select throws_ok($$select public.save_notification_publication('57000000-0000-4000-8000-000000000010','Unavailable target','Synthetic message','normal','sent',p_audience_user_ids=>array['57000000-0000-4000-8000-000000000003'::uuid])$$,'P0001','Audience contains unavailable members','inactive student cannot be selected explicitly');
select lives_ok($$select public.set_organization_student_status('57000000-0000-4000-8000-000000000010','57000000-0000-4000-8000-000000000003','active')$$,'owner reactivates a student');
select is((select count(*) from public.get_notification_publication_audience('57000000-0000-4000-8000-000000000010')),3::bigint,'reactivated student returns to the notification audience');
reset role;

select * from finish();
rollback;
