begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

select has_table('public', 'student_record_folders', 'student record folders table exists');
select has_table('public', 'student_record_items', 'student record items table exists');
select has_function('public', 'create_student_record_folder', array['uuid'], 'folder creation RPC exists');
select has_function(
  'public', 'create_student_record_item',
  array['uuid','uuid','text','date','text','text','text','text','text','bigint'],
  'record item creation RPC exists'
);
select is(
  (select file_size_limit from storage.buckets where id = 'student-record-files'),
  5242880::bigint,
  'student record bucket enforces the 5 MB limit'
);
select is(
  (select allowed_mime_types from storage.buckets where id = 'student-record-files'),
  array['application/pdf','image/jpeg','image/png']::text[],
  'student record bucket restricts attachment MIME types'
);

insert into public.saved_people (id, user_id, role, display_name, cert_number)
values (
  '49000000-0000-4000-8000-000000000001',
  (select id from public.profiles where email = 'instructor.one@example.test'),
  'student', 'Jordan Student', 'STU-490'
);

select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'instructor.one@example.test'), true);
set local role authenticated;
select lives_ok(
  $$select public.create_student_record_folder('49000000-0000-4000-8000-000000000001')$$,
  'instructor can create a folder for an owned saved student'
);
select is(
  (select count(*) from public.student_record_folders where student_id = '49000000-0000-4000-8000-000000000001'),
  1::bigint,
  'one folder is created for the student'
);
select lives_ok(
  $$select public.create_student_record_folder('49000000-0000-4000-8000-000000000001')$$,
  'opening an existing student record is idempotent'
);
select is(
  (select count(*) from public.student_record_folders where student_id = '49000000-0000-4000-8000-000000000001'),
  1::bigint,
  'duplicate folder creation does not create a second row'
);
select set_config(
  'pilotseal_test.folder_id',
  (select id::text from public.student_record_folders where student_id = '49000000-0000-4000-8000-000000000001'),
  true
);
select lives_ok(
  $$select public.create_student_record_item(
    '59000000-0000-4000-8000-000000000001', current_setting('pilotseal_test.folder_id')::uuid,
    'First lesson note', '2026-10-02', 'Training', 'Good progress',
    null, null, null, null
  )$$,
  'owner can add a note inside the student folder'
);
select lives_ok(
  $$select public.create_student_record_item(
    '59000000-0000-4000-8000-000000000002', current_setting('pilotseal_test.folder_id')::uuid,
    'Signed scan', '2026-10-02', 'Document', null,
    current_setting('request.jwt.claim.sub') || '/' || current_setting('pilotseal_test.folder_id') || '/59000000-0000-4000-8000-000000000002/file.pdf',
    'scan.pdf', 'application/pdf', 5242880
  )$$,
  'owner can attach an allowed file at the 5 MB boundary'
);
select throws_ok(
  $$select public.create_student_record_item(
    '59000000-0000-4000-8000-000000000003', current_setting('pilotseal_test.folder_id')::uuid,
    'Bad attachment', '2026-10-02', null, null,
    current_setting('request.jwt.claim.sub') || '/' || current_setting('pilotseal_test.folder_id') || '/59000000-0000-4000-8000-000000000003/file.txt',
    'file.txt', 'text/plain', 10
  )$$,
  '22023', 'Only PDF, JPG, and PNG files are allowed.',
  'unsupported attachment MIME types are rejected'
);
select set_config(
  'pilotseal_test.link_request_id',
  public.request_saved_person_account_link('49000000-0000-4000-8000-000000000001', 'pilot.one@example.test')::text,
  true
);
reset role;

select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'pilot.one@example.test'), true);
set local role authenticated;
select is(
  (select count(*) from public.student_record_folders where id = current_setting('pilotseal_test.folder_id')::uuid),
  0::bigint,
  'student cannot read the folder before accepting the account link'
);
select lives_ok(
  $$select public.respond_saved_person_account_link_request(current_setting('pilotseal_test.link_request_id')::uuid, true)$$,
  'student can accept the saved-person account link'
);
select is(
  (select count(*) from public.student_record_folders where id = current_setting('pilotseal_test.folder_id')::uuid),
  1::bigint,
  'linked student can read the folder'
);
select is(
  (select count(*) from public.student_record_items where folder_id = current_setting('pilotseal_test.folder_id')::uuid),
  2::bigint,
  'linked student can read all existing folder content'
);
select throws_ok(
  $$select public.update_student_record_item(
    '59000000-0000-4000-8000-000000000001', 'Changed by student', '2026-10-02', null, null, null, null, null, null
  )$$,
  'P0002', 'Student record item not found.',
  'student cannot edit instructor-owned content'
);
select lives_ok(
  $$select public.unlink_saved_person_account('49000000-0000-4000-8000-000000000001')$$,
  'student can unlink the saved-person identity'
);
select is(
  (select count(*) from public.student_record_folders where id = current_setting('pilotseal_test.folder_id')::uuid),
  1::bigint,
  'student keeps read access to the established folder after unlinking'
);
reset role;

select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'platform.admin@example.test'), true);
set local role authenticated;
select is(
  (select count(*) from public.student_record_folders where id = current_setting('pilotseal_test.folder_id')::uuid),
  0::bigint,
  'unrelated platform administrator cannot read the personal student folder'
);
reset role;

insert into public.endorsement_records (
  id, user_id, student_id, student_name, student_cert_number, instructor_name,
  endorsement_date, template_titles, storage_path, file_size_bytes
) values (
  '69000000-0000-4000-8000-000000000001',
  (select id from public.profiles where email = 'instructor.one@example.test'),
  '49000000-0000-4000-8000-000000000001', 'Jordan Student', 'STU-490',
  'Morgan Testflight', '10/02/2026', array['Trigger test'], 'test/trigger.pdf', 100
);
select is(
  (select count(*) from public.student_record_folders where student_id = '49000000-0000-4000-8000-000000000001'),
  1::bigint,
  'new endorsements reuse the existing student folder'
);

select * from finish();
rollback;
