begin;
create extension if not exists pgtap with schema extensions;
select plan(13);
insert into auth.users(id, email) values
 ('50000000-0000-4000-8000-000000000001','delivery-a@example.test'),
 ('50000000-0000-4000-8000-000000000002','delivery-b@example.test');
insert into public.notifications(id, title, message, status, is_active, kind, priority) values
 ('51000000-0000-4000-8000-000000000001','Notice A','Synthetic A','sent',true,'system','normal'),
 ('51000000-0000-4000-8000-000000000002','Notice B','Synthetic B','sent',true,'system','normal');
insert into public.notifications(id, title, status, is_active, kind, recipient_user_id) values
 ('51000000-0000-4000-8000-000000000003','Private notice','sent',true,'organization','50000000-0000-4000-8000-000000000002');
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is(cardinality(public.reserve_notification_deliveries(array['51000000-0000-4000-8000-000000000001'::uuid,'51000000-0000-4000-8000-000000000002'::uuid], '52000000-0000-4000-8000-000000000001')),2,'reserve a same-source burst');
select is((select count(*) from public.notification_delivery_states where displayed_at is not null),0::bigint,'reservation does not mark presented');
select is(cardinality(public.reserve_notification_deliveries(array['51000000-0000-4000-8000-000000000001'::uuid], '52000000-0000-4000-8000-000000000002')),0,'competing session cannot reserve an active lease');
select lives_ok($$select public.confirm_notification_deliveries('52000000-0000-4000-8000-000000000001')$$,'confirm visible group');
select is((select count(*) from public.notification_delivery_states where displayed_at is not null),2::bigint,'confirmation records both cards');
select is(cardinality(public.reserve_notification_deliveries(array['51000000-0000-4000-8000-000000000003'::uuid], '52000000-0000-4000-8000-000000000003')),0,'inaccessible message is not deliverable');
select throws_ok($$insert into public.notification_delivery_states(notification_id,user_id) values ('51000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002')$$,'42501',null,'cannot write another recipient state');
reset role;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select count(*) from public.notification_delivery_states),0::bigint,'another recipient cannot see state');
insert into public.notification_preferences(user_id,delivery_modes) values ('50000000-0000-4000-8000-000000000002','{"system":"inbox","organization":"instant","schedule":"instant","reminder":"inbox"}');
select is(cardinality(public.reserve_notification_deliveries(array['51000000-0000-4000-8000-000000000001'::uuid], '52000000-0000-4000-8000-000000000004')),0,'server enforces inbox-only preference');
select is(cardinality(public.reserve_notification_deliveries(array['51000000-0000-4000-8000-000000000003'::uuid], '52000000-0000-4000-8000-000000000005')),1,'intended recipient can reserve private message');
reset role;
update public.notification_delivery_states set claim_until = now() - interval '1 second' where user_id = '50000000-0000-4000-8000-000000000002';
set local role authenticated;
select is(cardinality(public.reserve_notification_deliveries(array['51000000-0000-4000-8000-000000000003'::uuid], '52000000-0000-4000-8000-000000000006')),1,'abandoned lease is recoverable');
select public.confirm_notification_deliveries('52000000-0000-4000-8000-000000000005');
select is((select count(*) from public.notification_delivery_states where displayed_at is not null),0::bigint,'stale token cannot confirm a replacement lease');
select public.confirm_notification_deliveries('52000000-0000-4000-8000-000000000006');
select is((select count(*) from public.notification_delivery_states where displayed_at is not null),1::bigint,'current token confirms recovered lease');
select * from finish();
rollback;
