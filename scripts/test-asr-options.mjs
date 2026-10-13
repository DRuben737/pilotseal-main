import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const compiled = ts.transpileModule(fs.readFileSync('lib/asr-options.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const compiledModule = { exports: {} };
vm.runInThisContext(`(function(module,exports){${compiled}\n})`)(compiledModule, compiledModule.exports);
const { asrOptionValues, asrFieldOptions, asrOptionLabel } = compiledModule.exports;
const option = (category, value, is_active = true) => ({ id: value, organization_id: 'synthetic-org', category, value, is_active, sort_order: 1 });

test('new organizations can complete every required option without Settings', () => {
  for (const category of ['occurrence_type', 'nature_of_flight', 'phase_of_flight']) {
    const choices = asrOptionValues([], category);
    assert(choices.length > 1); assert(choices.includes('Other')); assert(!choices.includes(''));
  }
});
test('all optional categories have useful defaults without arbitrary school-specific areas', () => {
  for (const category of ['maneuver', 'training_area', 'program', 'day_night', 'flight_conditions', 'precipitation', 'intensity', 'external_agency']) assert(asrOptionValues([], category).length);
  assert(!asrOptionValues([], 'training_area').includes('Alpha'));
});
test('existing organization choices stay intact and deduplicated', () => {
  const rows = [option('occurrence_type', 'Local procedure'), option('occurrence_type', 'Local procedure'), option('occurrence_type', 'Hidden', false), option('phase_of_flight', 'Taxi')];
  const before = JSON.stringify(rows);
  assert.deepEqual(asrOptionValues(rows, 'occurrence_type'), ['Local procedure']);
  assert.equal(JSON.stringify(rows), before);
});
test('empty/inactive category still works while unrelated categories are populated', () => {
  assert(asrOptionValues([option('occurrence_type', 'Hidden', false), option('phase_of_flight', 'Taxi')], 'occurrence_type').includes('Mechanical'));
});
test('legacy or inactive saved values remain selectable when editing', () => {
  assert.deepEqual(asrFieldOptions(['Mechanical', 'Other'], 'Old organization category'), ['Old organization category', 'Mechanical', 'Other']);
  assert.deepEqual(asrFieldOptions(['Mechanical', 'Other'], 'Mechanical'), ['Mechanical', 'Other']);
});
test('required choices are not preselected and user content is not rewritten', () => {
  assert.deepEqual(asrFieldOptions(['Mechanical', 'Other'], ''), ['Mechanical', 'Other']);
  assert.equal(asrFieldOptions(['Other'], '旧记录内容')[0], '旧记录内容');
});
test('ambiguous preset abbreviations are readable without rewriting stored values', () => {
  for (const [value, label] of [['MX Check', 'Maintenance check flight'], ['PAX', 'Passenger flight'], ['A/C Documents', 'Aircraft documents']]) assert.equal(asrOptionLabel(value), label);
  assert.equal(asrOptionLabel('School custom option'), 'School custom option');
  assert.equal(asrOptionLabel('constructor'), 'constructor');
  assert.equal(asrOptionLabel('__proto__'), '__proto__');
});
