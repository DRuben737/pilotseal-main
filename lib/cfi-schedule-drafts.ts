import type { LessonKind, ScheduleEntry } from "./cfi-schedule";

export type LessonEdit = { start_at: string; end_at: string; lesson_kind: LessonKind; note: string; aircraft_id: string | null; aircraft_tail_number?: string | null; aircraft_status?: ScheduleEntry["aircraft_status"] };
export type ScheduleOperation =
  | { type: "edit"; id: string; values: LessonEdit }
  | { type: "add"; entry: ScheduleEntry }
  | { type: "cancel"; id: string };
export type ScheduleChange = { before: ScheduleEntry | null; after: ScheduleEntry };

// Each operation changes only its own lesson, including when replayed against a
// newer server snapshot. Other lessons must be adjusted explicitly.
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
    result = result.map((entry) => entry.id === target.id ? { ...entry, ...operation.values } : entry);
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
    else if (Date.parse(before.start_at) !== Date.parse(after.start_at) || Date.parse(before.end_at) !== Date.parse(after.end_at) || before.lesson_kind !== after.lesson_kind || before.aircraft_id !== after.aircraft_id || before.note !== after.note) result.push({ before, after });
  }
  for (const [id, after] of afterById) if (!beforeById.has(id)) result.push({ before: null, after });
  return result;
}

export function scheduleHasOverlap(entries: ScheduleEntry[]) {
  const lessons = entries.filter((entry) => entry.entry_type === "lesson" && entry.status === "scheduled").sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at));
  return lessons.some((entry, index) => index > 0 && Date.parse(entry.start_at) < Date.parse(lessons[index - 1].end_at));
}

export function scheduleConflictsForLesson(entries: ScheduleEntry[], lessonId: string) {
  const edited = entries.find((entry) => entry.id === lessonId && entry.entry_type === "lesson" && entry.status === "scheduled");
  if (!edited) return [];
  const start = Date.parse(edited.start_at);
  const end = Date.parse(edited.end_at);
  return entries.filter((entry) => entry.id !== lessonId && entry.entry_type === "lesson" && entry.status === "scheduled"
    && Date.parse(entry.start_at) < end && Date.parse(entry.end_at) > start)
    .sort((left, right) => Date.parse(left.start_at) - Date.parse(right.start_at));
}

export function swapScheduleLessons(entries: ScheduleEntry[], sourceId: string, targetId: string) {
  if (!sourceId || !targetId || sourceId === targetId) throw new Error("Choose two different lessons to swap.");
  const source = entries.find((entry) => entry.id === sourceId && entry.entry_type === "lesson" && entry.status === "scheduled");
  const target = entries.find((entry) => entry.id === targetId && entry.entry_type === "lesson" && entry.status === "scheduled");
  if (!source || !target) throw new Error("One of these lessons is no longer available. Refresh and try again.");
  if (source.student_user_id === target.student_user_id) throw new Error("Choose lessons for two different students.");

  const moveTo = (entry: ScheduleEntry, startAt: string) => {
    const duration = Date.parse(entry.end_at) - Date.parse(entry.start_at);
    return { ...entry, start_at: new Date(startAt).toISOString(), end_at: new Date(Date.parse(startAt) + duration).toISOString() };
  };
  return entries.map((entry) => entry.id === sourceId ? moveTo(entry, target.start_at) : entry.id === targetId ? moveTo(entry, source.start_at) : { ...entry })
    .sort((left, right) => Date.parse(left.start_at) - Date.parse(right.start_at));
}
