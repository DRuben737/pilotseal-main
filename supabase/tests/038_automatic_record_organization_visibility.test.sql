begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

select set_config('pilotseal_test.instructor_id', (select id::text from public.profiles where email = 'instructor.one@example.test'), true);
select set_config('pilotseal_test.student_id', (select id::text from public.profiles where email = 'pilot.one@example.test'), true);

select has_table('private', 'endorsement_record_organization_access', 'endorsement organization access relation exists');
select has_table('private', 'flight_brief_organization_access', 'Flight Brief organization access relation exists');
select has_function('public', 'list_organization_flight_briefs', array['uuid'], 'organization Flight Brief listing RPC exists');
select ok(not has_function_privilege('authenticated', 'public.share_personal_flight_brief_with_organization(uuid,uuid)', 'execute'), 'manual Flight Brief sharing is disabled');
select ok(not has_function_privilege('authenticated', 'public.copy_flight_brief_to_personal(uuid)', 'execute'), 'manual Flight Brief copying is disabled');

insert into public.organizations (id, name, created_by)
values (
  '10000000-0000-4000-8000-000000000038',
  'Second Automatic Test School',
  current_setting('pilotseal_test.instructor_id')::uuid
);
insert into public.organization_members (
  organization_id, user_id, role, teaching_role, added_by
) values
(
  '10000000-0000-4000-8000-000000000038',
  current_setting('pilotseal_test.instructor_id')::uuid,
  'owner', 'instructor', current_setting('pilotseal_test.instructor_id')::uuid
),
(
  '10000000-0000-4000-8000-000000000038',
  current_setting('pilotseal_test.student_id')::uuid,
  'member', 'student', current_setting('pilotseal_test.instructor_id')::uuid
);

insert into public.saved_people (id, user_id, role, display_name, cert_number)
values
(
  '48000000-0000-4000-8000-000000000001',
  current_setting('pilotseal_test.student_id')::uuid,
  'self', 'Avery Multi Student', 'MULTI-1'
),
(
  '48000000-0000-4000-8000-000000000002',
  current_setting('pilotseal_test.instructor_id')::uuid,
  'student', 'Avery Multi Student', 'MULTI-1'
),
(
  '48000000-0000-4000-8000-000000000003',
  current_setting('pilotseal_test.instructor_id')::uuid,
  'student', 'Una Unregistered', 'UNREG-1'
);
update public.profiles
set self_person_id = '48000000-0000-4000-8000-000000000001'
where id = current_setting('pilotseal_test.student_id')::uuid;
insert into public.saved_person_account_links (
  owner_user_id, saved_person_id, linked_user_id
) values (
  current_setting('pilotseal_test.instructor_id')::uuid,
  '48000000-0000-4000-8000-000000000002',
  current_setting('pilotseal_test.student_id')::uuid
);

select set_config('request.jwt.claim.sub', current_setting('pilotseal_test.instructor_id'), true);
set local role authenticated;
select lives_ok(
  $$select public.create_endorsement_record(
    '68000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '48000000-0000-4000-8000-000000000002',
    'Avery Multi Student', 'MULTI-1', 'Morgan Testflight', 'CFI-1',
    '09/02/2026', array['Automatic multi-organization'],
    current_setting('request.jwt.claim.sub') || '/68000000-0000-4000-8000-000000000001.pdf',
    1000, null
  )$$,
  'endorsement creation does not require a save destination'
);
reset role;

select is((select organization_id from public.endorsement_records where id = '68000000-0000-4000-8000-000000000001'), null::uuid, 'single organization column is not used as a save destination');
select is((select scope_status from public.endorsement_records where id = '68000000-0000-4000-8000-000000000001'), 'confirmed', 'automatic organization association freezes the record');
select is((select count(*) from private.endorsement_record_organization_access where record_id = '68000000-0000-4000-8000-000000000001'), 2::bigint, 'one endorsement is associated with both common organizations');

select set_config('request.jwt.claim.sub', current_setting('pilotseal_test.instructor_id'), true);
set local role authenticated;
select is((select count(*) from public.list_organization_endorsement_records('10000000-0000-4000-8000-000000000001') where id = '68000000-0000-4000-8000-000000000001'), 1::bigint, 'first organization reads the one endorsement');
select is((select count(*) from public.list_organization_endorsement_records('10000000-0000-4000-8000-000000000038') where id = '68000000-0000-4000-8000-000000000001'), 1::bigint, 'second organization reads the same endorsement');
select is_empty(
  $$update public.endorsement_records set student_name = 'Changed'
    where id = '68000000-0000-4000-8000-000000000001'
    returning id$$,
  'organization-associated endorsement cannot be edited in place'
);
select lives_ok(
  $$select public.create_endorsement_record(
    '68000000-0000-4000-8000-000000000002', null,
    '48000000-0000-4000-8000-000000000003',
    'Una Unregistered', 'UNREG-1', 'Morgan Testflight', 'CFI-1',
    '09/02/2026', array['Unregistered Personal'],
    current_setting('request.jwt.claim.sub') || '/68000000-0000-4000-8000-000000000002.pdf',
    1000, null
  )$$,
  'unregistered student endorsement is still allowed'
);
reset role;
select is((select count(*) from private.endorsement_record_organization_access where record_id = '68000000-0000-4000-8000-000000000002'), 0::bigint, 'unregistered student endorsement has no organization access');
select is((select scope_status from public.endorsement_records where id = '68000000-0000-4000-8000-000000000002'), 'personal', 'unregistered student endorsement remains Personal');

