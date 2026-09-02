import { getSupabaseClient } from "@/lib/supabase";

export type LessonKind = "flight" | "ground";
export type AvailabilityScope = "weekly" | "date";

export type ScheduleAccess = {
  /** For person storage, student_user_id is the People ID, NOT an auth ID. */
  storage_kind?: "account" | "person";
  account_user_id?: string | null;
  cfi_user_id: string;
  cfi_name: string;
  student_user_id: string;
  student_name: string;
  saved_person_id: string;
  default_weekly_sessions: number;
  default_duration_min: number;
  color: string;
  access_enabled: boolean;
  caller_role: "cfi" | "student";
};

export type AvailabilitySlot = {
  id: string;
  cfi_user_id: string;
  student_user_id: string;
  scope: AvailabilityScope;
  weekday: number | null;
  availability_date: string | null;
  start_minute: number;
  end_minute: number;
  timezone: string;
};

export type AvailabilityOverrideDate = {
  cfi_user_id: string;
  student_user_id: string;
  availability_date: string;
  timezone: string;
  source?: "manual" | "auto";
};

export type WeekOverride = {
  cfi_user_id: string;
  student_user_id: string;
  week_start: string;
  target_sessions: number;
  duration_min: number;
};

export type ScheduleEntry = {
  id: string;
  entry_type: "lesson" | "unavailable";
  student_user_id: string | null;
  student_name: string | null;
  lesson_kind: LessonKind | null;
  start_at: string;
  end_at: string;
  note: string;
  auto_generated: boolean;
  status: "scheduled" | "cancelled";
  is_own: boolean;
};

export type UnavailableBlock = {
  id: string;
  cfi_user_id: string;
  start_at: string;
  end_at: string;
  note: string;
};

export type ScheduleDraft = {
  cfi_user_id: string;
  student_user_id: string;
  student_name: string;
  lesson_kind: LessonKind;
  start_at: string;
  end_at: string;
  note: string;
  auto_generated: boolean;
};

export type LinkedScheduleCandidate = {
  storage_kind: "account" | "person";
  account_user_id: string | null;
  saved_person_id: string;
  student_user_id: string;
  student_name: string;
};

const slotSelect = "id, cfi_user_id, student_user_id, scope, weekday, availability_date, start_minute, end_minute, timezone";

export function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function getWeekStart(input = new Date()) {
  const value = new Date(input);
  value.setHours(12, 0, 0, 0);
  const weekday = (value.getDay() + 6) % 7;
  value.setDate(value.getDate() - weekday);
  return value;
}

export function addCalendarDays(input: Date, amount: number) {
  const value = new Date(input);
  value.setDate(value.getDate() + amount);
  return value;
}

export function localDateKey(input: Date) {
  return [
    input.getFullYear(),
    String(input.getMonth() + 1).padStart(2, "0"),
    String(input.getDate()).padStart(2, "0"),
  ].join("-");
}

export function minutesToTime(value: number) {
  const normalized = Math.max(0, Math.min(1440, value));
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function timeToMinutes(value: string) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) && value !== "24:00") return Number.NaN;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function datePartsInZone(input: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(input);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

export function zonedLocalToUtc(dateKey: string, minuteOfDay: number, timezone: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const desiredUtcShape = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = new Date(desiredUtcShape);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = datePartsInZone(candidate, timezone);
    const actualUtcShape = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute);
    const delta = desiredUtcShape - actualUtcShape;
    if (delta === 0) break;
    candidate = new Date(candidate.getTime() + delta);
  }
  return candidate;
}

export async function fetchScheduleAccess() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("list_my_cfi_schedule_access_v2");
  if (error) throw error;
  return (data ?? []) as ScheduleAccess[];
}

