"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ConfirmDialog, DetailDrawer, EmptyState, StatusBadge } from "@/components/admin/AdminConsole";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import {
  addCalendarDays,
  availabilityForDate,
  browserTimeZone,
  createUnavailableBlock,
  deleteUnavailableBlock,
  fetchAvailability,
  fetchScheduleAccess,
  fetchScheduleEntries,
  fetchScheduleEditorSnapshot,
  fetchWeekOverrides,
  generateAutomaticSchedule,
  getManualConflictWarnings,
  getWeekStart,
  grantScheduleAccess,
  localDateKey,
  minutesToTime,
  publishScheduleDraft,
  removeDateAvailabilityOverride,
  removeWeekOverride,
  saveScheduleAvailability,
  revokeScheduleAccess,
  timeToMinutes,
  updateStudentScheduleDefaults,
  upsertWeekOverride,
  type AvailabilityOverrideDate,
  type AvailabilitySlot,
  type LessonKind,
  type LinkedScheduleCandidate,
  type ScheduleAccess,
  type ScheduleDraft,
  type ScheduleEntry,
  type ScheduleEditorSnapshot,
  type UnavailableBlock,
  type WeekOverride,
} from "@/lib/cfi-schedule";
import { applyScheduleOperations, scheduleChanges, scheduleHasOverlap, type ScheduleOperation, type ScheduleChange } from "@/lib/cfi-schedule-drafts";
import { fetchEnabledFeatureIds, updateEnabledFeatureIds } from "@/lib/dashboard-preferences";
import { fetchSavedPeople, fetchSavedPersonAccountLinks } from "@/lib/saved-people";

type DrawerMode = "access" | "availability" | "lesson" | "block" | "auto" | "settings" | "publish" | null;
type AvailabilityRow = { start: string; end: string };

const weekdayLabels = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const emptyLesson = {
  id: "",
  originalStartAt: "",
  studentUserId: "",
  kind: "flight" as LessonKind,
  date: "",
  start: "08:00",
  durationMin: 120,
  note: "",
};

function localDateTimeValue(input: Date) {
  const date = localDateKey(input);
  return `${date}T${String(input.getHours()).padStart(2, "0")}:${String(input.getMinutes()).padStart(2, "0")}`;
}

function localDateTimeToIso(date: string, time: string, durationMin = 0) {
  const value = new Date(`${date}T${time}:00`);
  value.setMinutes(value.getMinutes() + durationMin);
  return value.toISOString();
}

function formatDate(input: Date) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(input);
}

function formatTime(input: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(input));
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return fallback;
}

