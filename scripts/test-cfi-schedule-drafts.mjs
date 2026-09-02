import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

process.env.TZ = 'America/New_York';
const source = await readFile(new URL('../lib/cfi-schedule-drafts.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { applyScheduleOperations, scheduleChanges, scheduleHasOverlap } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const lesson = (id, start, end, day = '2026-09-14') => ({ id, entry_type: 'lesson', student_user_id: id, student_name: id, lesson_kind: 'flight', start_at: `${day}T${start}:00-04:00`, end_at: `${day}T${end}:00-04:00`, status: 'scheduled', note: '', auto_generated: false, is_own: false });
const a = lesson('a', '07:00', '09:00');
const b = lesson('b', '09:30', '11:30');
const c = lesson('c', '12:00', '14:00');
const d = lesson('d', '09:00', '11:00', '2026-09-15');
const block = { ...lesson('block', '15:00', '16:00'), entry_type: 'unavailable', student_user_id: null };
const original = [a, b, c, d, block];
const edit = (entry, minutes) => ({ type: 'edit', id: entry.id, values: { lesson_kind: entry.lesson_kind, note: entry.note, start_at: new Date(Date.parse(entry.start_at) + minutes * 60000).toISOString(), end_at: new Date(Date.parse(entry.end_at) + minutes * 60000).toISOString() } });
const middle = applyScheduleOperations(original, [edit(b, 30)]);
assert.equal(Date.parse(middle.find(e => e.id === 'a').start_at), Date.parse(a.start_at));
assert.equal(Date.parse(middle.find(e => e.id === 'c').start_at), Date.parse(c.start_at) + 1800000);
assert.equal(middle.find(e => e.id === 'd').start_at, d.start_at);
assert.equal(middle.find(e => e.id === 'block').start_at, block.start_at);
assert.equal(Date.parse(middle.find(e => e.id === 'c').start_at) - Date.parse(middle.find(e => e.id === 'b').end_at), 1800000);
assert.equal(scheduleChanges(original, middle).length, 2);
const earlier = applyScheduleOperations(original, [edit(b, -15)]);
assert.equal(Date.parse(earlier.find(e => e.id === 'c').start_at), Date.parse(c.start_at) - 900000);
assert.equal(scheduleHasOverlap(earlier), false);
assert.equal(scheduleHasOverlap(applyScheduleOperations(original, [edit(b, -60)])), true);
assert.equal(scheduleChanges(original, applyScheduleOperations(original, [edit(c, 30)])).length, 1);
assert.equal(scheduleChanges(original, applyScheduleOperations(original, [edit(a, 30)])).length, 3);
const cancelled = applyScheduleOperations(original, [{ type: 'cancel', id: 'b' }]);
assert.equal(scheduleChanges(original, cancelled)[0].after.status, 'cancelled');
const newLesson = lesson('new', '17:00', '19:00');
assert.equal(scheduleChanges(original, applyScheduleOperations(original, [{ type: 'add', entry: newLesson }, { type: 'cancel', id: 'new' }])).length, 0);
const latest = [...original, newLesson];
const rebased = applyScheduleOperations(latest, [edit(b, 30)]);
assert.equal(Date.parse(rebased.find(e => e.id === 'new').start_at), Date.parse(newLesson.start_at) + 1800000);
assert.throws(() => applyScheduleOperations(cancelled, [edit(b, 30)]), /removed or cancelled/);
const repeated = applyScheduleOperations(original, [edit(b, 30), edit({ ...b, ...edit(b, 30).values }, 30)]);
assert.equal(Date.parse(repeated.find(e => e.id === 'c').start_at), Date.parse(c.start_at) + 3600000);
const restored = applyScheduleOperations(original, [edit(b, 30), { type: 'edit', id: 'b', values: { start_at: b.start_at, end_at: b.end_at, note: '', lesson_kind: 'flight' } }]);
assert.equal(scheduleChanges(original, restored).length, 0);
// Pure scheduling checks: no database or network calls.
const scheduleSource = (await readFile(new URL('../lib/cfi-schedule.ts', import.meta.url), 'utf8'))
  .replace('import { getSupabaseClient } from "@/lib/supabase";', 'const getSupabaseClient = () => { throw new Error("Network access is forbidden in this test"); };');
const scheduleCompiled = ts.transpileModule(scheduleSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { getManualConflictWarnings, generateAutomaticSchedule } = await import(`data:text/javascript;base64,${Buffer.from(scheduleCompiled).toString('base64')}`);
const slots = [{ student_user_id:'a', scope:'weekly', weekday:1, start_minute:420, end_minute:900, timezone:'America/New_York' }];
const aircraftBlock = { id:'resource', cfi_user_id:'cfi', start_at:a.start_at, end_at:a.end_at, note:'' };
const warningInput = { studentUserId:'a', start:new Date(a.start_at), end:new Date(a.end_at), slots, overrideDates:[], blocks:[aircraftBlock] };
assert.equal(getManualConflictWarnings({...warningInput,lessonKind:'flight'}).length,1);
assert.equal(getManualConflictWarnings({...warningInput,lessonKind:'ground'}).length,0);
const autoInput = { cfiUserId:'cfi', weekStart:new Date('2026-09-14T12:00:00'), includeWeekends:false,
  access:[{student_user_id:'a',student_name:'Student',default_duration_min:120,default_weekly_sessions:1}],
  weekOverrides:[], slots, overrideDates:[], existingEntries:[], blocks:[aircraftBlock] };
const generated = generateAutomaticSchedule(autoInput).drafts;
assert.equal(generated.length,1);
assert.equal(Date.parse(generated[0].start_at),Date.parse(a.end_at),'automatic flight starts after the aircraft block');
assert.equal(generateAutomaticSchedule({...autoInput,blocks:[]}).drafts[0].start_at,new Date(a.start_at).toISOString(),'removing the block releases the earlier slot');
console.log('22 schedule assertions passed, including Flight block avoidance and Ground independence.');