export async function fetchScheduleEntries(cfiUserId: string, rangeStart: Date, rangeEnd: Date) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("list_cfi_schedule_entries", {
    p_cfi_user_id: cfiUserId,
    p_range_start: rangeStart.toISOString(),
    p_range_end: rangeEnd.toISOString(),
  });
  if (error) throw error;
  return (data ?? []) as ScheduleEntry[];
}

export type ScheduleEditorSnapshot = {
  revision: string;
  entries: ScheduleEntry[];
  slots: AvailabilitySlot[];
  overrideDates: AvailabilityOverrideDate[];
  blocks: UnavailableBlock[];
  weekOverrides: WeekOverride[];
  access: ScheduleAccess[];
};

export async function fetchScheduleEditorSnapshot(rangeStart: Date, rangeEnd: Date, cfiUserId?: string) {
  const { data, error } = await getSupabaseClient().rpc("get_cfi_schedule_snapshot_v2", {
    p_range_start: rangeStart.toISOString(), p_range_end: rangeEnd.toISOString(),
    ...(cfiUserId ? { p_cfi_id: cfiUserId } : {}),
  });
  if (error) throw error;
  return data as ScheduleEditorSnapshot;
}

export async function publishScheduleDraft(revision: string, batchId: string, changes: ScheduleEntry[]) {
  const { data, error } = await getSupabaseClient().rpc("publish_cfi_schedule_draft", {
    p_expected_revision: revision,
    p_batch_id: batchId,
    p_changes: changes.map((entry) => ({
      id: entry.id, student_user_id: entry.student_user_id, lesson_kind: entry.lesson_kind,
      start_at: entry.start_at, end_at: entry.end_at, note: entry.note,
      status: entry.status, auto_generated: entry.auto_generated,
    })),
  });
  if (error) throw error;
  return String(data);
}

export async function saveScheduleAvailability(input: {
  personId?: string;
  cfiUserId: string; timezone: string; scope: AvailabilityScope; weekday: number;
  date: string; slots: Array<{ startMinute: number; endMinute: number }>; autofill: boolean;
}) {
  validateSlots(input.slots);
  const { data, error } = await getSupabaseClient().rpc(input.personId ? "save_cfi_person_availability" : "save_cfi_schedule_availability", {
    ...(input.personId ? { p_person_id: input.personId } : {}),
    p_cfi_id: input.cfiUserId, p_timezone: input.timezone, p_scope: input.scope,
    p_weekday: input.weekday, p_date: input.date,
    p_slots: input.slots.map((slot) => ({ start_minute: slot.startMinute, end_minute: slot.endMinute })),
    p_autofill: input.autofill,
  });
  if (error) throw error;
  return Number(data);
}

export async function fetchAvailability(cfiUserId: string) {
  const supabase = getSupabaseClient();
  const [slotsResult, datesResult] = await Promise.all([
    supabase.from("cfi_schedule_availability_slots").select(slotSelect).eq("cfi_user_id", cfiUserId),
    supabase
      .from("cfi_schedule_availability_override_dates")
      .select("cfi_user_id, student_user_id, availability_date, timezone, source")
      .eq("cfi_user_id", cfiUserId),
  ]);
  if (slotsResult.error) throw slotsResult.error;
  if (datesResult.error) throw datesResult.error;
  return {
    slots: (slotsResult.data ?? []) as AvailabilitySlot[],
    overrideDates: (datesResult.data ?? []) as AvailabilityOverrideDate[],
  };
}

export async function fetchWeekOverrides(cfiUserId: string, weekStart: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("cfi_schedule_week_overrides")
    .select("cfi_user_id, student_user_id, week_start, target_sessions, duration_min")
    .eq("cfi_user_id", cfiUserId)
    .eq("week_start", weekStart);
  if (error) throw error;
  return (data ?? []) as WeekOverride[];
}

