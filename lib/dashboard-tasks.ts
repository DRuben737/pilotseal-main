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
