import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = ts.transpileModule(fs.readFileSync('lib/notification-presentation.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
vm.runInThisContext(`(function(module,exports){${source}\n})`)(mod, mod.exports);
const { safeNotificationAction, buildNotificationPushGroups, notificationIsActive } = mod.exports;
const now = Date.parse('2026-10-14T12:00:00Z');
const modes = { system: 'instant', organization: 'instant', schedule: 'instant', reminder: 'inbox' };
const n = (id, extra = {}) => ({ id, title: id, message: 'Message', kind: 'organization', organization_id: 'school-a', source_label: 'School A', priority: 'normal', status: 'sent', created_at: '2026-10-14T10:00:00Z', scheduled_at: null, expires_at: null, withdrawn_at: null, event_key: null, read_at: null, ...extra });
test('groups historical messages by source without merging organizations', () => {
  const groups = buildNotificationPushGroups([n('1'), n('2'), n('3', { organization_id: 'school-b' }), n('4', { kind: 'system', organization_id: null })], [], modes, now);
  assert.deepEqual(groups.map(g => g.notifications.length), [2, 1, 1]);
});
test('read, shown, dismissed, expired, future and withdrawn messages do not push', () => {
  const inbox = [n('read', { read_at: 'today' }), n('shown'), n('dismissed'), n('expired', { expires_at: '2026-10-13' }), n('future', { scheduled_at: '2026-10-15' }), n('withdrawn', { withdrawn_at: 'today' }), n('draft', { status: 'draft' })];
  const states = [{ notification_id: 'shown', displayed_at: 'today' }, { notification_id: 'dismissed', dismissed_at: 'today' }];
  assert.deepEqual(buildNotificationPushGroups(inbox, states, modes, now), []);
});
test('inbox-only/off sources stay quiet and incomplete reservations remain recoverable', () => {
  assert.deepEqual(buildNotificationPushGroups([n('1')], [], { ...modes, organization: 'off' }, now), []);
  assert.deepEqual(buildNotificationPushGroups([n('1')], [], { ...modes, organization: 'inbox' }, now), []);
  assert.equal(buildNotificationPushGroups([n('1')], [{ notification_id: '1', displayed_at: null }], modes, now).length, 1);
});
test('same event is collapsed within its source; critical events sort first', () => {
  const inbox = [n('old', { event_key: 'lesson', created_at: '2026-10-12' }), n('new', { event_key: 'lesson' }), n('urgent', { kind: 'system', priority: 'critical', organization_id: null })];
  const groups = buildNotificationPushGroups(inbox, [], modes, now);
  assert.equal(groups[0].notifications[0].id, 'urgent');
  assert.deepEqual(groups[1].notifications.map(x => x.id), ['new']);
});
test('action links reject external, protocol-relative, encoded and malformed targets', () => {
  for (const input of ['https://example.com', '//example.com', '/\\example.com', '/%2fexample.com', '/%5cexample.com', '/%0afoo', '/%', '/a b', 'javascript:alert(1)']) assert.equal(safeNotificationAction(input), null, input);
  assert.equal(safeNotificationAction('/console/personal/notifications?view=unread'), '/console/personal/notifications?view=unread');
});
test('expiry and scheduled boundaries are deterministic', () => {
  assert.equal(notificationIsActive(n('1', { expires_at: new Date(now).toISOString() }), now), false);
  assert.equal(notificationIsActive(n('1', { scheduled_at: new Date(now).toISOString() }), now), true);
});

test('an older event never resurfaces after the latest version was shown or read', () => {
  const old = n('old', { event_key: 'lesson', created_at: '2026-10-12' });
  const latest = n('new', { event_key: 'lesson' });
  assert.deepEqual(buildNotificationPushGroups([old, latest], [{ notification_id: 'new', displayed_at: 'today' }], modes, now), []);
  assert.deepEqual(buildNotificationPushGroups([old, { ...latest, read_at: 'today' }], [], modes, now), []);
});

test('legacy UTC timestamps retain their instant in every browser timezone', () => {
  const { notificationUtcTimestamp } = mod.exports;
  assert.equal(notificationUtcTimestamp('2026-10-15T00:29:32.454217'), '2026-10-15T00:29:32.454217Z');
  assert.equal(notificationUtcTimestamp('2026-10-15T00:29:32Z'), '2026-10-15T00:29:32Z');
  assert.equal(notificationUtcTimestamp('2026-10-15T00:29:32-04:00'), '2026-10-15T00:29:32-04:00');
  assert.equal(notificationUtcTimestamp(null), null);
});
