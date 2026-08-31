begin;
create extension if not exists pgtap with schema extensions;
select plan(17);
select set_config(
  'pilotseal_test.student_id',
  (select id::text from public.profiles where email = 'pilot.one@example.test'),
  false
);

select has_function(
  'public', 'list_my_student_candidates', array[]::text[],
  'canonical student candidate RPC exists'
);
select has_column('public', 'flight_briefs', 'student_user_id', 'Flight Brief stores stable student account identity');
select has_column('public', 'flight_briefs', 'student_saved_person_id', 'Flight Brief stores the private alias used at entry');
select has_column('public', 'flight_briefs', 'student_membership_period_id', 'Flight Brief stores the student membership period');

insert into public.saved_people (id, user_id, role, display_name, cert_number)
values
  (
    '47000000-0000-4000-8000-000000000001',
    (select id from public.profiles where email = 'instructor.one@example.test'),
    'student', 'Avery One Person', 'ONE-100'
  ),
  (
    '47000000-0000-4000-8000-000000000002',
    (select id from public.profiles where email = 'pilot.one@example.test'),
    'self', 'pilot.one@example.test', null
  );
update public.profiles
set self_person_id = '47000000-0000-4000-8000-000000000002',
    display_name = 'Avery'
where email = 'pilot.one@example.test';
insert into public.saved_person_certificates (
  id, user_id, person_id, certificate_type, certificate_number,
  certificate_level, ratings
) values (
  '57000000-0000-4000-8000-000000000001',
  (select id from public.profiles where email = 'instructor.one@example.test'),
  '47000000-0000-4000-8000-000000000001', 'pilot', 'ONE-100',
  'Private', array['ASEL']
);

select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles where email = 'instructor.one@example.test'),
  true
);
set local role authenticated;
select set_config(
  'pilotseal_test.identity_request',
  public.request_saved_person_account_link(
    '47000000-0000-4000-8000-000000000001',
    'pilot.one@example.test'
  )::text,
  true
);
reset role;

select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles where email = 'pilot.one@example.test'),
  true
);
set local role authenticated;
select lives_ok(
  $$select public.respond_saved_person_account_link_request(
    current_setting('pilotseal_test.identity_request')::uuid, true
  )$$,
  'student can accept the identity link'
);
reset role;

select is(
  (select display_name from public.saved_people where id = '47000000-0000-4000-8000-000000000002'),
  'Avery One Person',
  'link acceptance replaces an email placeholder with the saved formal name'
);
select is(
  (select certificate_number from public.saved_person_certificates
   where user_id = (select id from public.profiles where email = 'pilot.one@example.test')
     and person_id = '47000000-0000-4000-8000-000000000002'),
  'ONE-100',
  'link acceptance copies a missing certificate to the canonical account profile'
);

select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles where email = 'instructor.one@example.test'),
  true
);
set local role authenticated;
select is(
  (select count(*) from public.list_my_student_candidates()
   where student_user_id = current_setting('pilotseal_test.student_id')::uuid),
  1::bigint,
  'linked Personal and organization sources collapse to one candidate'
);
select is(
  (select formal_name from public.list_my_student_candidates()
   where student_user_id = current_setting('pilotseal_test.student_id')::uuid),
  'Avery One Person',
  'candidate uses the canonical formal name instead of email or nickname'
);
select is(
  (select identity_status from public.list_my_student_candidates()
   where student_user_id = current_setting('pilotseal_test.student_id')::uuid),
  'linked',
  'candidate reports one linked logical identity'
);
select is(
  (select count(*) from public.list_organization_students('10000000-0000-4000-8000-000000000001')),
  1::bigint,
  'organization picker returns only teaching-role students'
);

insert into public.flight_briefs (
  id, created_by, organization_id, student_saved_person_id, student_user_id,
  aircraft_tail_number, student_name, instructor_name, status, brief_data
) values (
  '77000000-0000-4000-8000-000000000001',
  current_setting('request.jwt.claim.sub')::uuid,
  '10000000-0000-4000-8000-000000000001',
  '47000000-0000-4000-8000-000000000001',
  (select id from public.profiles where email = 'pilot.one@example.test'),
  'NIDENT', 'Avery One Person', 'Morgan Testflight', 'draft', '{}'::jsonb
);
reset role;

select ok(
  (select student_user_id is not null
      and instructor_membership_period_id is not null
      and student_membership_period_id is not null
   from public.flight_briefs where id = '77000000-0000-4000-8000-000000000001'),
  'organization Flight Brief stores stable identity and both membership periods'
);

select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles where email = 'pilot.one@example.test'),
  true
);
set local role authenticated;
select is(
  (select count(*) from public.flight_briefs where id = '77000000-0000-4000-8000-000000000001'),
  0::bigint,
  'student cannot read an instructor draft'
);
reset role;

update public.flight_briefs
set status = 'finalized', finalized_at = timezone('utc', now())
where id = '77000000-0000-4000-8000-000000000001';

select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles where email = 'pilot.one@example.test'),
  true
);
set local role authenticated;
select is(
  (select count(*) from public.flight_briefs where id = '77000000-0000-4000-8000-000000000001'),
  1::bigint,
  'student can read their finalized organization Flight Brief'
);
select throws_ok(
  $$update public.profiles
    set self_person_id = '47000000-0000-4000-8000-000000000001'
    where email = 'pilot.one@example.test'$$,
  '23514',
  'A profile self person must be the account owner''s self record.',
  'profile cannot reference another account owner''s person row'
);
reset role;

select set_config(
  'pilotseal_test.canonical_certificate_id',
  (select id::text from public.saved_person_certificates
   where user_id = current_setting('pilotseal_test.student_id')::uuid
     and person_id = '47000000-0000-4000-8000-000000000002'),
  false
);

select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles where email = 'instructor.one@example.test'),
  true
);
set local role authenticated;
select lives_ok(
  $$select public.delete_managed_student_certificate(
    current_setting('pilotseal_test.student_id')::uuid,
    current_setting('pilotseal_test.canonical_certificate_id')::uuid,
    '10000000-0000-4000-8000-000000000001'
  )$$,
  'linked instructor can delete the canonical pilot certificate through the audited RPC'
);
reset role;

select is(
  (select count(*) from public.saved_person_certificates
   where user_id = (select id from public.profiles where email = 'pilot.one@example.test')
     and person_id = '47000000-0000-4000-8000-000000000002'),
  0::bigint,
  'managed delete removes the canonical certificate rather than an alias copy'
);

select * from finish();
rollback;