export default function CfiScheduleManager() {
  const { session } = useAuthSession();
  const userId = session?.user?.id ?? "";
  const [featureEnabled, setFeatureEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [weekStart, setWeekStart] = useState(() => getWeekStart());
  const [access, setAccess] = useState<ScheduleAccess[]>([]);
  const [linkedCandidates, setLinkedCandidates] = useState<LinkedScheduleCandidate[]>([]);
  const [viewKey, setViewKey] = useState("cfi");
  const [publishedEntries, setEntries] = useState<ScheduleEntry[]>([]);
  const [operations, setOperations] = useState<ScheduleOperation[]>([]);
  const [revision, setRevision] = useState("0");
  const [loadedContext, setLoadedContext] = useState("");
  const [stale, setStale] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [publishAcknowledged, setPublishAcknowledged] = useState(false);
  const batchId = useRef("");
  const loadGeneration = useRef(0);
  const [mobileDayIndex, setMobileDayIndex] = useState(() => Math.min(4, (new Date().getDay() + 6) % 7));
  const entries = useMemo(() => applyScheduleOperations(publishedEntries, operations), [publishedEntries, operations]);
  const changes = useMemo(() => scheduleChanges(publishedEntries, entries), [publishedEntries, entries]);
  const hasDraft = operations.length > 0;
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [overrideDates, setOverrideDates] = useState<AvailabilityOverrideDate[]>([]);
  const [weekOverrides, setWeekOverrides] = useState<WeekOverride[]>([]);
  const [blocks, setBlocks] = useState<UnavailableBlock[]>([]);
  const [drawer, setDrawer] = useState<DrawerMode>(null);

  const [permissionDraft, setPermissionDraft] = useState<string[]>([]);
  const [confirmPermissions, setConfirmPermissions] = useState(false);
  const [availabilityScope, setAvailabilityScope] = useState<"weekly" | "date">("weekly");
  const [availabilityWeekday, setAvailabilityWeekday] = useState(1);
  const [availabilityDate, setAvailabilityDate] = useState(localDateKey(new Date()));
  const [availabilityRows, setAvailabilityRows] = useState<AvailabilityRow[]>([{ start: "07:00", end: "15:00" }]);
  const [autofillDates, setAutofillDates] = useState(true);
  const [lesson, setLesson] = useState(emptyLesson);
  const [lessonWarnings, setLessonWarnings] = useState<string[]>([]);
  const [cancelLessonId, setCancelLessonId] = useState("");
  const [blockForm, setBlockForm] = useState({ date: localDateKey(new Date()), start: "07:00", end: "09:00", note: "" });
  const [deleteBlockId, setDeleteBlockId] = useState("");
  const [autoDrafts, setAutoDrafts] = useState<ScheduleDraft[]>([]);
  const [autoUnscheduled, setAutoUnscheduled] = useState<Array<{ studentName: string; remaining: number; reason: string }>>([]);
  const [includeWeekends, setIncludeWeekends] = useState(false);
  const [settingsStudentId, setSettingsStudentId] = useState("");
  const [settingsForm, setSettingsForm] = useState({ weeklySessions: 3, durationMin: 120, color: "#2563eb", useWeekOverride: false, weekSessions: 3, weekDurationMin: 120 });

  const studentViews = useMemo(() => access.filter((item) => item.caller_role === "student" && item.access_enabled), [access]);
  const isCfiView = viewKey === "cfi";
  const activeCfiId = isCfiView ? userId : viewKey;
  const weekReady = loadedContext === `${activeCfiId}:${localDateKey(weekStart)}`;
  const activeCfiName = isCfiView ? "My CFI schedule" : studentViews.find((item) => item.cfi_user_id === viewKey)?.cfi_name ?? "Instructor";
  const cfiAccess = useMemo(
    () => access.filter((item) => item.caller_role === "cfi" && item.cfi_user_id === userId),
    [access, userId]
  );
  const activeStudents = useMemo(() => cfiAccess.filter((item) => item.access_enabled), [cfiAccess]);
  const maxAvailabilityDate = localDateKey(addCalendarDays(new Date(), 27));

  async function loadIdentityData() {
    if (!userId) return;
    const [featureIds, nextAccess, people, accountLinks] = await Promise.all([
      fetchEnabledFeatureIds(userId),
      fetchScheduleAccess(),
      fetchSavedPeople(userId, "student"),
      fetchSavedPersonAccountLinks(userId),
    ]);
    const peopleById = new Map(people.map((person) => [person.id, person]));
    setFeatureEnabled(featureIds.includes("cfi_schedule"));
    setAccess(nextAccess);
    setLinkedCandidates(accountLinks.map((link) => ({
      saved_person_id: link.saved_person_id,
      student_user_id: link.linked_user_id,
      student_name: peopleById.get(link.saved_person_id)?.display_name ?? "Linked student",
    })));
    setPermissionDraft(nextAccess.filter((item) => item.caller_role === "cfi" && item.access_enabled).map((item) => item.student_user_id));
    if (viewKey !== "cfi" && !nextAccess.some((item) => item.caller_role === "student" && item.cfi_user_id === viewKey)) {
      setViewKey("cfi");
    }
  }

  function adoptSnapshot(snapshot: ScheduleEditorSnapshot) {
    setLoadedContext(`${userId}:${localDateKey(weekStart)}`);
    setEntries(snapshot.entries);
    setRevision(snapshot.revision);
    setSlots(snapshot.slots);
    setOverrideDates(snapshot.overrideDates);
    setWeekOverrides(snapshot.weekOverrides.filter((item) => item.week_start === localDateKey(weekStart)));
    setBlocks(snapshot.blocks);
    setAccess((current) => [...current.filter((item) => item.caller_role === "student"), ...snapshot.access]);
    setStale(false);
  }

  function weekRange() {
    const start = new Date(weekStart);
    start.setHours(0, 0, 0, 0);
    return { start, end: addCalendarDays(start, 7) };
  }

  async function loadWeekData(cfiId = activeCfiId) {
    if (!cfiId) return;
    const generation = ++loadGeneration.current;
    const { start, end } = weekRange();
    if (cfiId === userId) {
      const snapshot = await fetchScheduleEditorSnapshot(start, end);
      if (generation !== loadGeneration.current) return;
      if (hasDraft) { setStale(snapshot.revision !== revision); return; }
      adoptSnapshot(snapshot);
      return;
    }
    const [nextEntries, availability, nextOverrides] = await Promise.all([
      fetchScheduleEntries(cfiId, start, end),
      fetchAvailability(cfiId),
      fetchWeekOverrides(cfiId, localDateKey(weekStart)),
    ]);
    if (generation !== loadGeneration.current) return;
    setLoadedContext(`${cfiId}:${localDateKey(weekStart)}`);
    setEntries(nextEntries);
    setSlots(availability.slots);
    setOverrideDates(availability.overrideDates);
    setWeekOverrides(nextOverrides);
    setBlocks([]);
  }

  async function reload() {
    if (!userId) return;
    setOperations([]);
    setLoading(true);
    setError("");
    try {
      await loadIdentityData();
      await loadWeekData();
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Unable to load the schedule."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // Reload when the signed-in user changes; week/view changes use the focused effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!userId || featureEnabled !== true || !activeCfiId) return;
    void loadWeekData(activeCfiId).catch((loadError) => setError(getErrorMessage(loadError, "Unable to load this week.")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCfiId, featureEnabled, localDateKey(weekStart), isCfiView]);

  useEffect(() => {
    if (!hasDraft) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const beforeNavigate = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest("a[href]");
      if (link && !window.confirm("Leave this page and discard unpublished schedule changes?")) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", beforeNavigate, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", beforeNavigate, true); };
  }, [hasDraft]);

  useEffect(() => {
    const onFocus = () => { if (!drawer && !saving) void loadWeekData().catch((failure) => setError(getErrorMessage(failure, "Unable to refresh schedule."))); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // Use the latest draft, view and week when returning from another tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawer, saving, operations, activeCfiId, revision, localDateKey(weekStart)]);

  function stageOperations(next: ScheduleOperation[]) {
    ++loadGeneration.current;
    setOperations(next);
    batchId.current = crypto.randomUUID();
    setPublishAcknowledged(false);
  }

  async function reviewLatestDraft() {
    setSaving(true);
    try {
      const { start, end } = weekRange();
      const snapshot = await fetchScheduleEditorSnapshot(start, end);
      applyScheduleOperations(snapshot.entries, operations);
      adoptSnapshot(snapshot);
      batchId.current = crypto.randomUUID();
      setPublishAcknowledged(false);
      setError("");
      setMessage("Draft reapplied to the latest schedule. Review every changed lesson and conflict before publishing.");
      setDrawer("publish");
    } catch (failure) { setError(getErrorMessage(failure, "Unable to review the latest schedule.")); }
    finally { setSaving(false); }
  }

  async function discardDraft() {
    setSaving(true);
    try {
      const { start, end } = weekRange();
      const snapshot = await fetchScheduleEditorSnapshot(start, end);
      setOperations([]);
      adoptSnapshot(snapshot);
      setDiscardOpen(false);
      setDrawer(null);
      setError("");
      setMessage("Draft discarded. Published lessons have not changed.");
    } catch (failure) { setError(getErrorMessage(failure, "Unable to refresh schedule.")); }
    finally { setSaving(false); }
  }

  async function enableFeature() {
    if (!userId) return;
    setSaving(true);
    try {
      await updateEnabledFeatureIds(userId, ["cfi_schedule"]);
      setFeatureEnabled(true);
    } catch (enableError) {
      setError(getErrorMessage(enableError, "Unable to add the feature."));
    } finally {
      setSaving(false);
    }
  }

  function openAccessDrawer() {
    setPermissionDraft(cfiAccess.filter((item) => item.access_enabled).map((item) => item.student_user_id));
    setDrawer("access");
  }

  async function applyPermissions() {
    setSaving(true);
    setError("");
    try {
      for (const candidate of linkedCandidates) {
        const shouldEnable = permissionDraft.includes(candidate.student_user_id);
        const existing = cfiAccess.find((item) => item.student_user_id === candidate.student_user_id);
        if (shouldEnable && !existing?.access_enabled) {
          await grantScheduleAccess({
            cfiUserId: userId,
            savedPersonId: candidate.saved_person_id,
            studentUserId: candidate.student_user_id,
          });
        } else if (!shouldEnable && existing?.access_enabled) {
          await revokeScheduleAccess(userId, candidate.student_user_id);
        }
      }
      await loadIdentityData();
      await loadWeekData(userId);
      setDrawer(null);
      setConfirmPermissions(false);
      setMessage("Schedule access updated.");
    } catch (permissionError) {
      setError(getErrorMessage(permissionError, "Unable to update schedule access."));
      setConfirmPermissions(false);
    } finally {
      setSaving(false);
    }
  }

  function requestPermissionApply() {
    const revokes = cfiAccess.some((item) => item.access_enabled && !permissionDraft.includes(item.student_user_id));
    if (revokes) setConfirmPermissions(true);
    else void applyPermissions();
  }

  function openAvailabilityDrawer(scope: "weekly" | "date", weekday = 1, date = localDateKey(new Date())) {
    setAvailabilityScope(scope);
    setAvailabilityWeekday(weekday);
    setAvailabilityDate(date);
    setAutofillDates(true);
    const dateOverride = overrideDates.find((item) => item.student_user_id === userId && item.availability_date === date);
    const dateWeekday = new Date(`${date}T12:00:00`).getDay() || 7;
    const current = slots.filter((slot) =>
      slot.student_user_id === userId && (
        scope === "weekly"
          ? slot.scope === "weekly" && slot.weekday === weekday
          : dateOverride ? slot.scope === "date" && slot.availability_date === date : slot.scope === "weekly" && slot.weekday === dateWeekday
      )
    );
    setAvailabilityRows(current.length
      ? current.map((slot) => ({ start: minutesToTime(slot.start_minute), end: minutesToTime(slot.end_minute) }))
      : dateOverride ? [] : [{ start: "07:00", end: "15:00" }]);
    setDrawer("availability");
  }

  async function saveAvailability() {
    const studentAccess = studentViews.find((item) => item.cfi_user_id === activeCfiId);
    if (!studentAccess) return;
    const normalized = availabilityRows
      .map((row) => ({ startMinute: timeToMinutes(row.start), endMinute: timeToMinutes(row.end) }));
    setSaving(true);
    setError("");
    try {
      const filled = await saveScheduleAvailability({
        cfiUserId: activeCfiId, timezone: browserTimeZone(), scope: availabilityScope,
        weekday: availabilityWeekday, date: availabilityDate, slots: normalized,
        autofill: availabilityScope === "weekly" && autofillDates,
      });
      await loadWeekData(activeCfiId);
      setDrawer(null);
      setMessage(availabilityScope === "weekly" && autofillDates ? `Availability saved. ${filled} matching dates auto-filled; personal date overrides were preserved. Existing lessons did not move.` : "Availability saved. Existing lessons did not move; conflicts are marked for review.");
    } catch (availabilityError) {
      setError(getErrorMessage(availabilityError, "Unable to save availability."));
    } finally {
      setSaving(false);
    }
  }

  async function clearDateOverride() {
    setSaving(true);
    try {
      await removeDateAvailabilityOverride(activeCfiId, userId, availabilityDate);
      await loadWeekData(activeCfiId);
      setDrawer(null);
      setMessage("Date now uses your general availability.");
    } catch (clearError) {
      setError(getErrorMessage(clearError, "Unable to clear the override."));
    } finally {
      setSaving(false);
    }
  }

  function openNewLesson(date = localDateKey(weekStart), start = "08:00") {
    if (!weekReady) return;
    ++loadGeneration.current;
    setLesson({ ...emptyLesson, studentUserId: activeStudents[0]?.student_user_id ?? "", date, start });
    setLessonWarnings([]);
    setDrawer("lesson");
  }

  function openEditLesson(entry: ScheduleEntry) {
    if (!weekReady) return;
    ++loadGeneration.current;
    const start = new Date(entry.start_at);
    const end = new Date(entry.end_at);
    setLesson({
      id: entry.id,
      originalStartAt: entry.start_at,
      studentUserId: entry.student_user_id ?? "",
      kind: entry.lesson_kind ?? "flight",
      date: localDateKey(start),
      start: localDateTimeValue(start).slice(11),
      durationMin: Math.round((end.getTime() - start.getTime()) / 60_000),
      note: entry.note,
    });
    setLessonWarnings([]);
    setDrawer("lesson");
  }

  function lessonTimes() {
    const start = new Date(localDateTimeToIso(lesson.date, lesson.start));
    const end = new Date(localDateTimeToIso(lesson.date, lesson.start, lesson.durationMin));
    return { start, end };
  }

  function lessonOperation(newId = "draft-new-preview"): ScheduleOperation {
    const { start, end } = lessonTimes();
    const values = { start_at: start.toISOString(), end_at: end.toISOString(), lesson_kind: lesson.kind, note: lesson.note };
    if (lesson.id) return { type: "edit", id: lesson.id, values };
    const student = activeStudents.find((item) => item.student_user_id === lesson.studentUserId);
    return { type: "add", entry: {
      ...values, id: newId, entry_type: "lesson", student_user_id: lesson.studentUserId,
      student_name: student?.student_name ?? "Student", auto_generated: false, status: "scheduled", is_own: false,
    } };
  }

  function lessonPreviewChanges() {
    if (!lesson.date || !lesson.start || !lesson.studentUserId) return [];
    return scheduleChanges(entries, applyScheduleOperations(entries, [lessonOperation()]));
  }

  function entryWarnings(entry: ScheduleEntry, schedule = entries) {
    if (entry.entry_type !== "lesson" || entry.status !== "scheduled") return [];
    const start = new Date(entry.start_at);
    const end = new Date(entry.end_at);
    const warnings = getManualConflictWarnings({
      studentUserId: entry.student_user_id ?? "", lessonKind: entry.lesson_kind ?? "flight",
      start, end, slots, overrideDates, blocks,
    });
    const startMinute = start.getHours() * 60 + start.getMinutes();
    if (startMinute < 420 || startMinute > 960) warnings.push("Starts outside the 07:00–16:00 automatic scheduling window.");
    if (localDateKey(start) !== localDateKey(end)) warnings.push("This lesson crosses into another calendar day.");
    const dayLessons = schedule.filter((item) => item.entry_type === "lesson" && item.status === "scheduled" && localDateKey(new Date(item.start_at)) === localDateKey(start));
    if (dayLessons.length && Math.max(...dayLessons.map((item) => Date.parse(item.end_at))) - Math.min(...dayLessons.map((item) => Date.parse(item.start_at))) > 8 * 60 * 60_000) {
      warnings.push("This day's lessons span more than eight hours.");
    }
    return warnings;
  }

  function calculateLessonWarnings() {
    if (!lesson.date || !lesson.start || !lesson.studentUserId) return [];
    const next = applyScheduleOperations(entries, [lessonOperation()]);
    return scheduleChanges(entries, next).flatMap((change) => entryWarnings(change.after, next).map((warning) => `${change.after.student_name}: ${warning}`));
  }

  function saveLesson(force = false) {
    if (!lesson.studentUserId || !lesson.date || !lesson.start) return;
    try {
      const operation = lessonOperation(crypto.randomUUID());
      const next = applyScheduleOperations(entries, [operation]);
      if (scheduleHasOverlap(next)) {
        setError("This draft overlaps another CFI lesson. Adjust the times before adding it to the draft.");
        return;
      }
      const warnings = calculateLessonWarnings();
      if (warnings.length && !force) { setLessonWarnings(warnings); return; }
      stageOperations([...operations, operation]);
      setDrawer(null);
      setLessonWarnings([]);
      setError("");
      setMessage("Changes added to the draft. Students will see them only after you confirm and publish.");
    } catch (failure) { setError(getErrorMessage(failure, "Unable to update the draft.")); }
  }

  function confirmCancelLesson() {
    stageOperations([...operations, { type: "cancel", id: cancelLessonId }]);
    setCancelLessonId("");
    setDrawer(null);
    setMessage("Cancellation added to the draft. No notification has been sent.");
  }

  async function openPublishDrawer() {
    setPublishAcknowledged(false);
    setDrawer("publish");
    await loadWeekData().catch((failure) => setError(getErrorMessage(failure, "Unable to check the latest schedule.")));
  }

  async function publishDraft() {
    if (!changes.length || stale || scheduleHasOverlap(entries)) return;
    setSaving(true);
    setError("");
    try {
      const nextRevision = await publishScheduleDraft(revision, batchId.current, changes.map((change) => change.after));
      setOperations([]);
      setEntries(entries);
      setRevision(nextRevision);
      setDrawer(null);
      setMessage("Schedule published. Each affected student receives at most one notification, according to their preferences.");
      const { start, end } = weekRange();
      try { adoptSnapshot(await fetchScheduleEditorSnapshot(start, end)); }
      catch { setError("Published successfully, but the refreshed schedule could not be loaded. Use Refresh."); }
    } catch (failure) {
      if (failure && typeof failure === "object" && "code" in failure && failure.code === "PT409") setStale(true);
      setError(getErrorMessage(failure, "Unable to publish. Your draft is still available; you can retry."));
    } finally { setSaving(false); }
  }

  async function saveBlock(keepAutoOpen = false) {
    setSaving(true);
    setError("");
    try {
      await createUnavailableBlock({
        cfi_user_id: userId,
        start_at: localDateTimeToIso(blockForm.date, blockForm.start),
        end_at: localDateTimeToIso(blockForm.date, blockForm.end),
        note: blockForm.note,
      });
      await loadWeekData(userId);
      setBlockForm((current) => ({ ...current, note: "" }));
      if (!keepAutoOpen) setDrawer(null);
      setMessage("Unavailable block added.");
    } catch (blockError) {
      setError(getErrorMessage(blockError, "Unable to add the block."));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteBlock() {
    setSaving(true);
    try {
      await deleteUnavailableBlock(deleteBlockId);
      await loadWeekData(userId);
      setDeleteBlockId("");
      setMessage("Unavailable block removed.");
    } catch (blockError) {
      setError(getErrorMessage(blockError, "Unable to remove the block."));
    } finally {
      setSaving(false);
    }
  }

  function openAutoDrawer() {
    if (!weekReady) return;
    ++loadGeneration.current;
    setAutoDrafts([]);
    setAutoUnscheduled([]);
    setBlockForm({ date: localDateKey(weekStart), start: "07:00", end: "09:00", note: "" });
    setDrawer("auto");
  }

  function buildAutomaticPreview() {
    const result = generateAutomaticSchedule({
      cfiUserId: userId,
      weekStart,
      includeWeekends,
      access: activeStudents,
      weekOverrides,
      slots,
      overrideDates,
      existingEntries: entries,
      blocks,
    });
    setAutoDrafts(result.drafts);
    setAutoUnscheduled(result.unscheduled);
  }

  async function confirmAutomaticSchedule() {
    setError("");
    try {
      const additions: ScheduleOperation[] = autoDrafts.map((draft) => ({ type: "add", entry: {
        id: crypto.randomUUID(), entry_type: "lesson", student_user_id: draft.student_user_id,
        student_name: draft.student_name, lesson_kind: "flight", start_at: draft.start_at,
        end_at: draft.end_at, note: draft.note, auto_generated: true, status: "scheduled", is_own: false,
      } }));
      stageOperations([...operations, ...additions]);
      setDrawer(null);
      setMessage(`${autoDrafts.length} Flight lessons added to the draft. Review and publish when ready.`);
    } catch (autoError) {
      setError(getErrorMessage(autoError, "Unable to save the generated schedule."));
    }
  }

  function openStudentSettings(student: ScheduleAccess) {
    const weekOverride = weekOverrides.find((item) => item.student_user_id === student.student_user_id);
    setSettingsStudentId(student.student_user_id);
    setSettingsForm({
      weeklySessions: student.default_weekly_sessions,
      durationMin: student.default_duration_min,
      color: student.color,
      useWeekOverride: Boolean(weekOverride),
      weekSessions: weekOverride?.target_sessions ?? student.default_weekly_sessions,
      weekDurationMin: weekOverride?.duration_min ?? student.default_duration_min,
    });
    setDrawer("settings");
  }

  async function saveStudentSettings() {
    setSaving(true);
    setError("");
    try {
      await updateStudentScheduleDefaults({
        cfiUserId: userId,
        studentUserId: settingsStudentId,
        weeklySessions: settingsForm.weeklySessions,
        durationMin: settingsForm.durationMin,
        color: settingsForm.color,
      });
      if (settingsForm.useWeekOverride) {
        await upsertWeekOverride({
          cfi_user_id: userId,
          student_user_id: settingsStudentId,
          week_start: localDateKey(weekStart),
          target_sessions: settingsForm.weekSessions,
          duration_min: settingsForm.weekDurationMin,
        });
      } else {
        await removeWeekOverride(userId, settingsStudentId, localDateKey(weekStart));
      }
      await loadIdentityData();
      await loadWeekData(userId);
      setDrawer(null);
      setMessage("Student schedule settings saved.");
    } catch (settingsError) {
      setError(getErrorMessage(settingsError, "Unable to save student settings."));
    } finally {
      setSaving(false);
    }
  }

  function renderChangePreview(items: ScheduleChange[], schedule = entries) {
    return <div className="max-w-full overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[380px] text-left text-xs"><thead className="bg-slate-50"><tr><th className="p-2">Student</th><th className="p-2">Before</th><th className="p-2">After</th></tr></thead><tbody>{items.map(({ before, after }) => <tr key={after.id} className="border-t border-slate-100 align-top"><td className="p-2 font-semibold">{after.student_name}</td><td className="p-2">{before ? <>{formatDate(new Date(before.start_at))}<br />{formatTime(before.start_at)}–{formatTime(before.end_at)}<br />{before.lesson_kind}</> : "New lesson"}</td><td className="p-2">{after.status === "cancelled" ? <span className="text-rose-700">Cancelled</span> : <>{formatDate(new Date(after.start_at))}<br />{formatTime(after.start_at)}–{formatTime(after.end_at)}<br />{after.lesson_kind}{before?.note !== after.note ? <p className="mt-1 break-words">Note: {after.note || "Removed"}</p> : null}{entryWarnings(after, schedule).map((warning) => <p key={warning} className="mt-1 text-amber-800">⚠ {warning}</p>)}</>}</td></tr>)}</tbody></table></div>;
  }

  if (featureEnabled === null || loading) return <div className="saas-panel">Loading CFI schedule…</div>;
  if (!featureEnabled) {
    return (
      <section className="saas-panel">
        <p className="saas-kicker">Optional personal feature</p>
        <h1 className="tools-child-title">CFI Schedule</h1>
        <p className="saas-meta-text mt-2 max-w-2xl">Add this feature to coordinate linked students, availability, lessons, and unavailable flight-resource periods.</p>
        <button type="button" className="primary-button mt-5" disabled={saving} onClick={() => void enableFeature()}>{saving ? "Adding…" : "Add CFI Schedule"}</button>
      </section>
    );
  }

  const displayDays = Array.from({ length: includeWeekends ? 7 : 5 }, (_, index) => addCalendarDays(weekStart, index));
  const publishWarnings = changes.flatMap((change) => entryWarnings(change.after));
  const previewChanges = drawer === "lesson" ? lessonPreviewChanges() : [];
  const lessonPreviewEntries = drawer === "lesson" && lesson.date && lesson.start && lesson.studentUserId ? applyScheduleOperations(entries, [lessonOperation()]) : entries;
  const fillCandidates = Array.from({ length: 28 }, (_, index) => addCalendarDays(new Date(), index)).filter((date) => (date.getDay() || 7) === availabilityWeekday);
  const preservedDates = fillCandidates.filter((date) => overrideDates.some((item) => item.student_user_id === userId && item.availability_date === localDateKey(date) && item.source !== "auto"));

  return (
    <div className="space-y-4">
      <section className="saas-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="saas-kicker">Personal workspace</p>
            <h1 className="tools-child-title">CFI Schedule</h1>
            <p className="saas-meta-text mt-2">Times are shown in {browserTimeZone()} using this browser.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {studentViews.length ? (
              <select className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm" value={viewKey} disabled={hasDraft || saving} onChange={(event) => setViewKey(event.target.value)} aria-label="Schedule view">
                <option value="cfi">My CFI schedule</option>
                {studentViews.map((item) => <option key={item.cfi_user_id} value={item.cfi_user_id}>Student view · {item.cfi_name}</option>)}
              </select>
            ) : null}
            {isCfiView ? <button className="secondary-button" type="button" disabled={hasDraft || saving} onClick={openAccessDrawer}>Manage access</button> : null}
            {isCfiView ? <button className="secondary-button" type="button" disabled={!activeStudents.length || !weekReady || saving} onClick={() => openNewLesson()}>Add lesson</button> : null}
            {isCfiView ? <button className="secondary-button" type="button" disabled={hasDraft || saving} onClick={() => setDrawer("block")}>Add unavailable</button> : null}
            {isCfiView ? <button className="primary-button" type="button" disabled={!activeStudents.length || !weekReady || saving} onClick={openAutoDrawer}>Auto schedule</button> : null}
            {!isCfiView ? <button className="primary-button" type="button" disabled={!weekReady} onClick={() => openAvailabilityDrawer("weekly", 1)}>Manage availability</button> : null}
          </div>
        </div>
        {message ? <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p> : null}
        {error ? <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}
        {hasDraft ? <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3"><p className="text-sm font-semibold text-blue-900">Unpublished draft · {changes.length} changed lesson(s)</p><p className="mt-1 text-xs text-blue-800">Only you can see these changes. Publish or discard before switching weeks or editing access/resources.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className="primary-button" disabled={saving || !changes.length} onClick={() => void openPublishDrawer()}>Review &amp; publish</button><button type="button" className="secondary-button" disabled={saving} onClick={() => stageOperations(operations.slice(0, -1))}>Undo last edit</button><button type="button" className="ghost-button" disabled={saving} onClick={() => setDiscardOpen(true)}>Discard draft</button></div>{stale ? <p role="alert" className="mt-2 text-sm text-amber-900">The schedule or availability changed elsewhere. <button type="button" className="underline" disabled={saving} onClick={() => void reviewLatestDraft()}>Review latest and reapply draft</button></p> : null}</div> : null}
      </section>

      <section className="saas-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-950">{activeCfiName}</p>
            <p className="text-xs text-slate-500">{formatDate(weekStart)} – {formatDate(addCalendarDays(weekStart, includeWeekends ? 6 : 4))}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="ghost-button" type="button" disabled={saving} onClick={() => void loadWeekData().catch((failure) => setError(getErrorMessage(failure, "Unable to refresh.")))}>Refresh</button>
            <button className="ghost-button" type="button" disabled={hasDraft || saving} onClick={() => setWeekStart(addCalendarDays(weekStart, -7))}>Previous</button>
            <button className="ghost-button" type="button" disabled={hasDraft || saving} onClick={() => setWeekStart(getWeekStart())}>Current week</button>
            <button className="ghost-button" type="button" disabled={hasDraft || saving} onClick={() => setWeekStart(addCalendarDays(weekStart, 7))}>Next</button>
            <label className="ml-2 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={includeWeekends} onChange={(event) => setIncludeWeekends(event.target.checked)} /> Show weekend</label>
          </div>
        </div>

        <div className="lg:hidden"><label className="saas-field mt-4"><span>Day view</span><select aria-label="Day view" value={Math.min(mobileDayIndex, displayDays.length - 1)} onChange={(event) => setMobileDayIndex(Number(event.target.value))}>{displayDays.map((day, index) => <option key={index} value={index}>{weekdayLabels[index]} · {formatDate(day)}</option>)}</select></label></div>
        {!weekReady ? <p role="status" className="mt-3 text-sm text-slate-500">Loading week…</p> : null}
        <div className="mt-4 grid gap-3 lg:grid-cols-5">
          {displayDays.map((day, dayIndex) => {
            const dayEntries = entries.filter((entry) => localDateKey(new Date(entry.start_at)) === localDateKey(day));
            return (
              <section key={localDateKey(day)} className={`min-w-0 rounded-2xl border border-slate-200 bg-slate-50/50 p-3 ${dayIndex === Math.min(mobileDayIndex, displayDays.length - 1) ? "" : "hidden lg:block"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(day)}</p><p className="text-sm font-semibold text-slate-900">{formatDate(day)}</p></div>
                  {isCfiView ? <button className="text-xs font-semibold text-blue-700" type="button" disabled={!weekReady} onClick={() => openNewLesson(localDateKey(day))}>＋</button> : <button className="text-xs font-semibold text-blue-700" type="button" disabled={!weekReady} onClick={() => openAvailabilityDrawer("date", 1, localDateKey(day))}>Edit</button>}
                </div>
                <div className="mt-3 grid gap-2">
                  {!dayEntries.length ? <p className="rounded-xl border border-dashed border-slate-200 px-2 py-4 text-center text-xs text-slate-400">Open</p> : dayEntries.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      disabled={!isCfiView || !weekReady || entry.entry_type !== "lesson"}
                      onClick={() => entry.entry_type === "lesson" && openEditLesson(entry)}
                      className={`rounded-xl border p-2 text-left text-xs ${entry.entry_type === "lesson" ? "border-sky-200 bg-white" : "border-slate-300 bg-slate-100 text-slate-500"}`}
                      style={entry.entry_type === "lesson" && entry.student_user_id ? { borderLeftColor: cfiAccess.find((item) => item.student_user_id === entry.student_user_id)?.color, borderLeftWidth: 4 } : undefined}
                    >
                      <span className="block font-semibold">{entry.entry_type === "lesson" ? entry.student_name : "Unavailable"}</span>
                      <span className="mt-1 block">{formatTime(entry.start_at)}–{formatTime(entry.end_at)}</span>
                      {entry.lesson_kind ? <span className="mt-1 block capitalize text-slate-500">{entry.lesson_kind}</span> : null}
                      {changes.some((change) => change.after.id === entry.id) ? <span className="mt-1 block font-semibold text-blue-700">Unpublished draft</span> : null}
                      {entryWarnings(entry).map((warning) => <span key={warning} className="mt-1 block text-amber-800">⚠ {warning}</span>)}
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </section>

      {isCfiView ? (
        <section className="saas-panel">
          <div className="flex items-center justify-between gap-3"><div><h2 className="saas-subsection-title">Students</h2><p className="saas-meta-text mt-1">General targets can be overridden for the selected week.</p></div><span className="text-xs text-slate-500">{activeStudents.length} active</span></div>
          {!activeStudents.length ? <EmptyState title="No students have schedule access" description="Link student accounts in People, then use Manage access to enable scheduling." /> : (
            <div className="mt-4 max-w-full overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead><tr className="border-b border-slate-200 text-slate-500"><th className="py-2">Student</th><th>Weekly target</th><th>Duration</th><th>Availability this week</th><th className="text-right">Action</th></tr></thead><tbody>{activeStudents.map((student) => {
              const override = weekOverrides.find((item) => item.student_user_id === student.student_user_id);
              const availabilityCount = displayDays.filter((day) => availabilityForDate({ date: day, studentUserId: student.student_user_id, slots, overrideDates }).length > 0).length;
              return <tr key={student.student_user_id} className="border-b border-slate-100"><td className="py-2 font-semibold text-slate-900"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: student.color }} />{student.student_name}</td><td>{override?.target_sessions ?? student.default_weekly_sessions}{override ? " · override" : ""}</td><td>{override?.duration_min ?? student.default_duration_min} min</td><td>{availabilityCount} day{availabilityCount === 1 ? "" : "s"}</td><td className="text-right"><button className="ghost-button" type="button" disabled={hasDraft || saving} onClick={() => openStudentSettings(student)}>Settings</button></td></tr>;
            })}</tbody></table></div>
          )}
        </section>
      ) : (
        <section className="saas-panel">
          <h2 className="saas-subsection-title">Your general availability</h2>
          <p className="saas-meta-text mt-1">Editing availability never moves or cancels an existing lesson. Conflicts are marked for your instructor to review. Each period must be at least two hours.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{weekdayLabels.map((label, index) => {
            const weekday = index + 1;
            const weeklySlots = slots.filter((slot) => slot.student_user_id === userId && slot.scope === "weekly" && slot.weekday === weekday);
            return <button key={label} type="button" className="rounded-xl border border-slate-200 p-3 text-left" onClick={() => openAvailabilityDrawer("weekly", weekday)}><span className="block text-xs font-semibold text-slate-900">{label}</span><span className="mt-1 block text-xs text-slate-500">{weeklySlots.length ? weeklySlots.map((slot) => `${minutesToTime(slot.start_minute)}–${minutesToTime(slot.end_minute)}`).join(", ") : "Unavailable"}</span></button>;
          })}</div>
        </section>
      )}

      <DetailDrawer open={drawer === "access"} onClose={() => setDrawer(null)} title="Manage schedule access" description="Enable scheduling only for linked student accounts.">
        <div className="grid gap-2">
          {!linkedCandidates.length ? <p className="saas-empty-state">No accepted student account links are available. Link a student from People first.</p> : linkedCandidates.map((candidate) => (
            <label key={candidate.student_user_id} className="flex items-center gap-3 border-b border-slate-100 py-3 text-sm"><input type="checkbox" checked={permissionDraft.includes(candidate.student_user_id)} onChange={(event) => setPermissionDraft((current) => event.target.checked ? [...current, candidate.student_user_id] : current.filter((id) => id !== candidate.student_user_id))} /><span className="font-semibold text-slate-900">{candidate.student_name}</span><span className="ml-auto"><StatusBadge tone={permissionDraft.includes(candidate.student_user_id) ? "success" : "neutral"}>{permissionDraft.includes(candidate.student_user_id) ? "Access" : "No access"}</StatusBadge></span></label>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2"><button className="ghost-button" type="button" onClick={() => setDrawer(null)}>Cancel</button><button className="primary-button" type="button" disabled={saving} onClick={requestPermissionApply}>Apply changes</button></div>
      </DetailDrawer>

      <DetailDrawer open={drawer === "availability"} onClose={() => setDrawer(null)} title={availabilityScope === "weekly" ? "General availability" : "Date availability"} description="Auto-fill matching weekdays over the next four weeks; individually edited dates are preserved. Availability changes do not move existing lessons.">
        {error ? <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p> : null}
        {availabilityScope === "weekly" ? <div className="mb-4 rounded-xl bg-blue-50 p-3 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={autofillDates} onChange={(event) => setAutofillDates(event.target.checked)} />Auto-fill other dates</label><p className="mt-1 text-xs text-slate-600">{fillCandidates.map((date) => formatDate(date)).join(" · ")}</p><p className="mt-1 text-xs text-slate-600">{preservedDates.length} individually edited date(s) will be kept unchanged.</p></div> : <p className="mb-3 text-xs text-slate-500">Saving this date makes it a personal exception; future auto-fill will not overwrite it.</p>}
        <div className="grid gap-4">
          {availabilityScope === "weekly" ? <label className="saas-field"><span>Weekday</span><select value={availabilityWeekday} onChange={(event) => { const day = Number(event.target.value); setAvailabilityWeekday(day); openAvailabilityDrawer("weekly", day); }}>{weekdayLabels.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</select></label> : <label className="saas-field"><span>Date</span><input type="date" min={localDateKey(new Date())} max={maxAvailabilityDate} value={availabilityDate} onChange={(event) => openAvailabilityDrawer("date", 1, event.target.value)} /></label>}
          {availabilityRows.map((row, index) => <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2"><label className="saas-field"><span>Start</span><input type="time" value={row.start} onChange={(event) => setAvailabilityRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, start: event.target.value } : item))} /></label><label className="saas-field"><span>End</span><input type="text" inputMode="numeric" placeholder="HH:MM (24:00 = midnight)" value={row.end} onChange={(event) => setAvailabilityRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, end: event.target.value } : item))} /></label><button className="ghost-button" type="button" onClick={() => setAvailabilityRows((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button></div>)}
          <button className="secondary-button justify-self-start" type="button" onClick={() => setAvailabilityRows((current) => [...current, { start: "07:00", end: "15:00" }])}>＋ Add period</button>
          <button className="ghost-button justify-self-start" type="button" onClick={() => setAvailabilityRows([{ start: "00:00", end: "24:00" }])}>Available all day</button>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">{availabilityScope === "date" && overrideDates.some((item) => item.student_user_id === userId && item.availability_date === availabilityDate) ? <button className="ghost-button" type="button" disabled={saving} onClick={() => void clearDateOverride()}>Use general rule</button> : null}<button className="ghost-button" type="button" onClick={() => setDrawer(null)}>Cancel</button><button className="primary-button" type="button" disabled={saving} onClick={() => void saveAvailability()}>{saving ? "Saving…" : "Apply"}</button></div>
      </DetailDrawer>

      <DetailDrawer open={drawer === "lesson"} onClose={() => setDrawer(null)} title={lesson.id ? "Edit lesson draft" : "Add lesson draft"} description="Moving any lesson within its day moves all later lessons by the same amount. Review the times below. Nothing is published until you confirm the full draft.">
        {error ? <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p> : null}
        <div className="grid gap-4"><label className="saas-field"><span>Student</span><select value={lesson.studentUserId} disabled={Boolean(lesson.id)} onChange={(event) => { setLessonWarnings([]); setLesson((current) => ({ ...current, studentUserId: event.target.value })); }}><option value="">Select student</option>{activeStudents.map((student) => <option key={student.student_user_id} value={student.student_user_id}>{student.student_name}</option>)}</select></label><div className="grid grid-cols-2 gap-3"><label className="saas-field"><span>Date</span><input type="date" value={lesson.date} onChange={(event) => { setLessonWarnings([]); setLesson((current) => ({ ...current, date: event.target.value })); }} /></label><label className="saas-field"><span>Start</span><input type="time" step={900} value={lesson.start} onChange={(event) => { setLessonWarnings([]); setLesson((current) => ({ ...current, start: event.target.value })); }} /></label></div><div className="grid grid-cols-2 gap-3"><label className="saas-field"><span>Type</span><select value={lesson.kind} onChange={(event) => { setLessonWarnings([]); setLesson((current) => ({ ...current, kind: event.target.value as LessonKind })); }}><option value="flight">Flight</option><option value="ground">Ground</option></select></label><label className="saas-field"><span>Duration</span><select value={lesson.durationMin} onChange={(event) => { setLessonWarnings([]); setLesson((current) => ({ ...current, durationMin: Number(event.target.value) })); }}>{[60, 90, 120, 150, 180, 240].map((value) => <option key={value} value={value}>{value} minutes</option>)}</select></label></div><label className="saas-field"><span>Note</span><textarea rows={3} maxLength={500} value={lesson.note} onChange={(event) => { setLessonWarnings([]); setLesson((current) => ({ ...current, note: event.target.value })); }} /></label>{previewChanges.length ? <div><p className="mb-2 text-sm font-semibold">Changes in this edit · {previewChanges.length} lesson(s)</p>{renderChangePreview(previewChanges, lessonPreviewEntries)}</div> : null}{lessonWarnings.length ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p className="font-semibold">Conflict warning</p><ul className="mt-1 list-disc pl-5">{lessonWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div> : null}</div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">{lesson.id ? <button className="danger-button mr-auto" type="button" onClick={() => setCancelLessonId(lesson.id)}>Cancel lesson</button> : null}<button className="ghost-button" type="button" onClick={() => setDrawer(null)}>Close</button><button className="primary-button" type="button" disabled={saving || !lesson.studentUserId} onClick={() => void saveLesson(lessonWarnings.length > 0)}>{lessonWarnings.length ? "Add to draft anyway" : "Add changes to draft"}</button></div>
      </DetailDrawer>

      <DetailDrawer open={drawer === "publish"} onClose={() => { if (!saving) setDrawer(null); }} title="Review & publish schedule" description="Review the final changes, not intermediate edits. Each affected student receives at most one notification, according to their preferences.">
        {error ? <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p> : null}
        {stale ? <div role="alert" className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><p>The published schedule or availability changed. Your draft has not overwritten anything.</p><button className="secondary-button mt-2" type="button" disabled={saving} onClick={() => void reviewLatestDraft()}>Load latest &amp; rebuild preview</button></div> : null}
        {renderChangePreview(changes)}
        {scheduleHasOverlap(entries) ? <p role="alert" className="mt-3 text-sm text-rose-700">The rebuilt draft contains overlapping CFI lessons. Close this preview and adjust the conflicting lessons before publishing.</p> : null}
        {publishWarnings.length ? <label className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><input type="checkbox" checked={publishAcknowledged} onChange={(event) => setPublishAcknowledged(event.target.checked)} /><span>I reviewed the availability, resource and time-limit warnings and want to publish anyway.</span></label> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2"><button className="ghost-button" type="button" disabled={saving} onClick={() => setDrawer(null)}>Keep editing</button><button className="primary-button" type="button" disabled={saving || stale || !changes.length || scheduleHasOverlap(entries) || (publishWarnings.length > 0 && !publishAcknowledged)} onClick={() => void publishDraft()}>{saving ? "Publishing…" : "Confirm & notify students"}</button></div>
      </DetailDrawer>

      <DetailDrawer open={drawer === "block"} onClose={() => setDrawer(null)} title="Add unavailable block" description="Unavailable blocks warn on manual Flight lessons and are excluded from automatic scheduling.">
        <BlockForm value={blockForm} onChange={setBlockForm} />
        <div className="mt-5 flex justify-end gap-2"><button className="ghost-button" type="button" onClick={() => setDrawer(null)}>Cancel</button><button className="primary-button" type="button" disabled={saving} onClick={() => void saveBlock()}>{saving ? "Saving…" : "Add block"}</button></div>
        <BlockList blocks={blocks} onDelete={setDeleteBlockId} />
      </DetailDrawer>

      <DetailDrawer open={drawer === "auto"} onClose={() => setDrawer(null)} title="Automatic scheduling" description="Only Flight lessons are generated. Review unavailable time first, then add the preview to your unpublished draft.">
        <section className="rounded-xl border border-slate-200 p-3"><h3 className="text-sm font-semibold text-slate-900">1. Review unavailable time</h3><div className="mt-3"><BlockForm value={blockForm} onChange={setBlockForm} /></div><button className="secondary-button mt-3" type="button" disabled={saving || hasDraft} onClick={() => void saveBlock(true)}>Add block</button><BlockList blocks={blocks} onDelete={(id) => { if (!hasDraft) setDeleteBlockId(id); }} />{hasDraft ? <p className="mt-2 text-xs text-slate-500">Publish or discard the current draft before changing resource blocks.</p> : null}</section>
        <section className="mt-4 rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-slate-900">2. Generate preview</h3><p className="mt-1 text-xs text-slate-500">Starts are considered from 07:00 through 16:00. Existing lessons stay in place.</p></div><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={includeWeekends} onChange={(event) => setIncludeWeekends(event.target.checked)} /> Include weekend</label></div><button className="primary-button mt-3" type="button" onClick={buildAutomaticPreview}>Generate preview</button></section>
        {autoDrafts.length || autoUnscheduled.length ? <section className="mt-4 rounded-xl border border-slate-200 p-3"><h3 className="text-sm font-semibold text-slate-900">3. Confirm</h3><div className="mt-3 grid gap-2">{autoDrafts.map((draft) => <div key={`${draft.student_user_id}-${draft.start_at}`} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs"><span className="font-semibold">{draft.student_name}</span><span>{formatDate(new Date(draft.start_at))} · {formatTime(draft.start_at)}–{formatTime(draft.end_at)}</span></div>)}</div>{autoUnscheduled.map((item) => <p key={item.studentName} className="mt-2 text-xs text-amber-800">{item.studentName}: {item.remaining} unscheduled. {item.reason}</p>)}<button className="primary-button mt-4" type="button" disabled={saving || !autoDrafts.length} onClick={() => void confirmAutomaticSchedule()}>{saving ? "Saving…" : `Add ${autoDrafts.length} Flight lessons to draft`}</button></section> : null}
      </DetailDrawer>

      <DetailDrawer open={drawer === "settings"} onClose={() => setDrawer(null)} title="Student schedule settings" description="Set the general target and optional override for the selected week.">
        <div className="grid gap-4"><div className="grid grid-cols-2 gap-3"><label className="saas-field"><span>General weekly sessions</span><input type="number" min={0} max={14} value={settingsForm.weeklySessions} onChange={(event) => setSettingsForm((current) => ({ ...current, weeklySessions: Number(event.target.value) }))} /></label><label className="saas-field"><span>Default duration</span><select value={settingsForm.durationMin} onChange={(event) => setSettingsForm((current) => ({ ...current, durationMin: Number(event.target.value) }))}>{[60, 90, 120, 150, 180, 240].map((value) => <option key={value} value={value}>{value} minutes</option>)}</select></label></div><label className="saas-field"><span>Calendar color</span><input type="color" value={settingsForm.color} onChange={(event) => setSettingsForm((current) => ({ ...current, color: event.target.value }))} /></label><label className="flex items-center gap-2 text-sm font-semibold text-slate-800"><input type="checkbox" checked={settingsForm.useWeekOverride} onChange={(event) => setSettingsForm((current) => ({ ...current, useWeekOverride: event.target.checked }))} /> Override {formatDate(weekStart)} week</label>{settingsForm.useWeekOverride ? <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 p-3"><label className="saas-field"><span>Week sessions</span><input type="number" min={0} max={14} value={settingsForm.weekSessions} onChange={(event) => setSettingsForm((current) => ({ ...current, weekSessions: Number(event.target.value) }))} /></label><label className="saas-field"><span>Week duration</span><select value={settingsForm.weekDurationMin} onChange={(event) => setSettingsForm((current) => ({ ...current, weekDurationMin: Number(event.target.value) }))}>{[60, 90, 120, 150, 180, 240].map((value) => <option key={value} value={value}>{value} minutes</option>)}</select></label></div> : null}</div>
        <div className="mt-5 flex justify-end gap-2"><button className="ghost-button" type="button" onClick={() => setDrawer(null)}>Cancel</button><button className="primary-button" type="button" disabled={saving} onClick={() => void saveStudentSettings()}>Apply</button></div>
      </DetailDrawer>

      <ConfirmDialog open={confirmPermissions} title="Update schedule access?" description="Students whose access is removed will stop seeing this schedule. Existing schedule data is retained." confirmLabel="Apply changes" busy={saving} destructive onCancel={() => setConfirmPermissions(false)} onConfirm={() => void applyPermissions()} />
      <ConfirmDialog open={Boolean(cancelLessonId)} title="Cancel this lesson?" description="This cancellation stays in your draft. The student is notified only when you publish the final changes." confirmLabel="Cancel lesson" busy={saving} destructive onCancel={() => setCancelLessonId("")} onConfirm={() => void confirmCancelLesson()} />
      <ConfirmDialog open={discardOpen} title="Discard unpublished changes?" description="Your published schedule stays unchanged. All edits in this draft will be removed." confirmLabel="Discard draft" busy={saving} destructive onCancel={() => setDiscardOpen(false)} onConfirm={() => void discardDraft()} />
      <ConfirmDialog open={Boolean(deleteBlockId)} title="Remove unavailable block?" description="Automatic scheduling will be able to use this time again." confirmLabel="Remove block" busy={saving} destructive onCancel={() => setDeleteBlockId("")} onConfirm={() => void confirmDeleteBlock()} />
    </div>
  );
}

function BlockForm({ value, onChange }: { value: { date: string; start: string; end: string; note: string }; onChange: (value: { date: string; start: string; end: string; note: string }) => void }) {
  return <div className="grid gap-3"><div className="grid grid-cols-3 gap-2"><label className="saas-field"><span>Date</span><input type="date" value={value.date} onChange={(event) => onChange({ ...value, date: event.target.value })} /></label><label className="saas-field"><span>Start</span><input type="time" value={value.start} onChange={(event) => onChange({ ...value, start: event.target.value })} /></label><label className="saas-field"><span>End</span><input type="time" value={value.end} onChange={(event) => onChange({ ...value, end: event.target.value })} /></label></div><label className="saas-field"><span>Reason</span><input maxLength={300} value={value.note} placeholder="Reserved, maintenance, or other" onChange={(event) => onChange({ ...value, note: event.target.value })} /></label></div>;
}

function BlockList({ blocks, onDelete }: { blocks: UnavailableBlock[]; onDelete: (id: string) => void }) {
  if (!blocks.length) return <p className="mt-4 text-xs text-slate-500">No unavailable blocks this week.</p>;
  return <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100">{blocks.map((block) => <div key={block.id} className="flex items-center justify-between gap-3 py-2 text-xs"><span><strong>{formatDate(new Date(block.start_at))}</strong> · {formatTime(block.start_at)}–{formatTime(block.end_at)}{block.note ? ` · ${block.note}` : ""}</span><button className="text-xs font-semibold text-rose-700" type="button" onClick={() => onDelete(block.id)}>Remove</button></div>)}</div>;
}
