begin;
create extension if not exists pgtap with schema extensions;
select plan(7);
insert into auth.users(id,email) values
 ('56000000-0000-4000-8000-000000000001','group-owner@example.test'),
 ('56000000-0000-4000-8000-000000000002','group-student@example.test'),
 ('56000000-0000-4000-8000-000000000003','group-admin@example.test');
insert into public.profiles(id,email,display_name,role) values
 ('56000000-0000-4000-8000-000000000001','group-owner@example.test','Group Owner','user'),
 ('56000000-0000-4000-8000-000000000002','group-student@example.test','Group Student','user'),
 ('56000000-0000-4000-8000-000000000003','group-admin@example.test','Group Admin','admin')
 on conflict(id) do update set display_name=excluded.display_name,role=excluded.role;
insert into public.organizations(id,name,created_by) values('56000000-0000-4000-8000-000000000010','Group School','56000000-0000-4000-8000-000000000001');
insert into public.organization_members(organization_id,user_id,role,teaching_role,added_by) values
 ('56000000-0000-4000-8000-000000000010','56000000-0000-4000-8000-000000000001','owner','instructor','56000000-0000-4000-8000-000000000001'),
 ('56000000-0000-4000-8000-000000000010','56000000-0000-4000-8000-000000000002','member','student','56000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub','56000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is((select count(*) from public.get_notification_publication_audience_groups('56000000-0000-4000-8000-000000000010')),2::bigint,'group audience includes only organization members');
select is((select group_keys from public.get_notification_publication_audience_groups('56000000-0000-4000-8000-000000000010') where user_id=auth.uid()),array['instructors','administrators']::text[],'teaching and management groups may overlap');
select is((select group_keys from public.get_notification_publication_audience_groups('56000000-0000-4000-8000-000000000010') where user_id='56000000-0000-4000-8000-000000000002'),array['students']::text[],'student membership is exposed as group');
select throws_ok($$select public.get_notification_publication_audience_groups(null)$$,'42501','Publishing permission required','organization owner cannot inspect platform audience');
reset role;
select set_config('request.jwt.claim.sub','56000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok($$select public.get_notification_publication_audience_groups('56000000-0000-4000-8000-000000000010')$$,'42501','Publishing permission required','ordinary member cannot enumerate publisher audience');
reset role;
select set_config('request.jwt.claim.sub','56000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is((select group_keys from public.get_notification_publication_audience_groups(null) where user_id=auth.uid()),array['administrators']::text[],'platform administrator group is based on trusted profile role');
reset role;
set local role anon;
select throws_ok($$select public.get_notification_publication_audience_groups(null)$$,'42501',null,'anonymous access is denied');
reset role;
select * from finish();
rollback;
