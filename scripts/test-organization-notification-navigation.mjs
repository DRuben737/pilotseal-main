import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(fs.readFileSync('lib/dashboard-navigation.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const compiledModule = { exports: {} };
vm.runInThisContext(`(function(module,exports){${code}\n})`)(compiledModule, compiledModule.exports);
const { getDashboardLinksForWorkspace, getOrganizationDashboardHref, getDashboardWorkspace } = compiledModule.exports;
const href = '/console/organization/notifications';
const links = permissions => getDashboardLinksForWorkspace({ workspace: 'organization', enabledFeatureIds: [], organizationPermissions: permissions });

test('organization notifications have a direct organization workspace entry', () => {
  const entry = links(['notifications']).find(item => item.href === href);
  assert.equal(entry.label, 'Notifications');
  assert.equal(entry.organizationPermission, 'notifications');
  assert.equal(getDashboardWorkspace(href), 'organization');
  assert.equal(entry.children, undefined);
});
test('users without notification permission do not see the publishing entry', () => {
  for (const permissions of [[], ['members'], ['fleet', 'endorsements']]) assert(!links(permissions).some(item => item.href === href));
});
test('notification-only delegated access lands on the notification page', () => {
  assert.equal(getOrganizationDashboardHref(['notifications']), href);
});
test('platform notice publishing remains separate', () => {
  assert(!links(['members', 'fleet', 'endorsements', 'notifications']).some(item => item.href.startsWith('/console/platform')));
  const platform = getDashboardLinksForWorkspace({ workspace: 'platform', enabledFeatureIds: [] });
  assert(platform.some(item => item.href === '/console/platform/notices'));
  assert(!platform.some(item => item.href === href));
});