delete from public.organization_members
where organization_id = '10000000-0000-4000-8000-000000000001'
  and user_id = current_setting('pilotseal_test.student_id')::uuid;

select set_config('request.jwt.claim.sub', current_setting('pilotseal_test.instructor_id'), true);
set local role authenticated;
select lives_ok(
  $$select public.create_endorsement_record(
    '68000000-0000-4000-8000-000000000003', null,
    '48000000-0000-4000-8000-000000000002',
    'Avery Multi Student', 'MULTI-1', 'Morgan Testflight', 'CFI-1',
    '09/02/2026', array['Exit gap'],
    current_setting('request.jwt.claim.sub') || '/68000000-0000-4000-8000-000000000003.pdf',
    1000, null
  )$$,
  'post-exit endorsement is created without routing input'
);
reset role;
select is((select count(*) from private.endorsement_record_organization_access where record_id = '68000000-0000-4000-8000-000000000003' and organization_id = '10000000-0000-4000-8000-000000000038'), 1::bigint, 'post-exit endorsement remains visible to the other common organization');
select is((select count(*) from private.endorsement_record_organization_access where record_id = '68000000-0000-4000-8000-000000000003' and organization_id = '10000000-0000-4000-8000-000000000001'), 0::bigint, 'post-exit endorsement is hidden from the exited organization');

insert into public.organization_members (
  organization_id, user_id, role, teaching_role, added_by
) values (
  '10000000-0000-4000-8000-000000000001',
  current_setting('pilotseal_test.student_id')::uuid,
  'member', 'student', current_setting('pilotseal_test.instructor_id')::uuid
);
select is((select count(*) from private.endorsement_record_organization_access where record_id = '68000000-0000-4000-8000-000000000003' and organization_id = '10000000-0000-4000-8000-000000000001'), 0::bigint, 'rejoin does not expose an exit-gap endorsement retroactively');

select set_config('request.jwt.claim.sub', current_setting('pilotseal_test.instructor_id'), true);
set local role authenticated;
select lives_ok(
  $$select public.create_endorsement_record(
    '68000000-0000-4000-8000-000000000004', null,
    '48000000-0000-4000-8000-000000000002',
    'Avery Multi Student', 'MULTI-1', 'Morgan Testflight', 'CFI-1',
    '09/02/2026', array['After rejoin'],
    current_setting('request.jwt.claim.sub') || '/68000000-0000-4000-8000-000000000004.pdf',
    1000, null
  )$$,
  'new endorsement is automatically associated after rejoin'
);
reset role;
select is((select count(*) from private.endorsement_record_organization_access where record_id = '68000000-0000-4000-8000-000000000004'), 2::bigint, 'post-rejoin endorsement is visible to both common organizations');

select set_config('request.jwt.claim.sub', current_setting('pilotseal_test.instructor_id'), true);
set local role authenticated;
select lives_ok(
  $$select public.create_and_finalize_flight_brief(
    jsonb_build_object(
      'student_saved_person_id', '48000000-0000-4000-8000-000000000002',
      'student_user_id', current_setting('pilotseal_test.student_id'),
      'aircraft_tail_number', 'NMULTI1',
      'student_name', 'Avery Multi Student',
      'instructor_name', 'Morgan Testflight',
      'brief_data', '{}'::jsonb
    ), null, null, null, null
  )$$,
  'Flight Brief finalization derives organization visibility automatically'
);
reset role;
select is((select count(*) from private.flight_brief_organization_access access join public.flight_briefs brief on brief.id = access.brief_id where brief.aircraft_tail_number = 'NMULTI1'), 2::bigint, 'one Flight Brief is associated with both common organizations');
select is((select count(*) from public.flight_brief_organization_shares share join public.flight_briefs brief on brief.id = share.source_brief_id where brief.aircraft_tail_number = 'NMULTI1'), 0::bigint, 'automatic Flight Brief visibility creates no copy');

