export type DashboardTaskRole = "student" | "instructor" | "pilot";
export type DashboardTaskPriority = "critical" | "high" | "normal" | "low";

export type DashboardTask = {
  id: string;
  title: string;
  detail: string;
  href: string;
  priority: DashboardTaskPriority;
  role: DashboardTaskRole;
  dueAt?: string | null;
};

type ScheduleTaskEntry = {
  lesson_kind: "flight" | "ground" | "solo" | null;
  student_name: string | null;
  aircraft_tail_number: string | null;
  aircraft_status?: "available" | "away" | "in_maintenance" | "grounded" | null;
  assigned_instructor_name?: string | null;
  start_at: string;
  end_at: string;
  training_subjects?: Array<{ subject_snapshot?: { title?: string } | null }>;
};

function aircraftStatusLabel(status: ScheduleTaskEntry["aircraft_status"]) {
  if (!status || status === "available") return null;
  if (status === "in_maintenance") return "Aircraft in maintenance";
  return `Aircraft ${status}`;
}

export function scheduleTaskPresentation(
  entry: ScheduleTaskEntry,
  options: { instructor: boolean; cfiName?: string | null; locale?: string },
) {
  const aircraft = entry.aircraft_tail_number?.trim() || null;
  const title = entry.lesson_kind === "ground"
    ? "Ground"
    : entry.lesson_kind === "solo"
      ? `Solo · ${aircraft ?? "No aircraft"}`
      : aircraft ?? "Flight";
  const locale = options.locale ?? "en-US";
  const start = new Date(entry.start_at);
  const end = new Date(entry.end_at);
  const date = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(start);
  const timeFormatter = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
  const person = options.instructor
    ? entry.student_name
    : entry.assigned_instructor_name || options.cfiName;
  const subjects = (entry.training_subjects ?? [])
    .map((subject) => subject.subject_snapshot?.title?.trim() ?? "")
    .filter(Boolean)
    .slice(0, 2)
    .join(", ");
  const detail = [
    date,
    `${timeFormatter.format(start)}–${timeFormatter.format(end)}`,
    person ? `${options.instructor ? "Student" : "Instructor"}: ${person}` : null,
    aircraftStatusLabel(entry.aircraft_status),
    subjects || null,
  ].filter((item): item is string => Boolean(item));

  return { title, detail: detail.join(" · ") };
}

const priorityRank: Record<DashboardTaskPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export function sortDashboardTasks(tasks: DashboardTask[]) {
  return [...tasks].sort((left, right) => {
    const priority = priorityRank[left.priority] - priorityRank[right.priority];
    if (priority !== 0) return priority;
    const leftDue = left.dueAt ? Date.parse(left.dueAt) : Number.POSITIVE_INFINITY;
    const rightDue = right.dueAt ? Date.parse(right.dueAt) : Number.POSITIVE_INFINITY;
    return leftDue - rightDue;
  });
}

export function dashboardTaskRoleLabel(role: DashboardTaskRole) {
  if (role === "student") return "Student";
  if (role === "instructor") return "Instructor";
  return "Pilot";
}
