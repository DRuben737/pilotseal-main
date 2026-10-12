import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual TS helpers, without mocking their validation logic.
const modules = new Map();
function loadTypeScript(filename) {
  if (modules.has(filename)) return modules.get(filename).exports;
  const compiledModule = { exports: {} };
  modules.set(filename, compiledModule);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const require = name => {
    assert(name.startsWith('.'), 'validation helpers have no service dependencies');
    return loadTypeScript(path.resolve(path.dirname(filename), `${name}.ts`));
  };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(require, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
const { emptyAircraftReportForm, localReportDate, optionalReportNumber, validateAircraftReportForm } = loadTypeScript(path.resolve('lib/aircraft-report-form.ts'));
const valid = () => ({ ...emptyAircraftReportForm(), aircraftId: 'aircraft', foundByPersonId: 'finder', discrepancyType: 'Radio', reportDate: '2026-10-12', description: 'Intermittent reception' });
const validate = form => validateAircraftReportForm(form, ['aircraft'], ['finder'], '2026-10-12');

test('required selections stay blank even with a single possible option', () => {
  const form = emptyAircraftReportForm();
  for (const key of ['aircraftId', 'foundByPersonId', 'discrepancyType', 'studentPersonId', 'instructorPersonId']) assert.equal(form[key], '');
  for (const key of ['aircraftId', 'foundByPersonId', 'discrepancyType']) {
    const errors = validate({ ...valid(), [key]: '' });
    assert.deepEqual(Object.keys(errors), [key]);
  }
});
test('invalid/stale selections cannot pass', () => {
  const errors = validate({ ...valid(), aircraftId: 'deleted', foundByPersonId: 'another-org', discrepancyType: 'Unknown' });
  assert.equal(Object.keys(errors).length, 3);
});
test('empty optional numbers remain null; cumulative readings differ from duration', () => {
  assert.equal(optionalReportNumber(''), null);
  assert.equal(optionalReportNumber(' '), null);
  assert.equal(optionalReportNumber('0'), 0);
  assert.equal(optionalReportNumber('1234.5'), 1234.5);
  assert.equal(optionalReportNumber('1.2'), 1.2);
});
test('negative and malformed numbers are rejected', () => {
  for (const value of ['-1', '0x10', '1e3', 'Infinity', 'NaN', '1.2.3']) assert.throws(() => optionalReportNumber(value));
  assert.equal(Object.keys(validate({ ...valid(), flightHobbsEnd: '-1', maintenanceHobbsEnd: '-1', flightDuration: '-1' })).length, 3);
});
test('invalid, partial and future dates are rejected', () => {
  for (const reportDate of ['', '10/', '2026-02-30', '2026-13-01', '2026-10-13']) assert(validate({ ...valid(), reportDate }).reportDate);
  assert.deepEqual(validate(valid()), {});
  assert.deepEqual(validate({ ...valid(), reportDate: '2024-02-29' }), {});
});
test('local today does not jump forward at the UTC boundary', () => {
  const original = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try { assert.equal(localReportDate(new Date('2026-10-13T00:30:00Z')), '2026-10-12'); }
  finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
});
test('descriptions are required without restricting user language', () => {
  assert(validate({ ...valid(), description: '  ' }).description);
  assert(validate({ ...valid(), description: 'x'.repeat(5001) }).description);
  assert.deepEqual(validate({ ...valid(), description: '无线电间歇故障' }), {});
});
