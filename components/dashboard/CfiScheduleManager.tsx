"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { ConfirmDialog, DetailDrawer, EmptyState } from "@/components/admin/AdminConsole";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import ScheduleMenu from "./ScheduleMenu";
import styles from "./CfiScheduleManager.module.css";
import {
  addCalendarDays,
  availabilityEndToMinutes,
  availabilityForDate,
  browserTimeZone,
  createUnavailableBlock,
  createInstructorTimeOff,
  clearPersonAvailabilityDate,
  setPersonScheduleAccess,
  savePersonScheduleSettings,
  deleteUnavailableBlock,
  deleteInstructorTimeOff,
  fetchScheduleAccess,
  fetchScheduleEditorSnapshot,
  fetchInstructorScheduleSettings,
  fetchAvailabilityReview,
  confirmAvailabilityReview,
  type AvailabilityReview,
  generateAutomaticSchedule,
  getManualConflictWarnings,
  getWeekStart,
  grantScheduleAccess,
  localDateKey,
  minutesToTime,
  minutesToAvailabilityEnd,
  normalizeAvailabilityTimeRows,
  publishScheduleDraft,
  saveScheduleAircraftPreferences,
  saveTeachingRules,
  removeDateAvailabilityOverride,
  removeWeekOverride,
  saveScheduleAvailability,
  revokeScheduleAccess,
  timeToMinutes,
  updateStudentScheduleDefaults,
  updateUnavailableBlock,
  upsertWeekOverride,
  type AvailabilityOverrideDate,
  type AvailabilitySlot,
  type AutomaticScheduleRequest,
  type AutomaticScheduleUnscheduled,
  type AircraftReservation,
  type ScheduleAircraft,
  type ScheduleAircraftPreference,
  type ScheduleAssignmentInstructor,
  type LessonKind,
  type LinkedScheduleCandidate,
  type ScheduleAccess,
  type ScheduleDraft,
  type ScheduleEntry,
  type ScheduleEditorSnapshot,
  type UnavailableBlock,
  type TeachingRules,
  type InstructorTimeOff,
  defaultTeachingRules,
  type WeekOverride,
} from "@/lib/cfi-schedule";
import { applyScheduleOperations, moveScheduleLesson, scheduleChanges, scheduleConflictsForLesson, scheduleHasOverlap, swapScheduleLessons, type ScheduleOperation, type ScheduleChange } from "@/lib/cfi-schedule-drafts";
import { fetchEnabledFeatureIds, fetchScheduleEligibility, updateEnabledFeatureIds, type ScheduleEligibility } from "@/lib/dashboard-preferences";
import { fetchSavedPeople, fetchSavedPersonAccountLinks } from "@/lib/saved-people";
import { compareAircraftLabels, groupByAircraftFamily } from "@/lib/aircraft-family";

type DrawerMode = "review" | "students" | "availability-overview" | "weekly" | "details" | "access" | "availability" | "aircraft-preferences" | "lesson" | "block" | "auto" | "teaching" | "settings" | "publish" | null;
type AvailabilityRow = { start: string; end: string };
type WeeklyAvailabilityRows = Record<number, AvailabilityRow[]>;
type AutoRequestRow = AutomaticScheduleRequest & { selected: boolean };

