import type { LessonKind, ScheduleEntry } from "./cfi-schedule";

export type LessonEdit = { start_at: string; end_at: string; lesson_kind: LessonKind; note: string };
export type ScheduleOperation =
  | { type: "edit"; id: string; values: LessonEdit }
  | { type: "add"; entry: ScheduleEntry }
  | { type: "cancel"; id: string };
export type ScheduleChange = { before: ScheduleEntry | null; after: ScheduleEntry };

function dayKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

// Each operation starts from the current draft. Replaying against a new server
// snapshot intentionally includes newly added later lessons in the next preview.
export function applyScheduleOperations(original: ScheduleEntry[], operations: ScheduleOperation[]) {
  let result = original.map((entry) => ({ ...entry }));
  for (const operation of operations) {
    if (operation.type === "add") {
      if (result.some((entry) => entry.id === operation.entry.id)) throw new Error("A draft lesson already exists. Reload the latest schedule.");
      result.push({ ...operation.entry });
      continue;
    }
    const target = result.find((entry) => entry.id === operation.id && entry.entry_type === "lesson");
    if (!target) throw new Error("A lesson in this draft has been removed or cancelled. Discard the draft and review the latest schedule.");
    if (operation.type === "cancel") {
      result = result.filter((entry) => entry.id !== operation.id);
      continue;
    }
    const delta = new Date(operation.values.start_at).getTime() - new Date(target.start_at).getTime();
    const cascade = delta !== 0 && dayKey(target.start_at) === dayKey(operation.values.start_at);
    result = result.map((entry) => {
      if (entry.id === target.id) return { ...entry, ...operation.values };
      if (cascade && entry.entry_type === "lesson" && dayKey(entry.start_at) === dayKey(target.start_at) && new Date(entry.start_at) > new Date(target.start_at)) {
        return { ...entry, start_at: new Date(new Date(entry.start_at).getTime() + delta).toISOString(), end_at: new Date(new Date(entry.end_at).getTime() + delta).toISOString() };
      }
      return entry;
    });
  }
  return result.sort((left, right) => Date.parse(left.start_at) - Date.parse(right.start_at));
}

export function scheduleChanges(original: ScheduleEntry[], current: ScheduleEntry[]): ScheduleChange[] {
  const beforeById = new Map(original.filter((entry) => entry.entry_type === "lesson").map((entry) => [entry.id, entry]));
  const afterById = new Map(current.filter((entry) => entry.entry_type === "lesson").map((entry) => [entry.id, entry]));
  const result: ScheduleChange[] = [];
  for (const [id, before] of beforeById) {
    const after = afterById.get(id);
    if (!after) result.push({ before, after: { ...before, status: "cancelled" } });
    else if (Date.parse(before.start_at) !== Date.parse(after.start_at) || Date.parse(before.end_at) !== Date.parse(after.end_at) || before.lesson_kind !== after.lesson_kind || before.note !== after.note) result.push({ before, after });
  }
  for (const [id, after] of afterById) if (!beforeById.has(id)) result.push({ before: null, after });
  return result;
}

export function scheduleHasOverlap(entries: ScheduleEntry[]) {
  const lessons = entries.filter((entry) => entry.entry_type === "lesson" && entry.status === "scheduled").sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at));
  return lessons.some((entry, index) => index > 0 && Date.parse(entry.start_at) < Date.parse(lessons[index - 1].end_at));
}
