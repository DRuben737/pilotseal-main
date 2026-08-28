begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

select has_column('public', 'saved_person_certificates', 'certificate_level', 'pilot certificate stores its highest level');
select has_column('public', 'saved_person_certificates', 'additional_privileges', 'pilot certificate stores lower-level privileges');
select has_function('public', 'delete_asr_draft', array['uuid'], 'ASR draft deletion RPC exists');
select has_function('public', 'create_and_finalize_flight_brief', array['jsonb','text','numeric','timestamptz','numeric'], 'atomic Flight Brief RPC exists');
select has_function('public', 'list_my_linked_person_certificates', array[]::text[], 'linked certificate aggregation RPC exists');
select has_function('public', 'list_organization_endorsement_records', array['uuid'], 'derived organization endorsement listing RPC exists');

select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'instructor.one@example.test'), true);
set local role authenticated;
select lives_ok(
  $$select public.save_asr_draft(
    '10000000-0000-4000-8000-000000000001', null,
    '35000000-0000-4000-8000-000000000001',
    jsonb_build_object('description', 'temporary test draft')
  )$$,
  'member can create a temporary ASR draft'
);
select lives_ok(
  $$select public.delete_asr_draft((select id from public.organization_reports where client_request_id = '35000000-0000-4000-8000-000000000001'))$$,
  'draft owner can cancel and delete the ASR'
);
reset role;

insert into public.saved_people (id, user_id, role, display_name, cert_number)
values
  ('45000000-0000-4000-8000-000000000001', (select id from public.profiles where email = 'instructor.one@example.test'), 'student', 'Avery Full Legal Name', null),
  ('45000000-0000-4000-8000-000000000002', (select id from public.profiles where email = 'pilot.one@example.test'), 'self', 'Student Account Alias', null);
update public.profiles
set self_person_id = '45000000-0000-4000-8000-000000000002'
where email = 'pilot.one@example.test';
update public.profiles
set display_name = 'Student Account Alias'
where email = 'pilot.one@example.test';
insert into public.saved_person_certificates (
  user_id, person_id, certificate_type, certificate_number, certificate_level,
  additional_privileges, ratings
)
values (
  (select id from public.profiles where email = 'pilot.one@example.test'),
  '45000000-0000-4000-8000-000000000002', 'pilot', 'PILOT-LINKED-1', 'ATP',
  '["Private — ASEL"]'::jsonb, array['AMEL']
);

select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'instructor.one@example.test'), true);
set local role authenticated;
select lives_ok(
  $$select public.create_endorsement_record(
    '65000000-0000-4000-8000-000000000001', null,
    '45000000-0000-4000-8000-000000000001', 'Avery Full Legal Name', null,
    'Morgan Testflight', 'CFI-1', '08/27/2026', array['Linked identity test'],
    current_setting('request.jwt.claim.sub') || '/65000000-0000-4000-8000-000000000001.pdf', 1000, null
  )$$,
  'instructor can issue a record to an unlinked saved student'
);
select is(
  (select student_user_id from public.endorsement_records where id = '65000000-0000-4000-8000-000000000001'),
  null::uuid,
  'record is not exposed to a student account before consent-based linking'
);
select set_config(
  'pilotseal_test.link_request_id',
  public.request_saved_person_account_link('45000000-0000-4000-8000-000000000001', 'pilot.one@example.test')::text,
  true
);
reset role;

select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'pilot.one@example.test'), true);
set local role authenticated;
select lives_ok(
  $$select public.respond_saved_person_account_link_request(current_setting('pilotseal_test.link_request_id')::uuid, true)$$,
  'student can accept the instructor identity link'
);
select is(
  (select count(*) from public.endorsement_records where id = '65000000-0000-4000-8000-000000000001'),
  1::bigint,
  'student can read the instructor-owned historical record after linking'
);
reset role;

select is(
  (select user_id from public.endorsement_records where id = '65000000-0000-4000-8000-000000000001'),
  (select id from public.profiles where email = 'instructor.one@example.test'),
  'linking does not change endorsement ownership'
);

select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'instructor.one@example.test'), true);
set local role authenticated;
select is(
  (select count(*) from public.list_my_linked_person_certificates() where person_id = '45000000-0000-4000-8000-000000000001' and certificate_number = 'PILOT-LINKED-1'),
  1::bigint,
  'student-owned certificate enriches the instructor saved-person identity after linking'
);
select is(
  (select count(*) from public.list_organization_endorsement_records('10000000-0000-4000-8000-000000000001') where id = '65000000-0000-4000-8000-000000000001'),
  1::bigint,
  'organization sees the linked record when both people were members at issuance'
);
select is(
  (select formal_name from public.list_organization_students('10000000-0000-4000-8000-000000000001') where formal_name is not null),
  'Avery Full Legal Name',
  'organization picker uses the instructor Saved People formal name'
);
select is(
  (select account_nickname from public.list_organization_students('10000000-0000-4000-8000-000000000001') where formal_name is not null),
  'Student Account Alias',
  'organization picker keeps account nickname separate from formal name'
);
select is(
  (select effective_certificate_number from public.list_organization_students('10000000-0000-4000-8000-000000000001') where formal_name is not null),
  'PILOT-LINKED-1',
  'organization picker prefers the linked student certificate number'
);
select ok(
  (select endorsement_ready from public.list_organization_students('10000000-0000-4000-8000-000000000001') where formal_name is not null),
  'linked formal profile is ready for endorsement'
);
reset role;
select is((select count(*) from public.organization_reports where client_request_id = '35000000-0000-4000-8000-000000000001'), 0::bigint, 'cancelled ASR leaves no report row');

select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'pilot.one@example.test'), true);
set local role authenticated;
select lives_ok(
  $$select public.create_and_finalize_flight_brief(
    jsonb_build_object(
      'aircraft_tail_number', 'NATOMIC', 'student_name', 'Avery Testpilot',
      'instructor_name', 'Morgan Testflight', 'brief_data', '{}'::jsonb
    ), null, null, null, null
  )$$,
  'a complete personal Flight Brief is created and finalized atomically'
);
select is((select count(*) from public.flight_briefs where aircraft_tail_number = 'NATOMIC' and status = 'finalized'), 1::bigint, 'atomic creation retains the completed brief');
select is((select count(*) from public.flight_briefs where aircraft_tail_number = 'NATOMIC' and status = 'draft'), 0::bigint, 'atomic creation retains no half brief');
reset role;

select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'instructor.one@example.test'), true);
set local role authenticated;
select is((select count(*) from public.list_organization_students('10000000-0000-4000-8000-000000000001')), 2::bigint, 'endorsement member picker returns all current organization members');
reset role;

select * from finish();
rollback;
