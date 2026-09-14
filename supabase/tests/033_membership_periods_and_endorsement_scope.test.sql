begin;
create extension if not exists pgtap with schema extensions;
select plan(27);
select set_config('pilotseal_test.instructor_id', (select id::text from public.profiles where email = 'instructor.one@example.test'), true);
select set_config('pilotseal_test.student_id', (select id::text from public.profiles where email = 'pilot.one@example.test'), true);

select has_table('public', 'organization_membership_periods', 'membership periods table exists');
select has_function('public', 'leave_organization', array['uuid', 'text'], 'self-leave RPC exists');
select has_function('public', 'create_endorsement_record', array['uuid','uuid','uuid','text','text','text','text','text','text[]','text','integer','uuid'], 'transactional endorsement RPC exists');
select is((select count(*) from public.organization_membership_periods where organization_id = '10000000-0000-4000-8000-000000000001' and left_at is null), 2::bigint, 'seeded current members have active periods');

insert into public.saved_people (id, user_id, role, display_name, cert_number)
values ('40000000-0000-4000-8000-000000000002', (select id from public.profiles where email = 'pilot.one@example.test'), 'self', 'Avery Testpilot', 'STUDENT-1');
update public.profiles set self_person_id = '40000000-0000-4000-8000-000000000002' where email = 'pilot.one@example.test';
insert into public.saved_people (id, user_id, role, display_name, cert_number)
values ('40000000-0000-4000-8000-000000000003', (select id from public.profiles where email = 'instructor.one@example.test'), 'student', 'Avery Testpilot', 'STUDENT-1');
insert into public.saved_person_account_links (owner_user_id, saved_person_id, linked_user_id)
values ((select id from public.profiles where email = 'instructor.one@example.test'), '40000000-0000-4000-8000-000000000003', (select id from public.profiles where email = 'pilot.one@example.test'));

select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'instructor.one@example.test'), true);
set local role authenticated;
select lives_ok(
  $$select public.create_endorsement_record(
    '60000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000003', 'Avery Testpilot', 'STUDENT-1',
    'Morgan Testflight', 'CFI-1', '08/27/2026', array['Test endorsement'],
    current_setting('request.jwt.claim.sub') || '/60000000-0000-4000-8000-000000000001.pdf', 1000, null
  )$$,
  'current instructor can create an organization endorsement for a current registered student'
);
reset role;
select is((select scope_status from public.endorsement_records where id = '60000000-0000-4000-8000-000000000001'), 'confirmed', 'organization endorsement is confirmed');
select ok((select count(*) = 1 and bool_and(instructor_membership_period_id is not null and student_membership_period_id is null) from private.endorsement_record_organization_access where record_id = '60000000-0000-4000-8000-000000000001'), 'automatic organization access stores only the instructor membership period');

select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'pilot.one@example.test'), true);
set local role authenticated;
select throws_ok($$select public.leave_organization('10000000-0000-4000-8000-000000000001', 'owner exit')$$, '42501', 'Transfer organization ownership before leaving.', 'owner cannot leave before transfer');
select lives_ok($$select public.transfer_organization_ownership('10000000-0000-4000-8000-000000000001', current_setting('pilotseal_test.instructor_id')::uuid)$$, 'owner can transfer ownership');
select lives_ok($$select public.leave_organization('10000000-0000-4000-8000-000000000001', 'student self exit')$$, 'non-owner student can leave immediately');
reset role;
select is((select count(*) from public.organization_members where organization_id = '10000000-0000-4000-8000-000000000001' and user_id = (select id from public.profiles where email = 'pilot.one@example.test')), 0::bigint, 'leaving removes current membership');
select ok((select left_at is not null from public.organization_membership_periods where organization_id = '10000000-0000-4000-8000-000000000001' and user_id = (select id from public.profiles where email = 'pilot.one@example.test')), 'leaving closes the active membership period');

select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'instructor.one@example.test'), true);
set local role authenticated;
select lives_ok(
  $$select public.create_endorsement_record(
    '60000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000003', 'Avery Testpilot', 'STUDENT-1',
    'Morgan Testflight', 'CFI-1', '08/27/2026', array['Post-exit organization attempt'],
    current_setting('request.jwt.claim.sub') || '/60000000-0000-4000-8000-000000000002.pdf', 1000, null
  )$$,
  'student exit does not stop the instructor membership from sharing a new endorsement'
);
select lives_ok(
  $$select public.create_endorsement_record(
    '60000000-0000-4000-8000-000000000003', null,
    '40000000-0000-4000-8000-000000000003', 'Avery Testpilot', 'STUDENT-1',
    'Morgan Testflight', 'CFI-1', '08/27/2026', array['Post-exit personal'],
    current_setting('request.jwt.claim.sub') || '/60000000-0000-4000-8000-000000000003.pdf', 1000, null
  )$$,
  'student membership is not required for automatic organization visibility'
);
reset role;
select is((select count(*) from private.endorsement_record_organization_access where record_id = '60000000-0000-4000-8000-000000000002'), 1::bigint, 'student exit does not remove organization visibility derived from the instructor');