export async function fetchUnavailableBlocks(cfiUserId: string, rangeStart: Date, rangeEnd: Date) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("cfi_schedule_unavailable_blocks")
    .select("id, cfi_user_id, start_at, end_at, note")
    .eq("cfi_user_id", cfiUserId)
    .lt("start_at", rangeEnd.toISOString())
    .gt("end_at", rangeStart.toISOString());
  if (error) throw error;
  return (data ?? []) as UnavailableBlock[];
}

export async function grantScheduleAccess(input: {
  storageKind?: "account" | "person";
  cfiUserId: string;
  savedPersonId: string;
  studentUserId: string;
  defaultWeeklySessions?: number;
  defaultDurationMin?: number;
  color?: string;
}) {
  if (input.storageKind === "person") return setPersonScheduleAccess(input.savedPersonId, true);
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("cfi_schedule_student_grants").upsert(
    {
      cfi_user_id: input.cfiUserId,
      saved_person_id: input.savedPersonId,
      student_user_id: input.studentUserId,
      default_weekly_sessions: input.defaultWeeklySessions ?? 3,
      default_duration_min: input.defaultDurationMin ?? 120,
      color: input.color ?? "#2563eb",
      access_enabled: true,
    },
    { onConflict: "cfi_user_id,student_user_id" }
  );
  if (error) throw error;
}

export async function setPersonScheduleAccess(personId: string, enabled: boolean) {
  const { error } = await getSupabaseClient().rpc("set_cfi_person_access", { p_person: personId, p_enabled: enabled });
  if (error) throw error;
}

export async function savePersonScheduleSettings(cfiUserId: string, personId: string, settings: {
  weeklySessions: number; durationMin: number; color: string; useWeekOverride: boolean;
  weekStart: string; weekSessions: number; weekDurationMin: number;
}) {
  const { error } = await getSupabaseClient().rpc("update_cfi_person_settings", { p_cfi_id: cfiUserId, p_person_id: personId, p_settings: settings });
  if (error) throw error;
}

export async function clearPersonAvailabilityDate(cfiUserId: string, personId: string, date: string) {
  const { error } = await getSupabaseClient().rpc("clear_cfi_person_date", { p_cfi_id: cfiUserId, p_person_id: personId, p_date: date });
  if (error) throw error;
}

export async function revokeScheduleAccess(cfiUserId: string, studentUserId: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("cfi_schedule_student_grants")
    .update({ access_enabled: false })
    .eq("cfi_user_id", cfiUserId)
    .eq("student_user_id", studentUserId);
  if (error) throw error;
}

export async function updateStudentScheduleDefaults(input: {
  cfiUserId: string;
  studentUserId: string;
  weeklySessions: number;
  durationMin: number;
  color: string;
}) {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("cfi_schedule_student_grants")
    .update({
      default_weekly_sessions: input.weeklySessions,
      default_duration_min: input.durationMin,
      color: input.color,
    })
    .eq("cfi_user_id", input.cfiUserId)
    .eq("student_user_id", input.studentUserId);
  if (error) throw error;
}

export async function upsertWeekOverride(input: WeekOverride) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("cfi_schedule_week_overrides").upsert(input, {
    onConflict: "cfi_user_id,student_user_id,week_start",
  });
  if (error) throw error;
}

export async function removeWeekOverride(cfiUserId: string, studentUserId: string, weekStart: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("cfi_schedule_week_overrides")
    .delete()
    .eq("cfi_user_id", cfiUserId)
    .eq("student_user_id", studentUserId)
    .eq("week_start", weekStart);
  if (error) throw error;
}

type SlotInput = { startMinute: number; endMinute: number };

