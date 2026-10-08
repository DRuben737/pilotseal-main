begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '89000000-0000-4000-8000-000000000049', 'authenticated', 'authenticated',
  'direct.member@example.test', crypt('LocalTestPassword123!', gen_salt('bf')),
  timezone('utc', now()),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  timezone('utc', now()), timezone('utc', now())
);

select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles where email = 'platform.admin@example.test'),
  true
);
set local role authenticated;
select set_config('pilotseal_test.direct_invitation_id', invitation_id::text, true)
from public.create_organization_member_invitation_v2(
  '10000000-0000-4000-8000-000000000001',
  'direct.member@example.test', 'Direct Member', 'instructor', null, null, null
);
reset role;

select is(
  (select status from public.organization_people
   where organization_id = '10000000-0000-4000-8000-000000000001'
     and normalized_email = 'direct.member@example.test'),
  'pending',
  'invitation starts with a pending roster row'
);

set local role authenticated;
select lives_ok(
  $$select public.add_organization_member_by_email(
    '10000000-0000-4000-8000-000000000001', 'DIRECT.MEMBER@example.test'
  )$$,
  'an organization manager can directly add a verified account with a pending invitation'
);
reset role;

select is(
  (select count(*) from public.organization_members
   where organization_id = '10000000-0000-4000-8000-000000000001'
     and user_id = '89000000-0000-4000-8000-000000000049'),
  1::bigint,
  'direct add creates membership'
);
select is(
  (select status from public.organization_people
   where organization_id = '10000000-0000-4000-8000-000000000001'
     and normalized_email = 'direct.member@example.test'),
  'linked',
  'direct add links the pending roster row'
);
select is(
  (select user_id from public.organization_people
   where organization_id = '10000000-0000-4000-8000-000000000001'
     and normalized_email = 'direct.member@example.test'),
  '89000000-0000-4000-8000-000000000049'::uuid,
  'linked roster row points to the verified account'
);
select is(
  (select status from public.organization_member_invitations
   where id = current_setting('pilotseal_test.direct_invitation_id')::uuid),
  'revoked',
  'direct add closes the unused invitation'
);
set local role authenticated;
select lives_ok(
  $$select public.add_organization_member_by_email(
    '10000000-0000-4000-8000-000000000001', 'direct.member@example.test'
  )$$,
  'direct add is safe to retry for an existing member'
);
reset role;
select is(
  (select count(*) from public.organization_members
   where organization_id = '10000000-0000-4000-8000-000000000001'
     and user_id = '89000000-0000-4000-8000-000000000049'),
  1::bigint,
  'retry does not duplicate membership'
);

select * from finish();
rollback;
