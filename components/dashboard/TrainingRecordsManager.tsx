"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useSearchParams } from "next/navigation";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { useOrganization } from "@/components/organizations/OrganizationProvider";
import {
  fetchOrganizationStudents,
  type OrganizationStudent,
} from "@/lib/organizations";
import {
  fetchMyScheduleTrainingCourses,
  trainingCourseTrack,
  type ScheduleTrainingCourse,
  type TrainingCourseModule,
} from "@/lib/training-guide";
import {
  deleteMyTrainingRecord,
  fetchMyTrainingRecords,
  fetchOrganizationTrainingRecords,
  fetchTrainingRecordInstructors,
  saveMyTrainingRecord,
  type TrainingRecord,
  type TrainingRecordFinalStatus,
  type TrainingRecordInput,
  type TrainingRecordInstructor,
  type TrainingRecordScore,
} from "@/lib/training-records";
import styles from "./TrainingRecordsManager.module.css";

type FormState = Omit<TrainingRecordInput, "scores"> & {
  scores: TrainingRecordScore[];
};
const STEPS = ["Session", "Flight data", "TCO scoring", "Remarks"] as const;
const FINAL_LABELS: Record<TrainingRecordFinalStatus, string> = {
  completed: "Completed",
  incomplete: "Incomplete",
  unsatisfactory: "Unsatisfactory",
};
const timeFields = [
  ["time_dual", "Dual"],
  ["time_pic", "PIC"],
  ["time_solo", "Solo"],
  ["condition_day", "Day"],
  ["condition_night", "Night"],
  ["condition_xc", "Cross-country"],
  ["condition_actual", "Actual instrument"],
  ["condition_simulated", "Simulated instrument"],
] as const;
const PRINT_GROUPS = [
  ["Date", 2],
  ["Aircraft", 2],
  ["Instructor", 1],
  ["Category", 2],
  ["Type of time", 3],
  ["Condition of Flight", 5],
  ["App & Ldg", 2],
  ["Route", 1],
  ["Total", 1],
  ["Student", 1],
  ["Instructor", 1],
] as const;
const PRINT_LABELS = [
  "Day",
  "Month",
  "Type",
  "Tail #",
  "",
  "SEL",
  "MEL",
  "Dual",
  "PIC",
  "Solo",
  "Day",
  "Night",
  "XC",
  "Actual",
  "Simulated",
  "Instrument",
  "Day/Night",
  "(From / To)",
  "Flight Duration",
  "Initial",
  "Initial",
];

function PrintFlightHeader() {
  return (
    <>
      <div className={styles.printGroupRow}>
        {PRINT_GROUPS.map(([label, span], index) => (
          <span
            style={{ gridColumn: `span ${span}` }}
            key={`${label}-${index}`}
          >
            {label}
          </span>
        ))}
      </div>
      <div className={styles.printLabelRow}>
        {PRINT_LABELS.map((label, index) => (
          <span key={`${label}-${index}`}>{label}</span>
        ))}
      </div>
    </>
  );
}

function emptyForm(organizationId = ""): FormState {
  return {
    organization_id: organizationId,
    instructor_user_id: "",
    student_person_id: "",
    course_id: "",
    course_module_id: "",
    lesson_date: new Date().toISOString().slice(0, 10),
    aircraft_type: "",
    aircraft_tail_number: "",
    category_sel: 0,
    category_mel: 0,
    time_dual: 0,
    time_pic: 0,
    time_solo: 0,
    condition_day: 0,
    condition_night: 0,
    condition_xc: 0,
    condition_actual: 0,
    condition_simulated: 0,
    approaches: 0,
    landings_day: 0,
    landings_night: 0,
    route_from: "",
    route_to: "",
    flight_duration: 0,
    remarks: "",
    scores: [],
    final_status: null,
  };
}

function scoresForModule(module: TrainingCourseModule): TrainingRecordScore[] {
  return module.line_items.map((item) => ({
    line_item_id: item.id,
    position: item.position,
    text: item.text,
    minimum_score: item.minimum_score ?? 1,
    score: null,
    note: "",
  }));
}

function isGroundModule(
  module: Pick<TrainingCourseModule, "module_type"> | null | undefined,
) {
  return Boolean(module && /(ground|oral)/i.test(module.module_type));
}

