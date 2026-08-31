begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

select has_table('public', 'legacy_endorsement_review_audit', 'legacy review audit table exists');
select has_function('public', 'get_legacy_endorsement_review_context', array['uuid'], 'legacy review context RPC exists');
select has_function('public', 'review_legacy_endorsement_scope_v2', array['uuid','text','text','boolean'], 'legacy review decision RPC exists');
select ok(
  not has_function_privilege('authenticated', 'public.review_legacy_endorsement_scope(uuid,text,uuid,text)', 'execute'),
  'legacy UUID-based review RPC is no longer executable by clients'
);

insert into public.saved_people (id, user_id, role, display_name, cert_number)
values
(
  '40000000-0000-4000-8000-000000000034',
  (select id from public.profiles where email = 'instructor.one@example.test'),
  'student', 'Avery Legacy', 'LEGACY-34'
),
(
  '40000000-0000-4000-8000-000000000035',
  (select id from public.profiles where email = 'pilot.one@example.test'),
  'self', 'Avery Testpilot', 'LEGACY-34'
);

update public.profiles
set self_person_id = '40000000-0000-4000-8000-000000000035'
where email = 'pilot.one@example.test';

insert into public.saved_person_account_links (saved_person_id, owner_user_id, linked_user_id)
values (
  '40000000-0000-4000-8000-000000000034',
  (select id from public.profiles where email = 'instructor.one@example.test'),
  (select id from public.profiles where email = 'pilot.one@example.test')
);

insert into public.endorsement_records (
  id, user_id, organization_id, student_id, student_name, instructor_name,
  endorsement_date, template_titles, storage_path, scope_status, created_at
) values (
  '60000000-0000-4000-8000-000000000034',
  (select id from public.profiles where email = 'instructor.one@example.test'),
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000034',
  'Avery Legacy', 'Morgan Testflight', '01/01/2020', array['Legacy test'],
  (select id::text from public.profiles where email = 'instructor.one@example.test') || '/60000000-0000-4000-8000-000000000034.pdf',
  'pending_review', '2020-01-01 12:00:00+00'
);

select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'platform.admin@example.test'), true);
set local role authenticated;
select is(
  (select account_linked from public.get_legacy_endorsement_review_context('60000000-0000-4000-8000-000000000034')),
  true,
  'review context resolves the accepted account link'
);
select is(
  (select organization_student from public.get_legacy_endorsement_review_context('60000000-0000-4000-8000-000000000034')),
  true,
  'review context confirms organization student status'
);
select is(
  (select requires_historical_attestation from public.get_legacy_endorsement_review_context('60000000-0000-4000-8000-000000000034')),
  true,
  'review context flags missing original-time membership periods'
);
select throws_ok(
  $$select public.review_legacy_endorsement_scope_v2('60000000-0000-4000-8000-000000000034', 'confirmed', 'Reviewed roster document', false)$$,
  '42501',
  'Confirm historical membership evidence to continue.',
  'legacy confirmation requires explicit historical evidence attestation'
);
select lives_ok(
  $$select public.review_legacy_endorsement_scope_v2('60000000-0000-4000-8000-000000000034', 'confirmed', '', true)$$,
  'platform admin can confirm historical membership without a written note'
);
reset role;

select is((select scope_status from public.endorsement_records where id = '60000000-0000-4000-8000-000000000034'), 'confirmed', 'review makes the endorsement organization-visible');
select is((select count(*) from public.legacy_endorsement_review_audit where record_id = '60000000-0000-4000-8000-000000000034' and evidence_kind = 'reviewer_attestation'), 1::bigint, 'historical attestation is audited');
select is((select note from public.legacy_endorsement_review_audit where record_id = '60000000-0000-4000-8000-000000000034'), null::text, 'historical attestation note is optional');

select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'pilot.one@example.test'), true);
set local role authenticated;
insert into public.flight_briefs (
  id, created_by, organization_id, student_saved_person_id, student_user_id,
  aircraft_tail_number, student_name, instructor_name, status, brief_data
) values (
  '70000000-0000-4000-8000-000000000034', current_setting('request.jwt.claim.sub')::uuid,
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000035', current_setting('request.jwt.claim.sub')::uuid,
  'N000PS', 'Avery Testpilot', 'Morgan Testflight',
  'draft', '{}'::jsonb
);
insert into public.flight_briefs (
  id, created_by, organization_id, student_saved_person_id, student_user_id,
  aircraft_tail_number, student_name, instructor_name, status, brief_data
) values (
  '70000000-0000-4000-8000-000000000035', current_setting('request.jwt.claim.sub')::uuid,
  null, '40000000-0000-4000-8000-000000000035', current_setting('request.jwt.claim.sub')::uuid,
  'NPRIVATE', 'Avery Testpilot', 'Morgan Testflight', 'draft', '{}'::jsonb
);
reset role;

select ok((select membership_period_id is not null from public.flight_briefs where id = '70000000-0000-4000-8000-000000000034'), 'organization draft stores its membership period');

update public.flight_briefs
set status = 'finalized', finalized_at = timezone('utc', now())
where id = '70000000-0000-4000-8000-000000000035';

select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'pilot.one@example.test'), true);
set local role authenticated;
select lives_ok(
  $$select public.share_personal_flight_brief_with_organization('70000000-0000-4000-8000-000000000035', '10000000-0000-4000-8000-000000000001')$$,
  'member can explicitly share a finalized Personal Flight Brief copy'
);
reset role;
select is((select organization_id from public.flight_briefs where id = '70000000-0000-4000-8000-000000000035'), null::uuid, 'sharing preserves the Personal original');
select is((select count(*) from public.flight_brief_organization_shares where source_brief_id = '70000000-0000-4000-8000-000000000035'), 1::bigint, 'organization copy is audited');

select set_config('request.jwt.claim.sub', (select id::text from public.profiles where email = 'instructor.one@example.test'), true);
set local role authenticated;
select is((select count(*) from public.flight_briefs where id = '70000000-0000-4000-8000-000000000034'), 0::bigint, 'organization instructor cannot read incomplete member drafts');
select is((select count(*) from public.flight_briefs where id = '70000000-0000-4000-8000-000000000035'), 0::bigint, 'organization instructor cannot read the member Personal original');
select is((select count(*) from public.flight_briefs where organization_id = '10000000-0000-4000-8000-000000000001' and aircraft_tail_number = 'NPRIVATE' and status = 'finalized'), 1::bigint, 'organization instructor can read the explicitly shared copy');
reset role;

select * from finish();
rollback;
