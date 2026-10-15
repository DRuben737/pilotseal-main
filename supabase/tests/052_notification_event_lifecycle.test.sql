begin;
create extension if not exists pgtap with schema extensions;
select plan(5);
insert into auth.users(id,email) values('54000000-0000-4000-8000-000000000001','notification-lifecycle@example.test');
insert into public.notifications(id,title,status,is_active,kind,dedupe_key,recipient_user_id) values
 ('54000000-0000-4000-8000-000000000010','Lesson changed','sent',true,'schedule','cfi-schedule-event:lesson-123:12345','54000000-0000-4000-8000-000000000001'),
 ('54000000-0000-4000-8000-000000000011','Add name','sent',true,'reminder','profile-completion:display-name','54000000-0000-4000-8000-000000000001'),
 ('54000000-0000-4000-8000-000000000012','Certificate due','sent',true,'reminder','certificate:cert-123:2026-11-20:30-days','54000000-0000-4000-8000-000000000001');
select is((select event_key from public.notifications where id='54000000-0000-4000-8000-000000000010'),'cfi-schedule-event:lesson-123','schedule updates share one event identity');
select is((select event_key from public.notifications where id='54000000-0000-4000-8000-000000000012'),'certificate:cert-123:2026-11-20','certificate stages share one deadline identity');
select is((select count(*) from public.notification_delivery_states where notification_id='54000000-0000-4000-8000-000000000011'),0::bigint,'creating a reminder does not complete it');
update public.notifications set is_active=false where id='54000000-0000-4000-8000-000000000011';
select is((select completed_at is not null from public.notification_delivery_states where notification_id='54000000-0000-4000-8000-000000000011'),true,'profile resolver records business completion');
update public.notifications set is_active=false,withdrawn_at=now() where id='54000000-0000-4000-8000-000000000012';
select is((select count(*) from public.notification_delivery_states where notification_id='54000000-0000-4000-8000-000000000012' and completed_at is not null),0::bigint,'withdrawal is not completion');
select * from finish();
rollback;
