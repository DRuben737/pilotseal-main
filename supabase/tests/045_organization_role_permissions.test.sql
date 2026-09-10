begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public', 'organization_role_permissions', 'organization role permission templates exist');
select has_function('public', 'list_organization_role_permissions', array['uuid'], 'role permission list RPC exists');
select has_function('public', 'set_organization_role_permissions', array['uuid','text','text[]'], 'role permission update RPC exists');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '85000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'permission.owner@example.test', crypt('LocalOnlyPassword123!', gen_salt('bf')), timezone('utc', now()),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, timezone('utc', now()), timezone('utc', now())),
  ('00000000-0000-0000-0000-000000000000', '85000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'permission.member@example.test', crypt('LocalOnlyPassword123!', gen_salt('bf')), timezone('utc', now()),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, timezone('utc', now()), timezone('utc', now()));

insert into public.organizations (id, name, created_by)
values ('85000000-0000-4000-8000-000000000010', 'Permission Test Organization', '85000000-0000-4000-8000-000000000001');

insert into public.organization_members (organization_id, user_id, role, added_by)
values
  ('85000000-0000-4000-8000-000000000010', '85000000-0000-4000-8000-000000000001', 'owner', '85000000-0000-4000-8000-000000000001'),
  ('85000000-0000-4000-8000-000000000010', '85000000-0000-4000-8000-000000000002', 'member', '85000000-0000-4000-8000-000000000001');

select is(
  (select permissions from public.organization_role_permissions
   where organization_id = '85000000-0000-4000-8000-000000000010' and role = 'organization_admin'),
  array['members', 'fleet', 'endorsements', 'notifications', 'audit']::text[],
  'new organizations give the admin role all capabilities by default'
);
select is(
  (select permissions from public.organization_role_permissions
   where organization_id = '85000000-0000-4000-8000-000000000010' and role = 'member'),
  '{}'::text[],
  'new organizations give the member role no management capabilities by default'
);

select set_config('request.jwt.claim.sub', '85000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select lives_ok(
  $$select public.set_organization_role_permissions(
    '85000000-0000-4000-8000-000000000010', 'member', array['notifications', 'fleet', 'fleet']
  )$$,
  'owner can assign multiple permissions to a role'
);
select is(
  (select permissions from public.list_organization_role_permissions('85000000-0000-4000-8000-000000000010') where role = 'member'),
  array['fleet', 'notifications']::text[],
  'role permissions are normalized and deduplicated'
);
select throws_ok(
  $$select public.set_organization_role_permissions(
    '85000000-0000-4000-8000-000000000010', 'member', array['unknown']
  )$$,
  '22023', 'One or more role permissions are invalid.',
  'unknown permissions are rejected'
);

select set_config('request.jwt.claim.sub', '85000000-0000-4000-8000-000000000002', true);
select is(
  (select permissions from public.get_my_organizations() where id = '85000000-0000-4000-8000-000000000010'),
  array['fleet', 'notifications']::text[],
  'a member receives the capabilities assigned to the member role'
);
select throws_ok(
  $$select public.set_organization_role_permissions(
    '85000000-0000-4000-8000-000000000010', 'member', array['members']
  )$$,
  '42501', 'Only the organization owner can change role permissions.',
  'a member cannot redefine role templates'
);
select throws_ok(
  $$select * from public.list_organization_members('85000000-0000-4000-8000-000000000010')$$,
  '42501', 'You do not have permission to view this organization''s members.',
  'a member without Members permission cannot call the member management API'
);
select throws_ok(
  $$select * from public.list_aircraft_assignment_audit('85000000-0000-4000-8000-000000000010', 10)$$,
  '42501', 'Organization manager access is required.',
  'a member without Audit permission cannot call the organization audit API'
);
select throws_ok(
  $$select * from public.list_organization_endorsement_records('85000000-0000-4000-8000-000000000010')$$,
  '42501', 'Organization instructor or administrator access is required.',
  'a member without Endorsements permission cannot call the endorsement review API'
);
select lives_ok(
  $$select public.create_organization_notification(
    '85000000-0000-4000-8000-000000000010', 'Local test', 'Permission template test', 'normal', '/dashboard/notifications'
  )$$,
  'a member with Notifications permission can publish an organization notification'
);

reset role;
select * from finish();
rollback;
