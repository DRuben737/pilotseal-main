import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// Independent, synthetic records. No existing school/user data is used as fixtures.
execFileSync('node', ['scripts/assert-local-targets.mjs'], { stdio: 'inherit' });
const raw = execFileSync('./node_modules/.bin/supabase', ['status', '--network-id', 'pilotseal-local', '--output', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const env = Object.fromEntries(raw.split(/\r?\n/).flatMap(line => {
  const match = line.match(/^([A-Z0-9_]+)=["']?(.*?)["']?$/);
  return match ? [[match[1], match[2]]] : [];
}));
assert(['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(env.API_URL).hostname));
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY ?? env.SECRET_KEY, options);
const client = () => createClient(env.API_URL, env.ANON_KEY ?? env.PUBLISHABLE_KEY, options);
const unwrap = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const school = '61000000-0000-4000-8000-000000000001';
const otherSchool = '61000000-0000-4000-8000-000000000002';
const model = '62000000-0000-4000-8000-000000000001';
const aircraft = '63000000-0000-4000-8000-000000000001';
const marker = 'aircraft-reports-qa';
const credentials = [
  ['owner', 'Report QA Owner', 'user'],
  ['finder', 'Report QA Finder', 'user'],
  ['admin', 'Report QA Admin', 'user'],
  ['platform', 'Report QA Platform', 'admin'],
  ['outsider', 'Report QA Outsider', 'user'],
];
const users = {};
const sessions = {};
let checks = 0;
const check = (label, actual, expected) => { assert.deepEqual(actual, expected, label); checks++; console.log(`PASS ${label}`); };
const fail = async (label, operation, pattern) => {
  const result = await operation;
  assert(result.error, `${label}: must fail`);
  assert.match(result.error.message, pattern, label);
  checks++; console.log(`PASS ${label}`);
};

async function cleanup() {
  const existing = unwrap(await admin.auth.admin.listUsers({ perPage: 1000 })).users.filter(user =>
    credentials.some(([role]) => user.email === `report-qa.${role}@example.test`));
  for (const user of existing) assert.equal(user.app_metadata.fixture, marker, 'cleanup only owns tagged QA users');
  for (const orgId of [school, otherSchool]) {
    const org = unwrap(await admin.from('organizations').select('name').eq('id', orgId).maybeSingle());
    if (org) assert.match(org.name, /^Report QA /, 'cleanup only owns QA schools');
    unwrap(await admin.from('organization_reports').delete().eq('organization_id', orgId));
  }
  unwrap(await admin.from('aircraft').delete().eq('id', aircraft));
  unwrap(await admin.from('aircraft_models').delete().eq('id', model));
  // Membership-removal notifications need the parent organization to exist.
  unwrap(await admin.from('organization_members').delete().in('organization_id', [school, otherSchool]));
  unwrap(await admin.from('organizations').delete().in('id', [school, otherSchool]));
  for (const user of existing) {
    // Test notifications can hold actor references until the recipient is removed.
    unwrap(await admin.from('notifications').delete().eq('recipient_user_id', user.id));
  }
  for (const user of existing) unwrap(await admin.auth.admin.deleteUser(user.id));
  console.log('Removed this test\'s synthetic schools, aircraft, reports and accounts.');
}

if (process.argv.includes('--cleanup')) { await cleanup(); process.exit(0); }
if (process.argv.includes('--touch-ui-report')) {
  const target = unwrap(await admin.from('organization_reports').select('id,aircraft_discrepancy_reports!inner(description)').eq('organization_id', school).eq('aircraft_discrepancy_reports.description', 'UI fixture: radio reception failed during taxi.').single());
  unwrap(await admin.from('organization_reports').update({ updated_at: new Date().toISOString() }).eq('id', target.id).eq('organization_id', school));
  console.log('Updated only the synthetic UI report version to test stale-close handling.');
  process.exit(0);
}
const pendingFinder = '64000000-0000-4000-8000-000000000001';
if (process.argv.includes('--add-ui-finder')) {
  unwrap(await admin.from('organization_people').insert({ id: pendingFinder, organization_id: school, email: 'report-qa.temporary@example.test', organization_display_name: 'Report QA Temporary Finder', status: 'pending', notes: marker }));
  console.log('Added a synthetic pending finder for submission-failure testing.');
  process.exit(0);
}
if (process.argv.includes('--remove-ui-finder')) {
  unwrap(await admin.from('organization_people').delete().eq('id', pendingFinder).eq('organization_id', school).eq('notes', marker));
  console.log('Removed only the synthetic temporary finder.');
  process.exit(0);
}
if (process.argv.includes('--add-legacy-report')) {
  const owner = unwrap(await admin.auth.admin.listUsers({ perPage: 1000 })).users.find(user => user.email === 'report-qa.owner@example.test');
  assert.equal(owner?.app_metadata.fixture, marker);
  const id = randomUUID();
  unwrap(await admin.from('organization_reports').insert({ id, organization_id: school, report_type: 'aircraft_discrepancy', status: 'submitted', submitted_by: owner.id, submitted_by_name: 'Report QA Owner', client_request_id: randomUUID() }));
  unwrap(await admin.from('aircraft_discrepancy_reports').insert({ report_id: id, aircraft_id: aircraft, aircraft_tail_number: 'NQA01', report_date: '2026-10-01', discrepancy_type: 'Fuel', description: 'Legacy UI fixture: original finder unknown.' }));
  console.log('Added a synthetic legacy report with unknown finder.');
  process.exit(0);
}
if (process.argv.includes('--add-preview-report')) {
  const owner = unwrap(await admin.auth.admin.listUsers({ perPage: 1000 })).users.find(user => user.email === 'report-qa.owner@example.test');
  assert.equal(owner?.app_metadata.fixture, marker);
  const finder = unwrap(await admin.from('organization_people').select('id').eq('organization_id', school).eq('organization_display_name', 'Report QA Finder').single());
  const signedClient = client();
  unwrap(await signedClient.auth.signInWithPassword({ email: owner.email, password: 'LocalReports!2026' }));
  unwrap(await signedClient.rpc('submit_aircraft_report', {
    p_organization_id: school, p_client_request_id: randomUUID(), p_aircraft_id: aircraft,
    p_report_date: '2026-10-12', p_report_timezone: 'America/New_York', p_found_by_person_id: finder.id,
    p_student_person_id: finder.id, p_instructor_person_id: null,
    p_flight_hobbs_end: 1201.7, p_maintenance_hobbs_end: null, p_flight_duration: 1.2,
    p_discrepancy_type: 'Radio', p_description: 'Radio reception is intermittent during taxi.', p_ground_aircraft: false,
  }));
  console.log('Added a synthetic report for final screenshots.');
  process.exit(0);
}
const existing = unwrap(await admin.auth.admin.listUsers({ perPage: 1000 })).users;
assert(!existing.some(user => credentials.some(([role]) => user.email === `report-qa.${role}@example.test`)), 'QA fixtures already exist; use --cleanup before a fresh run');
try {
  for (const [role, name, profileRole] of credentials) {
    const user = unwrap(await admin.auth.admin.createUser({
      email: `report-qa.${role}@example.test`, password: 'LocalReports!2026', email_confirm: true,
      app_metadata: { fixture: marker }, user_metadata: { display_name: name, account_type: 'personal' },
    })).user;
    users[role] = user;
    unwrap(await admin.from('profiles').upsert({ id: user.id, email: user.email, display_name: name, role: profileRole }));
    sessions[role] = client();
    unwrap(await sessions[role].auth.signInWithPassword({ email: user.email, password: 'LocalReports!2026' }));
  }
  unwrap(await admin.from('organizations').insert([
    { id: school, name: 'Report QA School', created_by: users.owner.id },
    { id: otherSchool, name: 'Report QA Other School', created_by: users.outsider.id },
  ]));
  unwrap(await admin.from('organization_members').insert([
    { organization_id: school, user_id: users.owner.id, role: 'owner', teaching_role: 'instructor' },
    { organization_id: school, user_id: users.finder.id, role: 'member', teaching_role: 'student' },
    { organization_id: school, user_id: users.admin.id, role: 'organization_admin' },
    { organization_id: school, user_id: users.platform.id, role: 'member' },
    { organization_id: otherSchool, user_id: users.outsider.id, role: 'owner' },
  ]));
  unwrap(await admin.from('aircraft_models').insert({ id: model, organization_id: school, name: 'QA Trainer', category: 'airplane', chart_type: 'standard', stations: [], envelope: [] }));
  unwrap(await admin.from('aircraft').insert({ id: aircraft, model_id: model, organization_id: school, visibility: 'organization', name: 'QA Trainer', tail_number: 'NQA01', empty_weight: 1400, empty_arm: 39, created_by: users.owner.id }));
  unwrap(await admin.from('aircraft_organization_assignments').insert({ aircraft_id: aircraft, organization_id: school, assigned_by: users.owner.id }));
  unwrap(await admin.from('organization_aircraft_maintenance').insert({ aircraft_id: aircraft, operational_status: 'available', current_meter_type: 'tach', current_meter_value: 2468.5, meter_observed_at: '2026-10-01T12:00:00Z' }));
  const people = unwrap(await admin.from('organization_people').select('*').in('organization_id', [school, otherSchool]));
  const person = role => people.find(item => item.user_id === users[role].id).id;
  if (process.argv.includes('--setup-ui')) {
    console.log('Created independent synthetic UI fixtures without rerunning API tests.');
    process.exit(0);
  }
  const base = () => ({
    p_organization_id: school, p_client_request_id: randomUUID(), p_aircraft_id: aircraft,
    p_report_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()),
    p_report_timezone: 'America/New_York', p_found_by_person_id: person('finder'),
    p_student_person_id: person('finder'), p_instructor_person_id: person('owner'),
    p_flight_hobbs_end: 1200.5, p_maintenance_hobbs_end: 890.2, p_flight_duration: 1.2,
    p_discrepancy_type: 'Radio', p_description: 'Synthetic radio intermittently loses reception.', p_ground_aircraft: false,
  });
  const submit = (input = {}, actor = 'owner') => sessions[actor].rpc('submit_aircraft_report', { ...base(), ...input });
  const report = id => admin.from('organization_reports').select('*, aircraft_discrepancy_reports(*), organization_report_events(*)').eq('id', id).single().then(unwrap);
  for (const [key, message] of [['p_aircraft_id', /Select an aircraft/], ['p_found_by_person_id', /Select who found/], ['p_discrepancy_type', /Select an affected area/]]) {
    await fail(`API rejects missing ${key}`, submit({ [key]: null }), message);
  }
  await fail('API rejects another school\'s finder', submit({ p_found_by_person_id: person('outsider') }), /from this organization/);
  await fail('API rejects outsider submission', submit({}, 'outsider'), /membership/);
  await fail('API rejects unknown affected area', submit({ p_discrepancy_type: 'Unknown' }), /affected area/);
  await fail('API rejects negative duration', submit({ p_flight_duration: -0.1 }), /positive decimal/);
  await fail('API rejects negative Hobbs', submit({ p_flight_hobbs_end: -1 }), /positive decimal/);
  await fail('API rejects non-finite meter', submit({ p_flight_hobbs_end: 'Infinity' }), /positive decimal/);
  await fail('API rejects invalid date', submit({ p_report_date: '2026-02-30' }), /date/);
  await fail('API rejects future date', submit({ p_report_date: '2099-01-01' }), /future/);
  await fail('API rejects empty description', submit({ p_description: ' ' }), /description/);
  await fail('API rejects invalid timezone', submit({ p_report_timezone: 'Invalid/Timezone' }), /time zone/);
  const legacy = base(); delete legacy.p_found_by_person_id; delete legacy.p_report_timezone;
  await fail('Legacy API cannot bypass found-by requirement', sessions.owner.rpc('submit_aircraft_discrepancy_report', legacy), /permission denied/);
  await fail('Anonymous cannot submit', client().rpc('submit_aircraft_report', base()), /permission denied/);

  const input = base();
  const id = unwrap(await sessions.owner.rpc('submit_aircraft_report', input));
  const created = await report(id);
  check('Server records the submitting account', created.submitted_by, users.owner.id);
  check('Finder is stored separately', created.aircraft_discrepancy_reports.found_by_person_id, person('finder'));
  check('Finder display name is captured', created.aircraft_discrepancy_reports.found_by_name, 'Report QA Finder');
  for (const [field, value] of [['flight_hobbs_end', 1200.5], ['maintenance_hobbs_end', 890.2], ['flight_duration', 1.2], ['report_date', input.p_report_date], ['student_person_id', person('finder')], ['instructor_person_id', person('owner')]]) {
    check(`Round trip preserves ${field}`, created.aircraft_discrepancy_reports[field], value);
  }
  const repeated = unwrap(await sessions.owner.rpc('submit_aircraft_report', { ...input, p_description: 'Must not overwrite the original' }));
  check('Retry returns the same report', repeated, id);
  check('Retry preserves the original description', (await report(id)).aircraft_discrepancy_reports.description, input.p_description);
  const concurrentInput = base();
  const ids = await Promise.all([1, 2, 3].map(() => sessions.owner.rpc('submit_aircraft_report', concurrentInput).then(unwrap)));
  check('Concurrent submissions create one report', new Set(ids).size, 1);
  const emptyId = unwrap(await submit({ p_flight_hobbs_end: null, p_maintenance_hobbs_end: null, p_flight_duration: null, p_student_person_id: null, p_instructor_person_id: null }));
  for (const field of ['flight_hobbs_end', 'maintenance_hobbs_end', 'flight_duration', 'student_person_id', 'instructor_person_id']) check(`Optional ${field} stays null`, (await report(emptyId)).aircraft_discrepancy_reports[field], null);
  check('Report does not overwrite current aircraft meter', unwrap(await admin.from('organization_aircraft_maintenance').select('current_meter_type,current_meter_value').eq('aircraft_id', aircraft).single()), { current_meter_type: 'tach', current_meter_value: 2468.5 });

  const review = { status: 'in_review', instructorPersonId: person('owner'), asrSubmitted: false, deferrable: false, aircraftDown: true, creditApplied: true, creditAuthorized: true };
  const rpcReview = {
    p_report_id: id, p_status: review.status, p_instructor_person_id: review.instructorPersonId,
    p_asr_submitted: false, p_deferrable: false, p_aircraft_down: true, p_credit_applied: true, p_credit_authorized: true,
  };
  unwrap(await sessions.owner.rpc('process_aircraft_discrepancy_report', rpcReview));
  const before = await report(id);
  const credit = value => ['credit_authorized_by', 'credit_authorized_name', 'credit_authorized_at'].map(key => value.aircraft_discrepancy_reports[key]);
  unwrap(await sessions.admin.rpc('process_aircraft_discrepancy_report', rpcReview));
  check('Saving review preserves existing credit authorization', credit(await report(id)), credit(before));
  let current = await report(id);
  const close = (actor, target = id, version = current.updated_at, changes = null) => sessions[actor].rpc('close_aircraft_report', { p_report_id: target, p_expected_updated_at: version, p_review: changes });
  await fail('Member cannot close through API', close('finder'), /permission/);
  await fail('Outsider cannot close through API', close('outsider'), /permission/);
  await fail('Anonymous cannot close', client().rpc('close_aircraft_report', { p_report_id: id, p_expected_updated_at: current.updated_at }), /permission denied/);
  await fail('Old review endpoint cannot close reports', sessions.owner.rpc('process_aircraft_discrepancy_report', { ...rpcReview, p_status: 'closed' }), /Invalid report status/);
  await fail('Stale report version cannot close', close('owner', id, '2000-01-01T00:00:00Z'), /changed/);
  check('Failed close leaves report open', (await report(id)).status, 'in_review');
  await fail('Close cannot revoke existing authorization', close('owner', id, current.updated_at, { ...review, creditAuthorized: false }), /authorization/);
  check('Rejected save-and-close is atomic', (await report(id)).updated_at, current.updated_at);
  const mxBefore = unwrap(await admin.from('organization_aircraft_maintenance').select('*').eq('aircraft_id', aircraft).single());
  unwrap(await close('admin', id, current.updated_at, { ...review, deferrable: true }));
  const closed = await report(id);
  check('Admin can save explicitly chosen changes and close', closed.status, 'closed');
  check('Chosen review change was saved', closed.aircraft_discrepancy_reports.is_deferrable, true);
  check('Closing preserves original authorization', credit(closed), credit(before));
  assert(closed.closed_at); checks++; console.log('PASS Closing records server time');
  check('Closing writes one activity event', closed.organization_report_events.filter(event => event.event_type === 'closed').length, 1);
  check('Closing preserves the entire aircraft maintenance record', unwrap(await admin.from('organization_aircraft_maintenance').select('*').eq('aircraft_id', aircraft).single()), mxBefore);
  unwrap(await close('admin'));
  check('Close retries do not duplicate events', (await report(id)).organization_report_events.filter(event => event.event_type === 'closed').length, 1);
  check('Open query excludes the closed report', unwrap(await sessions.owner.from('organization_reports').select('id').eq('organization_id', school).neq('status', 'closed')).some(row => row.id === id), false);
  check('Closed query includes the closed report', unwrap(await sessions.owner.from('organization_reports').select('id').eq('organization_id', school).eq('status', 'closed')).some(row => row.id === id), true);
  await fail('Closed report cannot be edited', sessions.owner.rpc('process_aircraft_discrepancy_report', rpcReview), /immutable/);
  for (const actor of ['owner', 'platform']) {
    const target = unwrap(await submit({ p_ground_aircraft: true }));
    const initial = await report(target);
    const mx = unwrap(await admin.from('organization_aircraft_maintenance').select('*').eq('aircraft_id', aircraft).single());
    unwrap(await close(actor, target, initial.updated_at));
    check(`${actor} can close`, (await report(target)).status, 'closed');
    check(`${actor} closing does not return grounded aircraft to service`, unwrap(await admin.from('organization_aircraft_maintenance').select('*').eq('aircraft_id', aircraft).single()), mx);
  }
  // A separate member-owned report allows UI checks under a non-manager account.
  const memberId = unwrap(await submit({ p_description: 'Member UI fixture: loose cabin vent.' }, 'finder'));
  check('Member can read their own report', unwrap(await sessions.finder.from('organization_reports').select('id').eq('id', memberId).single()).id, memberId);
  console.log(`Aircraft report API: ${checks} checks passed.`);
  if (process.argv.includes('--keep-fixtures')) console.log('QA fixtures kept for browser verification. Logins: report-qa.owner@example.test / report-qa.finder@example.test.');
} finally {
  if (!process.argv.includes('--keep-fixtures')) await cleanup();
}
