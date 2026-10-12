import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument } from 'pdf-lib';

execFileSync('node', ['scripts/assert-local-targets.mjs'], { stdio: 'inherit' });
const raw = execFileSync('./node_modules/.bin/supabase', ['status', '--network-id', 'pilotseal-local', '--output', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const env = Object.fromEntries(raw.split(/\r?\n/).flatMap(line => { const match = line.match(/^([A-Z0-9_]+)=["']?(.*?)["']?$/); return match ? [[match[1], match[2]]] : []; }));
assert(['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(env.API_URL).hostname));
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY ?? env.SECRET_KEY, options);
const client = () => createClient(env.API_URL, env.ANON_KEY ?? env.PUBLISHABLE_KEY, options);
const unwrap = ({ data, error }) => { if (error) throw Error(error.message); return data; };
const school = '61000000-0000-4000-8000-000000000001';
const otherSchool = '61000000-0000-4000-8000-000000000002';
const aircraft = '63000000-0000-4000-8000-000000000001';
const endorsementIds = ['65000000-0000-4000-8000-000000000001', '65000000-0000-4000-8000-000000000002', '65000000-0000-4000-8000-000000000003'];
const roles = ['owner', 'finder', 'admin', 'platform', 'outsider'];
const users = {};
const sessions = {};
const paths = [];
let checks = 0;
const check = (name, actual, expected) => { assert.deepEqual(actual, expected, name); checks++; console.log(`PASS ${name}`); };
const fail = async (name, promise, pattern) => { const value = await promise; assert(value.error, `${name}: should fail`); assert.match(value.error.message, pattern, name); checks++; console.log(`PASS ${name}`); };

async function cleanup() {
  const organizations = unwrap(await admin.from('organizations').select('name').in('id', [school, otherSchool]));
  for (const organization of organizations) assert.match(organization.name, /^Report QA /, 'cleanup only owns QA organizations');
  const records = unwrap(await admin.from('endorsement_records').select('id,storage_path').in('id', endorsementIds));
  for (const row of records) assert.match(row.storage_path, /\/record-actions-qa-/, 'cleanup only owns its PDFs');
  if (records.length) unwrap(await admin.storage.from('endorsement-records').remove(records.map(row => row.storage_path)));
  unwrap(await admin.from('endorsement_records').delete().in('id', endorsementIds));
  unwrap(await admin.from('record_action_audit').delete().in('organization_id', [school, otherSchool]));
  execFileSync('node', ['scripts/test-aircraft-reports-local.mjs', '--cleanup'], { stdio: 'inherit' });
}
if (process.argv.includes('--cleanup')) { await cleanup(); process.exit(0); }
if (process.argv.includes('--ground-ui-aircraft')) {
  const user = unwrap(await admin.auth.admin.listUsers({ perPage: 1000 })).users.find(value => value.email === 'report-qa.owner@example.test');
  assert.equal(user?.app_metadata.fixture, 'aircraft-reports-qa');
  const signed = client(); unwrap(await signed.auth.signInWithPassword({ email: user.email, password: 'LocalReports!2026' }));
  unwrap(await signed.rpc('update_organization_aircraft_status', { p_organization_id: school, p_aircraft_id: aircraft, p_operational_status: 'grounded', p_operational_status_note: 'QA manual grounding: inspection pending.' }));
  console.log('Grounded only the synthetic QA aircraft with a manual note.'); process.exit(0);
}
if (process.argv.includes('--touch-ui-safety-report')) {
  const target = unwrap(await admin.from('asr_reports').select('report_id').eq('aircraft_id', aircraft).eq('description', 'UI safety group: runway incursion report.').single());
  unwrap(await admin.from('organization_reports').update({ updated_at: new Date().toISOString() }).eq('id', target.report_id).eq('organization_id', school));
  console.log('Changed only the synthetic safety report version for retry verification.'); process.exit(0);
}
if (process.argv.includes('--add-ui-note')) {
  const tagged = unwrap(await admin.auth.admin.listUsers({ perPage: 1000 })).users;
  const owner = tagged.find(value => value.email === 'report-qa.owner@example.test');
  const student = tagged.find(value => value.email === 'report-qa.finder@example.test');
  assert.equal(owner?.app_metadata.fixture, 'aircraft-reports-qa'); assert.equal(student?.app_metadata.fixture, 'aircraft-reports-qa');
  const existing = unwrap(await admin.from('student_record_folders').select('id,student_name').eq('owner_user_id', owner.id).eq('student_user_id', student.id).maybeSingle());
  if (existing) assert.equal(existing.student_name, 'Report QA Finder');
  const folderId = existing?.id ?? '66000000-0000-4000-8000-000000000001';
  if (!existing) unwrap(await admin.from('student_record_folders').insert({ id: folderId, owner_user_id: owner.id, student_id: null, student_user_id: student.id, student_name: 'Report QA Finder', student_cert_number: 'QA-100' }));
  unwrap(await admin.from('student_record_items').insert({ id: '67000000-0000-4000-8000-000000000001', folder_id: folderId, title: 'QA training note', record_date: '2026-10-12', category: 'Training', notes: 'Independent synthetic note for grouped-record verification.' }));
  console.log('Added one synthetic note to the same student as the QA endorsements.'); process.exit(0);
}
if (process.argv.includes('--verify-concurrency')) {
  const tagged = unwrap(await admin.auth.admin.listUsers({ perPage: 1000 })).users;
  const platform = tagged.find(value => value.email === 'report-qa.platform@example.test');
  const owner = tagged.find(value => value.email === 'report-qa.owner@example.test');
  assert.equal(platform?.app_metadata.fixture, 'aircraft-reports-qa'); assert.equal(owner?.app_metadata.fixture, 'aircraft-reports-qa');
  const signed = client(); unwrap(await signed.auth.signInWithPassword({ email: platform.email, password: 'LocalReports!2026' }));
  const first = randomUUID(); const second = randomUUID();
  for (const id of [first, second]) {
    unwrap(await admin.from('organization_reports').insert({ id, organization_id: school, report_type: 'asr', status: 'draft', submitted_by: owner.id, submitted_by_name: 'Report QA Owner', client_request_id: randomUUID() }));
    unwrap(await admin.from('asr_reports').insert({ report_id: id, report_data: { no_aircraft: true }, description: 'Synthetic concurrency fixture.' }));
  }
  unwrap(await admin.from('organization_reports').update({ supersedes_report_id: second }).eq('id', first));
  unwrap(await admin.from('organization_reports').update({ supersedes_report_id: first }).eq('id', second));
  const rows = unwrap(await admin.from('organization_reports').select('id,updated_at').in('id', [first, second]));
  const results = await Promise.all(rows.map(row => signed.rpc('perform_organization_report_action', { p_report_id: row.id, p_expected_updated_at: row.updated_at, p_action: 'delete', p_reason: 'Concurrent synthetic cleanup.' })));
  for (const result of results) unwrap(result);
  check('cross-linked simultaneous deletions complete without a lock cycle', unwrap(await admin.from('organization_reports').select('id').in('id', [first, second])).length, 0);
  check('both deletions retain independent audit', unwrap(await admin.from('record_action_audit').select('id').in('record_id', [first, second]).eq('action', 'deleted')).length, 2);
  console.log(`Concurrency: ${checks} checks passed.`); process.exit(0);
}
if (process.argv.includes('--verify-return-scope')) {
  const tagged = unwrap(await admin.auth.admin.listUsers({ perPage: 1000 })).users;
  for (const role of ['owner', 'platform']) {
    const user = tagged.find(value => value.email === `report-qa.${role}@example.test`);
    assert.equal(user?.app_metadata.fixture, 'aircraft-reports-qa'); users[role] = user;
    sessions[role] = client(); unwrap(await sessions[role].auth.signInWithPassword({ email: user.email, password: 'LocalReports!2026' }));
  }
  const founder = unwrap(await admin.from('organization_people').select('id').eq('organization_id', school).eq('organization_display_name', 'Report QA Finder').single()).id;
  const source = unwrap(await sessions.owner.rpc('submit_aircraft_report', { p_organization_id: school, p_client_request_id: randomUUID(), p_aircraft_id: aircraft, p_report_date: '2026-10-12', p_found_by_person_id: founder, p_report_timezone: 'America/New_York', p_student_person_id: null, p_instructor_person_id: null, p_flight_hobbs_end: null, p_maintenance_hobbs_end: null, p_flight_duration: null, p_discrepancy_type: 'Radio', p_description: 'QA source for authority and deleted-reference checks.', p_ground_aircraft: false }));
  const related = randomUUID();
  unwrap(await admin.from('organization_reports').insert({ id: related, organization_id: school, report_type: 'asr', status: 'in_review', submitted_by: users.owner.id, submitted_by_name: 'Report QA Owner', client_request_id: randomUUID() }));
  unwrap(await admin.from('asr_reports').insert({ report_id: related, source_discrepancy_report_id: source, aircraft_id: aircraft, aircraft_tail_number: 'NQA01', risk_score: 10, description: 'QA surviving safety report.', report_data: { source_discrepancy_report_id: source, description: 'QA surviving safety report.' } }));
  const row = unwrap(await admin.from('organization_reports').select('updated_at').eq('id', source).single());
  const currentAssignments = unwrap(await admin.from('aircraft_organization_assignments').select('*').eq('aircraft_id', aircraft).eq('organization_id', school));
  const originalModel = unwrap(await admin.from('aircraft').select('model_id').eq('id', aircraft).single()).model_id;
  const scopeModel = randomUUID();
  unwrap(await admin.from('aircraft_models').insert({ id: scopeModel, organization_id: otherSchool, name: 'QA current-fleet trainer', category: 'airplane', chart_type: 'standard', stations: [], envelope: [] }));
  unwrap(await sessions.owner.rpc('update_organization_aircraft_status', { p_organization_id: school, p_aircraft_id: aircraft, p_operational_status: 'grounded', p_operational_status_note: 'QA fleet-authority verification.' }));
  try {
    unwrap(await admin.from('aircraft').update({ organization_id: otherSchool, model_id: scopeModel }).eq('id', aircraft));
    unwrap(await admin.from('aircraft_organization_assignments').delete().eq('aircraft_id', aircraft).eq('organization_id', school));
    const ownerContext = unwrap(await sessions.owner.rpc('get_organization_report_action_context', { p_report_id: source }));
    check('historical organization manager cannot restore an aircraft now outside their fleet', ownerContext.can_return_to_service, false);
    await fail('old fleet context cannot bypass current assignment permission', sessions.owner.rpc('perform_organization_report_action', { p_report_id: source, p_expected_updated_at: row.updated_at, p_action: 'close', p_return_to_service: true, p_context_token: ownerContext.token }), /Fleet management/);
    const platformContext = unwrap(await sessions.platform.rpc('get_organization_report_action_context', { p_report_id: source }));
    check('platform uses the current authorized aircraft organization', platformContext.return_organization_id, otherSchool);
    check('platform can restore an aircraft moved from its historical report organization', platformContext.can_return_to_service, true);
    unwrap(await sessions.platform.rpc('perform_organization_report_action', { p_report_id: source, p_expected_updated_at: row.updated_at, p_action: 'delete', p_reason: 'Synthetic authority verification.', p_return_to_service: true, p_context_token: platformContext.token }));
    check('combined historical report deletion returns the aircraft to Available', unwrap(await admin.from('organization_aircraft_maintenance').select('operational_status').eq('aircraft_id', aircraft).single()).operational_status, 'available');
    const retained = unwrap(await admin.from('asr_reports').select('source_discrepancy_report_id,deleted_source_report_id,report_data,description').eq('report_id', related).single());
    check('deletion clears the stale form reference and preserves source marker', [retained.source_discrepancy_report_id, retained.deleted_source_report_id, retained.report_data.source_discrepancy_report_id], [null, source, '']);
    check('linked safety report content remains unchanged', [retained.description, retained.report_data.description], ['QA surviving safety report.', 'QA surviving safety report.']);
  } finally {
    unwrap(await admin.from('aircraft').update({ organization_id: school, model_id: originalModel }).eq('id', aircraft));
    if (currentAssignments.length) unwrap(await admin.from('aircraft_organization_assignments').upsert(currentAssignments));
    unwrap(await admin.from('aircraft_models').delete().eq('id', scopeModel));
  }
  const closed = unwrap(await admin.from('organization_reports').select('updated_at').eq('id', related).single());
  unwrap(await sessions.owner.rpc('perform_organization_report_action', { p_report_id: related, p_expected_updated_at: closed.updated_at, p_action: 'close', p_safety_review: { safetyComments: 'Synthetic source deletion reviewed.', title: 'Safety reviewer', externalNotifications: [] } }));
  const closedVersion = unwrap(await admin.from('organization_reports').select('updated_at').eq('id', related).single());
  await fail('a stale combined close cannot silently ignore return-to-service after another closure', sessions.owner.rpc('perform_organization_report_action', { p_report_id: related, p_expected_updated_at: closedVersion.updated_at, p_action: 'close', p_return_to_service: true, p_context_token: 'stale' }), /already closed/);
  unwrap(await sessions.platform.rpc('perform_organization_report_action', { p_report_id: related, p_expected_updated_at: closedVersion.updated_at, p_action: 'delete', p_reason: 'Synthetic closed safety report deletion.' }));
  check('platform can permanently delete a closed safety report', unwrap(await admin.from('organization_reports').select('id').eq('id', related)).length, 0);
  console.log(`Current-fleet authority and references: ${checks} checks passed.`); process.exit(0);
}
if (process.argv.includes('--verify-visibility-rules')) {
  for (const role of ['owner', 'finder']) {
    sessions[role] = client();
    unwrap(await sessions[role].auth.signInWithPassword({ email: `report-qa.${role}@example.test`, password: 'LocalReports!2026' }));
  }
  try {
    for (const id of [endorsementIds[0], endorsementIds[2]]) unwrap(await sessions.owner.rpc('set_organization_endorsement_hidden', { p_organization_id: school, p_record_id: id, p_hidden: true }));
    const visible = unwrap(await sessions.finder.from('organization_endorsement_visibility').select('record_id').eq('organization_id', school));
    check('student can see visibility metadata only for their own endorsement', visible.map(row => row.record_id), [endorsementIds[0]]);
    await fail('anonymous cannot read hidden-record metadata', client().from('organization_endorsement_visibility').select('record_id'), /permission denied/);
    await fail('student cannot write hidden-record metadata directly', sessions.finder.from('organization_endorsement_visibility').delete().eq('record_id', endorsementIds[0]), /permission denied/);
  } finally {
    for (const id of [endorsementIds[0], endorsementIds[2]]) unwrap(await sessions.owner.rpc('set_organization_endorsement_hidden', { p_organization_id: school, p_record_id: id, p_hidden: false }));
  }
  console.log(`Visibility RLS: ${checks} checks passed.`); process.exit(0);
}
if (!process.argv.includes('--resume-endorsements')) execFileSync('node', ['scripts/test-aircraft-reports-local.mjs', '--setup-ui', '--keep-fixtures'], { stdio: 'inherit' });
try {
  const createdUsers = unwrap(await admin.auth.admin.listUsers({ perPage: 1000 })).users;
  for (const role of roles) {
    users[role] = createdUsers.find(user => user.email === `report-qa.${role}@example.test`);
    assert.equal(users[role]?.app_metadata.fixture, 'aircraft-reports-qa');
    sessions[role] = client();
    unwrap(await sessions[role].auth.signInWithPassword({ email: users[role].email, password: 'LocalReports!2026' }));
  }
  const people = unwrap(await admin.from('organization_people').select('id,user_id').eq('organization_id', school));
  const finder = people.find(person => person.user_id === users.finder.id).id;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  async function submit(description, ground = false) {
    return unwrap(await sessions.owner.rpc('submit_aircraft_report', { p_organization_id: school, p_client_request_id: randomUUID(), p_aircraft_id: aircraft,
      p_report_date: today, p_found_by_person_id: finder, p_report_timezone: 'America/New_York', p_student_person_id: null, p_instructor_person_id: null,
      p_flight_hobbs_end: null, p_maintenance_hobbs_end: null, p_flight_duration: null, p_discrepancy_type: 'Radio', p_description: description, p_ground_aircraft: ground }));
  }
  const report = id => admin.from('organization_reports').select('*').eq('id', id).maybeSingle().then(unwrap);
  const meter = () => admin.from('organization_aircraft_maintenance').select('*').eq('aircraft_id', aircraft).single().then(unwrap);
  const context = (id, role = 'owner') => sessions[role].rpc('get_organization_report_action_context', { p_report_id: id }).then(unwrap);
  async function action(id, type, role = 'owner', extra = {}) {
    const row = await report(id);
    return sessions[role].rpc('perform_organization_report_action', { p_report_id: id, p_expected_updated_at: row?.updated_at ?? null, p_action: type, ...extra });
  }
  if (!process.argv.includes('--resume-endorsements')) {
  const a = await submit('QA grouped report: intermittent radio reception.', true);
  const before = await meter();
  await fail('member cannot close', action(a, 'close', 'finder'), /permission/);
  await fail('organization admin cannot permanently delete', action(a, 'delete', 'admin', { p_reason: 'Duplicate QA record.' }), /platform/);
  await fail('outsider cannot close', action(a, 'close', 'outsider'), /permission/);
  await fail('open report cannot be hidden', action(a, 'hide'), /Close this report/);
  await fail('anonymous cannot invoke report actions', client().rpc('perform_organization_report_action', { p_report_id: a, p_expected_updated_at: (await report(a)).updated_at, p_action: 'close' }), /permission denied/);
  await fail('anonymous cannot read action context', client().rpc('get_organization_report_action_context', { p_report_id: a }), /permission denied/);
  check('grounding context offers authorized return to service', (await context(a)).can_return_to_service, true);
  unwrap(await action(a, 'close'));
  check('unchecked close leaves the entire aircraft record unchanged', await meter(), before);
  unwrap(await action(a, 'hide'));
  check('hide keeps the business status Closed', (await report(a)).status, 'closed');
  check('hide records visibility without deleting the report', Boolean((await report(a)).hidden_at), true);
  await fail('member cannot unhide', action(a, 'unhide', 'finder'), /permission/);
  unwrap(await action(a, 'unhide'));
  check('unhide retains Closed and clears visibility flag', [(await report(a)).status, (await report(a)).hidden_at], ['closed', null]);
  check('hide and unhide preserve aircraft state', await meter(), before);
  await fail('direct visibility-table writes are forbidden', sessions.owner.from('organization_endorsement_visibility').insert({ organization_id: school, record_id: endorsementIds[0], hidden_by: users.owner.id }), /permission denied/);
  await fail('direct audit writes are forbidden', sessions.owner.from('record_action_audit').insert({ organization_id: school, record_id: a, record_kind: 'report', action: 'deleted', actor_user_id: users.owner.id }), /permission denied/);

  const b = await submit('QA grouped report: engine vibration.', true);
  const staleContext = await context(b);
  const c = await submit('QA grouped report: another unresolved grounding issue.', true);
  await fail('changed grounding context rejects combined close atomically', action(b, 'close', 'owner', { p_return_to_service: true, p_context_token: staleContext.token }), /changed/);
  check('failed combined close keeps report open and aircraft grounded', [(await report(b)).status, (await meter()).operational_status], ['submitted', 'grounded']);
  const refreshed = await context(b);
  check('confirmation lists other open grounding reports', refreshed.other_grounding_reports.some(row => row.id === c), true);
  unwrap(await action(b, 'close', 'owner', { p_return_to_service: true, p_context_token: refreshed.token }));
  check('explicit combined close changes both report and aircraft', [(await report(b)).status, (await meter()).operational_status], ['closed', 'available']);
  const available = await meter();
  check('return-to-service preserves cumulative meter', [available.current_meter_type, available.current_meter_value], [before.current_meter_type, before.current_meter_value]);
  const closedEvents = unwrap(await admin.from('organization_report_events').select('id').eq('report_id', b).eq('event_type', 'closed'));
  unwrap(await action(b, 'close'));
  check('close retries do not duplicate activity', unwrap(await admin.from('organization_report_events').select('id').eq('report_id', b).eq('event_type', 'closed')).length, closedEvents.length);

  const d = await submit('QA permanent deletion: duplicate report.', true);
  const related = randomUUID();
  unwrap(await admin.from('organization_reports').insert({ id: related, organization_id: school, report_type: 'asr', status: 'in_review', submitted_by: users.owner.id, submitted_by_name: 'Report QA Owner', client_request_id: randomUUID() }));
  unwrap(await admin.from('asr_reports').insert({ report_id: related, source_discrepancy_report_id: d, aircraft_id: aircraft, aircraft_tail_number: 'NQA01', description: 'QA safety report remains after source deletion.', risk_score: 10, report_data: { description: 'QA safety report remains after source deletion.' } }));
  await fail('deletion reason is required', action(d, 'delete', 'platform', { p_reason: '' }), /reason/);
  await fail('stale report version blocks deletion', sessions.platform.rpc('perform_organization_report_action', { p_report_id: d, p_expected_updated_at: '2000-01-01T00:00:00Z', p_action: 'delete', p_reason: 'Duplicate QA record.' }), /changed/);
  const deletedContext = await context(d, 'platform');
  unwrap(await action(d, 'delete', 'platform', { p_reason: 'Duplicate QA record.', p_return_to_service: true, p_context_token: deletedContext.token }));
  check('platform deletion is permanent', await report(d), null);
  check('explicit deletion can return aircraft to service', (await meter()).operational_status, 'available');
  check('deleting source report preserves the safety report', Boolean(await report(related)), true);
  const surviving = unwrap(await admin.from('asr_reports').select('source_discrepancy_report_id,deleted_source_report_id').eq('report_id', related).single());
  check('related report keeps a deleted-reference marker', surviving, { source_discrepancy_report_id: null, deleted_source_report_id: d });
  const audit = unwrap(await admin.from('record_action_audit').select('actor_user_id,reason').eq('record_id', d).eq('action', 'deleted').single());
  check('independent deletion audit retains actor and reason', audit, { actor_user_id: users.platform.id, reason: 'Duplicate QA record.' });
  unwrap(await action(d, 'delete', 'platform', { p_reason: 'Duplicate QA record.' }));
  check('deletion retries do not duplicate audit', unwrap(await admin.from('record_action_audit').select('id').eq('record_id', d).eq('action', 'deleted')).length, 1);
  check('ordinary member cannot read independent audit', unwrap(await sessions.finder.from('record_action_audit').select('id').eq('record_id', d)).length, 0);

  const e = await submit('QA unchecked deletion keeps aircraft Grounded.', true);
  const grounded = await meter();
  unwrap(await action(e, 'delete', 'platform', { p_reason: 'QA duplicate record.' }));
  check('unchecked deletion preserves the entire aircraft record', await meter(), grounded);
  unwrap(await sessions.owner.rpc('set_organization_report_reviewer_capability', { p_organization_id: school, p_user_id: users.finder.id, p_capability: 'safety_reviewer', p_enabled: true }));
  unwrap(await sessions.owner.rpc('set_organization_report_reviewer_capability', { p_organization_id: school, p_user_id: users.owner.id, p_capability: 'safety_reviewer', p_enabled: true }));
  const safetyReview = { safetyComments: 'Synthetic issue reviewed.', hazardLogReference: '', internalInvestigationReference: '', title: 'Safety reviewer', externalNotifications: [] };
  check('safety reviewer without fleet permission cannot return to service', (await context(related, 'finder')).can_return_to_service, false);
  await fail('backend enforces fleet permission on safety close', action(related, 'close', 'finder', { p_return_to_service: true, p_context_token: (await context(related, 'finder')).token, p_safety_review: safetyReview }), /Fleet management/);
  check('failed fleet-permission check leaves safety report open', (await report(related)).status, 'in_review');
  unwrap(await action(related, 'close', 'owner', { p_return_to_service: true, p_context_token: (await context(related)).token, p_safety_review: safetyReview }));
  check('safety close can atomically return aircraft to service', [(await report(related)).status, (await meter()).operational_status], ['closed', 'available']);

  const otherDraft = randomUUID();
  unwrap(await admin.from('organization_reports').insert({ id: otherDraft, organization_id: otherSchool, report_type: 'asr', status: 'draft', submitted_by: users.outsider.id, submitted_by_name: 'Report QA Outsider', client_request_id: randomUUID() }));
  unwrap(await admin.from('asr_reports').insert({ report_id: otherDraft, report_data: { no_aircraft: true }, description: 'QA other organization draft.' }));
  check('platform can read an unrelated organization draft', unwrap(await sessions.platform.from('organization_reports').select('id').eq('id', otherDraft)).length, 1);
  check('ordinary member cannot read unrelated organization draft', unwrap(await sessions.finder.from('organization_reports').select('id').eq('id', otherDraft)).length, 0);
  check('platform organization selector includes unrelated school', unwrap(await sessions.platform.rpc('list_report_organizations')).some(row => row.id === otherSchool), true);
  check('member organization selector excludes unrelated school', unwrap(await sessions.finder.rpc('list_report_organizations')).some(row => row.id === otherSchool), false);
  check('platform roster can load unrelated report organization', unwrap(await sessions.platform.rpc('list_organization_report_people', { p_organization_id: otherSchool })).length > 0, true);
  await fail('member cannot use platform roster access', sessions.finder.rpc('list_organization_report_people', { p_organization_id: otherSchool }), /membership/);
  unwrap(await action(otherDraft, 'delete', 'platform', { p_reason: 'Synthetic draft deletion.' }));
  check('platform can delete a draft in another organization', await report(otherDraft), null);
  }

  const bucket = await admin.storage.getBucket('endorsement-records');
  if (bucket.error && /not found/i.test(bucket.error.message)) unwrap(await admin.storage.createBucket('endorsement-records', { public: false, fileSizeLimit: 5 * 1024 * 1024, allowedMimeTypes: ['application/pdf'] }));
  else unwrap(bucket);
  const pdf = await PDFDocument.create(); pdf.addPage().drawText('Synthetic endorsement for record grouping QA only.');
  const bytes = await pdf.save();
  for (const [index, id] of endorsementIds.entries()) {
    const storagePath = `${users.owner.id}/record-actions-qa-${id}.pdf`; paths.push(storagePath);
    unwrap(await admin.storage.from('endorsement-records').upload(storagePath, bytes, { contentType: 'application/pdf' }));
    unwrap(await admin.from('endorsement_records').insert({ id, user_id: users.owner.id, student_user_id: index < 2 ? users.finder.id : users.outsider.id, student_name: 'Report QA Finder', student_cert_number: index < 2 ? 'QA-100' : 'QA-200', instructor_name: 'Report QA Owner', endorsement_date: '10/12/2026', template_titles: [`QA endorsement ${index + 1}`], storage_path: storagePath, organization_id: school, scope_status: 'confirmed' }));
    execFileSync('docker', ['exec', 'supabase_db_pilotseal', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', `insert into private.endorsement_record_organization_access(record_id,organization_id,access_source) values ('${id}','${school}','automatic_creation') on conflict do nothing;`], { stdio: 'ignore' });
  }
  const personalBefore = unwrap(await sessions.owner.from('endorsement_records').select('id').in('id', endorsementIds));
  unwrap(await sessions.owner.rpc('set_organization_endorsement_hidden', { p_organization_id: school, p_record_id: endorsementIds[0], p_hidden: true }));
  check('organization hides a record without deleting it', unwrap(await sessions.owner.from('organization_endorsement_visibility').select('record_id').eq('organization_id', school)).length, 1);
  check('issuer personal records stay available when organization hides', unwrap(await sessions.owner.from('endorsement_records').select('id').in('id', endorsementIds)).length, personalBefore.length);
  check('student retains access to a hidden endorsement', unwrap(await sessions.finder.from('endorsement_records').select('id').eq('id', endorsementIds[0])).length, 1);
  await fail('member cannot hide endorsements', sessions.finder.rpc('set_organization_endorsement_hidden', { p_organization_id: school, p_record_id: endorsementIds[0], p_hidden: true }), /permission/);
  await fail('another organization cannot hide a record without access', sessions.outsider.rpc('set_organization_endorsement_hidden', { p_organization_id: otherSchool, p_record_id: endorsementIds[0], p_hidden: true }), /not found/);
  unwrap(await sessions.admin.rpc('set_organization_endorsement_hidden', { p_organization_id: school, p_record_id: endorsementIds[0], p_hidden: false }));
  check('organization admin can unhide', unwrap(await sessions.owner.from('organization_endorsement_visibility').select('record_id').eq('organization_id', school)).length, 0);
  check('organization list can still retrieve records after unhide', unwrap(await sessions.owner.rpc('list_organization_endorsement_records', { p_organization_id: school })).filter(row => endorsementIds.includes(row.id)).length, 3);
  if (process.argv.includes('--keep-fixtures')) {
    await submit('UI group: intermittent radio reception during taxi.', true);
    await submit('UI group: engine vibration requires review.', true);
    for (const [organizationId, owner, plane] of [[school, 'owner', aircraft], [school, 'owner', null], [otherSchool, 'outsider', null]]) {
      const id = randomUUID();
      unwrap(await admin.from('organization_reports').insert({ id, organization_id: organizationId, report_type: 'asr', status: 'in_review', submitted_by: users[owner].id, submitted_by_name: `Report QA ${owner}`, client_request_id: randomUUID() }));
      unwrap(await admin.from('asr_reports').insert({ report_id: id, aircraft_id: plane, aircraft_tail_number: plane ? 'NQA01' : null, risk_score: 10, description: plane ? 'UI safety group: runway incursion report.' : 'UI safety group: ground training occurrence.', report_data: { no_aircraft: !plane, aircraft_id: plane ?? '', aircraft_registration: plane ? 'NQA01' : '', description: 'Independent synthetic safety report.' } }));
    }
  }
  console.log(`${process.argv.includes('--resume-endorsements') ? 'Endorsement-only continuation' : 'Record actions API'}: ${checks} checks passed.`);
} finally {
  if (!process.argv.includes('--keep-fixtures')) await cleanup();
}
