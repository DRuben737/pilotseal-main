import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';

execFileSync('node', ['scripts/assert-local-targets.mjs'], { stdio: 'inherit' });
const raw = execFileSync('./node_modules/.bin/supabase', ['status', '--network-id', 'pilotseal-local', '--output', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const env = Object.fromEntries(raw.split(/\r?\n/).flatMap(line => { const match = line.match(/^([A-Z0-9_]+)=["']?(.*?)["']?$/); return match ? [[match[1], match[2]]] : []; }));
assert(['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(env.API_URL).hostname));
const authOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(env.API_URL, env.SERVICE_ROLE_KEY ?? env.SECRET_KEY, authOptions);
const client = () => createClient(env.API_URL, env.ANON_KEY ?? env.PUBLISHABLE_KEY, authOptions);
const unwrap = ({ data, error }) => { if (error) throw Error(error.message); return data; };
const school = '61000000-0000-4000-8000-000000000001';
const otherSchool = '61000000-0000-4000-8000-000000000002';
const tagged = unwrap(await service.auth.admin.listUsers({ perPage: 1000 })).users;
const users = {}; const sessions = {};
for (const role of ['owner', 'admin', 'finder', 'outsider']) {
  const user = tagged.find(value => value.email === `report-qa.${role}@example.test`);
  assert.equal(user?.app_metadata.fixture, 'aircraft-reports-qa'); users[role] = user;
  sessions[role] = client(); unwrap(await sessions[role].auth.signInWithPassword({ email: user.email, password: 'LocalReports!2026' }));
}
if (process.argv.includes('--add-ui-second-org')) {
  unwrap(await service.from('organization_members').insert({ organization_id: otherSchool, user_id: users.admin.id, role: 'member' }));
  console.log('Added only the synthetic admin as a standard member of the second QA organization.'); process.exit(0);
}
let actor = sessions.owner;
const compiledModule = { exports: {} };
const code = ts.transpileModule(fs.readFileSync('lib/notifications.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInThisContext(`(function(require,module,exports){${code}\n})`)(name => { assert.equal(name, '@/lib/supabase'); return { getSupabaseClient: () => actor }; }, compiledModule, compiledModule.exports);
const { createOrganizationNotification, fetchOrganizationNotificationRecipientCount, createNotification } = compiledModule.exports;
let checks = 0;
const check = (label, actual, expected) => { assert.deepEqual(actual, expected, label); checks++; console.log(`PASS ${label}`); };
const denied = async (label, action, pattern = /permission|row-level security/i) => {
  await assert.rejects(action, error => { assert.match(error.message, pattern); return true; }); checks++; console.log(`PASS ${label}`);
};
const message = { organizationId: school, title: `Synthetic organization notice ${randomUUID()}`, message: 'Independent local-only notification verification.', priority: 'normal' };
const roleSetting = unwrap(await service.from('organization_role_permissions').select('permissions').eq('organization_id', school).eq('role', 'organization_admin').single());
try {
  check('owner can inspect organization recipients', await fetchOrganizationNotificationRecipientCount(school), 4);
  actor = sessions.admin;
  check('organization admin can inspect own recipients by default', await fetchOrganizationNotificationRecipientCount(school), 4);
  check('organization admin can publish to its organization', await createOrganizationNotification(message), 4);
  const rows = unwrap(await service.from('notifications').select('kind,organization_id,recipient_user_id,action_url').eq('title', message.title));
  check('notification copies go only to current organization members', [rows.length, rows.every(row => row.kind === 'organization' && row.organization_id === school && row.recipient_user_id !== users.outsider.id && row.action_url === '/console/personal/notifications')], [4, true]);
  await denied('organization admin cannot publish to another organization', () => createOrganizationNotification({ ...message, organizationId: otherSchool }));
  await denied('organization admin cannot inspect another organization audience', () => fetchOrganizationNotificationRecipientCount(otherSchool));
  await denied('organization admin cannot publish a platform notice', () => createNotification({ title: message.title, message: message.message, priority: 'normal', status: 'sent', createdBy: users.admin.id }));
  actor = sessions.finder;
  await denied('standard member cannot publish organization notices', () => createOrganizationNotification(message));
  check('recipient sees only its own copy', unwrap(await actor.from('notifications').select('id').eq('title', message.title)).length, 1);
  actor = sessions.outsider;
  check('other organization member cannot read this notice', unwrap(await actor.from('notifications').select('id').eq('title', message.title)).length, 0);
  actor = client();
  await denied('anonymous cannot publish organization notices', () => createOrganizationNotification(message));
  actor = sessions.owner;
  await denied('empty notice title is rejected', () => createOrganizationNotification({ ...message, title: ' ' }), /Title and message/);
  unwrap(await service.from('organization_role_permissions').update({ permissions: roleSetting.permissions.filter(permission => permission !== 'notifications') }).eq('organization_id', school).eq('role', 'organization_admin'));
  actor = sessions.admin;
  await denied('explicitly revoked publishing permission is still enforced', () => createOrganizationNotification(message));
} finally {
  unwrap(await service.from('organization_role_permissions').update({ permissions: roleSetting.permissions }).eq('organization_id', school).eq('role', 'organization_admin'));
  // Exact unique title and synthetic sender: never remove another workflow's notice.
  unwrap(await service.from('notifications').delete().eq('title', message.title).eq('created_by', users.admin.id));
}
console.log(`Organization notifications: ${checks} local checks passed.`);
