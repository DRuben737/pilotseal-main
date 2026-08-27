begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

select has_table('public', 'organization_registration_requests', 'company registration request table exists');
select has_table('public', 'organization_member_invitations', 'organization invitation table exists');
select has_function('public', 'review_organization_registration_request', array['uuid','text','text'], 'platform review RPC exists');
select has_function('public', 'accept_organization_member_invitation', array['text'], 'invitation acceptance RPC exists');
select ok(not has_function_privilege('authenticated', 'public.add_organization_person(uuid,text,text,text,text,text)', 'execute'), 'legacy direct roster add is unavailable to clients');
select ok(not has_function_privilege('authenticated', 'public.claim_organization_person(uuid)', 'execute'), 'legacy email-only claim is unavailable to clients');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '80000000-0000-4000-8000-000000000035', 'authenticated', 'authenticated',
  'company.owner@example.test', crypt('LocalTestPassword123!', gen_salt('bf')), null,
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"account_type":"company","company_name":"Approval Test Aviation"}'::jsonb,
  timezone('utc', now()), timezone('utc', now())
);

select is((select count(*) from public.organization_registration_requests where requester_user_id = '80000000-0000-4000-8000-000000000035'), 1::bigint, 'company signup creates one pending request');
select is((select count(*) from public.organizations where name = 'Approval Test Aviation'), 0::bigint, 'company signup does not create an organization before approval');

select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'pilot.one@example.test'), true);
set local role authenticated;
select throws_ok(
  $$select public.review_organization_registration_request((select id from public.organization_registration_requests where requester_user_id = '80000000-0000-4000-8000-000000000035'), 'approved', 'Not an admin')$$,
  '42501', 'Platform administrator access is required.',
  'organization member cannot approve a company request'
);
reset role;

select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'platform.admin@example.test'), true);
set local role authenticated;
select throws_ok(
  $$select public.review_organization_registration_request((select id from public.organization_registration_requests where requester_user_id = '80000000-0000-4000-8000-000000000035'), 'approved', 'Review completed')$$,
  '42501', 'The requester must verify their email before approval.',
  'platform admin cannot approve an unverified owner email'
);
reset role;

update auth.users set email_confirmed_at = timezone('utc', now()) where id = '80000000-0000-4000-8000-000000000035';
select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'platform.admin@example.test'), true);
set local role authenticated;
select lives_ok(
  $$select public.review_organization_registration_request((select id from public.organization_registration_requests where requester_user_id = '80000000-0000-4000-8000-000000000035'), 'approved', 'Verified company registration')$$,
  'platform admin can approve a verified company request'
);
reset role;
select is((select status from public.organization_registration_requests where requester_user_id = '80000000-0000-4000-8000-000000000035'), 'approved', 'approved request is recorded');
select is((select count(*) from public.organization_members members join public.organizations organizations on organizations.id = members.organization_id where organizations.name = 'Approval Test Aviation' and members.user_id = '80000000-0000-4000-8000-000000000035' and members.role = 'owner'), 1::bigint, 'approval creates the requester as organization Owner');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '81000000-0000-4000-8000-000000000035', 'authenticated', 'authenticated',
  'invited.member@example.test', crypt('LocalTestPassword123!', gen_salt('bf')), null,
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  timezone('utc', now()), timezone('utc', now())
);

select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'pilot.one@example.test'), true);
set local role authenticated;
select set_config('pilotseal_test.invite_token', invite_token, true)
from public.create_organization_member_invitation(
  '10000000-0000-4000-8000-000000000001', 'invited.member@example.test',
  'Invited Member', 'student', 'STU-35', 'Invitation test'
);
reset role;

select ok(char_length(current_setting('pilotseal_test.invite_token')) = 64, 'invitation returns a high-entropy token once');
select ok(not exists (select 1 from public.organization_member_invitations where token_hash = current_setting('pilotseal_test.invite_token')), 'plaintext invitation token is not stored');
select is((select count(*) from public.organization_member_invitations where token_hash = encode(extensions.digest(current_setting('pilotseal_test.invite_token'), 'sha256'), 'hex')), 1::bigint, 'only the invitation token hash is stored');

set local role anon;
select is((select organization_name from public.get_organization_invitation(current_setting('pilotseal_test.invite_token'))), 'PilotSeal Local Test School', 'anonymous recipient can preview the organization through the unguessable token');
reset role;

select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'instructor.one@example.test'), true);
set local role authenticated;
select throws_ok(
  $$select public.accept_organization_member_invitation(current_setting('pilotseal_test.invite_token'))$$,
  '42501', 'This invitation belongs to a different verified email.',
  'a different signed-in email cannot accept the invitation'
);
reset role;

select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000035', true);
set local role authenticated;
select throws_ok(
  $$select public.accept_organization_member_invitation(current_setting('pilotseal_test.invite_token'))$$,
  '42501', 'Verify your email before joining the organization.',
  'invited account must verify its email before joining'
);
reset role;

update auth.users set email_confirmed_at = timezone('utc', now()) where id = '81000000-0000-4000-8000-000000000035';
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000035', true);
set local role authenticated;
select lives_ok(
  $$select public.accept_organization_member_invitation(current_setting('pilotseal_test.invite_token'))$$,
  'verified invited account can accept the one-time invitation'
);
select throws_ok(
  $$select public.accept_organization_member_invitation(current_setting('pilotseal_test.invite_token'))$$,
  'P0002', 'This invitation is no longer available.',
  'accepted invitation cannot be reused'
);
reset role;

select is((select count(*) from public.organization_members where organization_id = '10000000-0000-4000-8000-000000000001' and user_id = '81000000-0000-4000-8000-000000000035'), 1::bigint, 'acceptance creates current organization membership');
select is((select count(*) from public.organization_membership_periods where organization_id = '10000000-0000-4000-8000-000000000001' and user_id = '81000000-0000-4000-8000-000000000035' and left_at is null), 1::bigint, 'acceptance opens a membership period');

select * from finish();
rollback;
