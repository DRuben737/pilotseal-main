import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';

execFileSync('node', ['scripts/assert-local-targets.mjs'], { stdio: 'inherit' });
const raw = execFileSync('./node_modules/.bin/supabase', ['status', '--network-id', 'pilotseal-local', '--output', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const env = Object.fromEntries(raw.split(/\r?\n/).flatMap(line => { const match = line.match(/^([A-Z0-9_]+)=["']?(.*?)["']?$/); return match ? [[match[1], match[2]]] : []; }));
assert(['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(env.API_URL).hostname));
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY ?? env.SECRET_KEY, options);
const client = () => createClient(env.API_URL, env.ANON_KEY ?? env.PUBLISHABLE_KEY, options);
const unwrap = ({ data, error }) => { if (error) throw Error(error.message); return data; };
const school = '61000000-0000-4000-8000-000000000001';
const tagged = unwrap(await admin.auth.admin.listUsers({ perPage: 1000 })).users;
const users = {}; const sessions = {};
for (const role of ['owner', 'finder', 'outsider']) {
  const user = tagged.find(value => value.email === `report-qa.${role}@example.test`);
  assert.equal(user?.app_metadata.fixture, 'aircraft-reports-qa'); users[role] = user;
  sessions[role] = client(); unwrap(await sessions[role].auth.signInWithPassword({ email: user.email, password: 'LocalReports!2026' }));
}
let actor = sessions.owner;
const modules = new Map();
function loadTypeScript(filename) {
  if (modules.has(filename)) return modules.get(filename).exports;
  const compiledModule = { exports: {} }; modules.set(filename, compiledModule);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const require = name => {
    if (name === '@/lib/supabase') return { getSupabaseClient: () => actor };
    assert(name.startsWith('.'), 'only actual relative helper modules are loaded');
    return loadTypeScript(path.resolve(path.dirname(filename), `${name}.ts`));
  };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(require, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
const { fetchAsrReviewerAssignments, setAsrReviewerCapability, createEmptyAsrReportData } = loadTypeScript(path.resolve('lib/asr-reports.ts'));
const original = await fetchAsrReviewerAssignments(school, users.finder.id);
const capabilities = ['safety_reviewer', 'training_reviewer', 'maintenance_reviewer'];
let checks = 0;
const check = (label, actual, expected) => { assert.deepEqual(actual, expected, label); checks++; console.log(`PASS ${label}`); };
const denied = async (label, action) => {
  await assert.rejects(action, value => { assert.match(value.message, /owners and administrators|organization member|permission denied/i); return true; });
  checks++; console.log(`PASS ${label}`);
};
try {
  if (!process.argv.includes('--verify-denials')) {
  for (const capability of capabilities) await setAsrReviewerCapability({ organizationId: school, userId: users.finder.id, capability, enabled: false });
  await setAsrReviewerCapability({ organizationId: school, userId: users.finder.id, capability: 'training_reviewer', enabled: true });
  check('actual member query returns only the selected member', (await fetchAsrReviewerAssignments(school, users.finder.id)).map(row => [row.user_id, row.capability]), [[users.finder.id, 'training_reviewer']]);
  await setAsrReviewerCapability({ organizationId: school, userId: users.finder.id, capability: 'safety_reviewer', enabled: true });
  check('adding safety review preserves training review', (await fetchAsrReviewerAssignments(school, users.finder.id)).map(row => row.capability).sort(), ['safety_reviewer', 'training_reviewer']);
  await setAsrReviewerCapability({ organizationId: school, userId: users.finder.id, capability: 'safety_reviewer', enabled: false });
  check('removing safety review does not remove unrelated access', (await fetchAsrReviewerAssignments(school, users.finder.id)).map(row => row.capability), ['training_reviewer']);
  }
  actor = sessions.finder;
  await denied('standard member cannot grant reviewer access', () => setAsrReviewerCapability({ organizationId: school, userId: users.finder.id, capability: 'safety_reviewer', enabled: true }));
  actor = sessions.outsider;
  await denied('other organization member cannot grant access', () => setAsrReviewerCapability({ organizationId: school, userId: users.finder.id, capability: 'safety_reviewer', enabled: true }));
  actor = client();
  await denied('anonymous cannot grant access', () => setAsrReviewerCapability({ organizationId: school, userId: users.finder.id, capability: 'safety_reviewer', enabled: true }));
  actor = sessions.owner;
  await denied('reviewer must belong to this organization', () => setAsrReviewerCapability({ organizationId: school, userId: users.outsider.id, capability: 'safety_reviewer', enabled: true }));
  const previousTimezone = process.env.TZ; process.env.TZ = 'America/New_York';
  try {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    check('actual new ASR data uses the local calendar date', createEmptyAsrReportData().occurrence_date, today);
  } finally { if (previousTimezone === undefined) delete process.env.TZ; else process.env.TZ = previousTimezone; }
} finally {
  actor = sessions.owner;
  for (const capability of capabilities) await setAsrReviewerCapability({ organizationId: school, userId: users.finder.id, capability, enabled: original.some(row => row.capability === capability) });
}
console.log(`Safety review access: ${checks} local checks passed.`);