function studentValue(student: OrganizationStudent) {
  return (
    student.person_id ?? student.saved_person_id ?? student.student_user_id
  );
}
function studentName(student: OrganizationStudent) {
  return student.formal_name || student.account_nickname || "Student";
}
function displayDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${month}/${day}/${year}` : value;
}
function chunk<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, index * size + size),
  );
}

function sumRecords(records: TrainingRecord[]) {
  return records.reduce(
    (sum, record) => ({
      sel: sum.sel + record.category_sel,
      mel: sum.mel + record.category_mel,
      dual: sum.dual + record.time_dual,
      pic: sum.pic + record.time_pic,
      solo: sum.solo + record.time_solo,
      day: sum.day + record.condition_day,
      night: sum.night + record.condition_night,
      xc: sum.xc + record.condition_xc,
      actual: sum.actual + record.condition_actual,
      simulated: sum.simulated + record.condition_simulated,
      instrument: sum.instrument + record.approaches,
      landings: sum.landings + record.landings_day + record.landings_night,
      duration: sum.duration + record.flight_duration,
    }),
    {
      sel: 0,
      mel: 0,
      dual: 0,
      pic: 0,
      solo: 0,
      day: 0,
      night: 0,
      xc: 0,
      actual: 0,
      simulated: 0,
      instrument: 0,
      landings: 0,
      duration: 0,
    },
  );
}

function NumericField({
  label,
  value,
  onChange,
  integer = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  integer?: boolean;
}) {
  return (
    <label className="saas-field">
      <span>{label}</span>
      <input
        type="number"
        min={0}
        max={integer ? 99 : 999.9}
        step={integer ? 1 : 0.1}
        inputMode="decimal"
        value={value}
        onChange={(event) =>
          onChange(Math.max(0, Number(event.target.value) || 0))
        }
      />
    </label>
  );
}

function EvaluationGrid({ record }: { record: TrainingRecord }) {
  const positions: Array<Array<number | string>> = [
    Array.from({ length: 10 }, (_, index) => index + 1),
    Array.from({ length: 10 }, (_, index) => index + 11),
    [
      ...Array.from({ length: 7 }, (_, index) => index + 21),
      "SRM/CRM",
      "Final",
    ],
  ];
  const srm = record.scores.find((score) => /SRM|CRM/i.test(score.text));
  const moduleScores = record.scores.filter(
    (score) => score.score != null && score !== srm,
  );
  const moduleScore = moduleScores.length
    ? (
        moduleScores.reduce((total, score) => total + (score.score ?? 0), 0) /
        moduleScores.length
      ).toFixed(1)
    : "";
  return (
    <div className={styles.printEvaluation}>
      <div className={styles.printModuleTitle}>
        Module
        <br />#
      </div>
      <div className={styles.printScoreRows}>
        {positions.map((row, rowIndex) => (
          <div className={styles.printScoreRow} key={rowIndex}>
            {row.map((position) => {
              const value =
                position === "Final"
                  ? record.final_status
                    ? FINAL_LABELS[record.final_status]
                    : ""
                  : position === "SRM/CRM"
                    ? (srm?.score ?? "")
                    : position === record.module_number
                      ? moduleScore
                      : "";
              return (
                <div
                  className={`${styles.printScorePair} ${position === "Final" ? styles.printFinalPair : ""}`}
                  key={String(position)}
                >
                  <span
                    className={`${styles.printScoreCell} ${position === "SRM/CRM" ? styles.printSrmCell : ""}`}
                  >
                    {position === "SRM/CRM" ? (
                      <>
                        SRM
                        <br />
                        CRM
                      </>
                    ) : (
                      position
                    )}
                  </span>
                  <span
                    className={`${styles.printScoreValue} ${position === "Final" ? styles.printFinalValue : ""}`}
                  >
                    {value}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className={styles.printRemarks}>{record.remarks}</div>
    </div>
  );
}

function EmptyPrintLog({ showHeader }: { showHeader: boolean }) {
  const positions: Array<Array<number | string>> = [
    Array.from({ length: 10 }, (_, index) => index + 1),
    Array.from({ length: 10 }, (_, index) => index + 11),
    [
      ...Array.from({ length: 7 }, (_, index) => index + 21),
      "SRM/CRM",
      "Final",
    ],
  ];
  return (
    <article className={styles.printLog}>
      {showHeader ? <PrintFlightHeader /> : null}
      <div className={styles.printValueRow}>
        {PRINT_LABELS.map((_, index) => (
          <span key={index} />
        ))}
      </div>
      <div className={styles.printEvaluation}>
        <div className={styles.printModuleTitle}>
          Module
          <br />#
        </div>
        <div className={styles.printScoreRows}>
          {positions.map((row, rowIndex) => (
            <div className={styles.printScoreRow} key={rowIndex}>
              {row.map((position) => (
                <div
                  className={`${styles.printScorePair} ${position === "Final" ? styles.printFinalPair : ""}`}
                  key={String(position)}
                >
                  <span
                    className={`${styles.printScoreCell} ${position === "SRM/CRM" ? styles.printSrmCell : ""}`}
                  >
                    {position === "SRM/CRM" ? (
                      <>
                        SRM
                        <br />
                        CRM
                      </>
                    ) : (
                      position
                    )}
                  </span>
                  <span className={styles.printScoreValue} />
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className={styles.printRemarks} />
      </div>
    </article>
  );
}

function PrintLog({
  record,
  showHeader,
}: {
  record: TrainingRecord;
  showHeader: boolean;
}) {
  const cells: Array<[string, string | number]> = [
    ["Day", record.lesson_date.slice(8, 10)],
    ["Month", record.lesson_date.slice(5, 7)],
    ["Type", record.aircraft_type],
    ["Tail #", record.aircraft_tail_number],
    ["Instructor", record.instructor_name],
    ["SEL", record.category_sel || ""],
    ["MEL", record.category_mel || ""],
    ["Dual", record.time_dual || ""],
    ["PIC", record.time_pic || ""],
    ["Solo", record.time_solo || ""],
    ["Day", record.condition_day || ""],
    ["Night", record.condition_night || ""],
    ["XC", record.condition_xc || ""],
    ["Actual", record.condition_actual || ""],
    ["Sim", record.condition_simulated || ""],
    ["Instrument", record.approaches || ""],
    [
      "Day/Night",
      `${record.landings_day || ""}/${record.landings_night || ""}`,
    ],
    [
      "Route (From / To)",
      [record.route_from, record.route_to].filter(Boolean).join(" / "),
    ],
    ["Flight Duration", record.flight_duration || ""],
    ["Student Initial", ""],
    ["Instructor Initial", ""],
  ];
  return (
    <article className={styles.printLog}>
      {showHeader ? <PrintFlightHeader /> : null}
      <div className={styles.printValueRow}>
        {cells.map(([, value], index) => (
          <span key={index}>{value}</span>
        ))}
      </div>
      <EvaluationGrid record={record} />
    </article>
  );
}

function PrintTotals({
  page,
  stage,
  course,
}: {
  page: ReturnType<typeof sumRecords>;
  stage: ReturnType<typeof sumRecords>;
  course: ReturnType<typeof sumRecords>;
}) {
  const rows = [
    ["Page Totals", page, "Total hours on this page"],
    ["Stage Totals", stage, "From previous page (if applicable) + Page Total"],
    ["Course Totals", course, "From previous page + Page Total"],
  ] as const;
  const fields = [
    "sel",
    "mel",
    "dual",
    "pic",
    "solo",
    "day",
    "night",
    "xc",
    "actual",
    "simulated",
    "instrument",
    "landings",
    "duration",
  ] as const;
  return (
    <footer className={styles.printTotals}>
      {rows.map(([label, totals, note]) => (
        <div className={styles.printTotalsRow} key={label}>
          <strong>{label}</strong>
          {fields.map((field) => (
            <span key={field}>
              {totals[field] === 0
                ? ""
                : Number.isInteger(totals[field])
                  ? totals[field]
                  : totals[field].toFixed(1)}
            </span>
          ))}
          <i aria-hidden="true" />
          <small>{note}</small>
        </div>
      ))}
      <div className={styles.printFormCode}>TRGEN-10A / Oct 2024 / V0</div>
    </footer>
  );
}

function TrainingRecordPrint({ records }: { records: TrainingRecord[] }) {
  const grouped = new Map<string, TrainingRecord[]>();
  for (const record of records) {
    const key = `${record.student_person_id}:${record.course_id}:${record.stage_number}`;
    grouped.set(key, [...(grouped.get(key) ?? []), record]);
  }
  const pages = Array.from(grouped.values()).flatMap((group) =>
    chunk(group, 3).map((pageRecords) => ({ pageRecords, group })),
  );
  return (
    <div className={styles.printOnly} aria-hidden="true">
      {pages.map(({ pageRecords, group }, pageIndex) => {
        const first = pageRecords[0];
        const courseRecords = records.filter(
          (record) =>
            record.student_person_id === first.student_person_id &&
            record.course_id === first.course_id,
        );
        return (
          <section
            className={styles.printPage}
            key={`${first.id}-${pageIndex}`}
          >
            <header className={styles.printHeader}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/usats-training-record-logo.svg" alt="USATS" />
              <h1>TRAINING RECORD</h1>
              <span />
            </header>
            <div className={styles.printMeta}>
              <div className={styles.printName}>
                <strong>Name:</strong> {first.student_name}
              </div>
              <div>
                <strong>Course:</strong> {first.course_title}
              </div>
              <div>
                <strong>Version:</strong> {first.course_revision}
              </div>
              <div>
                <strong>Stage:</strong> {first.stage_number}
              </div>
              <div>
                <strong>Year:</strong> {first.lesson_date.slice(0, 4)}
              </div>
            </div>
            <div className={styles.printLogs}>
              {pageRecords.map((record, recordIndex) => (
                <PrintLog
                  record={record}
                  showHeader={recordIndex === 0}
                  key={record.id}
                />
              ))}
              {Array.from({ length: 3 - pageRecords.length }, (_, index) => (
                <EmptyPrintLog
                  showHeader={pageRecords.length === 0 && index === 0}
                  key={`empty-${index}`}
                />
              ))}
            </div>
            <PrintTotals
              page={sumRecords(pageRecords)}
              stage={sumRecords(group)}
              course={sumRecords(courseRecords)}
            />
          </section>
        );
      })}
    </div>
  );
}

export default function TrainingRecordsManager({
  organizationView = false,
}: {
  organizationView?: boolean;
}) {
  const searchParams = useSearchParams();
  const prefillApplied = useRef(false);
  const { session } = useAuthSession();
  const {
    activeOrganization,
    activeOrganizationId,
    loading: organizationLoading,
  } = useOrganization();
  const [records, setRecords] = useState<TrainingRecord[]>([]);
  const [courses, setCourses] = useState<ScheduleTrainingCourse[]>([]);
  const [students, setStudents] = useState<OrganizationStudent[]>([]);
  const [instructors, setInstructors] = useState<TrainingRecordInstructor[]>(
    [],
  );
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [editorOpen, setEditorOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [studentFilter, setStudentFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [printStudentId, setPrintStudentId] = useState("");
  const [schedulePrefill, setSchedulePrefill] = useState(false);

  async function reload() {
    if (!session?.user?.id || !activeOrganizationId) return;
    setLoading(true);
    setMessage("");
    try {
      const [nextRecords, nextCourses, nextStudents, nextInstructors] =
        await Promise.all([
          organizationView
            ? fetchOrganizationTrainingRecords(activeOrganizationId)
            : fetchMyTrainingRecords(),
          fetchMyScheduleTrainingCourses(),
          fetchOrganizationStudents(activeOrganizationId),
          fetchTrainingRecordInstructors(activeOrganizationId),
        ]);
      setRecords(
        nextRecords.filter(
          (record) => record.organization_id === activeOrganizationId,
        ),
      );
      setCourses(
        nextCourses.filter(
          (course) =>
            course.organization_id === activeOrganizationId &&
            /U\.S\. Aviation Training Solutions/i.test(course.provider_name) &&
            trainingCourseTrack(course) === "Flight",
        ),
      );
      setStudents(nextStudents);
      setInstructors(nextInstructors);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to load training records.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // Reload is intentionally keyed to the signed-in user and selected organization.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, activeOrganizationId, organizationView]);
  const selectedCourse =
    courses.find((course) => course.id === form.course_id) ?? null;
  const selectedModule =
    selectedCourse?.modules.find(
      (module) => module.id === form.course_module_id,
    ) ?? null;
  const groundSelected = isGroundModule(selectedModule);
  const visibleRecords = useMemo(
    () =>
      records.filter(
        (record) =>
          (!studentFilter || record.student_person_id === studentFilter) &&
          (!courseFilter || record.course_id === courseFilter),
      ),
    [courseFilter, records, studentFilter],
  );
  const recordGroups = useMemo(() => {
    const groups = new Map<string, TrainingRecord[]>();
    for (const record of visibleRecords) {
      groups.set(record.student_person_id, [
        ...(groups.get(record.student_person_id) ?? []),
        record,
      ]);
    }
    return Array.from(groups.entries());
  }, [visibleRecords]);
  const scoresComplete =
    form.scores.length > 0 && form.scores.every((score) => score.score != null);

  useEffect(() => {
    if (
      prefillApplied.current ||
      searchParams.get("action") !== "new" ||
      !courses.length ||
      !students.length ||
      !instructors.length
    )
      return;
    const organizationId = searchParams.get("organization") ?? "";
    if (organizationId && organizationId !== activeOrganizationId) return;
    const courseId = searchParams.get("course") ?? "";
    const moduleId = searchParams.get("module") ?? "";
    const studentId = searchParams.get("student") ?? "";
    const course = courses.find((item) => item.id === courseId);
    const courseModule = course?.modules.find((item) => item.id === moduleId);
    const student = students.find((item) =>
      [item.person_id, item.saved_person_id, item.student_user_id].includes(
        studentId,
      ),
    );
    if (!course || !courseModule || !student) return;
    const requestedInstructor = searchParams.get("instructor") ?? "";
    const instructorId = instructors.some(
      (item) => item.user_id === requestedInstructor,
    )
      ? requestedInstructor
      : (instructors.find((item) => item.user_id === session?.user?.id)
          ?.user_id ?? instructors[0].user_id);
    prefillApplied.current = true;
    setForm({
      ...emptyForm(activeOrganizationId),
      instructor_user_id: instructorId,
      student_person_id: studentValue(student),
      course_id: course.id,
      course_module_id: courseModule.id,
      lesson_date:
        searchParams.get("date") ?? new Date().toISOString().slice(0, 10),
      aircraft_tail_number: isGroundModule(courseModule)
        ? "CLASSROOM"
        : (searchParams.get("tail") ?? "").toUpperCase(),
      aircraft_type: isGroundModule(courseModule)
        ? "Ground"
        : (searchParams.get("type") ?? ""),
      scores: scoresForModule(courseModule),
    });
    setSchedulePrefill(true);
    setStep(1);
    setMessage("");
    setEditorOpen(true);
  }, [
    activeOrganizationId,
    courses,
    instructors,
    searchParams,
    session?.user?.id,
    students,
  ]);

  function startNew() {
    const course = courses[0];
    const courseModule = course?.modules.find(
      (item) => item.module_number <= 27,
    );
    setForm({
      ...emptyForm(activeOrganizationId),
      instructor_user_id:
        instructors.find((item) => item.user_id === session?.user?.id)
          ?.user_id ??
        instructors[0]?.user_id ??
        "",
      course_id: course?.id ?? "",
      course_module_id: courseModule?.id ?? "",
      aircraft_type: isGroundModule(courseModule) ? "Ground" : "",
      aircraft_tail_number: isGroundModule(courseModule) ? "CLASSROOM" : "",
      scores: courseModule ? scoresForModule(courseModule) : [],
    });
    setSchedulePrefill(false);
    setStep(0);
    setMessage("");
    setEditorOpen(true);
  }
  function editRecord(record: TrainingRecord) {
    setForm({
      id: record.id,
      organization_id: record.organization_id,
      instructor_user_id: record.instructor_user_id,
      student_person_id: record.student_person_id,
      course_id: record.course_id,
      course_module_id: record.course_module_id,
      lesson_date: record.lesson_date,
      aircraft_type: record.aircraft_type,
      aircraft_tail_number: record.aircraft_tail_number,
      category_sel: record.category_sel,
      category_mel: record.category_mel,
      time_dual: record.time_dual,
      time_pic: record.time_pic,
      time_solo: record.time_solo,
      condition_day: record.condition_day,
      condition_night: record.condition_night,
      condition_xc: record.condition_xc,
      condition_actual: record.condition_actual,
      condition_simulated: record.condition_simulated,
      approaches: record.approaches,
      landings_day: record.landings_day,
      landings_night: record.landings_night,
      route_from: record.route_from,
      route_to: record.route_to,
      flight_duration: record.flight_duration,
      remarks: record.remarks,
      scores: record.scores,
      final_status: record.final_status,
    });
    setSchedulePrefill(false);
    setStep(0);
    setMessage("");
    setEditorOpen(true);
  }
  function selectCourse(courseId: string) {
    const course = courses.find((item) => item.id === courseId);
    const courseModule = course?.modules.find(
      (item) => item.module_number <= 27,
    );
    setForm((current) => ({
      ...current,
      course_id: course?.id ?? "",
      course_module_id: courseModule?.id ?? "",
      aircraft_type: isGroundModule(courseModule)
        ? "Ground"
        : current.aircraft_type === "Ground"
          ? ""
          : current.aircraft_type,
      aircraft_tail_number: isGroundModule(courseModule)
        ? "CLASSROOM"
        : current.aircraft_tail_number === "CLASSROOM"
          ? ""
          : current.aircraft_tail_number,
      category_sel: isGroundModule(courseModule) ? 0 : current.category_sel,
      category_mel: isGroundModule(courseModule) ? 0 : current.category_mel,
      scores: courseModule ? scoresForModule(courseModule) : [],
      final_status: null,
    }));
  }
  function selectModule(moduleId: string) {
    const courseModule = selectedCourse?.modules.find(
      (item) => item.id === moduleId,
    );
    setForm((current) => ({
      ...current,
      course_module_id: moduleId,
      aircraft_type: isGroundModule(courseModule)
        ? "Ground"
        : current.aircraft_type === "Ground"
          ? ""
          : current.aircraft_type,
      aircraft_tail_number: isGroundModule(courseModule)
        ? "CLASSROOM"
        : current.aircraft_tail_number === "CLASSROOM"
          ? ""
          : current.aircraft_tail_number,
      category_sel: isGroundModule(courseModule) ? 0 : current.category_sel,
      category_mel: isGroundModule(courseModule) ? 0 : current.category_mel,
      scores: courseModule ? scoresForModule(courseModule) : [],
      final_status: null,
    }));
  }
  function nextStep() {
    if (
      step === 0 &&
      (!form.student_person_id ||
        !form.instructor_user_id ||
        !form.course_module_id ||
        !form.lesson_date)
    ) {
      setMessage("Select the date, student, instructor, course, and module.");
      return;
    }
    setMessage("");
    setStep((current) => Math.min(STEPS.length - 1, current + 1));
  }
  async function saveRecord() {
    if (busy || !form.final_status) {
      setMessage(
        "Choose Completed, Incomplete, or Unsatisfactory before saving.",
      );
      return;
    }
    if (
      (form.final_status === "completed" ||
        form.final_status === "unsatisfactory") &&
      !scoresComplete
    ) {
      setMessage("Score every TCO item for this final status.");
      setStep(2);
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await saveMyTrainingRecord(form);
      await reload();
      setEditorOpen(false);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to save the training record.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function removeRecord(record: TrainingRecord) {
    if (
      busy ||
      !window.confirm(
        `Delete Module ${record.module_number} for ${record.student_name}?`,
      )
    )
      return;
    setBusy(true);
    try {
      await deleteMyTrainingRecord(record.id);
      setRecords((current) => current.filter((item) => item.id !== record.id));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to delete the training record.",
      );
    } finally {
      setBusy(false);
    }
  }
  function printRecords(studentId: string) {
    if (!studentId) return;
    flushSync(() => setPrintStudentId(studentId));
    document.body.classList.add("training-record-printing");
    const cleanup = () => {
      document.body.classList.remove("training-record-printing");
      setPrintStudentId("");
    };
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 1500);
  }

  return (
    <>
      <main
        className={`${styles.screenOnly} mx-auto w-full max-w-7xl px-4 py-6 sm:px-6`}
      >
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
              {activeOrganization?.name ?? "USATS"}
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950">
              Training Records
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="secondary-button cursor-pointer"
              type="button"
              disabled={
                !studentFilter ||
                !records.some(
                  (record) => record.student_person_id === studentFilter,
                )
              }
              onClick={() => printRecords(studentFilter)}
            >
              Print selected student
            </button>
            <button
              className="primary-button cursor-pointer"
              type="button"
              disabled={!courses.length || organizationLoading}
              onClick={startNew}
            >
              New log
            </button>
          </div>
        </header>
        {message ? (
          <p
            className="mt-4 border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-950"
            role="status"
          >
            {message}
          </p>
        ) : null}
        {editorOpen ? (
          <section className="mt-6 border border-slate-200 bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-5">
              <h2 className="text-lg font-semibold text-slate-950">
                {form.id ? "Edit log" : "New log"}
              </h2>
              <button
                className="secondary-button cursor-pointer"
                type="button"
                onClick={() => setEditorOpen(false)}
              >
                Close
              </button>
            </div>
            <nav className={styles.stepNav} aria-label="Training record steps">
              {STEPS.map((label, index) => (
                <button
                  className={`${styles.stepButton} ${step === index ? styles.stepActive : ""} ${step > index ? styles.stepDone : ""}`}
                  type="button"
                  onClick={() => setStep(index)}
                  key={label}
                >
                  <span>{index + 1}</span>
                  {label}
                </button>
              ))}
            </nav>
            <div className="p-4 sm:p-5">
              {step === 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="saas-field">
                    <span>Date</span>
                    <input
                      type="date"
                      value={form.lesson_date}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          lesson_date: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="saas-field">
                    <span>Student</span>
                    <select
                      value={form.student_person_id}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          student_person_id: event.target.value,
                        }))
                      }
                    >
                      <option value="">Select student</option>
                      {students.map((student) => (
                        <option
                          key={student.student_user_id}
                          value={studentValue(student)}
                        >
                          {studentName(student)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="saas-field">
                    <span>Instructor</span>
                    <select
                      value={form.instructor_user_id}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          instructor_user_id: event.target.value,
                        }))
                      }
                    >
                      <option value="">Select instructor</option>
                      {instructors.map((instructor) => (
                        <option
                          key={instructor.user_id}
                          value={instructor.user_id}
                        >
                          {instructor.display_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="saas-field lg:col-span-2">
                    <span>USATS course</span>
                    <select
                      value={form.course_id}
                      onChange={(event) => selectCourse(event.target.value)}
                      disabled={Boolean(form.id)}
                    >
                      <option value="">Select course</option>
                      {courses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.title} — Flight
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="saas-field">
                    <span>Module</span>
                    <select
                      value={form.course_module_id}
                      onChange={(event) => selectModule(event.target.value)}
                      disabled={Boolean(form.id)}
                    >
                      <option value="">Select module</option>
                      {selectedCourse?.modules.map((module) => (
                        <option key={module.id} value={module.id}>
                          Stage {module.stage_number} · Module{" "}
                          {module.module_number} · {module.module_type}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
              {step === 1 ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="saas-field">
                    <span>Aircraft type</span>
                    <input
                      maxLength={80}
                      value={form.aircraft_type}
                      readOnly={schedulePrefill || groundSelected}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          aircraft_type: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="saas-field">
                    <span>Tail number</span>
                    <input
                      maxLength={20}
                      value={form.aircraft_tail_number}
                      readOnly={groundSelected}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          aircraft_tail_number:
                            event.target.value.toUpperCase(),
                        }))
                      }
                    />
                  </label>
                  <NumericField
                    label="SEL time"
                    value={form.category_sel}
                    onChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        category_sel: value,
                      }))
                    }
                  />
                  <NumericField
                    label="MEL time"
                    value={form.category_mel}
                    onChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        category_mel: value,
                      }))
                    }
                  />
                  {timeFields.map(([key, label]) => (
                    <NumericField
                      key={key}
                      label={label}
                      value={form[key]}
                      onChange={(value) =>
                        setForm((current) => ({ ...current, [key]: value }))
                      }
                    />
                  ))}
                  <NumericField
                    label="Approaches"
                    integer
                    value={form.approaches}
                    onChange={(value) =>
                      setForm((current) => ({ ...current, approaches: value }))
                    }
                  />
                  <NumericField
                    label="Day landings"
                    integer
                    value={form.landings_day}
                    onChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        landings_day: value,
                      }))
                    }
                  />
                  <NumericField
                    label="Night landings"
                    integer
                    value={form.landings_night}
                    onChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        landings_night: value,
                      }))
                    }
                  />
                  <NumericField
                    label="Total duration"
                    value={form.flight_duration}
                    onChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        flight_duration: value,
                      }))
                    }
                  />
                  <label className="saas-field">
                    <span>Route from</span>
                    <input
                      maxLength={20}
                      value={form.route_from}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          route_from: event.target.value.toUpperCase(),
                        }))
                      }
                    />
                  </label>
                  <label className="saas-field">
                    <span>Route to</span>
                    <input
                      maxLength={20}
                      value={form.route_to}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          route_to: event.target.value.toUpperCase(),
                        }))
                      }
                    />
                  </label>
                </div>
              ) : null}
              {step === 2 ? (
                <div>
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-950">
                        TCO items 1–{form.scores.length}
                      </h3>
                      {selectedModule ? (
                        <p className="mt-1 text-sm text-slate-600">
                          Stage {selectedModule.stage_number} · Module{" "}
                          {selectedModule.module_number}
                        </p>
                      ) : null}
                    </div>
                    <span className="text-sm text-slate-600">
                      {
                        form.scores.filter((score) => score.score != null)
                          .length
                      }{" "}
                      / {form.scores.length} scored
                    </span>
                  </div>
                  <div className={styles.scoreTable}>
                    {form.scores.map((score, scoreIndex) => (
                      <div className={styles.scoreRow} key={score.line_item_id}>
                        <div>
                          <strong>
                            {score.position}. {score.text}
                          </strong>
                          <small>Minimum {score.minimum_score}</small>
                        </div>
                        <div
                          className={styles.scoreChoices}
                          role="radiogroup"
                          aria-label={`Score for ${score.text}`}
                        >
                          {[1, 2, 3, 4, 5].map((value) => (
                            <button
                              className={
                                score.score === value
                                  ? styles.selectedScore
                                  : ""
                              }
                              type="button"
                              role="radio"
                              aria-checked={score.score === value}
                              aria-label={`${value} for ${score.text}`}
                              key={value}
                              onClick={() =>
                                setForm((current) => ({
                                  ...current,
                                  scores: current.scores.map((item, index) =>
                                    index === scoreIndex
                                      ? { ...item, score: value }
                                      : item,
                                  ),
                                }))
                              }
                            >
                              {value}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {step === 3 ? (
                <div className="grid gap-5">
                  <label className="saas-field">
                    <span>Remarks</span>
                    <textarea
                      rows={7}
                      maxLength={4000}
                      value={form.remarks}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          remarks: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <fieldset>
                    <legend className="mb-2 text-sm font-semibold text-slate-800">
                      Final
                    </legend>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {(
                        [
                          "completed",
                          "incomplete",
                          "unsatisfactory",
                        ] as TrainingRecordFinalStatus[]
                      ).map((status) => (
                        <label
                          className={`cursor-pointer border px-4 py-3 text-sm font-semibold ${form.final_status === status ? "border-blue-700 bg-blue-50 text-blue-900" : "border-slate-300 bg-white text-slate-700"}`}
                          key={status}
                        >
                          <input
                            className="mr-2"
                            type="radio"
                            name="final-status"
                            checked={form.final_status === status}
                            onChange={() =>
                              setForm((current) => ({
                                ...current,
                                final_status: status,
                              }))
                            }
                          />
                          {FINAL_LABELS[status]}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </div>
              ) : null}
              <div className="mt-6 flex justify-between gap-3 border-t border-slate-200 pt-4">
                <button
                  className="secondary-button cursor-pointer"
                  type="button"
                  disabled={step === 0}
                  onClick={() => setStep((current) => Math.max(0, current - 1))}
                >
                  Back
                </button>
                {step < STEPS.length - 1 ? (
                  <button
                    className="primary-button cursor-pointer"
                    type="button"
                    onClick={nextStep}
                  >
                    Continue
                  </button>
                ) : (
                  <button
                    className="primary-button cursor-pointer"
                    type="button"
                    disabled={busy}
                    onClick={() => void saveRecord()}
                  >
                    {busy ? "Saving…" : "Save log"}
                  </button>
                )}
              </div>
            </div>
          </section>
        ) : (
          <>
            <section className="mt-5 grid gap-3 border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
              <label className="saas-field">
                <span>Student</span>
                <select
                  value={studentFilter}
                  onChange={(event) => setStudentFilter(event.target.value)}
                >
                  <option value="">All students</option>
                  {Array.from(
                    new Map(
                      records.map((record) => [
                        record.student_person_id,
                        record.student_name,
                      ]),
                    ).entries(),
                  ).map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="saas-field">
                <span>Course</span>
                <select
                  value={courseFilter}
                  onChange={(event) => setCourseFilter(event.target.value)}
                >
                  <option value="">All courses</option>
                  {Array.from(
                    new Map(
                      records.map((record) => [
                        record.course_id,
                        record.course_title,
                      ]),
                    ).entries(),
                  ).map(([id, title]) => (
                    <option key={id} value={id}>
                      {title}
                    </option>
                  ))}
                </select>
              </label>
            </section>
            <section className="mt-4 grid gap-4">
              {loading ? (
                <p className="p-5 text-sm text-slate-600">Loading…</p>
              ) : !visibleRecords.length ? (
                <p className="p-5 text-sm text-slate-600">
                  No training records.
                </p>
              ) : (
                recordGroups.map(([studentId, studentRecords]) => (
                  <section
                    className="overflow-hidden border border-slate-200 bg-white"
                    key={studentId}
                  >
                    <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
                      <div>
                        <h2 className="text-sm font-semibold text-slate-950">
                          {studentRecords[0].student_name}
                        </h2>
                        <p className="text-xs text-slate-500">
                          {studentRecords.length} log
                          {studentRecords.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <button
                        className="secondary-button cursor-pointer"
                        type="button"
                        onClick={() => printRecords(studentId)}
                      >
                        Print student
                      </button>
                    </header>
                    <div className="divide-y divide-slate-200">
                      {studentRecords.map((record) => (
                        <article
                          className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_auto] md:items-center"
                          key={record.id}
                        >
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <strong className="text-sm text-slate-950">
                                {record.student_name}
                              </strong>
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${record.final_status === "completed" ? "bg-emerald-100 text-emerald-800" : record.final_status === "unsatisfactory" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}
                              >
                                {record.final_status
                                  ? FINAL_LABELS[record.final_status]
                                  : "Draft"}
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-slate-700">
                              {record.course_title} · Stage{" "}
                              {record.stage_number} · Module{" "}
                              {record.module_number}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {displayDate(record.lesson_date)} ·{" "}
                              {record.instructor_name} ·{" "}
                              {record.flight_duration.toFixed(1)} hr
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              className="secondary-button cursor-pointer"
                              type="button"
                              onClick={() => editRecord(record)}
                            >
                              Edit
                            </button>
                            <button
                              className="secondary-button cursor-pointer text-red-700"
                              type="button"
                              disabled={busy}
                              onClick={() => void removeRecord(record)}
                            >
                              Delete
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ))
              )}
            </section>
          </>
        )}
      </main>
      <TrainingRecordPrint
        records={
          printStudentId
            ? records.filter(
                (record) => record.student_person_id === printStudentId,
              )
            : []
        }
      />
    </>
  );
}