export async function replaceWeeklyAvailability(input: {
  cfiUserId: string;
  studentUserId: string;
  timezone: string;
  weekday: number;
  slots: SlotInput[];
}) {
  validateSlots(input.slots);
  const supabase = getSupabaseClient();
  const { error: deleteError } = await supabase
    .from("cfi_schedule_availability_slots")
    .delete()
    .eq("cfi_user_id", input.cfiUserId)
    .eq("student_user_id", input.studentUserId)
    .eq("scope", "weekly")
    .eq("weekday", input.weekday);
  if (deleteError) throw deleteError;
  if (!input.slots.length) return;
  const { error } = await supabase.from("cfi_schedule_availability_slots").insert(
    input.slots.map((slot) => ({
      cfi_user_id: input.cfiUserId,
      student_user_id: input.studentUserId,
      scope: "weekly",
      weekday: input.weekday,
      availability_date: null,
      start_minute: slot.startMinute,
      end_minute: slot.endMinute,
      timezone: input.timezone,
    }))
  );
  if (error) throw error;
}

export async function replaceDateAvailability(input: {
  cfiUserId: string;
  studentUserId: string;
  timezone: string;
  date: string;
  slots: SlotInput[];
}) {
  validateSlots(input.slots);
  const supabase = getSupabaseClient();
  const { error: markerError } = await supabase
    .from("cfi_schedule_availability_override_dates")
    .upsert(
      {
        cfi_user_id: input.cfiUserId,
        student_user_id: input.studentUserId,
        availability_date: input.date,
        timezone: input.timezone,
      },
      { onConflict: "cfi_user_id,student_user_id,availability_date" }
    );
  if (markerError) throw markerError;
  const { error: deleteError } = await supabase
    .from("cfi_schedule_availability_slots")
    .delete()
    .eq("cfi_user_id", input.cfiUserId)
    .eq("student_user_id", input.studentUserId)
    .eq("scope", "date")
    .eq("availability_date", input.date);
  if (deleteError) throw deleteError;
  if (!input.slots.length) return;
  const { error } = await supabase.from("cfi_schedule_availability_slots").insert(
    input.slots.map((slot) => ({
      cfi_user_id: input.cfiUserId,
      student_user_id: input.studentUserId,
      scope: "date",
      weekday: null,
      availability_date: input.date,
      start_minute: slot.startMinute,
      end_minute: slot.endMinute,
      timezone: input.timezone,
    }))
  );
  if (error) throw error;
}

export async function removeDateAvailabilityOverride(cfiUserId: string, studentUserId: string, date: string) {
  const supabase = getSupabaseClient();
  const [{ error: slotsError }, { error: markerError }] = await Promise.all([
    supabase
      .from("cfi_schedule_availability_slots")
      .delete()
      .eq("cfi_user_id", cfiUserId)
      .eq("student_user_id", studentUserId)
      .eq("scope", "date")
      .eq("availability_date", date),
    supabase
      .from("cfi_schedule_availability_override_dates")
      .delete()
      .eq("cfi_user_id", cfiUserId)
      .eq("student_user_id", studentUserId)
      .eq("availability_date", date),
  ]);
  if (slotsError) throw slotsError;
  if (markerError) throw markerError;
}

export async function createUnavailableBlock(input: Omit<UnavailableBlock, "id">) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("cfi_schedule_unavailable_blocks").insert(input);
  if (error) throw error;
}

export async function updateUnavailableBlock(id: string, input: Omit<UnavailableBlock, "id">) {
  const { error } = await getSupabaseClient().from("cfi_schedule_unavailable_blocks")
    .update(input).eq("id", id).eq("cfi_user_id", input.cfi_user_id).select("id").single();
  if (error) throw error;
}

export async function deleteUnavailableBlock(id: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("cfi_schedule_unavailable_blocks").delete().eq("id", id);
  if (error) throw error;
}

export async function createScheduleEvents(drafts: ScheduleDraft[], createdBy: string) {
  if (!drafts.length) return;
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("cfi_schedule_events").insert(
    drafts.map((draft) => ({ ...draft, created_by: createdBy, status: "scheduled" }))
  );
  if (error) throw error;
}

