begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

select has_column(
  'public', 'organization_member_invitations', 'assigned_instructor_user_id',
  'organization invitation stores its assigned instructor'
);
select has_column(
  'public', 'organization_member_invitations', 'assigned_saved_person_id',
  'organization invitation stores the instructor Saved People identity'
);
select has_function(
  'public', 'create_organization_member_invitation_v2',
  array['uuid','text','text','text','uuid','text','text'],
  'assigned-instructor invitation RPC exists'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '82000000-0000-4000-8000-000000000042', 'authenticated', 'authenticated',
  'assigned.student@example.test', crypt('LocalTestPassword123!', gen_salt('bf')),
  timezone('utc', now()),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"FunNickname"}'::jsonb,
  timezone('utc', now()), timezone('utc', now())
);

update public.profiles
set display_name = 'FunNickname'
where id = '82000000-0000-4000-8000-000000000042';

select set_config(
  'pilotseal_test.instructor_id',
  (select id::text from public.profiles where email = 'instructor.one@example.test'),
  true
);
select set_config(
  'pilotseal_test.instructor_name',
  (select coalesce(nullif(btrim(display_name), ''), email)
   from public.profiles where email = 'instructor.one@example.test'),
  true
);
select set_config(
  'pilotseal_test.pilot_id',
  (select id::text from public.profiles where email = 'pilot.one@example.test'),
  true
);

select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles where email = 'pilot.one@example.test'),
  true
);
set local role authenticated;
select throws_ok(
  $$select * from public.create_organization_member_invitation_v2(
    '10000000-0000-4000-8000-000000000001',
    'assigned.student@example.test', 'Legal Student Name', 'student', null, null, null
  )$$,
  '22023', 'Select a current organization instructor.',
  'student invitation requires an assigned instructor'
);
select throws_ok(
  $$select * from public.create_organization_member_invitation_v2(
    '10000000-0000-4000-8000-000000000001',
    'assigned.student@example.test', 'Legal Student Name', 'student',
    current_setting('pilotseal_test.pilot_id')::uuid, null, null
  )$$,
  '22023', 'Select a current organization instructor.',
  'student invitation rejects an organization student as instructor'
);

select set_config('pilotseal_test.invite_token', invite_token, true),
       set_config('pilotseal_test.saved_person_id', assigned_saved_person_id::text, true)
from public.create_organization_member_invitation_v2(
  '10000000-0000-4000-8000-000000000001',
  'assigned.student@example.test', 'Legal Student Name', 'student',
  current_setting('pilotseal_test.instructor_id')::uuid,
  'STU-42', 'Automatically linked invitation'
);
reset role;

select is(
  (select assigned_instructor_user_id
   from public.organization_member_invitations
   where token_hash = encode(extensions.digest(
     current_setting('pilotseal_test.invite_token'), 'sha256'
   ), 'hex')),
  current_setting('pilotseal_test.instructor_id')::uuid,
  'invitation persists the selected organization instructor'
);
select is(
  (select display_name
   from public.saved_people
   where id = current_setting('pilotseal_test.saved_person_id')::uuid),
  'Legal Student Name',
  'inviting creates the instructor formal Saved People record before registration'
);
select is(
  (select user_id
   from public.saved_people
   where id = current_setting('pilotseal_test.saved_person_id')::uuid),
  current_setting('pilotseal_test.instructor_id')::uuid,
  'pending Saved People record belongs to the selected instructor'
);

set local role anon;
select is(
  (select assigned_instructor_name
   from public.get_organization_invitation_v2(
     current_setting('pilotseal_test.invite_token')
   )),
  current_setting('pilotseal_test.instructor_name'),
  'invited student can preview the assigned instructor'
);
reset role;

insert into public.saved_person_certificates (
  user_id, person_id, certificate_type, certificate_number,
  certificate_level, ratings
) values (
  current_setting('pilotseal_test.instructor_id')::uuid,
  current_setting('pilotseal_test.saved_person_id')::uuid,
  'pilot', 'CERT-42', 'Private', array['ASEL']::text[]
);