const weekdayLabels = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const emptyWeeklyAvailability = (): WeeklyAvailabilityRows => Object.fromEntries(weekdayLabels.map((_, index) => [index + 1, []]));
const emptyLesson = {
  id: "",
  originalStartAt: "",
  studentUserId: "",
  kind: "flight" as LessonKind,
  date: "",
  start: "08:00",
  durationMin: 120,
  note: "",
  aircraftId: "",
  assignedInstructorId: "",
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

function showNativePicker(input: HTMLInputElement) {
  if (input.disabled) return;
  try {
    input.showPicker?.();
  } catch {
    // A normal click still opens the platform picker when showPicker is unavailable.
  }
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

function lessonDropMode(clientY: number, top: number, height: number, allowSwap: boolean): "before" | "swap" | "after" {
  const ratio = height > 0 ? (clientY - top) / height : 0.5;
  if (!allowSwap) return ratio < 0.5 ? "before" : "after";
  if (ratio < 0.3) return "before";
  if (ratio > 0.7) return "after";
  return "swap";
}

function updateTeachingWindow(current: TeachingRules, startMinute: number, endMinute: number): TeachingRules {
  const windowMinutes = endMinute - startMinute;
  return {
    ...current,
    start_minute: startMinute,
    end_minute: endMinute,
    latest_start_minute: Math.max(startMinute, endMinute - 1),
    max_daily_span_min: Math.max(1, windowMinutes),
    max_daily_teaching_min: windowMinutes > 0 ? Math.min(current.max_daily_teaching_min, windowMinutes) : current.max_daily_teaching_min,
  };
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
  const [operationBatchSizes, setOperationBatchSizes] = useState<number[]>([]);
  const [revision, setRevision] = useState("0");
  const [loadedContext, setLoadedContext] = useState("");
  const [stale, setStale] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [publishAcknowledged, setPublishAcknowledged] = useState(false);
  const batchId = useRef("");
  const loadGeneration = useRef(0);
  const [selectedDate, setSelectedDate] = useState(() => localDateKey(new Date()));
  const [agendaStart, setAgendaStart] = useState(() => localDateKey(new Date()));
  const [agendaDays, setAgendaDays] = useState(14);
  const [layout, setLayout] = useState<"list" | "calendar">("calendar");
  const layoutWasSelected = useRef(false);
  const [eligibility, setEligibility] = useState<ScheduleEligibility | null>(null);
  const [availabilityReview, setAvailabilityReview] = useState<AvailabilityReview | null>(null);
  const [reviewChecked, setReviewChecked] = useState(false);
  const [drawerReturn, setDrawerReturn] = useState<DrawerMode>(null);
  const promptedReview = useRef("");
  const [detailEntry, setDetailEntry] = useState<ScheduleEntry | null>(null);
  const entries = useMemo(() => applyScheduleOperations(publishedEntries, operations), [publishedEntries, operations]);
  const changes = useMemo(() => scheduleChanges(publishedEntries, entries), [publishedEntries, entries]);
  const hasDraft = operations.length > 0;
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [overrideDates, setOverrideDates] = useState<AvailabilityOverrideDate[]>([]);
  const [weekOverrides, setWeekOverrides] = useState<WeekOverride[]>([]);
  const [blocks, setBlocks] = useState<UnavailableBlock[]>([]);
  const [teachingRules, setTeachingRules] = useState<TeachingRules>({ ...defaultTeachingRules, cfi_user_id: "" });
  const [ruleForm, setRuleForm] = useState<TeachingRules>({ ...defaultTeachingRules, cfi_user_id: "" });
  const [instructorTimeOff, setInstructorTimeOff] = useState<InstructorTimeOff[]>([]);
  const [timeOffForm, setTimeOffForm] = useState({ startDate: localDateKey(new Date()), endDate: localDateKey(new Date()), start: "00:00", end: "00:00", allDay: true, note: "" });
  const [aircraft, setAircraft] = useState<ScheduleAircraft[]>([]);
  const [aircraftReservations, setAircraftReservations] = useState<AircraftReservation[]>([]);
  const [aircraftPreferences, setAircraftPreferences] = useState<ScheduleAircraftPreference[]>([]);
  const [assignmentInstructors, setAssignmentInstructors] = useState<ScheduleAssignmentInstructor[]>([]);
  const [aircraftPreferenceDraft, setAircraftPreferenceDraft] = useState<string[]>([]);
  const [drawer, setDrawer] = useState<DrawerMode>(null);
  const [lessonDropTarget, setLessonDropTarget] = useState<{ id: string; mode: "before" | "swap" | "after" } | null>(null);
  const [dayDropTarget, setDayDropTarget] = useState("");
  const dragSourceId = useRef("");
  const suppressEntryClick = useRef(false);

  const [permissionDraft, setPermissionDraft] = useState<string[]>([]);
  const [accessPickerOpen, setAccessPickerOpen] = useState(false);
  const [accessSearch, setAccessSearch] = useState("");
  const [accessSelection, setAccessSelection] = useState<string[]>([]);
  const [confirmPermissions, setConfirmPermissions] = useState(false);
  const [availabilityStudentId, setAvailabilityStudentId] = useState("");
  const [studentTab, setStudentTab] = useState<"lessons" | "availability">("lessons");
  const [availabilityScope, setAvailabilityScope] = useState<"weekly" | "date">("weekly");
  const [availabilityWeekday, setAvailabilityWeekday] = useState(1);
  const [availabilityDate, setAvailabilityDate] = useState(localDateKey(new Date()));
  const [availabilityRows, setAvailabilityRows] = useState<AvailabilityRow[]>([{ start: "07:00", end: "15:00" }]);
  const [weeklyAvailabilityRows, setWeeklyAvailabilityRows] = useState<WeeklyAvailabilityRows>(emptyWeeklyAvailability);
  const [availabilityWeeklyTarget, setAvailabilityWeeklyTarget] = useState(3);
  const [initialAvailabilityWeeklyTarget, setInitialAvailabilityWeeklyTarget] = useState(3);
  const [quickWeekdays, setQuickWeekdays] = useState([1, 2, 3, 4, 5]);
  const [quickAvailability, setQuickAvailability] = useState({ start: "07:00", end: "15:00" });
  const [autofillDates, setAutofillDates] = useState(true);
  const [lesson, setLesson] = useState(emptyLesson);
  const [resumeLessons, setResumeLessons] = useState<typeof emptyLesson[]>([]);
  const [lessonWarnings, setLessonWarnings] = useState<string[]>([]);
  const [blockForm, setBlockForm] = useState({ date: localDateKey(new Date()), start: "07:00", end: "09:00", note: "", aircraftId: "" });
  const [editingBlockId, setEditingBlockId] = useState("");
  const [deleteBlockId, setDeleteBlockId] = useState("");
  const [autoDrafts, setAutoDrafts] = useState<ScheduleDraft[]>([]);
  const [autoUnscheduled, setAutoUnscheduled] = useState<AutomaticScheduleUnscheduled[]>([]);
  const [autoRequests, setAutoRequests] = useState<AutoRequestRow[]>([]);
  const [autoPreviewBuilt, setAutoPreviewBuilt] = useState(false);
  const [selectedAircraftIds, setSelectedAircraftIds] = useState<string[]>([]);
  const [settingsStudentId, setSettingsStudentId] = useState("");
  const [settingsForm, setSettingsForm] = useState({ weeklySessions: 3, durationMin: 120, color: "#2563eb", useWeekOverride: false, weekSessions: 3, weekDurationMin: 120 });

  const studentViews = useMemo(() => access.filter((item) => item.caller_role === "student" && item.access_enabled), [access]);
  const authorizedCandidates = useMemo(() => linkedCandidates.filter((candidate) => permissionDraft.includes(candidate.student_user_id)), [linkedCandidates, permissionDraft]);
  const addableCandidates = useMemo(() => {
    const query = accessSearch.trim().toLocaleLowerCase();
    return linkedCandidates.filter((candidate) => !permissionDraft.includes(candidate.student_user_id)
      && (!query || candidate.student_name.toLocaleLowerCase().includes(query)));
  }, [accessSearch, linkedCandidates, permissionDraft]);
  const aircraftOptionGroups = useMemo(() =>
    groupByAircraftFamily(aircraft.filter((item) => item.operational_status !== "away"), (item) => item.model_name)
      .map((group) => ({
        ...group,
        items: [...group.items].sort((left, right) => compareAircraftLabels(left.tail_number, right.tail_number)),
      })),
  [aircraft]);
  const isCfiView = viewKey === "cfi";
  const activeCfiId = isCfiView ? userId : viewKey;
  const calendarView = layout === "calendar";
  const rangeStartKey = calendarView ? localDateKey(weekStart) : agendaStart;
  const rangeDays = calendarView ? 7 : agendaDays;
  const rangeContext = `${activeCfiId}:${rangeStartKey}:${rangeDays}`;
  const weekReady = loadedContext === rangeContext;
  const activeCfiName = isCfiView ? "My instructor schedule" : studentViews.find((item) => item.cfi_user_id === viewKey)?.cfi_name ?? "Instructor";
  const cfiAccess = useMemo(
    () => access.filter((item) => item.caller_role === "cfi" && item.cfi_user_id === userId),
    [access, userId]
  );
  const activeStudents = useMemo(() => cfiAccess.filter((item) => item.access_enabled), [cfiAccess]);
  const automaticAircraft = useMemo(() => aircraft.filter((item) => item.operational_status === "available"), [aircraft]);
  const maxAvailabilityDate = localDateKey(addCalendarDays(new Date(), 27));

  useEffect(() => {
    const phoneViewport = window.matchMedia("(max-width: 600px)");
    const applyResponsiveDefault = () => {
      if (!layoutWasSelected.current) setLayout(phoneViewport.matches ? "list" : "calendar");
    };
    applyResponsiveDefault();
    phoneViewport.addEventListener("change", applyResponsiveDefault);
    return () => phoneViewport.removeEventListener("change", applyResponsiveDefault);
  }, []);

  function selectLayout(nextLayout: "list" | "calendar") {
    layoutWasSelected.current = true;
    setLayout(nextLayout);
  }

  async function loadIdentityData() {
    if (!userId) return;
    const [featureIds, nextAccess, people, accountLinks, nextEligibility] = await Promise.all([
      fetchEnabledFeatureIds(userId),
      fetchScheduleAccess(),
      fetchSavedPeople(userId, "student"),
      fetchSavedPersonAccountLinks(userId),
      fetchScheduleEligibility(),
    ]);

    setFeatureEnabled(featureIds.includes("cfi_schedule"));
    setEligibility(nextEligibility);
    setAccess(nextAccess);
    setLinkedCandidates(people.map((person) => {
      const existing = nextAccess.find((item) => item.caller_role === "cfi" && item.saved_person_id === person.id);
      const link = accountLinks.find((item) => item.saved_person_id === person.id);
      return {
        saved_person_id: person.id,
        student_user_id: existing?.student_user_id ?? person.id,
        student_name: person.display_name,
        storage_kind: existing?.storage_kind ?? "person",
        account_user_id: link?.linked_user_id ?? null,
      };
    }));
    setPermissionDraft(nextAccess.filter((item) => item.caller_role === "cfi" && item.access_enabled).map((item) => item.student_user_id));
    if ((!loadedContext || !nextEligibility.can_instruct) && !nextAccess.some((item) => item.caller_role === "cfi" && nextEligibility.can_instruct) && nextAccess.some((item) => item.caller_role === "student" && item.access_enabled)) {
      setViewKey(nextAccess.find((item) => item.caller_role === "student" && item.access_enabled)!.cfi_user_id);
    }
    if (viewKey !== "cfi" && !nextAccess.some((item) => item.caller_role === "student" && item.cfi_user_id === viewKey)) {
      setViewKey("cfi");
    }
  }

  function adoptSnapshot(snapshot: ScheduleEditorSnapshot) {
    setLoadedContext(rangeContext);
    setEntries(snapshot.entries);
    setRevision(snapshot.revision);
    setSlots(snapshot.slots);
    setOverrideDates(snapshot.overrideDates);
    setWeekOverrides(snapshot.weekOverrides.filter((item) => item.week_start === localDateKey(weekStart)));
    setBlocks(snapshot.blocks);
    setAircraft(snapshot.aircraft ?? []);
    setAircraftReservations(snapshot.aircraftReservations ?? []);
    setAircraftPreferences(snapshot.aircraftPreferences ?? []);
    setAssignmentInstructors(snapshot.assignmentInstructors ?? []);
    setAccess((current) => [...current.filter((item) => item.caller_role === "student"), ...snapshot.access]);
    setStale(false);
  }

  function weekRange() {
    const visibleStart = new Date(`${rangeStartKey}T12:00:00`);
    visibleStart.setHours(0, 0, 0, 0);
    // Instructor list may start midweek; auto scheduling must still see Monday's
    // existing lessons and blocks before it proposes any changes for that week.
    const start = isCfiView ? getWeekStart(visibleStart) : new Date(visibleStart);
    start.setHours(0, 0, 0, 0);
    return { start, end: addCalendarDays(visibleStart, rangeDays) };
  }

  async function loadWeekData(cfiId = activeCfiId) {
    if (!cfiId) return;
    const generation = ++loadGeneration.current;
    const { start, end } = weekRange();
    if (cfiId === userId) {
      const settingsStart = new Date(Math.min(start.getTime(), new Date().getTime()));
      const settingsEnd = new Date(Math.max(end.getTime(), addCalendarDays(new Date(), 28).getTime()));
      const [snapshot, teaching] = await Promise.all([fetchScheduleEditorSnapshot(start, end), fetchInstructorScheduleSettings(userId, settingsStart, settingsEnd)]);
      if (generation !== loadGeneration.current) return;
      setTeachingRules(teaching.rules);
      setInstructorTimeOff(teaching.timeOff);
      if (hasDraft) {
        // Refresh resources and warnings without losing the unpublished lessons
        // or advancing their revision past changes that still require review.
        setBlocks(snapshot.blocks);
        setSlots(snapshot.slots);
        setOverrideDates(snapshot.overrideDates);
        setAircraft(snapshot.aircraft ?? []);
        setAircraftReservations(snapshot.aircraftReservations ?? []);
        setStale(snapshot.revision !== revision);
        return;
      }
      adoptSnapshot(snapshot);
      return;
    }
    const [snapshot, review] = await Promise.all([fetchScheduleEditorSnapshot(start, end, cfiId), fetchAvailabilityReview(cfiId)]);
    if (generation !== loadGeneration.current) return;
    setLoadedContext(rangeContext);
    setAvailabilityReview(review);
    setEntries(snapshot.entries);
    setSlots(snapshot.slots);
    setOverrideDates(snapshot.overrideDates);
    setWeekOverrides(snapshot.weekOverrides.filter((item) => item.week_start === localDateKey(weekStart)));
    setBlocks([]);
    setAircraft(snapshot.aircraft ?? []);
    setAircraftReservations([]);
    setAircraftPreferences(snapshot.aircraftPreferences ?? []);
    setAssignmentInstructors([]);
  }

  async function reload() {
    if (!userId) return;
    setOperations([]);
    setOperationBatchSizes([]);
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
  }, [activeCfiId, featureEnabled, rangeContext]);

  useEffect(() => {
    if (featureEnabled && !isCfiView && weekReady && availabilityReview?.needs_review && !availabilityReview.confirmed_through && promptedReview.current !== activeCfiId) {
      promptedReview.current = activeCfiId;
      setReviewChecked(false);
      setDrawer("review");
    }
  }, [featureEnabled, isCfiView, weekReady, availabilityReview, activeCfiId]);

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
  }, [drawer, saving, operations, activeCfiId, revision, rangeContext]);

  function jumpToDate(date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || hasDraft || saving) return;
    const value = new Date(`${date}T12:00:00`);
    if (Number.isNaN(value.getTime())) return;
    setSelectedDate(date);
    setWeekStart(getWeekStart(value));
    setAgendaStart(date);
    setAgendaDays(14);
  }

  function stageOperations(next: ScheduleOperation[], batchSize = 1) {
    ++loadGeneration.current;
    setOperations(next);
    setOperationBatchSizes((current) => [...current, batchSize]);
    batchId.current = crypto.randomUUID();
    setPublishAcknowledged(false);
  }

  function undoLastDraftChange() {
    const batchSize = operationBatchSizes[operationBatchSizes.length - 1] ?? 1;
    ++loadGeneration.current;
    setOperations((current) => current.slice(0, -batchSize));
    setOperationBatchSizes((current) => current.slice(0, -1));
    batchId.current = crypto.randomUUID();
    setPublishAcknowledged(false);
  }

  function resetLessonDrag() {
    setLessonDropTarget(null);
    setDayDropTarget("");
    dragSourceId.current = "";
  }

  function lessonEditOperation(entry: ScheduleEntry): ScheduleOperation {
    return {
      type: "edit",
      id: entry.id,
      values: { start_at: entry.start_at, end_at: entry.end_at, lesson_kind: entry.lesson_kind ?? "flight", note: entry.note, aircraft_id: entry.aircraft_id, aircraft_tail_number: entry.aircraft_tail_number, aircraft_status: entry.aircraft_status, assigned_instructor_user_id: entry.assigned_instructor_user_id, assigned_instructor_name: entry.assigned_instructor_name, occupies_instructor_time: entry.occupies_instructor_time },
    };
  }

  function stageMovedLesson(sourceId: string, startAt: string, message: string) {
    const source = entries.find((entry) => entry.id === sourceId && entry.entry_type === "lesson");
    if (source && Date.parse(source.start_at) === Date.parse(startAt)) {
      resetLessonDrag();
      return;
    }
    const next = moveScheduleLesson(entries, sourceId, startAt);
    if (scheduleConflictsForLesson(next, sourceId).length) {
      setError("That position overlaps another lesson. Move it before or after a different lesson.");
      resetLessonDrag();
      return;
    }
    const moved = next.find((entry) => entry.id === sourceId);
    if (!moved) return;
    stageOperations([...operations, lessonEditOperation(moved)]);
    resetLessonDrag();
    setError("");
    setMessage(message);
  }

  function moveLessonToDate(sourceId: string, date: string) {
    const source = entries.find((entry) => entry.id === sourceId && entry.entry_type === "lesson");
    if (!source) return;
    const sourceStart = new Date(source.start_at);
    const time = `${String(sourceStart.getHours()).padStart(2, "0")}:${String(sourceStart.getMinutes()).padStart(2, "0")}`;
    stageMovedLesson(sourceId, localDateTimeToIso(date, time), "Lesson moved to draft.");
  }

  function moveLessonRelative(sourceId: string, target: ScheduleEntry, position: "before" | "after") {
    const source = entries.find((entry) => entry.id === sourceId && entry.entry_type === "lesson");
    if (!source) return;
    const duration = Date.parse(source.end_at) - Date.parse(source.start_at);
    const startAt = position === "before" ? Date.parse(target.start_at) - duration : Date.parse(target.end_at);
    stageMovedLesson(sourceId, new Date(startAt).toISOString(), `Lesson moved ${position} ${target.student_name ?? "the selected time"} in draft.`);
  }

  async function swapLessons(sourceId: string, targetId: string) {
    if (!isCfiView || saving || !sourceId || !targetId || sourceId === targetId) return;
    setError("");
    try {
      const next = swapScheduleLessons(entries, sourceId, targetId);
      if (scheduleHasOverlap(next)) {
        setError("These lesson lengths do not fit cleanly in each other's positions. Edit one lesson first, then try the swap again.");
        setLessonDropTarget(null);
        return;
      }
      const swappedEntries = scheduleChanges(entries, next).map((change) => change.after);
      if (swappedEntries.length !== 2) throw new Error("The schedule changed before the swap could be prepared. Refresh and try again.");
      const warningCount = swappedEntries.reduce((count, entry) => count + entryWarnings(entry, next).length, 0);
      const swapOperations = swappedEntries.map(lessonEditOperation);
      stageOperations([...operations, ...swapOperations], swapOperations.length);
      resetLessonDrag();
      setMessage(warningCount ? `Swap added to draft · ${warningCount} issue${warningCount === 1 ? "" : "s"}.` : "Swap added to draft.");
    } catch (failure) {
      setError(getErrorMessage(failure, "Unable to swap these lessons."));
    }
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
      setOperationBatchSizes([]);
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
    setAccessPickerOpen(false);
    setAccessSearch("");
    setAccessSelection([]);
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
            storageKind: candidate.storage_kind,
            cfiUserId: userId,
            savedPersonId: candidate.saved_person_id,
            studentUserId: candidate.student_user_id,
          });
        } else if (!shouldEnable && existing?.access_enabled) {
          if (candidate.storage_kind === "person") await setPersonScheduleAccess(candidate.saved_person_id, false);
          else await revokeScheduleAccess(userId, candidate.student_user_id);
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

  function openAvailabilityDrawer(scope: "weekly" | "date", weekday = 1, date = localDateKey(new Date()), studentId = isCfiView ? availabilityStudentId : studentViews.find((item) => item.cfi_user_id === activeCfiId)?.student_user_id ?? userId) {
    if (drawer !== "availability") setDrawerReturn(drawer);
    if (drawer !== "availability" || availabilityStudentId !== studentId) {
      const student = isCfiView ? cfiAccess.find((item) => item.student_user_id === studentId) : studentViews.find((item) => item.student_user_id === studentId);
      const weekOverride = weekOverrides.find((item) => item.student_user_id === studentId);
      const target = weekOverride?.target_sessions ?? student?.default_weekly_sessions ?? 0;
      setAvailabilityWeeklyTarget(target);
      setInitialAvailabilityWeeklyTarget(target);
    }
    setReviewChecked(false);
    setAvailabilityStudentId(studentId);
    setAvailabilityScope(scope);
    setAvailabilityWeekday(weekday);
    setAvailabilityDate(date);
    setAutofillDates(true);
    if (scope === "weekly") {
      setWeeklyAvailabilityRows(Object.fromEntries(weekdayLabels.map((_, index) => {
        const day = index + 1;
        const periods = slots.filter((slot) => slot.student_user_id === studentId && slot.scope === "weekly" && slot.weekday === day);
        return [day, periods.map((slot) => ({ start: minutesToTime(slot.start_minute), end: minutesToAvailabilityEnd(slot.end_minute) }))];
      })));
    }
    const dateOverride = overrideDates.find((item) => item.student_user_id === studentId && item.availability_date === date);
    const dateWeekday = new Date(`${date}T12:00:00`).getDay() || 7;
    const current = slots.filter((slot) =>
      slot.student_user_id === studentId && (
        scope === "weekly"
          ? slot.scope === "weekly" && slot.weekday === weekday
          : dateOverride ? slot.scope === "date" && slot.availability_date === date : slot.scope === "weekly" && slot.weekday === dateWeekday
      )
    );
    setAvailabilityRows(current.length
      ? current.map((slot) => ({ start: minutesToTime(slot.start_minute), end: minutesToAvailabilityEnd(slot.end_minute) }))
      : dateOverride ? [] : [{ start: "07:00", end: "15:00" }]);
    setDrawer("availability");
  }

  function openAircraftPreferences() {
    const student = studentViews.find((item) => item.cfi_user_id === activeCfiId);
    if (!student) return;
    setAircraftPreferenceDraft(aircraftPreferences
      .filter((item) => item.cfi_user_id === activeCfiId && item.student_user_id === student.student_user_id)
      .map((item) => item.aircraft_id));
    setDrawerReturn(drawer);
    setDrawer("aircraft-preferences");
  }

  async function saveAircraftPreferences() {
    setSaving(true);
    setError("");
    try {
      await saveScheduleAircraftPreferences(activeCfiId, aircraftPreferenceDraft);
      await loadWeekData(activeCfiId);
      setDrawer(drawerReturn);
      setDrawerReturn(null);
      setMessage(aircraftPreferenceDraft.length ? "Aircraft preferences saved." : "Aircraft preferences cleared. Your instructor’s selections will be used.");
    } catch (failure) {
      setError(getErrorMessage(failure, "Unable to save aircraft preferences."));
    } finally {
      setSaving(false);
    }
  }

  async function saveAvailability() {
    const studentAccess = isCfiView ? cfiAccess.find((item) => item.student_user_id === availabilityStudentId) : studentViews.find((item) => item.cfi_user_id === activeCfiId);
    if (!studentAccess) return;
    if (isCfiView && (!Number.isInteger(availabilityWeeklyTarget) || availabilityWeeklyTarget < 0 || availabilityWeeklyTarget > 14)) {
      setError("Weekly target must be between 0 and 14.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const personId = studentAccess.storage_kind === "person" ? studentAccess.saved_person_id : undefined;
      let filled = 0;
      if (availabilityScope === "weekly") {
        const normalizedWeek = Object.fromEntries(weekdayLabels.map((_, index) => [index + 1, normalizeAvailabilityTimeRows(weeklyAvailabilityRows[index + 1])]));
        for (let weekday = 1; weekday <= 7; weekday += 1) {
          filled += await saveScheduleAvailability({
            personId, cfiUserId: activeCfiId, timezone: browserTimeZone(), scope: "weekly",
            weekday, date: availabilityDate, slots: normalizedWeek[weekday], autofill: autofillDates,
          });
        }
      } else {
        const normalized = normalizeAvailabilityTimeRows(availabilityRows);
        filled = await saveScheduleAvailability({
          personId, cfiUserId: activeCfiId, timezone: browserTimeZone(), scope: "date",
          weekday: availabilityWeekday, date: availabilityDate, slots: normalized, autofill: false,
        });
      }
      if (isCfiView && availabilityWeeklyTarget !== initialAvailabilityWeeklyTarget) {
        const weekOverride = weekOverrides.find((item) => item.student_user_id === studentAccess.student_user_id);
        if (studentAccess.storage_kind === "person") {
          await savePersonScheduleSettings(activeCfiId, studentAccess.saved_person_id, {
            weeklySessions: weekOverride ? studentAccess.default_weekly_sessions : availabilityWeeklyTarget,
            durationMin: studentAccess.default_duration_min,
            color: studentAccess.color,
            useWeekOverride: Boolean(weekOverride),
            weekStart: localDateKey(weekStart),
            weekSessions: weekOverride ? availabilityWeeklyTarget : studentAccess.default_weekly_sessions,
            weekDurationMin: weekOverride?.duration_min ?? studentAccess.default_duration_min,
          });
        } else if (weekOverride) {
          await upsertWeekOverride({
            cfi_user_id: activeCfiId,
            student_user_id: studentAccess.student_user_id,
            week_start: localDateKey(weekStart),
            target_sessions: availabilityWeeklyTarget,
            duration_min: weekOverride.duration_min,
          });
        } else {
          await updateStudentScheduleDefaults({
            cfiUserId: activeCfiId,
            studentUserId: studentAccess.student_user_id,
            weeklySessions: availabilityWeeklyTarget,
            durationMin: studentAccess.default_duration_min,
            color: studentAccess.color,
          });
        }
        await loadIdentityData();
      }
      await loadWeekData(activeCfiId);
      setDrawer(drawerReturn);
      setDrawerReturn(null);
      setMessage(availabilityScope === "weekly" && autofillDates ? `Saved and filled ${filled} dates.` : "Availability saved.");
    } catch (availabilityError) {
      setError(getErrorMessage(availabilityError, "Unable to save availability."));
    } finally {
      setSaving(false);
    }
  }

  async function clearDateOverride() {
    setSaving(true);
    try {
      const student = isCfiView ? cfiAccess.find((item) => item.student_user_id === availabilityStudentId) : studentViews.find((item) => item.cfi_user_id === activeCfiId);
      if (!student) throw new Error("Choose a student.");
      if (student.storage_kind === "person") await clearPersonAvailabilityDate(activeCfiId, student.saved_person_id, availabilityDate);
      else await removeDateAvailabilityOverride(activeCfiId, student.student_user_id, availabilityDate);
      await loadWeekData(activeCfiId);
      setDrawer(drawerReturn);
      setDrawerReturn(null);
      setMessage("Date now uses your general availability.");
    } catch (clearError) {
      setError(getErrorMessage(clearError, "Unable to clear the override."));
    } finally {
      setSaving(false);
    }
  }

  async function applyQuickAvailability() {
    const student = isCfiView ? cfiAccess.find((item) => item.student_user_id === availabilityStudentId) : studentViews.find((item) => item.cfi_user_id === activeCfiId);
    if (!student) return;
    if (!quickWeekdays.length) { setError("Choose at least one day."); return; }
    setSaving(true); setError(""); setReviewChecked(false);
    try {
      const period = { startMinute: timeToMinutes(quickAvailability.start), endMinute: availabilityEndToMinutes(quickAvailability.end) };
      await Promise.all(quickWeekdays.map((weekday) => saveScheduleAvailability({
        personId: student.storage_kind === "person" ? student.saved_person_id : undefined,
        cfiUserId: activeCfiId,
        timezone: browserTimeZone(),
        scope: "weekly",
        weekday,
        date: localDateKey(new Date()),
        slots: [period],
        autofill: true,
      })));
      await loadWeekData(activeCfiId);
      setMessage("Availability saved.");
      setDrawer(isCfiView ? null : "review");
    } catch (failure) { setError(getErrorMessage(failure, "Unable to save availability.")); }
    finally { setSaving(false); }
  }

  async function confirmReviewedDates() {
    if (!reviewChecked) return;
    setSaving(true); setError("");
    try {
      await confirmAvailabilityReview(activeCfiId);
      await loadWeekData();
      setDrawer(null);
      setMessage("Next two weeks confirmed.");
    } catch (failure) { setError(getErrorMessage(failure, "Unable to confirm availability.")); }
    finally { setSaving(false); }
  }

  function openNewLesson(date = localDateKey(weekStart), start = "08:00", studentUserId = activeStudents[0]?.student_user_id ?? "") {
    if (!weekReady) return;
    ++loadGeneration.current;
    setLesson({ ...emptyLesson, studentUserId, date, start, assignedInstructorId: userId });
    setResumeLessons([]);
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
      aircraftId: aircraft.some((item) => item.id === entry.aircraft_id && item.operational_status !== "away") ? entry.aircraft_id ?? "" : "",
      assignedInstructorId: entry.assigned_instructor_user_id ?? userId,
    });
    setLessonWarnings(entryWarnings(entry));
    setResumeLessons([]);
    setDrawer("lesson");
  }

  function lessonTimes() {
    const start = new Date(localDateTimeToIso(lesson.date, lesson.start));
    const end = new Date(localDateTimeToIso(lesson.date, lesson.start, lesson.durationMin));
    return { start, end };
  }

  function lessonOperation(newId = "draft-new-preview"): ScheduleOperation {
    const { start, end } = lessonTimes();
    const selectedAircraft = aircraft.find((item) => item.id === lesson.aircraftId);
    const assignedInstructor = assignmentInstructors.find((item) => item.user_id === lesson.assignedInstructorId);
    const values = { start_at: start.toISOString(), end_at: end.toISOString(), lesson_kind: lesson.kind, note: lesson.note,
      aircraft_id: lesson.kind !== "ground" ? lesson.aircraftId || null : null,
      aircraft_tail_number: lesson.kind !== "ground" ? selectedAircraft?.tail_number ?? null : null,
      aircraft_status: lesson.kind !== "ground" ? selectedAircraft?.operational_status ?? null : null,
      assigned_instructor_user_id: lesson.assignedInstructorId || userId,
      assigned_instructor_name: assignedInstructor?.name ?? "Me",
      occupies_instructor_time: (lesson.assignedInstructorId || userId) === userId };
    if (lesson.id) return { type: "edit", id: lesson.id, values };
    const student = activeStudents.find((item) => item.student_user_id === lesson.studentUserId);
    return { type: "add", entry: {
      ...values, id: newId, entry_type: "lesson", student_user_id: lesson.studentUserId,
      student_name: student?.student_name ?? "Student", auto_generated: false, status: "scheduled", is_own: false,
      aircraft_status_note: selectedAircraft?.operational_status_note ?? null, aircraft_conflict: false, unavailable_kind: null,
      schedule_owner_user_id: userId, scheduled_by_user_id: userId, can_edit: true,
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
    const aircraftStatus = aircraft.find((item) => item.id === entry.aircraft_id)?.operational_status ?? entry.aircraft_status;
    const externalConflict = Boolean(entry.aircraft_id) && aircraftReservations.some((reservation) => reservation.source === "lesson" && reservation.aircraft_id === entry.aircraft_id && start < new Date(reservation.end_at) && end > new Date(reservation.start_at));
    const warnings = getManualConflictWarnings({
      studentUserId: entry.student_user_id ?? "", lessonKind: entry.lesson_kind ?? "flight",
      start, end, slots, overrideDates, blocks, aircraftId: entry.aircraft_id,
      aircraftStatus, aircraftConflict: isCfiView ? externalConflict : entry.aircraft_conflict,
    });
    const startMinute = start.getHours() * 60 + start.getMinutes();
    if (isCfiView && entry.occupies_instructor_time !== false) {
      const endMinute = end.getHours() * 60 + end.getMinutes();
      const weekday = (start.getDay() + 6) % 7 + 1;
      if (!teachingRules.weekdays.includes(weekday) || startMinute < teachingRules.start_minute || endMinute > teachingRules.end_minute) warnings.push("Outside your teaching days or hours.");
      if (instructorTimeOff.some((item) => start < new Date(item.end_at) && end > new Date(item.start_at))) warnings.push("Overlaps your unavailable time.");
    }
    if (localDateKey(start) !== localDateKey(end)) warnings.push("This lesson crosses into another calendar day.");
    const dayLessons = schedule.filter((item) => item.entry_type === "lesson" && item.status === "scheduled" && item.occupies_instructor_time !== false && localDateKey(new Date(item.start_at)) === localDateKey(start));
    if (isCfiView && dayLessons.reduce((total, item) => total + (Date.parse(item.end_at) - Date.parse(item.start_at)) / 60_000, 0) > teachingRules.max_daily_teaching_min) {
      warnings.push("This day's lessons exceed your total teaching hours.");
    }
    return warnings;
  }

  function calculateLessonWarnings() {
    if (!lesson.date || !lesson.start || !lesson.studentUserId) return [];
    const next = applyScheduleOperations(entries, [lessonOperation()]);
    return scheduleChanges(entries, next).flatMap((change) => entryWarnings(change.after, next).map((warning) => `${change.after.student_name}: ${warning}`));
  }

  async function saveLesson(force = false) {
    if (!lesson.studentUserId || !lesson.date || !lesson.start) return;
    try {
      const operation = lessonOperation(crypto.randomUUID());
      const next = applyScheduleOperations(entries, [operation]);
      const editedId = operation.type === "add" ? operation.entry.id : operation.id;
      if (scheduleConflictsForLesson(next, editedId).length) {
        setError("This time overlaps another lesson. Edit the affected lesson below, then save this one.");
        return;
      }
      const warnings = calculateLessonWarnings();
      if (warnings.length && !force) { setLessonWarnings(warnings); return; }
      stageOperations([...operations, operation]);
      if (resumeLessons.length) { setLesson(resumeLessons[resumeLessons.length - 1]); setResumeLessons(resumeLessons.slice(0, -1)); setLessonWarnings([]); setError(""); }
      else { setDrawer(null); setLessonWarnings([]); setError(""); }
      setMessage("Lesson change added to draft.");
    } catch (failure) { setError(getErrorMessage(failure, "Unable to update the draft.")); }
  }

  async function confirmCancelLesson(id: string) {
    if (!id) return;
    stageOperations([...operations, { type: "cancel", id }]);
    setDrawer(null);
    setResumeLessons([]);
    setMessage("Cancellation added to draft.");
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
      setOperationBatchSizes([]);
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

  function openBlockDrawer(date: string, block?: UnavailableBlock) {
    setEditingBlockId(block?.id ?? "");
    setError("");
    setBlockForm(block ? {
      date: localDateKey(new Date(block.start_at)),
      start: localDateTimeValue(new Date(block.start_at)).slice(11),
      end: localDateTimeValue(new Date(block.end_at)).slice(11),
      note: block.note,
      aircraftId: block.aircraft_id ?? "",
    } : { date, start: "07:00", end: "09:00", note: "", aircraftId: "" });
    setDrawer("block");
  }

  async function refreshAfterBlockChange() {
    setAutoDrafts([]);
    setAutoUnscheduled([]);
    setAutoPreviewBuilt(false);
    setPublishAcknowledged(false);
    if (hasDraft) setStale(true);
    try { await loadWeekData(userId); }
    catch { setError("Aircraft unavailable time was saved, but the calendar could not refresh. Use Refresh before continuing."); }
  }

  async function saveBlock() {
    setSaving(true);
    setError("");
    try {
      if (!blockForm.date || !blockForm.start || !blockForm.end) throw new Error("Choose a date, start time and end time.");
      if (!blockForm.aircraftId) throw new Error("Choose the specific aircraft that is unavailable.");
      const start = timeToMinutes(blockForm.start);
      const end = timeToMinutes(blockForm.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error("End time must be later than start time on the selected day.");
      const values = {
        cfi_user_id: userId,
        start_at: localDateTimeToIso(blockForm.date, blockForm.start),
        end_at: localDateTimeToIso(blockForm.date, blockForm.end),
        note: blockForm.note,
        aircraft_id: blockForm.aircraftId || null,
      };
      if (editingBlockId) await updateUnavailableBlock(editingBlockId, values);
      else await createUnavailableBlock(values);
      await refreshAfterBlockChange();
      setBlockForm((current) => ({ ...current, note: "" }));
      setDrawer(null);
      setEditingBlockId("");
      setMessage("Aircraft unavailable time saved. Flight conflicts are marked; existing lessons have not moved.");
    } catch (blockError) {
      setError(getErrorMessage(blockError, "Unable to add the block."));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteBlock() {
    setSaving(true);
    setError("");
    try {
      await deleteUnavailableBlock(deleteBlockId);
      await refreshAfterBlockChange();
      setDeleteBlockId("");
      if (drawer === "block") setDrawer(null);
      setMessage("Unavailable block removed.");
    } catch (blockError) {
      setError(getErrorMessage(blockError, "Unable to remove the block."));
    } finally {
      setSaving(false);
    }
  }

  function openTeachingDrawer() {
    setError("");
    if (drawer !== "teaching") setDrawerReturn(drawer);
    const teachingWindowMinutes = Math.max(1, teachingRules.end_minute - teachingRules.start_minute);
    setRuleForm({ ...teachingRules, max_daily_span_min: teachingWindowMinutes, max_daily_teaching_min: Math.min(teachingRules.max_daily_teaching_min, teachingWindowMinutes) });
    setTimeOffForm({ startDate: selectedDate, endDate: selectedDate, start: minutesToTime(teachingRules.start_minute), end: minutesToAvailabilityEnd(teachingRules.end_minute), allDay: true, note: "" });
    setDrawer("teaching");
  }

  async function refreshTeachingSettings() {
    const { start, end } = weekRange();
    const settingsStart = new Date(Math.min(start.getTime(), new Date().getTime()));
    const settingsEnd = new Date(Math.max(end.getTime(), addCalendarDays(new Date(), 28).getTime()));
    const next = await fetchInstructorScheduleSettings(userId, settingsStart, settingsEnd);
    setTeachingRules(next.rules);
    setRuleForm(next.rules);
    setInstructorTimeOff(next.timeOff);
    if (hasDraft) { setStale(true); setAutoPreviewBuilt(false); }
  }

  async function confirmTeachingRules() {
    setError("");
    const normalized = {
      ...ruleForm,
      cfi_user_id: userId,
      latest_start_minute: Math.max(ruleForm.start_minute, ruleForm.end_minute - 1),
      max_daily_span_min: ruleForm.end_minute - ruleForm.start_minute,
      weekdays: [...new Set(ruleForm.weekdays)].sort((a, b) => a - b),
    };
    const teachingWindowMinutes = normalized.end_minute - normalized.start_minute;
    if (!normalized.weekdays.length || teachingWindowMinutes < 1 || normalized.max_daily_teaching_min < 1 || normalized.max_daily_teaching_min > teachingWindowMinutes) {
      setError("Choose at least one day, an end after the start, and a daily teaching limit within those hours.");
      return;
    }
    setSaving(true);
    try {
      await saveTeachingRules(normalized);
      await refreshTeachingSettings();
      setMessage("Teaching rules saved. Existing lessons stay in place; conflicts show as warnings.");
    } catch (failure) { setError(getErrorMessage(failure, "Unable to save teaching rules.")); }
    finally { setSaving(false); }
  }

  async function confirmTimeOff() {
    setError("");
    const startAt = new Date(`${timeOffForm.startDate}T${timeOffForm.allDay ? "00:00" : timeOffForm.start}:00`);
    const endAt = timeOffForm.allDay ? addCalendarDays(new Date(`${timeOffForm.endDate}T00:00:00`), 1) : new Date(`${timeOffForm.endDate}T${timeOffForm.end}:00`);
    if (!timeOffForm.startDate || !timeOffForm.endDate || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
      setError("Choose an end date and time after the start."); return;
    }
    setSaving(true);
    try {
      await createInstructorTimeOff({ cfi_user_id: userId, start_at: startAt.toISOString(), end_at: endAt.toISOString(), note: timeOffForm.note.trim() });
      await refreshTeachingSettings();
      setTimeOffForm((current) => ({ ...current, note: "" }));
      setMessage("Unavailable time saved. Automatic scheduling will avoid it.");
    } catch (failure) { setError(getErrorMessage(failure, "Unable to save unavailable time.")); }
    finally { setSaving(false); }
  }

  async function removeTimeOff(id: string) {
    setSaving(true); setError("");
    try { await deleteInstructorTimeOff(id); await refreshTeachingSettings(); setMessage("Unavailable time removed."); }
    catch (failure) { setError(getErrorMessage(failure, "Unable to remove unavailable time.")); }
    finally { setSaving(false); }
  }

  function openAutoDrawer() {
    if (!weekReady) return;
    ++loadGeneration.current;
    setError("");
    setAutoDrafts([]);
    setAutoUnscheduled([]);
    setAutoPreviewBuilt(false);
    setAutoRequests(activeStudents.map((student) => {
      const override = weekOverrides.find((item) => item.student_user_id === student.student_user_id);
      const target = override?.target_sessions ?? student.default_weekly_sessions;
      const existingFlight = entries.filter((entry) => entry.entry_type === "lesson" && entry.status === "scheduled" && entry.student_user_id === student.student_user_id && entry.lesson_kind === "flight" && localDateKey(new Date(entry.start_at)) >= localDateKey(weekStart) && localDateKey(new Date(entry.start_at)) < localDateKey(addCalendarDays(weekStart, 7))).length;
      return { studentUserId: student.student_user_id, flightSessions: target, groundSessions: 0, selected: existingFlight < target };
    }));
    setSelectedAircraftIds([]);
    setDrawer("auto");
  }

  function buildAutomaticPreview() {
    const requests = autoRequests.filter((item) => item.selected && (item.flightSessions > 0 || item.groundSessions > 0)).map(({ studentUserId, flightSessions, groundSessions }) => ({ studentUserId, flightSessions, groundSessions }));
    if (!requests.length) {
      setError("Select at least one student and choose how many lessons to add.");
      setAutoPreviewBuilt(false);
      return;
    }
    setError("");
    const result = generateAutomaticSchedule({
      cfiUserId: userId,
      weekStart,
      includeWeekends: true,
      access: activeStudents,
      weekOverrides,
      slots,
      overrideDates,
      existingEntries: entries,
      blocks,
      requests,
      aircraft,
      selectedAircraftIds,
      aircraftPreferences,
      aircraftReservations,
      teachingRules,
      instructorTimeOff,
    });
    setAutoDrafts(result.drafts);
    setAutoUnscheduled(result.unscheduled);
    setAutoPreviewBuilt(true);
  }

  function updateAutoRequest(studentUserId: string, values: Partial<AutoRequestRow>) {
    setAutoRequests((current) => current.map((item) => item.studentUserId === studentUserId ? { ...item, ...values } : item));
    setError("");
    setAutoDrafts([]);
    setAutoUnscheduled([]);
    setAutoPreviewBuilt(false);
  }

  async function confirmAutomaticSchedule() {
    setError("");
    try {
      const additions: ScheduleOperation[] = autoDrafts.map((draft) => ({ type: "add", entry: {
        id: crypto.randomUUID(), entry_type: "lesson", student_user_id: draft.student_user_id,
        student_name: draft.student_name, lesson_kind: draft.lesson_kind, aircraft_id: draft.aircraft_id,
        aircraft_tail_number: draft.aircraft_tail_number ?? null, aircraft_status: aircraft.find((item) => item.id === draft.aircraft_id)?.operational_status ?? null,
        aircraft_status_note: null, aircraft_conflict: false, unavailable_kind: null, start_at: draft.start_at,
        end_at: draft.end_at, note: draft.note, auto_generated: true, status: "scheduled", is_own: false,
        schedule_owner_user_id: userId, assigned_instructor_user_id: userId,
        assigned_instructor_name: assignmentInstructors.find((item) => item.user_id === userId)?.name ?? "Me",
        scheduled_by_user_id: userId, occupies_instructor_time: true, can_edit: true,
      } }));
      stageOperations([...operations, ...additions], additions.length);
      setDrawer(null);
      setMessage(`${autoDrafts.length} lessons added to the draft. Review and publish when ready.`);
    } catch (autoError) {
      setError(getErrorMessage(autoError, "Unable to save the generated schedule."));
    }
  }

  function openStudentSettings(student: ScheduleAccess) {
    if (drawer !== "settings") setDrawerReturn(drawer);
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
      const student = access.find((item) => item.cfi_user_id === activeCfiId && item.student_user_id === settingsStudentId);
      if (student?.storage_kind === "person") {
        await savePersonScheduleSettings(activeCfiId, student.saved_person_id, { ...settingsForm, weekStart: localDateKey(weekStart) });
      } else {
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
      }
      await loadIdentityData();
      await loadWeekData(activeCfiId);
      setDrawer(drawerReturn);
      setDrawerReturn(null);
      setMessage("Student schedule settings saved.");
    } catch (settingsError) {
      setError(getErrorMessage(settingsError, "Unable to save student settings."));
    } finally {
      setSaving(false);
    }
  }

  function renderChangePreview(items: ScheduleChange[], schedule = entries) {
    return <div className="max-w-full overflow-x-auto border border-slate-200"><table className="w-full min-w-[380px] text-left text-xs"><thead className="bg-slate-50"><tr><th className="p-2">Student</th><th className="p-2">Before</th><th className="p-2">After</th></tr></thead><tbody>{items.map(({ before, after }) => <tr key={after.id} className="border-t border-slate-100 align-top"><td className="p-2 font-semibold">{after.student_name}</td><td className="p-2">{before ? <>{formatDate(new Date(before.start_at))}<br />{formatTime(before.start_at)}–{formatTime(before.end_at)}<br />{before.lesson_kind}{before.aircraft_tail_number ? ` · ${before.aircraft_tail_number}` : ""}<br />{before.assigned_instructor_name ?? "Me"}</> : "New lesson"}</td><td className="p-2">{after.status === "cancelled" ? <span className="text-rose-700">Cancelled</span> : <>{formatDate(new Date(after.start_at))}<br />{formatTime(after.start_at)}–{formatTime(after.end_at)}<br />{after.lesson_kind}{after.aircraft_tail_number ? ` · ${after.aircraft_tail_number}` : ""}<br />{after.assigned_instructor_name ?? "Me"}{before && before.note !== after.note ? <p className="mt-1 break-words">Note: {after.note || "Removed"}</p> : null}{entryWarnings(after, schedule).map((warning) => <p key={warning} className="mt-1 text-amber-800">⚠ {warning}</p>)}</>}</td></tr>)}</tbody></table></div>;
  }

  if (featureEnabled === null || loading) return <div className="saas-panel">Loading schedule…</div>;
  if (!featureEnabled || (isCfiView && !eligibility?.can_instruct)) {
    const canEnable = eligibility?.can_instruct || eligibility?.invited_student;
    return (
      <div className={styles.root} aria-label="Schedule setup">
        <header className={styles.onboardingHeader}>
          <div><p className={styles.eyebrow}>Personal schedule</p><h1>{canEnable ? "Schedule is ready" : "Get started"}</h1></div>
        </header>
        {canEnable ? <section className={styles.onboardingCard}>
          <h2>{eligibility?.can_instruct ? "Your instructor information is complete" : "Your instructor has added you"}</h2>
          <p>{eligibility?.can_instruct ? "Add Schedule, choose students from People, and start planning lessons." : "Add Schedule to see lessons and set the times you are available."}</p>
          {error ? <p role="alert" className={styles.error}>{error}</p> : null}
          {!featureEnabled ? <button type="button" className="primary-button mt-5" disabled={saving} onClick={() => void enableFeature()}>{saving ? "Adding…" : "Add Schedule"}</button> : null}
        </section> : <div className={styles.onboardingChoices}>
          <section className={styles.onboardingCard}>
            <p className={styles.eyebrow}>Student</p><h2>Already have an instructor?</h2>
            <p>Your instructor must add you from their People list, link your PilotSeal account, and grant Schedule access. Once they do, come back here—the calendar and availability guide will open automatically.</p>
            <p className={styles.onboardingNote}>Until access is granted, there is nothing you need to configure here.</p>
          </section>
          <section className={styles.onboardingCard}>
            <p className={styles.eyebrow}>Instructor</p><h2>Set up your instructor information</h2>
            <p>Add your name and a Flight Instructor or Ground Instructor certificate. Include the certificate number, ratings, and last activity or issuance date.</p>
            <Link className="primary-button mt-5 inline-flex" href="/console/personal/people">Complete my information</Link>
          </section>
        </div>}
      </div>
    );
  }

  const displayDays = Array.from({ length: calendarView ? 7 : agendaDays }, (_, index) => addCalendarDays(new Date(`${rangeStartKey}T12:00:00`), index));
  const availabilityOverviewDays = Array.from({ length: 7 }, (_, index) => addCalendarDays(weekStart, index));
  const activeStudent = studentViews.find((item) => item.cfi_user_id === activeCfiId);
  const calendarEntries: ScheduleEntry[] = isCfiView ? [
    ...entries.filter((entry) => entry.entry_type === "lesson"),
    ...blocks.map((block): ScheduleEntry => ({ ...block, entry_type: "unavailable", student_user_id: null,
      student_name: null, lesson_kind: null, auto_generated: false, status: "scheduled", is_own: block.can_manage ?? block.cfi_user_id === userId,
      aircraft_tail_number: block.aircraft_tail_number ?? null, aircraft_status: aircraft.find((item) => item.id === block.aircraft_id)?.operational_status ?? null,
      aircraft_status_note: null, aircraft_conflict: false, unavailable_kind: "aircraft", block_owner_name: block.block_owner_name ?? null })),
    ...instructorTimeOff.map((item): ScheduleEntry => ({ id: item.id, entry_type: "unavailable", unavailable_kind: "instructor", student_user_id: null,
      student_name: null, lesson_kind: null, aircraft_id: null, aircraft_tail_number: null, aircraft_status: null, aircraft_status_note: null,
      aircraft_conflict: false, start_at: item.start_at, end_at: item.end_at, note: item.note, auto_generated: false, status: "scheduled", is_own: true })),
  ] : entries;
  const visibleEntriesForDate = (day: Date) => calendarEntries.filter(entry =>
    (calendarView || (entry.entry_type === "lesson" && (isCfiView || entry.is_own)))
    && entry.status === "scheduled"
    && Date.parse(entry.start_at) < new Date(`${localDateKey(addCalendarDays(day,1))}T00:00:00`).getTime()
    && Date.parse(entry.end_at) > new Date(`${localDateKey(day)}T00:00:00`).getTime()
  ).sort((a,b)=>Date.parse(a.start_at)-Date.parse(b.start_at));
  const visibleDays = !calendarView && (isCfiView || studentTab === "lessons")
    ? displayDays.filter(day=>visibleEntriesForDate(day).length > 0) : displayDays;
  const publishWarnings = changes.flatMap((change) => entryWarnings(change.after));
  const previewChanges = drawer === "lesson" ? lessonPreviewChanges() : [];
  const lessonPreviewEntries = drawer === "lesson" && lesson.date && lesson.start && lesson.studentUserId ? applyScheduleOperations(entries, [lessonOperation()]) : entries;
  const lessonConflicts = drawer === "lesson" && lesson.date && lesson.start && lesson.studentUserId
    ? scheduleConflictsForLesson(lessonPreviewEntries, lesson.id || "draft-new-preview") : [];
  return (
    <div className={styles.root} aria-label="Schedule workspace">
      <header className={styles.header}>
        <div className={styles.dateGroup}>
          <button className={styles.weekArrow} type="button" aria-label="Previous week" disabled={hasDraft || saving} onClick={() => jumpToDate(localDateKey(addCalendarDays(new Date(`${selectedDate}T12:00:00`), -7)))}>‹</button>
          <label className={styles.datePicker}>
            <span>{new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${selectedDate}T12:00:00`))}</span>
            <input className={styles.nativePicker} data-native-picker type="date" aria-label="Jump to date" value={selectedDate} disabled={hasDraft || saving} onClick={(event) => showNativePicker(event.currentTarget)} onChange={(event) => jumpToDate(event.target.value)} />
          </label>
          <button className={styles.weekArrow} type="button" aria-label="Next week" disabled={hasDraft || saving} onClick={() => jumpToDate(localDateKey(addCalendarDays(new Date(`${selectedDate}T12:00:00`), 7)))}>›</button>
        </div>
        <div className={styles.actions}>
          {isCfiView ? <ScheduleMenu label="Add to schedule" icon="＋" disabled={saving || !weekReady} actions={[
            { label: "Add lesson", disabled: !activeStudents.length, onSelect: () => openNewLesson(selectedDate) },
            { label: "Aircraft unavailable", onSelect: () => openBlockDrawer(selectedDate) },
            { label: "Auto schedule", disabled: !activeStudents.length, onSelect: openAutoDrawer },
          ]} /> : null}
          <ScheduleMenu label="Schedule options" icon="⋯" disabled={saving} actions={[
            ...(isCfiView ? [
              { label: "Students", onSelect: () => setDrawer("students" as DrawerMode) },
              { label: "Student availability", disabled: !activeStudents.length || !weekReady, onSelect: () => setDrawer("availability-overview" as DrawerMode) },
              { label: "My teaching time", disabled: !weekReady, onSelect: openTeachingDrawer },
              { label: "Manage access", disabled: hasDraft, onSelect: openAccessDrawer },
            ] : [
              { label: "Usual weekly availability", disabled: !weekReady, onSelect: () => setDrawer("weekly" as DrawerMode) },
              { label: "Aircraft preferences", disabled: !weekReady || !aircraft.length, onSelect: openAircraftPreferences },
              ...(activeStudent?.storage_kind === "person" ? [{ label: "Weekly goal", disabled: !weekReady, onSelect: () => openStudentSettings(activeStudent) }] : []),
            ]),
            { label: "Refresh", onSelect: () => { void loadWeekData().catch((failure) => setError(getErrorMessage(failure, "Unable to refresh."))); } },
            ...(hasDraft ? [
              { label: "Undo last edit", onSelect: undoLastDraftChange },
              { label: "Discard draft", danger: true, onSelect: () => setDiscardOpen(true) },
            ] : []),
            ...(studentViews.length ? [
              ...(eligibility?.can_instruct ? [{ label: "My instructor schedule", disabled: hasDraft || isCfiView, onSelect: () => setViewKey("cfi") }] : []),
              ...studentViews.map((item) => ({ label: `Student view · ${item.cfi_name}`, disabled: hasDraft || viewKey === item.cfi_user_id, onSelect: () => setViewKey(item.cfi_user_id) })),
            ] : []),
          ]} />
        </div>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.segments} aria-label="Schedule view">
          <button type="button" aria-pressed={!calendarView} disabled={hasDraft || saving} onClick={() => selectLayout("list")}>List</button>
          <button type="button" aria-pressed={calendarView} disabled={hasDraft || saving} onClick={() => selectLayout("calendar")}>Week</button>
        </div>
        {!isCfiView ? <button type="button" className={styles.textButton} aria-pressed={studentTab === "availability"} onClick={() => { setStudentTab(studentTab === "availability" ? "lessons" : "availability"); setAgendaDays(studentTab === "availability" ? 14 : 28); }}>My availability</button> : null}
        <button className={styles.textButton} type="button" disabled={hasDraft || saving} onClick={() => jumpToDate(localDateKey(new Date()))}>Today</button>
      </div>
      <p className={styles.range}>{formatDate(displayDays[0])} – {formatDate(displayDays[displayDays.length - 1])}<span>{!isCfiView ? `${activeCfiName} · ` : ""}{browserTimeZone()}</span></p>
      {!isCfiView && weekReady ? <div className={styles.reminder} role="status"><span>{availabilityReview?.needs_review ? "Confirm your next 7 days." : `Confirmed through ${formatDate(new Date(`${availabilityReview?.confirmed_through}T12:00:00`))}.`}</span><button type="button" className={styles.textButton} onClick={() => { setReviewChecked(false); setDrawer("review"); }}>Review dates</button></div> : null}
      {error ? <p role="alert" className={`${styles.feedback} ${styles.error}`}>{error}</p> : null}
      {message ? <p role="status" className={styles.feedback}>{message}</p> : null}
      {hasDraft ? <div className={styles.draftBar}><strong>Unpublished draft · {changes.length} changed lesson(s)</strong><button className={styles.textButton} type="button" disabled={saving || !changes.length} onClick={() => void openPublishDrawer()}>Review &amp; publish</button></div> : null}
      {stale ? <p role="alert" className={styles.feedback}>The schedule changed. <button type="button" className={styles.textButton} onClick={() => void reviewLatestDraft()}>Review latest and reapply draft</button></p> : null}
      {!isCfiView && studentTab === "availability" ? <button type="button" className={styles.textButton} disabled={!weekReady} onClick={() => setDrawer("weekly")}>Edit usual week</button> : null}
      {!weekReady ? <p role="status" className={styles.feedback}>Loading dates…</p> : null}
      <div className={`${styles.calendar} ${!calendarView ? styles.agenda : displayDays.length === 7 ? styles.fullWeek : ""}`} data-schedule-range-start={rangeStartKey} data-schedule-range-days={rangeDays} aria-busy={!weekReady} aria-label={calendarView ? "Week schedule" : "Upcoming days"}>
        {weekReady && !visibleDays.length ? <p className={styles.empty}>No upcoming lessons in this date range.</p> : null}
        {visibleDays.map((day) => {
          const date = localDateKey(day);
          const isToday = date === localDateKey(new Date());
          const dayEntries = visibleEntriesForDate(day);
          return <section key={date} data-schedule-date={date} aria-label={formatDate(day)} className={`${styles.day} ${isToday ? styles.today : ""} ${dayDropTarget === date ? styles.dayDropTarget : ""}`}>
            <div className={styles.dayHeader}>
              <div className={styles.dayHeading}><span>{isToday ? "Today" : new Intl.DateTimeFormat(undefined,{weekday:"short"}).format(day)}</span><strong>{new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric"}).format(day)}</strong><small>{day.getFullYear()}</small></div>
              {isCfiView ? <ScheduleMenu label={`Add on ${date}`} icon="＋" disabled={!weekReady || saving} actions={[
                { label: "Add lesson", disabled: !activeStudents.length, onSelect: () => openNewLesson(date) },
                { label: "Aircraft unavailable", onSelect: () => openBlockDrawer(date) },
              ]} /> : null}
            </div>
            <div className={styles.dayEntries}
              onDragOver={(event) => {
                if (!isCfiView || !dragSourceId.current) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setLessonDropTarget(null);
                setDayDropTarget(date);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDayDropTarget((current) => current === date ? "" : current);
              }}
              onDrop={(event) => {
                if (!isCfiView) return;
                event.preventDefault();
                const sourceId = event.dataTransfer.getData("text/plain") || dragSourceId.current;
                suppressEntryClick.current = true;
                moveLessonToDate(sourceId, date);
              }}>
              {!weekReady ? null : !isCfiView && studentTab === "availability" ? <button type="button" className={styles.availability} aria-label={`Edit availability on ${date}`} disabled={date < localDateKey(new Date()) || date > maxAvailabilityDate} onClick={() => openAvailabilityDrawer("date", 1, date)}>
                {availabilityForDate({date:day,studentUserId:activeStudent?.student_user_id ?? userId,slots,overrideDates}).map((period) => `${formatTime(period.start.toISOString())}–${formatTime(period.end.toISOString())}`).join(", ") || "Not available"}
                <span className={styles.entryMeta}>{date >= localDateKey(new Date()) && date <= maxAvailabilityDate ? "Tap to edit" : "Outside the four-week window"}</span>
              </button> : !dayEntries.length ? <p className={styles.empty}>{isCfiView ? "Open" : "No lessons"}</p> : dayEntries.map((entry) => {
                const warnings = entryWarnings(entry);
                const aircraftLabel = entry.aircraft_tail_number || (entry.aircraft_id ? "Aircraft" : "Aircraft not specified");
                const lessonLabel = entry.lesson_kind === "ground" ? "Ground" : entry.lesson_kind === "solo" ? `Solo · ${aircraftLabel}` : aircraftLabel;
                const assignmentLabel = entry.entry_type !== "lesson" ? "" : !isCfiView
                  ? entry.assigned_instructor_name ? `Instructor: ${entry.assigned_instructor_name}` : ""
                  : entry.schedule_owner_user_id === userId && entry.assigned_instructor_user_id !== userId
                    ? `Assigned to ${entry.assigned_instructor_name ?? "another instructor"}`
                    : entry.schedule_owner_user_id !== userId ? `Assigned by ${entry.scheduled_by_name ?? "another instructor"}` : "";
                const content = <><strong>{formatTime(entry.start_at)}–{formatTime(entry.end_at)}</strong><span className={styles.entryMeta}>{entry.entry_type === "lesson" ? `${entry.student_name} · ${lessonLabel}` : entry.unavailable_kind === "aircraft" ? `${aircraftLabel} unavailable${entry.block_owner_name && !entry.is_own ? ` · ${entry.block_owner_name}` : ""}` : entry.unavailable_kind === "instructor" ? `My unavailable time${entry.note ? ` · ${entry.note}` : ""}` : "Busy"}</span>{assignmentLabel ? <span className={styles.entryMeta}>{assignmentLabel}</span> : null}{changes.some((change) => change.after.id === entry.id) ? <span className={styles.entryMeta}>Unpublished draft</span> : null}{warnings.length ? <span className={styles.conflict}>⚠ {warnings.length} issue{warnings.length === 1 ? "" : "s"}</span> : null}</>;
                const dropMode = lessonDropTarget?.id === entry.id ? lessonDropTarget.mode : null;
                const className = `${styles.entry} ${entry.entry_type === "unavailable" ? (entry.unavailable_kind === "aircraft" ? styles.aircraftUnavailable : styles.busy) : entry.lesson_kind === "ground" ? styles.ground : entry.lesson_kind === "solo" ? styles.solo : styles.flight} ${entry.aircraft_status && entry.aircraft_status !== "available" ? styles.aircraftStatusWarning : ""} ${dropMode === "swap" ? styles.swapTarget : dropMode === "before" ? styles.dropBefore : dropMode === "after" ? styles.dropAfter : ""}`;
                const canSwapEntry = isCfiView && entry.entry_type === "lesson" && entry.status === "scheduled" && entry.can_edit !== false;
                const canManageEntry = entry.entry_type === "lesson" || entry.is_own;
                return (isCfiView && canManageEntry) || entry.is_own ? <button key={entry.id} type="button" className={className} disabled={!weekReady || saving} draggable={canSwapEntry && !saving}
                  data-drop-label={dropMode ? dropMode === "swap" ? "Swap" : dropMode === "before" ? "Place before" : "Place after" : undefined}
                  title={canSwapEntry ? "Drag to another day, or before, onto, or after an entry" : undefined}
                  onDragStart={(event) => {
                    if (!canSwapEntry) { event.preventDefault(); return; }
                    dragSourceId.current = entry.id;
                    suppressEntryClick.current = true;
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", entry.id);
                  }}
                  onDragOver={(event) => {
                    if (!isCfiView || !dragSourceId.current || dragSourceId.current === entry.id) return;
                    event.stopPropagation();
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    const rect = event.currentTarget.getBoundingClientRect();
                    setDayDropTarget("");
                    setLessonDropTarget({ id: entry.id, mode: lessonDropMode(event.clientY, rect.top, rect.height, entry.entry_type === "lesson") });
                  }}
                  onDrop={(event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    const sourceId = event.dataTransfer.getData("text/plain") || dragSourceId.current;
                    suppressEntryClick.current = true;
                    const rect = event.currentTarget.getBoundingClientRect();
                    const mode = lessonDropMode(event.clientY, rect.top, rect.height, entry.entry_type === "lesson");
                    if (mode === "swap" && entry.entry_type === "lesson") void swapLessons(sourceId, entry.id);
                    else moveLessonRelative(sourceId, entry, mode === "before" ? "before" : "after");
                  }}
                  onDragEnd={() => {
                    resetLessonDrag();
                    window.setTimeout(() => { suppressEntryClick.current = false; }, 0);
                  }}
                  onClick={() => {
                  if (suppressEntryClick.current) { suppressEntryClick.current = false; return; }
                  if (!isCfiView) { setDetailEntry(entry); setDrawer("details"); }
                  else if (entry.entry_type === "lesson" && entry.can_edit !== false) openEditLesson(entry);
                  else if (entry.entry_type === "lesson") { setDetailEntry(entry); setDrawer("details"); }
                  else if (entry.unavailable_kind === "instructor") openTeachingDrawer();
                  else { const block = blocks.find((item) => item.id === entry.id); if (block) openBlockDrawer(date, block); }
                }}>{content}</button> : <div key={entry.id} className={className}>{content}</div>;
              })}
            </div>
          </section>;
        })}
      </div>
      {!calendarView ? <button type="button" className={`${styles.textButton} ${styles.moreDates}`} disabled={!weekReady || saving} onClick={() => setAgendaDays((current) => current + 14)}>Show 2 more weeks</button> : null}
      {isCfiView && !activeStudents.length ? <button type="button" className={styles.textButton} onClick={openAccessDrawer}>Choose students from People</button> : null}

      <DetailDrawer compact open={drawer === "students"} onClose={() => setDrawer(null)} title="Students" description="Availability and weekly goals." width="wide">

          <p className="saas-meta-text">{activeStudents.length} active · Week of {formatDate(weekStart)}. General targets can be overridden for this week.</p>
          {!activeStudents.length ? <EmptyState title="No students have schedule access" description="Choose students already saved in People using Manage access. An account is not required." /> : (
            <div className="mt-4 max-w-full overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead><tr className="border-b border-slate-200 text-slate-500"><th className="py-2">Student</th><th>Weekly target</th><th>Duration</th><th>Availability this week</th><th className="text-right">Action</th></tr></thead><tbody>{activeStudents.map((student) => {
              const override = weekOverrides.find((item) => item.student_user_id === student.student_user_id);
              const availabilityCount = displayDays.filter((day) => availabilityForDate({ date: day, studentUserId: student.student_user_id, slots, overrideDates }).length > 0).length;
              return <tr key={student.student_user_id} className="border-b border-slate-100"><td className="py-2 font-semibold text-slate-900"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: student.color }} />{student.student_name}</td><td>{override?.target_sessions ?? student.default_weekly_sessions}{override ? " · override" : ""}</td><td>{override?.duration_min ?? student.default_duration_min} min</td><td>{availabilityCount} day{availabilityCount === 1 ? "" : "s"}</td><td className="text-right">{student.storage_kind === "person" ? <button className="ghost-button" type="button" disabled={!weekReady || saving} onClick={() => openAvailabilityDrawer("weekly", 1, localDateKey(new Date()), student.student_user_id)}>Availability</button> : null}<button className="ghost-button" type="button" disabled={hasDraft || saving} onClick={() => openStudentSettings(student)}>Settings</button></td></tr>;
            })}</tbody></table></div>
          )}
      </DetailDrawer>
      <DetailDrawer compact open={drawer === "availability-overview"} onClose={() => setDrawer(null)} title="Student availability" description="Tap an available time to add a lesson." width="wide">
        <div className={styles.availabilityWeekNav}>
          <button className={styles.weekArrow} type="button" aria-label="Previous availability week" disabled={hasDraft || saving} onClick={() => jumpToDate(localDateKey(addCalendarDays(weekStart, -7)))}>‹</button>
          <strong>{formatDate(availabilityOverviewDays[0])} – {formatDate(availabilityOverviewDays[6])}</strong>
          <button className={styles.weekArrow} type="button" aria-label="Next availability week" disabled={hasDraft || saving} onClick={() => jumpToDate(localDateKey(addCalendarDays(weekStart, 7)))}>›</button>
        </div>
        <div className={styles.availabilityOverview} aria-busy={!weekReady}>
          {activeStudents.map((student) => {
            const studentDays = availabilityOverviewDays.map((day) => ({ day, periods: availabilityForDate({ date: day, studentUserId: student.student_user_id, slots, overrideDates }) }));
            return <section className={styles.studentAvailability} key={student.student_user_id} aria-label={`${student.student_name} availability`}>
              <div className={styles.studentAvailabilityHeader}><span className={styles.studentColor} style={{ background: student.color }} aria-hidden="true" /><strong>{student.student_name}</strong></div>
              <div className={styles.availabilityDayGrid}>{studentDays.map(({ day, periods }) => {
                const date = localDateKey(day);
                return <div className={styles.availabilityDay} key={date} data-empty={!periods.length}>
                  <div className={styles.availabilityDayLabel}><strong>{new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(day)}</strong><span>{new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(day)}</span></div>
                  <div className={styles.availabilityPeriods}>{periods.length ? periods.map((period) => {
                    const start = localDateTimeValue(period.start).slice(11);
                    const label = `${formatTime(period.start.toISOString())}–${formatTime(period.end.toISOString())}`;
                    return <button type="button" key={`${period.start.toISOString()}-${period.end.toISOString()}`} disabled={!weekReady || saving} aria-label={`Schedule ${student.student_name} on ${formatDate(day)} at ${formatTime(period.start.toISOString())}`} onClick={() => openNewLesson(date, start, student.student_user_id)}>{label}</button>;
                  }) : <span>Unavailable</span>}</div>
                </div>;
              })}</div>
            </section>;
          })}
        </div>
      </DetailDrawer>
      <DetailDrawer compact open={drawer === "review"} onClose={() => setDrawer(null)} title="Your availability" description="Check the next 14 days.">
        <div className="flex flex-wrap gap-3"><button type="button" className={styles.textButton} onClick={() => setDrawer("weekly")}>Set usual week</button><button type="button" className={styles.textButton} disabled={!aircraft.length} onClick={openAircraftPreferences}>Aircraft preferences</button></div>
        <div className={styles.weeklyList}>{Array.from({length:14},(_,i)=>addCalendarDays(new Date(),i)).map(day=>{
          const date=localDateKey(day);
          const times=availabilityForDate({date:day,studentUserId:activeStudent?.student_user_id ?? userId,slots,overrideDates});
          return <button type="button" key={date} disabled={!weekReady || saving} aria-label={`Review availability on ${date}`} onClick={()=>openAvailabilityDrawer("date",day.getDay()||7,date)}><span>{new Intl.DateTimeFormat(undefined,{weekday:"short",month:"short",day:"numeric"}).format(day)}</span><span>{times.map(period=>`${formatTime(period.start.toISOString())}–${formatTime(period.end.toISOString())}`).join(", ") || "Unavailable"} ›</span></button>;
        })}</div>
        <label className="my-4 flex items-center gap-3 text-sm"><input type="checkbox" checked={reviewChecked} onChange={event=>setReviewChecked(event.target.checked)} /><span>Checked through {formatDate(addCalendarDays(new Date(),13))}</span></label>
        {error ? <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p> : null}
        <button type="button" className="primary-button" disabled={!reviewChecked || saving || !weekReady} onClick={()=>void confirmReviewedDates()}>{saving ? "Saving…" : "Confirm next 2 weeks"}</button>
      </DetailDrawer>
      <DetailDrawer compact open={drawer === "weekly"} onClose={() => setDrawer(null)} title="Availability" description="Set several days at once.">
        {error ? <p role="alert" className="my-3 text-sm text-rose-700">{error}</p> : null}
        <section className={styles.quickAvailability}>
          <span className={styles.quickLabel}>Days</span>
          <div className={styles.dayChips} aria-label="Available weekdays">{weekdayLabels.map((label,index) => {
            const weekday = index + 1;
            return <button key={label} type="button" aria-label={label} aria-pressed={quickWeekdays.includes(weekday)} onClick={() => setQuickWeekdays((current) => current.includes(weekday) ? current.filter((day) => day !== weekday) : [...current, weekday].sort())}>{label.slice(0,2)}</button>;
          })}</div>
          <div className={styles.quickTimes}>
            <label className="saas-field"><span>Start</span><input className={styles.nativePicker} data-native-picker type="time" value={quickAvailability.start} onClick={(event) => showNativePicker(event.currentTarget)} onChange={(event) => setQuickAvailability((current) => ({ ...current, start: event.target.value }))} /></label>
            <label className="saas-field"><span>End</span><input className={styles.nativePicker} data-native-picker type="time" value={quickAvailability.end} onClick={(event) => showNativePicker(event.currentTarget)} onChange={(event) => setQuickAvailability((current) => ({ ...current, end: event.target.value }))} /></label>
          </div>
          <button type="button" className="primary-button" disabled={!weekReady || saving || !quickWeekdays.length} onClick={() => void applyQuickAvailability()}>{saving ? "Saving…" : "Save for 4 weeks"}</button>
        </section>
        <details className={styles.individualDays}>
          <summary>Edit individual days</summary>
          <div className={styles.weeklyList}>{weekdayLabels.map((label,index) => {
            const periods = slots.filter((slot) => slot.student_user_id === activeStudent?.student_user_id && slot.scope === "weekly" && slot.weekday === index + 1);
            return <button key={label} type="button" onClick={() => openAvailabilityDrawer("weekly", index + 1)}><span>{label}</span><span>{periods.length ? periods.map((slot) => `${minutesToTime(slot.start_minute)}–${minutesToTime(slot.end_minute)}`).join(", ") : "Unavailable"} ›</span></button>;
          })}</div>
        </details>
      </DetailDrawer>
      <DetailDrawer compact open={drawer === "details"} onClose={() => setDrawer(null)} title="Lesson details">
        {detailEntry ? <div className="space-y-3"><p className="font-semibold">{formatDate(new Date(detailEntry.start_at))} · {formatTime(detailEntry.start_at)}–{formatTime(detailEntry.end_at)}</p><p className="capitalize">{detailEntry.lesson_kind}</p>{detailEntry.assigned_instructor_name ? <p>Instructor: {detailEntry.assigned_instructor_name}</p> : null}{detailEntry.scheduled_by_name && detailEntry.scheduled_by_user_id !== detailEntry.assigned_instructor_user_id ? <p className="text-sm text-slate-600">Assigned by {detailEntry.scheduled_by_name}</p> : null}{detailEntry.aircraft_tail_number ? <p>{detailEntry.aircraft_tail_number}{detailEntry.aircraft_status && detailEntry.aircraft_status !== "available" ? ` · ${detailEntry.aircraft_status.replace("_", " ")}` : " · Available"}</p> : null}{detailEntry.note ? <p className="whitespace-pre-wrap">{detailEntry.note}</p> : null}{entryWarnings(detailEntry).map((warning) => <p key={warning} className="text-sm text-amber-800">⚠ {warning}</p>)}</div> : null}
      </DetailDrawer>

      <DetailDrawer compact open={drawer === "access"} onClose={() => setDrawer(null)} title="Manage schedule access" description="Students who can use this schedule.">
        <div className={styles.accessToolbar}><span>{authorizedCandidates.length} authorized</span><button className="secondary-button" type="button" onClick={() => { setAccessPickerOpen(true); setAccessSearch(""); setAccessSelection([]); }}>＋ Add students</button></div>
        <div className={styles.accessList}>
          {!authorizedCandidates.length ? <p className="saas-empty-state">No students are authorized.</p> : authorizedCandidates.map((candidate) => (
            <div key={candidate.student_user_id} className={styles.accessRow}><span><strong>{candidate.student_name}</strong><small>{candidate.account_user_id ? "Account linked" : "Instructor-managed"}</small></span><button className="ghost-button" type="button" onClick={() => setPermissionDraft((current) => current.filter((id) => id !== candidate.student_user_id))}>Remove</button></div>
          ))}
        </div>
        {accessPickerOpen ? <section className={styles.accessPicker} aria-label="Add students">
          <div className={styles.accessSearch}><input type="search" value={accessSearch} placeholder="Search students" aria-label="Search students" onChange={(event) => setAccessSearch(event.target.value)} /><button className={styles.textButton} type="button" disabled={!addableCandidates.length} onClick={() => setAccessSelection(addableCandidates.map((candidate) => candidate.student_user_id))}>Select all</button></div>
          <div className={styles.accessPickerList}>{!addableCandidates.length ? <p className="saas-empty-state">No more students to add.</p> : addableCandidates.map((candidate) => <label key={candidate.student_user_id}><input type="checkbox" checked={accessSelection.includes(candidate.student_user_id)} onChange={(event) => setAccessSelection((current) => event.target.checked ? [...current, candidate.student_user_id] : current.filter((id) => id !== candidate.student_user_id))} /><span><strong>{candidate.student_name}</strong><small>{candidate.account_user_id ? "Account linked" : "Instructor-managed"}</small></span></label>)}</div>
          <div className="mt-3 flex justify-end gap-2"><button className="ghost-button" type="button" onClick={() => { setAccessPickerOpen(false); setAccessSelection([]); }}>Cancel</button><button className="primary-button" type="button" disabled={!accessSelection.length} onClick={() => { setPermissionDraft((current) => [...new Set([...current, ...accessSelection])]); setAccessPickerOpen(false); setAccessSelection([]); }}>Add selected</button></div>
        </section> : null}
        <div className="mt-5 flex justify-end gap-2"><button className="ghost-button" type="button" onClick={() => setDrawer(null)}>Cancel</button><button className="primary-button" type="button" disabled={saving} onClick={requestPermissionApply}>Apply changes</button></div>
      </DetailDrawer>

      <DetailDrawer compact open={drawer === "availability"} onClose={() => { setDrawer(drawerReturn); setDrawerReturn(null); }} title="Availability" description={availabilityScope === "weekly" ? "Edit the whole week." : "Override one date."}>
        {error ? <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p> : null}
        {isCfiView ? <div className={styles.availabilityStudentBar}><p className={styles.availabilityStudentName}>{cfiAccess.find((item) => item.student_user_id === availabilityStudentId)?.student_name}</p><label className={styles.weeklyTargetField}><span>Weekly target</span><input aria-label="Weekly target" type="number" inputMode="numeric" min={0} max={14} disabled={saving || hasDraft} value={availabilityWeeklyTarget} onChange={(event) => setAvailabilityWeeklyTarget(Number(event.target.value))} /><span>lessons</span></label></div> : null}
        <div className={styles.availabilityModeBar}>
          <div className={styles.modeSwitch} aria-label="Availability scope"><button type="button" aria-pressed={availabilityScope === "weekly"} onClick={() => openAvailabilityDrawer("weekly", availabilityWeekday)}>Usual week</button><button type="button" aria-pressed={availabilityScope === "date"} onClick={() => openAvailabilityDrawer("date", 1, availabilityDate)}>One date</button></div>
          {availabilityScope === "weekly" ? <label className={styles.repeatToggle}><input type="checkbox" checked={autofillDates} onChange={(event) => setAutofillDates(event.target.checked)} />Fill next 4 weeks</label> : null}
        </div>
        {availabilityScope === "weekly" ? <div className={styles.weeklyEditor}>{weekdayLabels.map((label, index) => {
          const weekday = index + 1;
          const rows = weeklyAvailabilityRows[weekday];
          return <section key={label} className={styles.weeklyEditorDay}><header><strong>{label}</strong><button className={styles.textButton} type="button" onClick={() => setWeeklyAvailabilityRows((current) => ({ ...current, [weekday]: [...current[weekday], { start: "", end: "" }] }))}>＋ Time</button></header>{rows.length ? <div className={styles.weeklyEditorRows}>{rows.map((row, rowIndex) => <div key={rowIndex} className={styles.weeklyEditorRow}><input className={styles.nativePicker} data-native-picker aria-label={`${label} start`} type="time" value={row.start} onClick={(event) => showNativePicker(event.currentTarget)} onChange={(event) => setWeeklyAvailabilityRows((current) => ({ ...current, [weekday]: current[weekday].map((item, itemIndex) => itemIndex === rowIndex ? { ...item, start: event.target.value } : item) }))} /><span>–</span><input className={styles.nativePicker} data-native-picker aria-label={`${label} end`} type="time" value={row.end} onClick={(event) => showNativePicker(event.currentTarget)} onChange={(event) => setWeeklyAvailabilityRows((current) => ({ ...current, [weekday]: current[weekday].map((item, itemIndex) => itemIndex === rowIndex ? { ...item, end: event.target.value } : item) }))} /><button className="ghost-button" type="button" aria-label={`Remove ${label} time`} onClick={() => setWeeklyAvailabilityRows((current) => ({ ...current, [weekday]: current[weekday].filter((_, itemIndex) => itemIndex !== rowIndex) }))}>Remove</button></div>)}</div> : <span className={styles.unavailableLabel}>Unavailable</span>}</section>;
        })}</div> : <div className="grid gap-4">
          <label className="saas-field"><span>Date</span><input className={styles.nativePicker} data-native-picker type="date" min={localDateKey(new Date())} max={maxAvailabilityDate} value={availabilityDate} onClick={(event) => showNativePicker(event.currentTarget)} onChange={(event) => openAvailabilityDrawer("date", 1, event.target.value)} /></label>
          {availabilityRows.map((row, index) => <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2"><label className="saas-field"><span>Start</span><input className={styles.nativePicker} data-native-picker type="time" value={row.start} onClick={(event) => showNativePicker(event.currentTarget)} onChange={(event) => setAvailabilityRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, start: event.target.value } : item))} /></label><label className="saas-field"><span>End</span><input className={styles.nativePicker} data-native-picker type="time" value={row.end} onClick={(event) => showNativePicker(event.currentTarget)} onChange={(event) => setAvailabilityRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, end: event.target.value } : item))} /></label><button className="ghost-button" type="button" onClick={() => setAvailabilityRows((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button></div>)}
          <button className="secondary-button justify-self-start" type="button" onClick={() => setAvailabilityRows((current) => [...current, { start: "", end: "" }])}>＋ Add time</button>
        </div>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">{availabilityScope === "date" && overrideDates.some((item) => item.student_user_id === availabilityStudentId && item.availability_date === availabilityDate) ? <button className="ghost-button" type="button" disabled={saving} onClick={() => void clearDateOverride()}>Use general rule</button> : null}<button className="ghost-button" type="button" onClick={() => { setDrawer(drawerReturn); setDrawerReturn(null); }}>Cancel</button><button className="primary-button" type="button" disabled={saving} onClick={() => void saveAvailability()}>{saving ? "Saving…" : "Apply"}</button></div>
      </DetailDrawer>

      <DetailDrawer compact open={drawer === "aircraft-preferences"} onClose={() => { if (!saving) { setDrawer(drawerReturn); setDrawerReturn(null); } }} title="Aircraft preferences" description="Select any aircraft you prefer for flight lessons.">
        {error ? <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p> : null}
        <div className={styles.aircraftChoices}>{aircraft.filter((item) => item.operational_status !== "away").map((item) => <label key={item.id}><input type="checkbox" checked={aircraftPreferenceDraft.includes(item.id)} onChange={(event) => setAircraftPreferenceDraft((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /><span><strong>{item.tail_number}</strong>{item.model_name ? ` · ${item.model_name}` : ""}{item.operational_status !== "available" ? ` · ${item.operational_status.replace("_", " ")}` : ""}</span></label>)}</div>
        {!aircraft.some((item) => item.operational_status !== "away") ? <p className="text-sm text-slate-600">No aircraft are available on this schedule.</p> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2"><button className="ghost-button mr-auto" type="button" disabled={saving || !aircraftPreferenceDraft.length} onClick={() => setAircraftPreferenceDraft([])}>Clear preferences</button><button className="ghost-button" type="button" disabled={saving} onClick={() => { setDrawer(drawerReturn); setDrawerReturn(null); }}>Cancel</button><button className="primary-button" type="button" disabled={saving} onClick={() => void saveAircraftPreferences()}>{saving ? "Saving…" : "Save preferences"}</button></div>
      </DetailDrawer>

      <DetailDrawer compact open={drawer === "lesson"} onClose={() => { setDrawer(null); setResumeLessons([]); }} title={lesson.id ? "Edit lesson" : "Add lesson"} description="Changes stay unpublished until Review & publish.">
        {error ? <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p> : null}
        <div className="grid gap-3">
          <label className="saas-field"><span>Student</span><select value={lesson.studentUserId} disabled={Boolean(lesson.id)} onChange={(event) => { setLessonWarnings([]); setLesson((current) => ({ ...current, studentUserId: event.target.value })); }}><option value="">Select student</option>{activeStudents.map((student) => <option key={student.student_user_id} value={student.student_user_id}>{student.student_name}</option>)}</select></label>
          {assignmentInstructors.length > 1 ? <label className="saas-field"><span>Instructor</span><select value={lesson.assignedInstructorId || userId} onChange={(event) => { setLessonWarnings([]); setLesson((current) => ({ ...current, assignedInstructorId: event.target.value })); }}>{assignmentInstructors.map((instructor) => <option key={instructor.user_id} value={instructor.user_id}>{instructor.user_id === userId ? `${instructor.name} (me)` : instructor.name}</option>)}</select></label> : null}
          <div className="grid grid-cols-2 gap-3"><label className="saas-field"><span>Date</span><input className={styles.nativePicker} data-native-picker type="date" value={lesson.date} onClick={(event) => showNativePicker(event.currentTarget)} onChange={(event) => { setLessonWarnings([]); setLesson((current) => ({ ...current, date: event.target.value })); }} /></label><label className="saas-field"><span>Start</span><input className={styles.nativePicker} data-native-picker type="time" step={900} value={lesson.start} onClick={(event) => showNativePicker(event.currentTarget)} onChange={(event) => { setLessonWarnings([]); setLesson((current) => ({ ...current, start: event.target.value })); }} /></label></div>
          <div className="grid grid-cols-2 gap-3"><label className="saas-field"><span>Type</span><select value={lesson.kind} onChange={(event) => { setLessonWarnings([]); setLesson((current) => ({ ...current, kind: event.target.value as LessonKind, aircraftId: event.target.value === "ground" ? "" : current.aircraftId })); }}><option value="flight">Flight</option><option value="solo">Solo</option><option value="ground">Ground</option></select></label><label className="saas-field"><span>Duration</span><select value={lesson.durationMin} onChange={(event) => { setLessonWarnings([]); setLesson((current) => ({ ...current, durationMin: Number(event.target.value) })); }}>{[60, 90, 120, 150, 180, 240].map((value) => <option key={value} value={value}>{value} minutes</option>)}</select></label></div>
          {lesson.kind !== "ground" ? <label className="saas-field"><span>Aircraft</span><select value={lesson.aircraftId} onChange={(event) => { setLessonWarnings([]); setLesson((current) => ({ ...current, aircraftId: event.target.value })); }}><option value="" disabled={lesson.kind === "solo"}>{lesson.kind === "solo" ? "Choose aircraft" : "Not assigned"}</option>{aircraftOptionGroups.map((group) => <optgroup key={group.key} label={group.label}>{group.items.map((item) => <option key={item.id} value={item.id}>{item.tail_number}{item.model_name ? ` · ${item.model_name}` : ""}{item.operational_status !== "available" ? ` · ${item.operational_status.replace("_", " ")}` : ""}</option>)}</optgroup>)}</select></label> : null}
          <label className="saas-field"><span>Note</span><textarea rows={3} maxLength={500} value={lesson.note} onChange={(event) => { setLessonWarnings([]); setLesson((current) => ({ ...current, note: event.target.value })); }} /></label>
          {previewChanges.length ? <div><p className="mb-2 text-sm font-semibold">Changes in this edit · {previewChanges.length} lesson(s)</p>{renderChangePreview(previewChanges, lessonPreviewEntries)}</div> : null}
          {lessonWarnings.length ? <div role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-900"><p className="font-semibold">Schedule issues</p><ul className="mt-1 list-disc pl-5">{lessonWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul><p className="mt-2 text-xs">These are warnings only. You can still save.</p></div> : null}
        </div>
        {resumeLessons.length ? <p className="mt-3 text-xs text-slate-600">Save this lesson to return to the time change you were making.</p> : null}
        {lessonConflicts.length ? <div role="alert" className="mt-3 border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <p className="font-semibold">Overlaps {lessonConflicts.length} other lesson{lessonConflicts.length === 1 ? "" : "s"}</p>
          {lessonConflicts.map((conflict) => <div key={conflict.id} className="mt-2 flex items-center justify-between gap-2 border-t border-amber-200 pt-2">
            <span>{conflict.student_name} · {formatDate(new Date(conflict.start_at))} · {formatTime(conflict.start_at)}–{formatTime(conflict.end_at)}</span>
            <button type="button" className="text-sm font-semibold text-blue-800 underline underline-offset-2" onClick={() => { const pending = lesson; const previous = resumeLessons; openEditLesson(conflict); setResumeLessons([...previous, pending]); setError(""); }}>Edit</button>
          </div>)}
        </div> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">{lesson.id ? <button className="danger-button mr-auto" type="button" disabled={saving} onClick={() => void confirmCancelLesson(lesson.id)}>Cancel lesson</button> : null}<button className="ghost-button" type="button" onClick={() => { setDrawer(null); setResumeLessons([]); }}>Close</button><button className="primary-button" type="button" disabled={saving || !lesson.studentUserId || (lesson.kind === "solo" && !lesson.aircraftId) || lessonConflicts.length > 0} onClick={() => void saveLesson(lessonWarnings.length > 0)}>{lessonWarnings.length ? lesson.id ? "Update anyway" : "Add anyway" : lesson.id ? "Update draft" : "Add to draft"}</button></div>
      </DetailDrawer>

      <DetailDrawer compact open={drawer === "publish"} onClose={() => { if (!saving) setDrawer(null); }} title="Review & publish schedule" description="Review the final changes, not intermediate edits. Each affected student receives at most one notification, according to their preferences.">
        {error ? <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p> : null}
        {stale ? <div role="alert" className="mb-3 rounded-md bg-amber-50 p-2.5 text-sm text-amber-900"><p>The published schedule or availability changed. Your draft has not overwritten anything.</p><button className="secondary-button mt-2" type="button" disabled={saving} onClick={() => void reviewLatestDraft()}>Load latest &amp; rebuild preview</button></div> : null}
        {renderChangePreview(changes)}
        {scheduleHasOverlap(entries) ? <p role="alert" className="mt-3 text-sm text-rose-700">The rebuilt draft contains conflicting lessons. Close this preview and adjust them before publishing.</p> : null}
        {publishWarnings.length ? <label className="mt-4 flex items-start gap-2 rounded-md bg-amber-50 p-2.5 text-sm text-amber-900"><input type="checkbox" checked={publishAcknowledged} onChange={(event) => setPublishAcknowledged(event.target.checked)} /><span>I reviewed the availability, resource and time-limit warnings and want to publish anyway.</span></label> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2"><button className="danger-button mr-auto" type="button" disabled={saving} onClick={() => setDiscardOpen(true)}>Discard draft</button><button className="ghost-button" type="button" disabled={saving} onClick={() => setDrawer(null)}>Keep editing</button><button className="primary-button" type="button" disabled={saving || stale || !changes.length || scheduleHasOverlap(entries) || (publishWarnings.length > 0 && !publishAcknowledged)} onClick={() => void publishDraft()}>{saving ? "Publishing…" : "Confirm & notify students"}</button></div>
      </DetailDrawer>

      <DetailDrawer compact open={drawer === "block"} onClose={() => { if (!saving) setDrawer(null); }} title={editingBlockId ? "Edit aircraft unavailable time" : "Mark aircraft unavailable"} description="Choose the time. Flight lessons will avoid it; Ground is unaffected. Saves immediately without publishing your lesson draft.">
        {error ? <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p> : null}
        <BlockForm value={blockForm} aircraft={aircraft} onChange={setBlockForm} />
        <div className="mt-5 flex flex-wrap justify-end gap-2">{editingBlockId ? <button className="ghost-button mr-auto text-rose-700" type="button" disabled={saving} onClick={() => setDeleteBlockId(editingBlockId)}>Remove block</button> : null}<button className="ghost-button" type="button" disabled={saving} onClick={() => setDrawer(null)}>Cancel</button><button className="primary-button" type="button" disabled={saving || !blockForm.aircraftId} onClick={() => void saveBlock()}>{saving ? "Saving…" : editingBlockId ? "Save changes" : "Add block"}</button></div>
      </DetailDrawer>

      <DetailDrawer compact open={drawer === "teaching"} onClose={() => { if (!saving) { setDrawer(drawerReturn); setDrawerReturn(null); } }} title="My teaching time" description="Usual hours and unavailable time.">
        {error ? <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p> : null}
        <section className={styles.formSection}>
          <h3 className="text-sm font-semibold text-slate-900">Usual week</h3>
          <div className={styles.compactChecks} role="group" aria-label="Teaching days">{weekdayLabels.map((label, index) => <label key={label}><input type="checkbox" checked={ruleForm.weekdays.includes(index + 1)} onChange={(event) => setRuleForm((current) => ({ ...current, weekdays: event.target.checked ? [...current.weekdays, index + 1] : current.weekdays.filter((day) => day !== index + 1) }))} />{label.slice(0, 3)}</label>)}</div>
          <div className={styles.teachingTimeGrid}><label className="saas-field"><span>Start</span><input className={styles.nativePicker} type="time" value={minutesToTime(ruleForm.start_minute)} onClick={(event) => showNativePicker(event.currentTarget)} onChange={(event) => { const startMinute = timeToMinutes(event.target.value); setRuleForm((current) => updateTeachingWindow(current, startMinute, current.end_minute)); }} /></label><label className="saas-field"><span>End</span><input className={styles.nativePicker} type="time" value={minutesToAvailabilityEnd(ruleForm.end_minute)} onClick={(event) => showNativePicker(event.currentTarget)} onChange={(event) => { const endMinute = availabilityEndToMinutes(event.target.value); setRuleForm((current) => updateTeachingWindow(current, current.start_minute, endMinute)); }} /></label></div>
          <label className={`saas-field ${styles.teachingLimit}`}><span>Daily teaching limit</span><input type="number" inputMode="decimal" min={0.25} max={Math.max(0.25, (ruleForm.end_minute - ruleForm.start_minute) / 60)} step={0.25} value={ruleForm.max_daily_teaching_min / 60} onChange={(event) => setRuleForm((current) => ({ ...current, max_daily_teaching_min: Math.round(Number(event.target.value) * 60) }))} /></label>
          <div className={styles.formActions}><button className="primary-button" type="button" disabled={saving} onClick={() => void confirmTeachingRules()}>{saving ? "Saving…" : "Save usual week"}</button></div>
        </section>
        <section className={styles.formSection}>
          <h3 className="text-sm font-semibold text-slate-900">Unavailable time</h3><p className="mt-1 text-sm text-slate-600">Use the same date for a short break, or a date range for vacation.</p>
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-900"><input type="checkbox" checked={timeOffForm.allDay} onChange={(event) => setTimeOffForm((current) => ({ ...current, allDay: event.target.checked }))} />Full day or vacation</label>
          <div className="mt-3 grid grid-cols-2 gap-3"><label className="saas-field"><span>From date</span><input className={styles.nativePicker} type="date" value={timeOffForm.startDate} onClick={(event) => showNativePicker(event.currentTarget)} onChange={(event) => setTimeOffForm((current) => ({ ...current, startDate: event.target.value }))} /></label><label className="saas-field"><span>To date (inclusive)</span><input className={styles.nativePicker} type="date" value={timeOffForm.endDate} onClick={(event) => showNativePicker(event.currentTarget)} onChange={(event) => setTimeOffForm((current) => ({ ...current, endDate: event.target.value }))} /></label>{!timeOffForm.allDay ? <><label className="saas-field"><span>From time</span><input className={styles.nativePicker} type="time" value={timeOffForm.start} onClick={(event) => showNativePicker(event.currentTarget)} onChange={(event) => setTimeOffForm((current) => ({ ...current, start: event.target.value }))} /></label><label className="saas-field"><span>To time</span><input className={styles.nativePicker} type="time" value={timeOffForm.end} onClick={(event) => showNativePicker(event.currentTarget)} onChange={(event) => setTimeOffForm((current) => ({ ...current, end: event.target.value }))} /></label></> : null}</div>
          <label className="saas-field mt-3"><span>Note (private)</span><input maxLength={300} value={timeOffForm.note} placeholder="Optional" onChange={(event) => setTimeOffForm((current) => ({ ...current, note: event.target.value }))} /></label>
          <div className="mt-3 flex justify-end"><button className="secondary-button" type="button" disabled={saving} onClick={() => void confirmTimeOff()}>Add unavailable time</button></div>
          {instructorTimeOff.length ? <div className="mt-4 divide-y divide-slate-200 border-t border-slate-200">{instructorTimeOff.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span className="text-slate-900">{formatDate(new Date(item.start_at))} {formatTime(item.start_at)} – {formatDate(new Date(item.end_at))} {formatTime(item.end_at)}{item.note ? ` · ${item.note}` : ""}</span><button className="ghost-button shrink-0" type="button" disabled={saving} onClick={() => void removeTimeOff(item.id)}>Remove</button></div>)}</div> : null}
        </section>
      </DetailDrawer>

      <DetailDrawer compact open={drawer === "auto"} onClose={() => setDrawer(null)} title="Automatic scheduling" description="Choose aircraft and weekly totals.">
        {error ? <p role="alert" className="mb-3 text-sm text-rose-700">{error}</p> : null}
        <div className={styles.autoUtility}><button className={styles.textButton} type="button" onClick={openTeachingDrawer}>Teaching time</button><InfoHint label="How teaching time is used">Automatic scheduling follows your teaching window, daily teaching total, and unavailable time.</InfoHint></div>
        <section className={styles.formSection}><div className={styles.sectionHeading}><h3 className="text-sm font-semibold text-slate-900">Aircraft</h3><InfoHint label="Aircraft selection help">Only aircraft currently marked Available can be selected. Each Flight lesson receives one selected aircraft.</InfoHint></div><div className={styles.aircraftChoices}>{automaticAircraft.map((item) => <label key={item.id}><input type="checkbox" checked={selectedAircraftIds.includes(item.id)} onChange={(event) => { setSelectedAircraftIds((current) => event.target.checked ? [...current,item.id] : current.filter((id) => id !== item.id)); setAutoPreviewBuilt(false); setAutoDrafts([]); }} /><span><strong>{item.tail_number}</strong>{item.model_name ? ` · ${item.model_name}` : ""}</span></label>)}</div>{!automaticAircraft.length ? <p className="mt-2 text-sm text-amber-800">No available aircraft. Ground lessons can still be generated.</p> : null}</section>
        <section className={styles.formSection}>
          <div className="flex flex-wrap items-center justify-between gap-3"><div className={styles.sectionHeading}><h3 className="text-sm font-semibold text-slate-900">Students</h3><InfoHint label="Weekly totals help">Enter the desired Flight and Ground totals for this run. Existing lessons are counted, so only the missing number is added.</InfoHint></div><div className="flex gap-1"><button className={styles.textButton} type="button" onClick={() => { setError(""); setAutoRequests((current) => current.map((item) => ({ ...item, selected: true, flightSessions: Math.max(1, item.flightSessions) }))); setAutoPreviewBuilt(false); setAutoDrafts([]); setAutoUnscheduled([]); }}>Select all</button><button className={styles.textButton} type="button" onClick={() => { setError(""); setAutoRequests((current) => current.map((item) => ({ ...item, selected: false }))); setAutoPreviewBuilt(false); setAutoDrafts([]); setAutoUnscheduled([]); }}>Clear</button></div></div>
          <div className={styles.autoRoster} role="group" aria-label="Students to automatically schedule">
            {activeStudents.map((student) => {
              const request = autoRequests.find((item) => item.studentUserId === student.student_user_id) ?? { studentUserId: student.student_user_id, flightSessions: 1, groundSessions: 0, selected: false };
              const override = weekOverrides.find((item) => item.student_user_id === student.student_user_id);
              const duration = override?.duration_min ?? student.default_duration_min;
              const existingFlight = entries.filter((entry) => entry.entry_type === "lesson" && entry.status === "scheduled" && entry.student_user_id === student.student_user_id && entry.lesson_kind === "flight" && localDateKey(new Date(entry.start_at)) >= localDateKey(weekStart) && localDateKey(new Date(entry.start_at)) < localDateKey(addCalendarDays(weekStart, 7))).length;
              const existingGround = entries.filter((entry) => entry.entry_type === "lesson" && entry.status === "scheduled" && entry.student_user_id === student.student_user_id && entry.lesson_kind === "ground" && localDateKey(new Date(entry.start_at)) >= localDateKey(weekStart) && localDateKey(new Date(entry.start_at)) < localDateKey(addCalendarDays(weekStart, 7))).length;
              const availableDays = Array.from({ length: 7 }, (_, index) => addCalendarDays(weekStart, index)).filter((date) => teachingRules.weekdays.includes((date.getDay() + 6) % 7 + 1) && availabilityForDate({ date, studentUserId: student.student_user_id, slots, overrideDates }).length > 0).length;
              const preferredAircraft = aircraftPreferences.filter((item) => item.student_user_id === student.student_user_id).map((item) => aircraft.find((candidate) => candidate.id === item.aircraft_id)?.tail_number).filter(Boolean);
              return <div className={styles.autoStudentRow} key={student.student_user_id} data-selected={request.selected}>
                <label className={styles.autoStudentToggle}><input type="checkbox" checked={request.selected} onChange={(event) => updateAutoRequest(student.student_user_id, { selected: event.target.checked, flightSessions: event.target.checked && request.flightSessions + request.groundSessions === 0 ? 1 : request.flightSessions })} /><span><strong>{student.student_name}</strong><span className={styles.autoStudentMeta}>{availableDays} available day{availableDays === 1 ? "" : "s"} · Existing {existingFlight} Flight, {existingGround} Ground · {duration} min</span><span className={styles.autoStudentMeta}>{preferredAircraft.length ? `Prefers ${preferredAircraft.join(", ")}` : "No aircraft preference"}</span>{availableDays === 0 ? <span className={styles.autoStudentWarning}>No availability in the selected days</span> : null}</span></label>
                <div className={styles.autoCounts}><label><span>Flight total</span><input type="number" inputMode="numeric" min={0} max={14} value={request.flightSessions} disabled={!request.selected} aria-label={`Flight lessons for ${student.student_name}`} onChange={(event) => updateAutoRequest(student.student_user_id, { flightSessions: Math.max(0,Math.min(14,Number(event.target.value)||0)) })} /></label><label><span>Ground total</span><input type="number" inputMode="numeric" min={0} max={14} value={request.groundSessions} disabled={!request.selected} aria-label={`Ground lessons for ${student.student_name}`} onChange={(event) => updateAutoRequest(student.student_user_id, { groundSessions: Math.max(0,Math.min(14,Number(event.target.value)||0)) })} /></label></div>
              </div>;
            })}
          </div>
        </section>
        <section className={styles.formSection}><div className={styles.sectionHeading}><h3 className="text-sm font-semibold text-slate-900">Preview</h3><InfoHint label="Automatic placement help">Students with fewer Flight lessons are considered first. The scheduler also avoids gaps when availability and aircraft permit.</InfoHint></div><button className="primary-button mt-3" type="button" disabled={!autoRequests.some((item) => item.selected && (item.flightSessions > 0 || item.groundSessions > 0))} onClick={buildAutomaticPreview}>Generate preview</button></section>
        {autoPreviewBuilt ? <section className={styles.formSection}><h3 className="text-sm font-semibold text-slate-900">Review</h3><p className="mt-1 text-xs text-slate-500">{autoDrafts.length} new lesson{autoDrafts.length === 1 ? "" : "s"}</p><div className="mt-3 grid gap-3">{autoRequests.filter((item) => item.selected && (item.flightSessions > 0 || item.groundSessions > 0)).map((request) => {
          const student = activeStudents.find((item) => item.student_user_id === request.studentUserId);
          const studentDrafts = autoDrafts.filter((draft) => draft.student_user_id === request.studentUserId);
          const missed = autoUnscheduled.filter((item) => item.studentUserId === request.studentUserId);
          return <div key={request.studentUserId} className={styles.autoPreviewStudent}><div><strong>{student?.student_name}</strong><span>{studentDrafts.length} new</span></div>{studentDrafts.map((draft) => <p key={`${draft.lesson_kind}-${draft.start_at}`}>{formatDate(new Date(draft.start_at))} · {formatTime(draft.start_at)}–{formatTime(draft.end_at)} · {draft.lesson_kind === "flight" ? `Flight · ${draft.aircraft_tail_number}` : "Ground"}</p>)}{!studentDrafts.length && !missed.length ? <p>Weekly totals are already met.</p> : null}{missed.map((item) => <p key={item.lessonKind} className={styles.autoStudentWarning}>{item.remaining} {item.lessonKind} could not be scheduled. {item.reason}</p>)}</div>;
        })}</div><button className="primary-button mt-4" type="button" disabled={saving || !autoDrafts.length} onClick={() => void confirmAutomaticSchedule()}>{saving ? "Saving…" : `Add ${autoDrafts.length} lesson${autoDrafts.length === 1 ? "" : "s"} to draft`}</button></section> : null}
      </DetailDrawer>

      <DetailDrawer compact open={drawer === "settings"} onClose={() => { setDrawer(drawerReturn); setDrawerReturn(null); }} title="Student schedule settings" description="Set the general target and optional override for the selected week.">
        <div className="grid gap-3"><div className="grid grid-cols-2 gap-3"><label className="saas-field"><span>General weekly sessions</span><input type="number" min={0} max={14} value={settingsForm.weeklySessions} onChange={(event) => setSettingsForm((current) => ({ ...current, weeklySessions: Number(event.target.value) }))} /></label><label className="saas-field"><span>Default duration</span><select value={settingsForm.durationMin} onChange={(event) => setSettingsForm((current) => ({ ...current, durationMin: Number(event.target.value) }))}>{[60, 90, 120, 150, 180, 240].map((value) => <option key={value} value={value}>{value} minutes</option>)}</select></label></div><label className="saas-field"><span>Calendar color</span><input type="color" value={settingsForm.color} onChange={(event) => setSettingsForm((current) => ({ ...current, color: event.target.value }))} /></label><label className="flex items-center gap-2 text-sm font-semibold text-slate-800"><input type="checkbox" checked={settingsForm.useWeekOverride} onChange={(event) => setSettingsForm((current) => ({ ...current, useWeekOverride: event.target.checked }))} /> Override {formatDate(weekStart)} week</label>{settingsForm.useWeekOverride ? <div className="grid grid-cols-2 gap-3 border-y border-slate-200 py-3"><label className="saas-field"><span>Week sessions</span><input type="number" min={0} max={14} value={settingsForm.weekSessions} onChange={(event) => setSettingsForm((current) => ({ ...current, weekSessions: Number(event.target.value) }))} /></label><label className="saas-field"><span>Week duration</span><select value={settingsForm.weekDurationMin} onChange={(event) => setSettingsForm((current) => ({ ...current, weekDurationMin: Number(event.target.value) }))}>{[60, 90, 120, 150, 180, 240].map((value) => <option key={value} value={value}>{value} minutes</option>)}</select></label></div> : null}</div>
        <div className="mt-5 flex justify-end gap-2"><button className="ghost-button" type="button" onClick={() => { setDrawer(drawerReturn); setDrawerReturn(null); }}>Cancel</button><button className="primary-button" type="button" disabled={saving} onClick={() => void saveStudentSettings()}>Apply</button></div>
      </DetailDrawer>

      <ConfirmDialog open={confirmPermissions} title="Update schedule access?" description="Students whose access is removed will stop seeing this schedule. Existing schedule data is retained." confirmLabel="Apply changes" busy={saving} destructive onCancel={() => setConfirmPermissions(false)} onConfirm={() => void applyPermissions()} />
      <ConfirmDialog open={discardOpen} title="Discard unpublished changes?" description="Your published schedule stays unchanged. All edits in this draft will be removed." confirmLabel="Discard draft" busy={saving} destructive onCancel={() => setDiscardOpen(false)} onConfirm={() => void discardDraft()} />
      <ConfirmDialog open={Boolean(deleteBlockId)} title="Remove unavailable block?" description="Automatic scheduling will be able to use this time again." confirmLabel="Remove block" busy={saving} destructive onCancel={() => setDeleteBlockId("")} onConfirm={() => void confirmDeleteBlock()} />
    </div>
  );
}

function InfoHint({ label, children }: { label: string; children: string }) {
  return <details className={styles.infoHint}>
    <summary aria-label={label} title={label}><svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7.5" stroke="currentColor" /><path d="M10 8.5v5M10 6.25h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></summary>
    <p>{children}</p>
  </details>;
}

function BlockForm({ value, aircraft, onChange }: { value: { date: string; start: string; end: string; note: string; aircraftId: string }; aircraft: ScheduleAircraft[]; onChange: (value: { date: string; start: string; end: string; note: string; aircraftId: string }) => void }) {
  const aircraftGroups = groupByAircraftFamily(aircraft, (item) => item.model_name)
    .map((group) => ({
      ...group,
      items: [...group.items].sort((left, right) => compareAircraftLabels(left.tail_number, right.tail_number)),
    }));
  return (
    <div className="grid gap-3">
      <label className="saas-field">
        <span>Aircraft</span>
        <select required value={value.aircraftId} onChange={(event) => onChange({ ...value, aircraftId: event.target.value })}>
          <option value="" disabled>Choose aircraft</option>
          {aircraftGroups.map((group) => (
            <optgroup key={group.key} label={group.label}>
              {group.items.map((item) => <option key={item.id} value={item.id}>{item.tail_number}{item.model_name ? ` · ${item.model_name}` : ""}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3"><label className="saas-field col-span-2"><span>Date</span><input className={styles.nativePicker} data-native-picker type="date" value={value.date} onClick={(event) => showNativePicker(event.currentTarget)} onChange={(event) => onChange({ ...value, date: event.target.value })} /></label><label className="saas-field"><span>Start</span><input className={styles.nativePicker} data-native-picker type="time" value={value.start} onClick={(event) => showNativePicker(event.currentTarget)} onChange={(event) => onChange({ ...value, start: event.target.value })} /></label><label className="saas-field"><span>End</span><input className={styles.nativePicker} data-native-picker type="time" value={value.end} onClick={(event) => showNativePicker(event.currentTarget)} onChange={(event) => onChange({ ...value, end: event.target.value })} /></label></div>
      <label className="saas-field"><span>Reason (private)</span><input maxLength={300} value={value.note} placeholder="Reserved, maintenance, or other" onChange={(event) => onChange({ ...value, note: event.target.value })} /></label>
    </div>
  );
}