export async function updateScheduleEvent(id: string, input: {
  lessonKind: LessonKind;
  startAt: string;
  endAt: string;
  note: string;
}) {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("cfi_schedule_events")
    .update({
      lesson_kind: input.lessonKind,
      start_at: input.startAt,
      end_at: input.endAt,
      note: input.note,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function moveFirstScheduleEventAndFollowing(id: string, input: {
  lessonKind: LessonKind;
  startAt: string;
  endAt: string;
  note: string;
  timezone: string;
}) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("move_cfi_schedule_day", {
    p_event_id: id,
    p_start_at: input.startAt,
    p_end_at: input.endAt,
    p_lesson_kind: input.lessonKind,
    p_note: input.note,
    p_timezone: input.timezone,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function cancelScheduleEvent(id: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("cfi_schedule_events")
    .update({ status: "cancelled" })
    .eq("id", id);
  if (error) throw error;
}

function validateSlots(slots: SlotInput[]) {
  for (const slot of slots) {
    if (!Number.isInteger(slot.startMinute) || !Number.isInteger(slot.endMinute) || slot.startMinute < 0 || slot.endMinute > 1440 || slot.endMinute - slot.startMinute < 120) {
      throw new Error("Each availability period must be at least two hours.");
    }
  }
}

function overlaps(start: Date, end: Date, otherStart: Date, otherEnd: Date) {
  return start < otherEnd && end > otherStart;
}

export function availabilityForDate(input: {
  date: Date;
  studentUserId: string;
  slots: AvailabilitySlot[];
  overrideDates: AvailabilityOverrideDate[];
}) {
  const date = localDateKey(input.date);
  const override = input.overrideDates.find(
    (item) => item.student_user_id === input.studentUserId && item.availability_date === date
  );
  const weekday = input.date.getDay() === 0 ? 7 : input.date.getDay();
  const matching = input.slots.filter((slot) =>
    slot.student_user_id === input.studentUserId && (
      override
        ? slot.scope === "date" && slot.availability_date === date
        : slot.scope === "weekly" && slot.weekday === weekday
    )
  );
  return matching.map((slot) => ({
    start: zonedLocalToUtc(date, slot.start_minute, slot.timezone),
    end: zonedLocalToUtc(date, slot.end_minute, slot.timezone),
  }));
}

export function getManualConflictWarnings(input: {
  studentUserId: string;
  lessonKind: LessonKind;
  start: Date;
  end: Date;
  slots: AvailabilitySlot[];
  overrideDates: AvailabilityOverrideDate[];
  blocks: UnavailableBlock[];
}) {
  const periods = availabilityForDate({
    date: input.start,
    studentUserId: input.studentUserId,
    slots: input.slots,
    overrideDates: input.overrideDates,
  });
  const warnings: string[] = [];
  if (!periods.some((period) => input.start >= period.start && input.end <= period.end)) {
    warnings.push("This lesson is outside the student’s stated availability.");
  }
  if (
    input.lessonKind === "flight" &&
    input.blocks.some((block) => overlaps(input.start, input.end, new Date(block.start_at), new Date(block.end_at)))
  ) {
    warnings.push("This flight overlaps an unavailable block.");
  }
  return warnings;
}

export function generateAutomaticSchedule(input: {
  cfiUserId: string;
  weekStart: Date;
  includeWeekends: boolean;
  access: ScheduleAccess[];
  weekOverrides: WeekOverride[];
  slots: AvailabilitySlot[];
  overrideDates: AvailabilityOverrideDate[];
  existingEntries: ScheduleEntry[];
  blocks: UnavailableBlock[];
}) {
  const dayCount = input.includeWeekends ? 7 : 5;
  const occupied = input.existingEntries
    .filter((entry) => entry.entry_type === "lesson")
    .map((entry) => ({ start: new Date(entry.start_at), end: new Date(entry.end_at), studentUserId: entry.student_user_id }));
  const drafts: ScheduleDraft[] = [];
  const unscheduled: Array<{ studentName: string; remaining: number; reason: string }> = [];
  const weekKey = localDateKey(input.weekStart);
  const settings = input.access.map((access) => {
    const override = input.weekOverrides.find(
      (item) => item.student_user_id === access.student_user_id && item.week_start === weekKey
    );
    const existingCount = input.existingEntries.filter(
      (entry) => entry.entry_type === "lesson" && entry.student_user_id === access.student_user_id
    ).length;
    return {
      access,
      durationMin: override?.duration_min ?? access.default_duration_min,
      remaining: Math.max(0, (override?.target_sessions ?? access.default_weekly_sessions) - existingCount),
      usedDays: new Set(
        input.existingEntries
          .filter((entry) => entry.entry_type === "lesson" && entry.student_user_id === access.student_user_id)
          .map((entry) => localDateKey(new Date(entry.start_at)))
      ),
    };
  });

  const dailyItems = (date: Date) => [
    ...occupied.filter((item) => localDateKey(item.start) === localDateKey(date)),
    ...drafts
      .filter((draft) => localDateKey(new Date(draft.start_at)) === localDateKey(date))
      .map((draft) => ({ start: new Date(draft.start_at), end: new Date(draft.end_at), studentUserId: draft.student_user_id })),
  ];

  for (const allowSameDay of [false, true]) {
    let madeProgress = true;
    while (madeProgress && settings.some((item) => item.remaining > 0)) {
      madeProgress = false;
      const ordered = [...settings].sort((a, b) => b.remaining - a.remaining || a.access.student_name.localeCompare(b.access.student_name));
      for (const setting of ordered) {
        if (setting.remaining <= 0) continue;
        let placed = false;
        for (let dayIndex = 0; dayIndex < dayCount && !placed; dayIndex += 1) {
          const date = addCalendarDays(input.weekStart, dayIndex);
          const dateKey = localDateKey(date);
          if (!allowSameDay && setting.usedDays.has(dateKey)) continue;
          const periods = availabilityForDate({
            date,
            studentUserId: setting.access.student_user_id,
            slots: input.slots,
            overrideDates: input.overrideDates,
          });
          for (const period of periods) {
            for (let startMs = period.start.getTime(); startMs + setting.durationMin * 60_000 <= period.end.getTime(); startMs += 15 * 60_000) {
              const start = new Date(startMs);
              const end = new Date(startMs + setting.durationMin * 60_000);
              const localStartMinute = start.getHours() * 60 + start.getMinutes();
              if (localStartMinute < 420 || localStartMinute > 960) continue;
              const items = dailyItems(date);
              if (items.some((item) => overlaps(start, end, item.start, item.end))) continue;
              if (input.blocks.some((block) => overlaps(start, end, new Date(block.start_at), new Date(block.end_at)))) continue;
              const spanStart = Math.min(start.getTime(), ...items.map((item) => item.start.getTime()));
              const spanEnd = Math.max(end.getTime(), ...items.map((item) => item.end.getTime()));
              if (spanEnd - spanStart > 8 * 60 * 60_000) continue;
              drafts.push({
                cfi_user_id: input.cfiUserId,
                student_user_id: setting.access.student_user_id,
                student_name: setting.access.student_name,
                lesson_kind: "flight",
                start_at: start.toISOString(),
                end_at: end.toISOString(),
                note: "Auto-scheduled",
                auto_generated: true,
              });
              setting.remaining -= 1;
              setting.usedDays.add(dateKey);
              placed = true;
              madeProgress = true;
              break;
            }
            if (placed) break;
          }
        }
      }
    }
  }

  for (const setting of settings) {
    if (setting.remaining > 0) {
      unscheduled.push({
        studentName: setting.access.student_name,
        remaining: setting.remaining,
        reason: "No remaining slot satisfies availability, conflicts, and the eight-hour duty span.",
      });
    }
  }
  return { drafts, unscheduled };
}
