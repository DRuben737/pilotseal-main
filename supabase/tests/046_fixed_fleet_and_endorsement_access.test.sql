begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '86000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'fixed.owner@example.test', crypt('LocalOnlyPassword123!', gen_salt('bf')), timezone('utc', now()),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, timezone('utc', now()), timezone('utc', now())),
  ('00000000-0000-0000-0000-000000000000', '86000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'fixed.member@example.test', crypt('LocalOnlyPassword123!', gen_salt('bf')), timezone('utc', now()),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, timezone('utc', now()), timezone('utc', now())),
  ('00000000-0000-0000-0000-000000000000', '86000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   'fixed.admin@example.test', crypt('LocalOnlyPassword123!', gen_salt('bf')), timezone('utc', now()),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, timezone('utc', now()), timezone('utc', now())),
  ('00000000-0000-0000-0000-000000000000', '86000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated',
   'fixed.cfi@example.test', crypt('LocalOnlyPassword123!', gen_salt('bf')), timezone('utc', now()),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, timezone('utc', now()), timezone('utc', now())),
  ('00000000-0000-0000-0000-000000000000', '86000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated',
   'fixed.student@example.test', crypt('LocalOnlyPassword123!', gen_salt('bf')), timezone('utc', now()),
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, timezone('utc', now()), timezone('utc', now()));

insert into public.organizations (id, name, created_by)
values ('86000000-0000-4000-8000-000000000010', 'Fixed Access Test Organization', '86000000-0000-4000-8000-000000000001');

insert into public.organization_members (organization_id, user_id, role, teaching_role, added_by)
values
  ('86000000-0000-4000-8000-000000000010', '86000000-0000-4000-8000-000000000001', 'owner', null, '86000000-0000-4000-8000-000000000001'),
  ('86000000-0000-4000-8000-000000000010', '86000000-0000-4000-8000-000000000002', 'member', null, '86000000-0000-4000-8000-000000000001'),
  ('86000000-0000-4000-8000-000000000010', '86000000-0000-4000-8000-000000000003', 'organization_admin', null, '86000000-0000-4000-8000-000000000001'),
  ('86000000-0000-4000-8000-000000000010', '86000000-0000-4000-8000-000000000004', 'member', 'instructor', '86000000-0000-4000-8000-000000000001'),
  ('86000000-0000-4000-8000-000000000010', '86000000-0000-4000-8000-000000000005', 'member', 'student', '86000000-0000-4000-8000-000000000001');

-- Simulate stale/custom templates that attempted to grant Fleet to Member and
-- removed all Admin capabilities. Effective access must still honor the fixed boundary.
update public.organization_role_permissions
set permissions = array['fleet']::text[]
where organization_id = '86000000-0000-4000-8000-000000000010' and role = 'member';
update public.organization_role_permissions
set permissions = '{}'::text[]
where organization_id = '86000000-0000-4000-8000-000000000010' and role = 'organization_admin';

insert into public.aircraft (
  id, model_id, tail_number, name, visibility, organization_id, created_by, updated_by
) values (
  '86000000-0000-4000-8000-000000000020', '20000000-0000-4000-8000-000000000001',
  'NFIXED1', 'Fixed Access Aircraft',
  'organization', '86000000-0000-4000-8000-000000000010',
  '86000000-0000-4000-8000-000000000001', '86000000-0000-4000-8000-000000000001'
);

insert into public.endorsement_records (
  id, user_id, student_user_id, student_name, student_cert_number,
  instructor_name, instructor_cert_number, endorsement_date,
  template_titles, storage_path, file_size_bytes
) values (
  '86000000-0000-4000-8000-000000000030',
  '86000000-0000-4000-8000-000000000004',
  '86000000-0000-4000-8000-000000000005',
  'Fixed Student', 'CERT-FIXED', 'Fixed CFI', 'CFI-FIXED', '09/12/2026',
  array['Fixed access endorsement'],
  '86000000-0000-4000-8000-000000000004/86000000-0000-4000-8000-000000000030.pdf', 1000
);

select is(
  (select count(*) from private.endorsement_record_organization_access
   where record_id = '86000000-0000-4000-8000-000000000030'
     and organization_id = '86000000-0000-4000-8000-000000000010'),
  1::bigint,
  'CFI-to-student endorsement is associated with their active organization'
);

select set_config('request.jwt.claim.sub', '86000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select is(
  (select permissions from public.get_my_organizations()
   where id = '86000000-0000-4000-8000-000000000010'),
  '{}'::text[],
  'ordinary Member never receives Fleet even from a stale role template'
);
select is(
  (select count(*) from public.aircraft where id = '86000000-0000-4000-8000-000000000020'),
  1::bigint,
  'ordinary Member can still read an organization aircraft needed by operational records'
);
select is_empty(
  $$delete from public.aircraft where id = '86000000-0000-4000-8000-000000000020' returning id$$,
  'ordinary Member cannot delete organization aircraft through the Data API'
);
select throws_ok(
  $$select * from public.list_organization_endorsement_records('86000000-0000-4000-8000-000000000010')$$,
  '42501', 'Organization instructor or administrator access is required.',
  'ordinary Member cannot review organization endorsement history'
);

select set_config('request.jwt.claim.sub', '86000000-0000-4000-8000-000000000003', true);
select is(
  (select permissions from public.get_my_organizations()
   where id = '86000000-0000-4000-8000-000000000010'),
  array['endorsements', 'fleet']::text[],
  'Organization Admin always receives Endorsements and Fleet capabilities'
);
select is(
  (select count(*) from public.list_organization_endorsement_records('86000000-0000-4000-8000-000000000010')
   where id = '86000000-0000-4000-8000-000000000030'),
  1::bigint,
  'Organization Admin can see endorsements issued by organization CFIs to organization students'
);

reset role;
select is(
  (select count(*) from public.aircraft where id = '86000000-0000-4000-8000-000000000020'),
  1::bigint,
  'failed Member delete leaves the aircraft intact'
);

select * from finish();
rollback;
