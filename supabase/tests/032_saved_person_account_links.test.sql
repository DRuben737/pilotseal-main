begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

select has_table('public', 'saved_person_account_links', 'saved person account links table exists');
select has_table('public', 'saved_person_account_link_requests', 'saved person link requests table exists');
select has_function('public', 'request_saved_person_account_link', array['uuid', 'text'], 'request function exists');
select has_function('public', 'respond_saved_person_account_link_request', array['uuid', 'boolean'], 'response function exists');
select has_function('public', 'list_my_saved_person_link_requests', array[]::text[], 'request inbox function exists');
select has_function('public', 'list_my_saved_person_account_links', array[]::text[], 'account context function exists');
select has_function('public', 'unlink_saved_person_account', array['uuid'], 'unlink function exists');
select is((select relrowsecurity from pg_class join pg_namespace on pg_namespace.oid = pg_class.relnamespace where pg_namespace.nspname = 'public' and pg_class.relname = 'saved_person_account_links'), true, 'links use RLS');
select is((select relrowsecurity from pg_class join pg_namespace on pg_namespace.oid = pg_class.relnamespace where pg_namespace.nspname = 'public' and pg_class.relname = 'saved_person_account_link_requests'), true, 'requests use RLS');

select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'platform.admin@example.test'), true);
set local role authenticated;
select is((select count(*) from public.get_my_organizations()), 0::bigint, 'platform administrators are not synthetic organization members');
reset role;
insert into public.organization_members (organization_id, user_id, role, teaching_role, added_by)
values ('10000000-0000-4000-8000-000000000001', (select id from public.profiles where email = 'platform.admin@example.test'), 'member', 'instructor', (select id from public.profiles where email = 'pilot.one@example.test'));
set local role authenticated;
select is((select member_role from public.get_my_organizations() limit 1), 'platform_admin', 'a real platform-admin member keeps effective platform access');
reset role;

insert into public.saved_people (id, user_id, role, display_name, cert_number)
values ('40000000-0000-4000-8000-000000000001', (select id from public.profiles where email = 'pilot.one@example.test'), 'student', 'Linked Student Fixture', 'TEST-100');

select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'pilot.one@example.test'), true);
set local role authenticated;
select lives_ok($$select public.request_saved_person_account_link('40000000-0000-4000-8000-000000000001', 'instructor.one@example.test')$$, 'owner can request a link to a verified account');
select is((select count(*) from public.saved_person_account_link_requests where saved_person_id = '40000000-0000-4000-8000-000000000001' and status = 'pending'), 1::bigint, 'link stays pending until student accepts');
select is((select count(*) from public.saved_person_account_links where saved_person_id = '40000000-0000-4000-8000-000000000001'), 0::bigint, 'request does not create a formal link');
select throws_ok($$select public.request_saved_person_account_link('40000000-0000-4000-8000-000000000001', 'pilot.one@example.test')$$, '22023', 'A saved person cannot be linked to your own account.', 'owners cannot request links to themselves');

reset role;
select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'instructor.one@example.test'), true);
set local role authenticated;
select is((select count(*) from public.list_my_saved_person_link_requests() where direction = 'incoming' and status = 'pending'), 1::bigint, 'target sees the pending request');
select lives_ok($$select public.respond_saved_person_account_link_request((select id from public.saved_person_account_link_requests where saved_person_id = '40000000-0000-4000-8000-000000000001'), true)$$, 'target can accept the request');
select is((select count(*) from public.saved_person_account_links), 0::bigint, 'target cannot read the owner private link row');
select is((select count(*) from public.list_my_saved_person_account_links()), 0::bigint, 'target cannot discover owner context through the owner RPC');
select is((select count(*) from public.list_my_saved_person_link_requests() where status = 'accepted'), 1::bigint, 'target sees the accepted identity request');

reset role;
select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'pilot.one@example.test'), true);
set local role authenticated;
select ok((select linked_user_id is not null from public.saved_person_account_links where saved_person_id = '40000000-0000-4000-8000-000000000001'), 'acceptance creates the formal logical link');
select is((select shared_organization_names from public.list_my_saved_person_account_links() where saved_person_id = '40000000-0000-4000-8000-000000000001'), array['PilotSeal Local Test School']::text[], 'accepted identity includes shared organizations');
select is((select count(*) from public.saved_person_account_links), 1::bigint, 'owner still has the accepted logical link');
select is((select count(*) from public.saved_person_account_link_requests where status = 'accepted'), 1::bigint, 'acceptance remains in the audit trail');

reset role;
select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'instructor.one@example.test'), true);
set local role authenticated;
select lives_ok($$select public.unlink_saved_person_account('40000000-0000-4000-8000-000000000001')$$, 'linked student can unlink their identity');
reset role;
select is((select count(*) from public.saved_person_account_links), 0::bigint, 'student unlink removes the logical link');

set local role anon;
select throws_ok($$select public.request_saved_person_account_link('40000000-0000-4000-8000-000000000001', 'instructor.one@example.test')$$, '42501', 'permission denied for function request_saved_person_account_link', 'anonymous callers cannot execute requests');

select * from finish();
rollback;
