begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select set_config(
  'pilotseal_test.instructor_id',
  (select id::text from public.profiles where email = 'instructor.one@example.test'),
  true
);
select set_config(
  'pilotseal_test.admin_id',
  (select id::text from public.profiles where email = 'pilot.one@example.test'),
  true
);

insert into public.saved_people (id, user_id, role, display_name, cert_number)
values
  ('85000000-0000-4000-8000-000000000001', current_setting('pilotseal_test.instructor_id')::uuid, 'student', 'Existing Student', 'KEEP-1'),
  ('85000000-0000-4000-8000-000000000002', current_setting('pilotseal_test.instructor_id')::uuid, 'student', 'Automatic Student', 'KEEP-2');

select set_config('request.jwt.claim.sub', current_setting('pilotseal_test.admin_id'), true);
set local role authenticated;
select set_config('pilotseal_test.explicit_invite_person', assigned_saved_person_id::text, true)
from public.create_organization_member_invitation_v3(
  '10000000-0000-4000-8000-000000000001',
  'explicit.merge@example.test', 'Existing Student', 'student',
  current_setting('pilotseal_test.instructor_id')::uuid,
  '85000000-0000-4000-8000-000000000001', null, null
);
select set_config('pilotseal_test.auto_invite_person', assigned_saved_person_id::text, true)
from public.create_organization_member_invitation_v3(
  '10000000-0000-4000-8000-000000000001',
  'automatic.merge@example.test', '  Automatic   Student ', 'student',
  current_setting('pilotseal_test.instructor_id')::uuid,
  null, null, null
);
reset role;

select is(
  current_setting('pilotseal_test.explicit_invite_person')::uuid,
  '85000000-0000-4000-8000-000000000001'::uuid,
  'an invitation can explicitly reuse the instructor existing student'
);
select is(
  current_setting('pilotseal_test.auto_invite_person')::uuid,
  '85000000-0000-4000-8000-000000000002'::uuid,
  'a unique normalized formal-name match is reused automatically'
);
select is(
  (select count(*) from public.saved_people
   where user_id = current_setting('pilotseal_test.instructor_id')::uuid
     and role = 'student' and display_name = 'Existing Student'),
  1::bigint,
  'explicit reuse does not leave a duplicate student shell'
);
select is(
  (select count(*) from public.saved_people
   where user_id = current_setting('pilotseal_test.instructor_id')::uuid
     and role = 'student'
     and lower(regexp_replace(btrim(display_name), '[[:space:]]+', ' ', 'g')) = 'automatic student'),
  1::bigint,
  'automatic reuse does not leave a duplicate student shell'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '85000000-0000-4000-8000-000000000010', 'authenticated', 'authenticated',
  'existing.duplicate@example.test', crypt('LocalTestPassword123!', gen_salt('bf')),
  timezone('utc', now()), '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb, timezone('utc', now()), timezone('utc', now())
);
insert into public.saved_people (id, user_id, role, display_name, cert_number)
values
  ('85000000-0000-4000-8000-000000000011', current_setting('pilotseal_test.instructor_id')::uuid, 'student', 'Original Record', 'ORIGINAL-11'),
  ('85000000-0000-4000-8000-000000000012', current_setting('pilotseal_test.instructor_id')::uuid, 'student', 'Duplicate Record', null);
insert into public.saved_person_account_links (owner_user_id, saved_person_id, linked_user_id)
values (
  current_setting('pilotseal_test.instructor_id')::uuid,
  '85000000-0000-4000-8000-000000000012',
  '85000000-0000-4000-8000-000000000010'
);
insert into public.saved_person_certificates (
  user_id, person_id, certificate_type, certificate_number
) values (
  current_setting('pilotseal_test.instructor_id')::uuid,
  '85000000-0000-4000-8000-000000000012', 'pilot', 'MOVED-12'
);
insert into public.endorsement_records (
  user_id, student_id, student_user_id, student_name, student_cert_number,
  instructor_name, endorsement_date, template_titles, storage_path
) values (
  current_setting('pilotseal_test.instructor_id')::uuid,
  '85000000-0000-4000-8000-000000000012',
  '85000000-0000-4000-8000-000000000010', 'Duplicate Record', 'MOVED-12',
  'Local Instructor', '09/10/2026', array['Merge test'], 'local/merge-test.pdf'
);

select set_config('request.jwt.claim.sub', current_setting('pilotseal_test.instructor_id'), true);
set local role authenticated;
select is(
  public.merge_saved_person_duplicate(
    '85000000-0000-4000-8000-000000000011',
    '85000000-0000-4000-8000-000000000012'
  ),
  '85000000-0000-4000-8000-000000000011'::uuid,
  'the owner can merge a linked duplicate into the original record'
);
reset role;

select is(
  (select saved_person_id from public.saved_person_account_links
   where linked_user_id = '85000000-0000-4000-8000-000000000010'),
  '85000000-0000-4000-8000-000000000011'::uuid,
  'the verified account link moves to the original record'
);
select is(
  (select student_id from public.endorsement_records
   where storage_path = 'local/merge-test.pdf'),
  '85000000-0000-4000-8000-000000000011'::uuid,
  'existing endorsement references move to the original record'
);
select is(
  (select person_id from public.saved_person_certificates
   where certificate_number = 'MOVED-12'),
  '85000000-0000-4000-8000-000000000011'::uuid,
  'instructor-held certificate details move to the original record'
);
select is(
  (select count(*) from public.saved_people
   where id = '85000000-0000-4000-8000-000000000012'),
  0::bigint,
  'the empty duplicate shell is removed after references move'
);
select is(
  (select count(*) from public.student_profile_change_log
   where student_user_id = '85000000-0000-4000-8000-000000000010'
     and change_kind = 'link_merge'),
  1::bigint,
  'the duplicate merge is audited'
);

select * from finish();
rollback;
