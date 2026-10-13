"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AdminPageHeader, EmptyState, StatusBadge } from "@/components/admin/AdminConsole";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { useOrganization } from "@/components/organizations/OrganizationProvider";
import { fetchMyAircraft, type AircraftRecord } from "@/lib/aircraft";
import {
  dashboardTaskRoleLabel,
  sortDashboardTasks,
  type DashboardTask,
  type DashboardTaskPriority,
  type DashboardTaskRole,
} from "@/lib/dashboard-tasks";
import { fetchEnabledFeatureIds, fetchScheduleEligibility, type OptionalFeatureId } from "@/lib/dashboard-preferences";
import { fetchScheduleAccess, fetchScheduleEntries, type ScheduleEntry } from "@/lib/cfi-schedule";
import { fetchInboxNotifications, type NotificationPriority } from "@/lib/notifications";
import { fetchCurrentProfile } from "@/lib/profile";

const moduleLinks = [
  ["Schedule", "/dashboard/schedule", "Week calendar, availability, and lesson planning", "cfi_schedule"],
  ["People", "/dashboard/people", "Students, instructors, and certificates"],
  ["Aircraft", "/dashboard/aircraft", "Aircraft details and due items"],
  ["Reports", "/dashboard/reports", "Safety and aircraft reports"],
  ["Flight Briefs", "/dashboard/flight-briefs", "Recent preflight records"],
  ["Records", "/dashboard/endorsements", "Student records, endorsements, and attachments"],
  ["Notifications", "/dashboard/notifications", "Requests, reminders, and updates"],
  ["Account", "/dashboard/account-settings", "Profile, certificates, and preferences"],
] as const;

function notificationPriority(priority: NotificationPriority): DashboardTaskPriority {
  if (priority === "critical") return "critical";
  if (priority === "high") return "high";
  if (priority === "low") return "low";
  return "normal";
}

function roleForSchedule(entry: ScheduleEntry, instructor: boolean): DashboardTaskRole {
  if (instructor) return "instructor";
  return entry.student_user_id ? "student" : "pilot";
}

function datePriority(value: string) {
  const days = Math.ceil((Date.parse(value) - Date.now()) / 86_400_000);
  if (days < 0) return "critical" as const;
  if (days <= 30) return "high" as const;
  return "normal" as const;
}

function formatTaskDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parsed);
}

function aircraftDueTasks(aircraft: AircraftRecord[]): DashboardTask[] {
  const fields = [
    ["Annual inspection", "annual_due_date"],
    ["Static system", "static_due_date"],
    ["Transponder", "transponder_due_date"],
    ["ELT", "elt_due_date"],
  ] as const;
  const horizon = Date.now() + 90 * 86_400_000;
  return aircraft.flatMap((item) => fields.flatMap(([label, field]) => {
    const dueAt = item[field];
    if (!dueAt || Date.parse(dueAt) > horizon) return [];
    return [{
      id: `aircraft:${item.id}:${field}`,
      title: `${item.tail_number} · ${label}`,
      detail: `${datePriority(dueAt) === "critical" ? "Past due" : "Due"} ${formatTaskDate(dueAt)}`,
      href: "/dashboard/aircraft",
      priority: datePriority(dueAt),
      role: "pilot" as const,
      dueAt,
    }];
  }));
}

