begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email) values
 ('53000000-0000-4000-8000-000000000001','publisher-owner@example.test'),
 ('53000000-0000-4000-8000-000000000002','publisher-member@example.test'),
 ('53000000-0000-4000-8000-000000000003','publisher-outsider@example.test');
insert into public.profiles(id,email,display_name) values
 ('53000000-0000-4000-8000-000000000001','publisher-owner@example.test','Owner'),
 ('53000000-0000-4000-8000-000000000002','publisher-member@example.test','Member'),
 ('53000000-0000-4000-8000-000000000003','publisher-outsider@example.test','Outsider') on conflict(id) do update set display_name = excluded.display_name;
insert into public.organizations(id,name,created_by) values('53000000-0000-4000-8000-000000000010','Publication Test','53000000-0000-4000-8000-000000000001');
insert into public.organization_members(organization_id,user_id,role,added_by) values
 ('53000000-0000-4000-8000-000000000010','53000000-0000-4000-8000-000000000001','owner','53000000-0000-4000-8000-000000000001'),
 ('53000000-0000-4000-8000-000000000010','53000000-0000-4000-8000-000000000002','member','53000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub','53000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is((select count(*) from public.get_notification_publication_audience('53000000-0000-4000-8000-000000000010')),2::bigint,'audience contains only organization members');
select throws_ok($$select public.save_notification_publication('53000000-0000-4000-8000-000000000010','Test','Message','normal','sent',p_audience_user_ids=>array['53000000-0000-4000-8000-000000000003'::uuid])$$,'P0001','Audience contains unavailable members','outsiders cannot be targeted');
select throws_ok($$select public.save_notification_publication('53000000-0000-4000-8000-000000000010','Test','Message','normal','sent',p_action_url=>'//evil.example')$$,'P0001','Use a relative site link','external action is rejected');
select lives_ok($$select public.save_notification_publication('53000000-0000-4000-8000-000000000010','Scheduled test','Synthetic message','high','scheduled',now()+interval '1 hour',now()+interval '2 hours',p_requires_acknowledgement=>true)$$,'owner schedules message');
select is((select count(*) from public.notification_publications where title='Scheduled test'),1::bigint,'publisher can see publication');
select is((select count(*) from public.get_notification_publication_report((select id from public.notification_publications where title='Scheduled test'))),2::bigint,'report shows intended recipients');
select set_config('test.publication_id',(select id::text from public.notification_publications where title='Scheduled test'),true);
select lives_ok($$select public.save_notification_publication('53000000-0000-4000-8000-000000000010','Corrected test','Corrected message','high','sent',p_id=>current_setting('test.publication_id')::uuid)$$,'owner can publish correction');
select is((select revision from public.notification_publications where id=current_setting('test.publication_id')::uuid),2,'correction increments revision');
reset role;
select is((select count(*) from public.notifications where publication_id=current_setting('test.publication_id')::uuid and withdrawn_at is not null),2::bigint,'previous revision is withdrawn');
select is((select count(*) from public.notifications where publication_id=current_setting('test.publication_id')::uuid and withdrawn_at is null),2::bigint,'correction gets new receipt identities');
select set_config('request.jwt.claim.sub','53000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select count(*) from public.notification_publications),0::bigint,'ordinary member cannot read management history');
select throws_ok($$select public.get_notification_publication_report(current_setting('test.publication_id')::uuid)$$,'42501','Publishing permission required','ordinary member cannot inspect other receipts');
select throws_ok($$select public.withdraw_notification_publication(current_setting('test.publication_id')::uuid)$$,'42501','Publishing permission required','ordinary member cannot withdraw');
reset role;
select set_config('request.jwt.claim.sub','53000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok($$select public.withdraw_notification_publication(current_setting('test.publication_id')::uuid)$$,'owner withdraws publication');
select is((select status from public.notification_publications where id=current_setting('test.publication_id')::uuid),'withdrawn','management state is withdrawn');
reset role;
select is((select count(*) from public.notifications where publication_id=current_setting('test.publication_id')::uuid and withdrawn_at is null),0::bigint,'withdrawal removes all current recipient messages');
set local role authenticated;
select is((select count(*) from public.get_notification_publication_report(current_setting('test.publication_id')::uuid)),2::bigint,'withdrawn publication retains latest revision receipt history');
select throws_ok($$select public.save_notification_publication('53000000-0000-4000-8000-000000000010','Test','Message','normal','sent',p_audience_user_ids=>array[null::uuid])$$,'P0001','Audience contains unavailable members','null recipients are rejected');
reset role;
select * from finish();
rollback;
