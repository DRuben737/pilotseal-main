begin;
create extension if not exists pgtap with schema extensions;
select plan(14);
select set_config('pilotseal_test.student_id', (select id::text from public.profiles where email = 'pilot.one@example.test'), false);

select has_table('public', 'student_profile_change_log', 'student profile edits have an audit table');
select has_function('public', 'get_managed_student_profile', array['uuid','uuid'], 'managed profile reader exists');
select has_function('public', 'save_managed_student_profile', array['uuid','uuid','text','uuid','text','text','text[]','jsonb','date','text'], 'managed profile writer exists');

insert into public.saved_people (id, user_id, role, display_name, cert_number)
values
  ('46000000-0000-4000-8000-000000000001', (select id from public.profiles where email = 'instructor.one@example.test'), 'student', 'Taylor Formal Pilot', 'OWNER-42'),
  ('46000000-0000-4000-8000-000000000002', current_setting('pilotseal_test.student_id')::uuid, 'self', 'TaylorNickname', null);
update public.profiles set self_person_id = '46000000-0000-4000-8000-000000000002', display_name = 'TaylorNickname'
where email = 'pilot.one@example.test';
insert into public.saved_person_certificates (
  id, user_id, person_id, certificate_type, certificate_number,
  certificate_level, ratings, additional_privileges
) values (
  '56000000-0000-4000-8000-000000000001',
  (select id from public.profiles where email = 'instructor.one@example.test'),
  '46000000-0000-4000-8000-000000000001', 'pilot', 'OWNER-42',
  'Private', array['ASEL'], '["Student pilot privileges"]'::jsonb
);

select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'instructor.one@example.test'), true);
set local role authenticated;
select set_config(
  'pilotseal_test.canonical_link_request',
  public.request_saved_person_account_link('46000000-0000-4000-8000-000000000001', 'pilot.one@example.test')::text,
  true
);
reset role;

select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'pilot.one@example.test'), true);
set local role authenticated;
select lives_ok(
  $$select public.respond_saved_person_account_link_request(current_setting('pilotseal_test.canonical_link_request')::uuid, true)$$,
  'student can accept the identity merge'
);
reset role;

select is(
  (select display_name from public.saved_people where id = '46000000-0000-4000-8000-000000000002'),
  'Taylor Formal Pilot',
  'link merge replaces a nickname-only self name with the instructor formal name'
);
select is(
  (select certificate_number from public.saved_person_certificates
   where user_id = current_setting('pilotseal_test.student_id')::uuid and certificate_type = 'pilot'),
  'OWNER-42',
  'link merge fills a missing canonical certificate from Saved People'
);

select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'instructor.one@example.test'), true);
set local role authenticated;
select lives_ok(
  $$select public.save_managed_student_profile(
    current_setting('pilotseal_test.student_id')::uuid,
    '10000000-0000-4000-8000-000000000001',
    'Taylor A. Formal Pilot',
    (select certificate_id from public.get_managed_student_profile(
      current_setting('pilotseal_test.student_id')::uuid,
      '10000000-0000-4000-8000-000000000001'
    ) limit 1),
    'CANONICAL-99', 'ATP', array['AMEL'], '["Private — ASEL"]'::jsonb,
    '2026-08-28', 'Verified by instructor'
  )$$,
  'organization instructor can edit the one canonical student profile'
);
select is(
  (select formal_name from public.get_managed_student_profile(
    current_setting('pilotseal_test.student_id')::uuid,
    '10000000-0000-4000-8000-000000000001'
  ) limit 1),
  'Taylor A. Formal Pilot',
  'managed profile immediately returns the shared formal name'
);
select is(
  (select certificate_number from public.get_managed_student_profile(
    current_setting('pilotseal_test.student_id')::uuid,
    '10000000-0000-4000-8000-000000000001'
  ) limit 1),
  'CANONICAL-99',
  'managed profile immediately returns the shared certificate number'
);
select is(
  (select formal_name from public.list_organization_students('10000000-0000-4000-8000-000000000001')
   where student_user_id = current_setting('pilotseal_test.student_id')::uuid),
  'Taylor A. Formal Pilot',
  'endorsement candidates use the canonical formal name'
);
select is(
  (select effective_certificate_number from public.list_organization_students('10000000-0000-4000-8000-000000000001')
   where student_user_id = current_setting('pilotseal_test.student_id')::uuid),
  'CANONICAL-99',
  'endorsement candidates use the canonical certificate number'
);
reset role;

select is(
  (select count(*) from public.student_profile_change_log
   where student_user_id = current_setting('pilotseal_test.student_id')::uuid),
  3::bigint,
  'link merge, formal-name edit, and certificate edit are audited'
);

select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'pilot.one@example.test'), true);
set local role authenticated;
select is(
  (select count(*) from public.student_profile_change_log),
  3::bigint,
  'student can inspect the complete change history for their profile'
);
select is(
  (select certificate_source from public.list_my_endorsement_people()
   where linked_user_id = current_setting('pilotseal_test.student_id')::uuid),
  null::text,
  'student does not gain access to the instructor private Saved People list'
);
reset role;

select * from finish();
rollback;