select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'pilot.one@example.test'), true);
set local role authenticated;
select is((select count(*) from public.endorsement_records where id in ('60000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000003')), 3::bigint, 'linked student can read every successfully issued endorsement regardless of organization visibility');
reset role;

select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'instructor.one@example.test'), true);
set local role authenticated;
select lives_ok(
  $$select set_config('pilotseal_test.rejoin_token', invite_token, true)
    from public.create_organization_member_invitation(
      '10000000-0000-4000-8000-000000000001', 'pilot.one@example.test',
      'Avery Testpilot', 'student', null, 'Rejoin test'
    )$$,
  'organization owner can invite the former student again'
);
reset role;
select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'pilot.one@example.test'), true);
set local role authenticated;
select lives_ok(
  $$select public.accept_organization_member_invitation(current_setting('pilotseal_test.rejoin_token'))$$,
  'former student can rejoin with the email-bound invitation'
);
reset role;
select is((select count(*) from public.organization_membership_periods where organization_id = '10000000-0000-4000-8000-000000000001' and user_id = (select id from public.profiles where email = 'pilot.one@example.test')), 2::bigint, 'rejoining creates a distinct membership period');

select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'instructor.one@example.test'), true);
set local role authenticated;
select lives_ok(
  $$select public.create_endorsement_record(
    '60000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000003', 'Avery Testpilot', 'STUDENT-1',
    'Morgan Testflight', 'CFI-1', '08/27/2026', array['After rejoin'],
    current_setting('request.jwt.claim.sub') || '/60000000-0000-4000-8000-000000000004.pdf', 1000, null
  )$$,
  'organization endorsement works again after rejoin'
);
reset role;
select is((select count(*) from private.endorsement_record_organization_access where organization_id = '10000000-0000-4000-8000-000000000001'), 4::bigint, 'all endorsements issued during the instructor membership are organization-visible');
select is((select count(*) from private.endorsement_record_organization_access where record_id = '60000000-0000-4000-8000-000000000003'), 1::bigint, 'student membership gaps do not affect organization visibility');

select set_config(
  'pilotseal_test.original_endorsement_created_at',
  (select created_at::text from public.endorsement_records where id = '60000000-0000-4000-8000-000000000001'),
  true
);
select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'instructor.one@example.test'), true);
set local role authenticated;
select lives_ok(
  $$select public.replace_endorsement_record(
    '60000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000003',
    'Avery Testpilot', 'STUDENT-1', 'Morgan Testflight', 'CFI-1',
    '09/14/2026', array['Corrected endorsement'],
    current_setting('request.jwt.claim.sub') || '/60000000-0000-4000-8000-000000000001-replacement.pdf',
    1200,
    '{"version":1,"generatorMode":"customized","formData":{"studentName":"Avery Testpilot"},"selectedTemplates":["Corrected endorsement"],"templateFieldData":{},"printFormat":"letter","labelStartSlot":"1"}'::jsonb
  )$$,
  'issuing instructor can replace an organization-visible endorsement'
);
reset role;
select is(
  (select created_at::text from public.endorsement_records where id = '60000000-0000-4000-8000-000000000001'),
  current_setting('pilotseal_test.original_endorsement_created_at'),
  'replacement preserves immutable issue time'
);
select is(
  (select storage_path from public.endorsement_records where id = '60000000-0000-4000-8000-000000000001'),
  (select id::text from public.profiles where email = 'instructor.one@example.test') || '/60000000-0000-4000-8000-000000000001-replacement.pdf',
  'replacement switches the active PDF path'
);
select is(
  (select count(*) from private.endorsement_record_organization_access where record_id = '60000000-0000-4000-8000-000000000001'),
  1::bigint,
  'replacement preserves organization access'
);

select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'pilot.one@example.test'), true);
set local role authenticated;
select throws_ok(
  $$select public.replace_endorsement_record(
    '60000000-0000-4000-8000-000000000001', null,
    'Avery Testpilot', 'STUDENT-1', 'Avery Testpilot', 'STUDENT-1',
    '09/14/2026', array['Unauthorized replacement'],
    current_setting('request.jwt.claim.sub') || '/unauthorized.pdf', 10, '{}'::jsonb
  )$$,
  '42501', 'Only the issuing instructor can replace this endorsement.',
  'student cannot replace an endorsement issued to them'
);
reset role;

select * from finish();
rollback;