select set_config('request.jwt.claim.sub', current_setting('pilotseal_test.student_id'), true);
set local role authenticated;
select lives_ok(
  $$select public.create_and_finalize_flight_brief(
    jsonb_build_object(
      'student_saved_person_id', '48000000-0000-4000-8000-000000000001',
      'student_user_id', current_setting('pilotseal_test.student_id'),
      'aircraft_tail_number', 'NMEMBER1',
      'student_name', 'Avery Multi Student',
      'instructor_name', 'Self-preflight',
      'brief_data', '{}'::jsonb
    ), null, null, null, null
  )$$,
  'an organization student can finalize their own single Flight Brief'
);
reset role;
select is((select count(*) from private.flight_brief_organization_access access join public.flight_briefs brief on brief.id = access.brief_id where brief.aircraft_tail_number = 'NMEMBER1'), 2::bigint, 'a member self-preflight is associated with every current organization');

select set_config('request.jwt.claim.sub', current_setting('pilotseal_test.instructor_id'), true);
set local role authenticated;
select is((select count(*) from public.list_organization_flight_briefs('10000000-0000-4000-8000-000000000001') where aircraft_tail_number = 'NMULTI1'), 1::bigint, 'first organization sees the original Flight Brief');
select is((select count(*) from public.list_organization_flight_briefs('10000000-0000-4000-8000-000000000038') where aircraft_tail_number = 'NMULTI1'), 1::bigint, 'second organization sees the same Flight Brief');
select is((select count(*) from public.list_organization_flight_briefs('10000000-0000-4000-8000-000000000001') where aircraft_tail_number = 'NMEMBER1'), 1::bigint, 'organization staff sees a member self-preflight without a copied record');
reset role;

delete from public.organization_members
where organization_id = '10000000-0000-4000-8000-000000000001'
  and user_id = current_setting('pilotseal_test.student_id')::uuid;

select set_config('request.jwt.claim.sub', current_setting('pilotseal_test.instructor_id'), true);
set local role authenticated;
select lives_ok(
  $$select public.create_and_finalize_flight_brief(
    jsonb_build_object(
      'student_saved_person_id', '48000000-0000-4000-8000-000000000002',
      'student_user_id', current_setting('pilotseal_test.student_id'),
      'aircraft_tail_number', 'NMULTI2',
      'student_name', 'Avery Multi Student',
      'instructor_name', 'Morgan Testflight',
      'brief_data', '{}'::jsonb
    ), null, null, null, null
  )$$,
  'post-exit Flight Brief is still finalized once'
);
reset role;
select is((select count(*) from private.flight_brief_organization_access access join public.flight_briefs brief on brief.id = access.brief_id where brief.aircraft_tail_number = 'NMULTI2' and access.organization_id = '10000000-0000-4000-8000-000000000038'), 1::bigint, 'post-exit Flight Brief remains visible to the other organization');
select is((select count(*) from private.flight_brief_organization_access access join public.flight_briefs brief on brief.id = access.brief_id where brief.aircraft_tail_number = 'NMULTI2' and access.organization_id = '10000000-0000-4000-8000-000000000001'), 0::bigint, 'post-exit Flight Brief is hidden from the exited organization');
update public.flight_briefs
set status = 'superseded'
where aircraft_tail_number = 'NMULTI1';
select is((select count(*) from private.flight_brief_organization_access access join public.flight_briefs brief on brief.id = access.brief_id where brief.aircraft_tail_number = 'NMULTI1' and access.organization_id = '10000000-0000-4000-8000-000000000001'), 1::bigint, 'later status changes do not erase pre-exit organization access');
select is((select count(*) from private.flight_brief_organization_access access join public.flight_briefs brief on brief.id = access.brief_id where brief.aircraft_tail_number = 'NMULTI1' and access.organization_id = '10000000-0000-4000-8000-000000000001'), 1::bigint, 'exited organization retains the earlier finalized Flight Brief');

select set_config('request.jwt.claim.sub', current_setting('pilotseal_test.instructor_id'), true);
set local role authenticated;
select is((select count(*) from public.list_organization_flight_briefs('10000000-0000-4000-8000-000000000001') where aircraft_tail_number = 'NMULTI2'), 0::bigint, 'organization listing excludes post-exit Flight Briefs');
select is((select count(*) from public.list_my_flight_briefs() where aircraft_tail_number in ('NMULTI1', 'NMULTI2')), 2::bigint, 'creator history contains each Flight Brief once');
reset role;

select set_config('request.jwt.claim.sub', current_setting('pilotseal_test.student_id'), true);
set local role authenticated;
select is((select count(*) from public.endorsement_records where id in (
  '68000000-0000-4000-8000-000000000001',
  '68000000-0000-4000-8000-000000000003',
  '68000000-0000-4000-8000-000000000004'
)), 3::bigint, 'linked student reads all of their endorsements independent of organization access');
select is((select count(*) from public.flight_briefs where aircraft_tail_number in ('NMULTI1', 'NMULTI2')), 2::bigint, 'student reads both finalized Flight Briefs independent of organization access');
reset role;

select * from finish();
rollback;