export default function DashboardTaskCenter() {
  const { session } = useAuthSession();
  const { organizations } = useOrganization();
  const [tasks, setTasks] = useState<DashboardTask[]>([]);
  const [roles, setRoles] = useState<DashboardTaskRole[]>([]);
  const [enabledFeatureIds, setEnabledFeatureIds] = useState<OptionalFeatureId[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;
    const currentUserId = userId;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [profile, notifications, eligibility, aircraft, access, features] = await Promise.all([
          fetchCurrentProfile(currentUserId),
          fetchInboxNotifications(currentUserId),
          fetchScheduleEligibility().catch(() => ({ can_instruct: false, invited_student: false })),
          fetchMyAircraft(currentUserId).catch(() => []),
          fetchScheduleAccess().catch(() => []),
          fetchEnabledFeatureIds(currentUserId).catch(() => []),
        ]);
        const nextRoles = new Set<DashboardTaskRole>();
        if (eligibility.can_instruct || organizations.some((item) => item.teaching_role === "instructor")) nextRoles.add("instructor");
        if (eligibility.invited_student || organizations.some((item) => item.teaching_role === "student")) nextRoles.add("student");
        if (!nextRoles.size) nextRoles.add("pilot");

        const next: DashboardTask[] = notifications
          .filter((item) => !item.read_at)
          .slice(0, 8)
          .map((item) => ({
            id: `notification:${item.id}`,
            title: item.title,
            detail: item.message,
            href: item.action_url?.startsWith("/") ? item.action_url : "/dashboard/notifications",
            priority: notificationPriority(item.priority),
            role: item.kind === "schedule"
              ? (nextRoles.has("instructor") ? "instructor" : "student")
              : "pilot",
            dueAt: item.scheduled_at ?? item.created_at,
          }));

        if (!profile?.display_name || !profile.medical_class || !profile.medical_exam_date) {
          next.push({
            id: "profile:incomplete",
            title: "Complete your pilot profile",
            detail: "Add your display name and current medical information.",
            href: "/dashboard/account-settings",
            priority: "high",
            role: nextRoles.has("student") ? "student" : "pilot",
          });
        }
        if (profile?.medical_exp_date && Date.parse(profile.medical_exp_date) <= Date.now() + 90 * 86_400_000) {
          next.push({
            id: "profile:medical",
            title: "Medical certificate",
            detail: `${datePriority(profile.medical_exp_date) === "critical" ? "Expired" : "Expires"} ${formatTaskDate(profile.medical_exp_date)}`,
            href: "/dashboard/account-settings",
            priority: datePriority(profile.medical_exp_date),
            role: nextRoles.has("student") ? "student" : "pilot",
            dueAt: profile.medical_exp_date,
          });
        }
        next.push(...aircraftDueTasks(aircraft));

        const now = new Date();
        const rangeEnd = new Date(now.getTime() + 14 * 86_400_000);
        const accessByCfi = new Map(access.map((item) => [item.cfi_user_id, item]));
        const scheduleGroups = await Promise.all(Array.from(accessByCfi).map(async ([cfiUserId, item]) => ({
          item,
          entries: await fetchScheduleEntries(cfiUserId, now, rangeEnd).catch(() => []),
        })));
        for (const group of scheduleGroups) {
          for (const entry of group.entries.filter((item) => item.status === "scheduled" && Date.parse(item.end_at) >= now.getTime()).slice(0, 3)) {
            next.push({
              id: `schedule:${entry.id}`,
              title: entry.lesson_kind === "ground" ? "Ground lesson" : "Flight lesson",
              detail: `${entry.student_name ?? group.item.student_name} · ${new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(entry.start_at))}`,
              href: "/dashboard/schedule",
              priority: "normal",
              role: roleForSchedule(entry, group.item.caller_role === "cfi"),
              dueAt: entry.start_at,
            });
          }
        }

        if (!cancelled) {
          setRoles(Array.from(nextRoles));
          setEnabledFeatureIds(features);
          setTasks(sortDashboardTasks(next).slice(0, 12));
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load your dashboard.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [organizations, session?.user?.id]);

  const roleSummary = useMemo(() => roles.map(dashboardTaskRoleLabel).join(" · "), [roles]);

  return (
    <section className="dashboard-task-center">
      <AdminPageHeader eyebrow="Personal workspace" title="Home" description="Items that need your attention, ordered by urgency." action={roleSummary ? <span className="text-xs font-medium text-slate-500">{roleSummary}</span> : null} />
      {error ? <p role="alert" className="dashboard-task-feedback dashboard-task-feedback-error">{error}</p> : null}
      <div className="dashboard-task-section">
        <div className="dashboard-task-section-heading">
          <h2>Needs attention</h2>
          <span>{loading ? "Loading…" : `${tasks.length} items`}</span>
        </div>
        {!loading && !tasks.length ? <EmptyState title="You are clear for now" description="New reminders, requests, and due items will appear here." /> : null}
        {tasks.length ? (
          <div className="dashboard-task-list" role="list">
            {tasks.map((task) => (
              <Link key={task.id} href={task.href} className="dashboard-task-row" role="listitem">
                <span className={`dashboard-task-priority dashboard-task-priority-${task.priority}`} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="dashboard-task-title">{task.title}</span>
                  <span className="dashboard-task-detail">{task.detail}</span>
                </span>
                <StatusBadge tone={task.role === "instructor" ? "info" : task.role === "student" ? "success" : "neutral"}>{dashboardTaskRoleLabel(task.role)}</StatusBadge>
                <span className="dashboard-task-arrow" aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
      <div className="dashboard-task-section">
        <div className="dashboard-task-section-heading"><h2>Workspace</h2></div>
        <nav className="dashboard-module-list" aria-label="Personal workspace modules">
          {moduleLinks.filter(([, , , featureId]) => !featureId || enabledFeatureIds.includes(featureId)).map(([label, href, detail]) => (
            <Link key={href} href={href}><span><strong>{label}</strong><small>{detail}</small></span><span aria-hidden="true">→</span></Link>
          ))}
        </nav>
      </div>
    </section>
  );
}
