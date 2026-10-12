import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const cache = new Map();
function load(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const compiledModule = { exports: {} }; cache.set(filename, compiledModule);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const require = name => {
    if (name === '@/lib/record-groups') return load(path.resolve('lib/record-groups.ts'));
    if (name.startsWith('.')) return load(path.resolve(path.dirname(filename), `${name}.ts`));
    // UI/service dependencies are not exercised; the exported grouping functions are actual source.
    return {};
  };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(require, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
const { groupAircraftReports, endorsementPersonIdentity, recordSortDate } = load(path.resolve('lib/record-groups.ts'));
const { buildStudentRecordGroups } = load(path.resolve('components/dashboard/EndorsementRecordsManager.tsx'));
const report = (id, aircraft = 'a', org = 'school') => ({ id, aircraft_id: aircraft, organization_id: org, aircraft_tail_number: aircraft ? 'N123' : null, created_at: `2026-10-${id.padStart(2, '0')}T12:00:00Z`, status: 'submitted' });
const record = (id, user = 'student', name = 'Alex') => ({ id, student_id: null, student_user_id: user, student_name: name, student_cert_number: null, created_at: '2026-10-12T12:00:00Z', organization_id: 'school' });
test('one aircraft row contains newest records first and an accurate open count', () => {
  const groups = groupAircraftReports([report('1'), { ...report('2'), status: 'closed' }]);
  assert.equal(groups.length, 1); assert.deepEqual(groups[0].records.map(x => x.id), ['2', '1']); assert.equal(groups[0].openCount, 1);
});
test('same tail number does not merge separate aircraft or organizations', () => {
  assert.equal(groupAircraftReports([report('1', 'a'), report('2', 'b'), report('3', 'a', 'other')]).length, 3);
});
test('no-aircraft and external-aircraft records remain usable groups', () => {
  const groups = groupAircraftReports([report('1', null), report('2', null), { ...report('3', null), aircraft_tail_number: 'EXTERNAL' }]);
  assert.equal(groups.length, 2); assert.equal(groups.find(x => x.label === 'No aircraft').records.length, 2);
});
test('unknown aircraft identities are not merged just because tail snapshots match', () => {
  assert.equal(groupAircraftReports([{ ...report('1', null), aircraft_tail_number: 'N123' }, { ...report('2', null), aircraft_tail_number: 'N123' }]).length, 2);
  assert.equal(groupAircraftReports([report('1'), { ...report('2'), aircraft_tail_number: 'NEWTAIL' }]).length, 1);
});
test('US and ISO record dates sort chronologically without changing stored values', () => {
  assert.equal(recordSortDate('12/31/2025', '2026-10-12T12:00:00Z'), '2025-12-31');
  assert.equal(recordSortDate('2026-01-01', '2026-10-12T12:00:00Z'), '2026-01-01');
  assert(recordSortDate('2026-01-01', '') > recordSortDate('12/31/2025', ''));
  assert.equal(recordSortDate('invalid', '2026-10-12T12:00:00Z'), '2026-10-12');
});
test('same linked person groups records across issuing instructors', () => {
  const groups = buildStudentRecordGroups([], [record('1'), { ...record('2'), user_id: 'other-instructor' }], []);
  assert.equal(groups.length, 1); assert.equal(groups[0].endorsements.length, 2);
});
test('same names are not identity evidence, including legacy records without IDs', () => {
  assert.equal(buildStudentRecordGroups([], [record('1', 'one'), record('2', 'two'), record('3', null), record('4', null)], []).length, 4);
  assert.notEqual(endorsementPersonIdentity(record('3', null)), endorsementPersonIdentity(record('4', null)));
});
test('organization grouping does not merge across organizations', () => {
  assert.equal(buildStudentRecordGroups([], [record('1'), { ...record('2'), organization_id: 'other' }], [], true).length, 2);
});
test('one person combines notes/files from multiple visible folders', () => {
  const folder = id => ({ id, student_user_id: 'student', student_id: null, student_name: 'Alex', student_cert_number: null, updated_at: '2026-10-12T12:00:00Z' });
  const groups = buildStudentRecordGroups([folder('f1'), folder('f2')], [record('1')], [{ id: 'item1', folder_id: 'f1', updated_at: '2026-10-12T12:00:00Z' }, { id: 'item2', folder_id: 'f2', updated_at: '2026-10-12T12:00:00Z' }]);
  assert.equal(groups.length, 1); assert.equal(groups[0].items.length, 2); assert.equal(groups[0].endorsements.length, 1);
});
test('organization access scope is used without rewriting the record organization', () => {
  const input = [record('1'), { ...record('2'), organization_id: null }];
  assert.equal(buildStudentRecordGroups([], input, [], true, new Map([['1', 'scope'], ['2', 'scope']])).length, 1);
  assert.equal(input[1].organization_id, null);
});