insert into public.endorsement_records (
  user_id, student_id, student_name, student_cert_number,
  instructor_name, endorsement_date, template_titles, storage_path
) values (
  current_setting('pilotseal_test.instructor_id')::uuid,
  current_setting('pilotseal_test.saved_person_id')::uuid,
  'Legal Student Name', 'CERT-42', 'Local Instructor', '09/08/2026',
  array['Test endorsement']::text[], 'local/test-42.pdf'
);

select set_config(
  'request.jwt.claim.sub', '82000000-0000-4000-8000-000000000042', true
);
set local role authenticated;
select lives_ok(
  $$select public.accept_organization_member_invitation(
    current_setting('pilotseal_test.invite_token')
  )$$,
  'verified invited student can accept membership and instructor link atomically'
);
reset role;

select is(
  (select teaching_role from public.organization_members
   where organization_id = '10000000-0000-4000-8000-000000000001'
     and user_id = '82000000-0000-4000-8000-000000000042'),
  'student',
  'acceptance creates the student organization membership'
);
select is(
  (select linked_user_id from public.saved_person_account_links
   where owner_user_id = current_setting('pilotseal_test.instructor_id')::uuid
     and saved_person_id = current_setting('pilotseal_test.saved_person_id')::uuid),
  '82000000-0000-4000-8000-000000000042'::uuid,
  'acceptance automatically links the instructor Saved People record'
);
select is(
  (select person.display_name
   from public.profiles profile
   join public.saved_people person on person.id = profile.self_person_id
   where profile.id = '82000000-0000-4000-8000-000000000042'),
  'Legal Student Name',
  'formal name comes from the invitation instead of the account nickname'
);
select is(
  (select count(*) from public.saved_person_certificates certificate
   join public.profiles profile on profile.self_person_id = certificate.person_id
   where profile.id = '82000000-0000-4000-8000-000000000042'
     and certificate.certificate_number = 'CERT-42'),
  1::bigint,
  'instructor certificate data initializes the student canonical profile'
);
select is(
  (select student_user_id from public.endorsement_records
   where storage_path = 'local/test-42.pdf'),
  '82000000-0000-4000-8000-000000000042'::uuid,
  'existing instructor endorsement is attached to the student account'
);

select set_config(
  'request.jwt.claim.sub', '82000000-0000-4000-8000-000000000042', true
);
set local role authenticated;
select is(
  (select count(*) from public.endorsement_records
   where storage_path = 'local/test-42.pdf'),
  1::bigint,
  'student can immediately read the linked instructor endorsement'
);
reset role;

select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles where email = 'pilot.one@example.test'),
  true
);
set local role authenticated;
select set_config('pilotseal_test.resend_token', invite_token, true)
from public.create_organization_member_invitation_v2(
  '10000000-0000-4000-8000-000000000001',
  'resend.student@example.test', 'Resend Student', 'student',
  current_setting('pilotseal_test.instructor_id')::uuid,
  null, null
);
select set_config('pilotseal_test.first_resend_person', assigned_saved_person_id::text, true)
from public.create_organization_member_invitation_v2(
  '10000000-0000-4000-8000-000000000001',
  'resend.student@example.test', 'Resend Student', 'student',
  current_setting('pilotseal_test.instructor_id')::uuid,
  null, null
);
reset role;

select is(
  (select assigned_saved_person_id
   from public.organization_member_invitations
   where normalized_email = 'resend.student@example.test'
     and status = 'pending'),
  current_setting('pilotseal_test.first_resend_person')::uuid,
  'resending reuses one instructor Saved People identity'
);
select is(
  (select count(*) from public.saved_people
   where user_id = current_setting('pilotseal_test.instructor_id')::uuid
     and role = 'student' and display_name = 'Resend Student'),
  1::bigint,
  'resending does not duplicate the instructor student record'
);

select * from finish();
rollback;
