"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import {
  formatTimeUntilDate,
  resolveDisplayIdentity,
} from "@/lib/identity";
import {
  fetchNotificationHistory,
  type NotificationRecord,
} from "@/lib/notifications";
import { fetchCurrentProfile } from "@/lib/profile";
import {
  fetchDefaultCfi,
  fetchSavedPeople,
  formatStoredDateForDisplay,
  type SavedPerson,
} from "@/lib/saved-people";

type OverviewState = {
  cfis: SavedPerson[];
  students: SavedPerson[];
  notifications: NotificationRecord[];
  role: string;
  displayName: string;
  defaultCfi: SavedPerson | null;
  medicalLastExam: string;
  medicalExpiry: string;
};

const emptyState: OverviewState = {
  cfis: [],
  students: [],
  notifications: [],
  role: "",
  displayName: "",
  defaultCfi: null,
  medicalLastExam: "",
  medicalExpiry: "",
};

function formatMedicalExam(value: string | null | undefined) {
  return formatStoredDateForDisplay(value ?? null);
}

function formatRelativeDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

export default function DashboardOverview() {
  const { session } = useAuthSession();
  const [loading, setLoading] = useState(true);
  const [statusNote, setStatusNote] = useState("");
  const [overview, setOverview] = useState<OverviewState>(emptyState);

  useEffect(() => {
    let cancelled = false;

    async function loadOverview() {
      if (!session?.user?.id) {
        if (!cancelled) {
          setOverview(emptyState);
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        setStatusNote("");

        const [cfis, students, profile, defaultCfi] = await Promise.all([
          fetchSavedPeople(session.user.id, "cfi"),
          fetchSavedPeople(session.user.id, "student"),
          fetchCurrentProfile(session.user.id),
          fetchDefaultCfi(session.user.id),
        ]);

        const notifications =
          profile?.role === "admin" ? await fetchNotificationHistory() : [];

        if (!cancelled) {
          setOverview({
            cfis,
            students,
            notifications,
            role: profile?.role ?? "",
            displayName: profile?.display_name ?? "",
            defaultCfi,
            medicalLastExam: formatMedicalExam(profile?.medical_exam_date),
            medicalExpiry: profile?.medical_exp_date ?? "",
          });
        }
      } catch {
        if (!cancelled) {
          setOverview(emptyState);
          setStatusNote("Dashboard data is temporarily unavailable.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadOverview();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const identityLabel = resolveDisplayIdentity({
    displayName: overview.displayName,
    defaultCfiName: overview.defaultCfi?.display_name ?? "",
    email: session?.user?.email,
  });

  const metricItems = [
    {
      label: "Saved Pilots",
      value: loading ? "..." : String(overview.cfis.length + overview.students.length),
    },
    {
      label: "Notifications",
      value: loading ? "..." : String(overview.notifications.length),
    },
  ];

  const activityItems = useMemo(() => {
    const items = [...overview.students, ...overview.cfis]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 4)
      .map((person) => ({
        id: person.id,
        title: person.display_name,
        detail: person.role === "cfi" ? "Instructor record added" : "Student profile added",
        meta: formatRelativeDate(person.created_at),
        href: "/dashboard/saved-people",
      }));

    if (items.length > 0) {
      return items;
    }

    return [
      {
        id: "empty-activity",
        title: "No recent activity",
        detail: "Saved people and workflow actions will appear here.",
        meta: "",
        href: "/dashboard/saved-people",
      },
    ];
  }, [overview.cfis, overview.students]);

  const savedPeopleItems = useMemo(() => {
    const people = [...overview.students, ...overview.cfis]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 3)
      .map((person) => ({
        id: person.id,
        title: person.display_name,
        detail: person.role === "cfi" ? "Instructor" : "Student pilot",
        meta:
          person.cert_exp_date
            ? `Exp. ${formatStoredDateForDisplay(person.cert_exp_date)}`
            : "",
        href: "/dashboard/saved-people",
      }));

    if (people.length > 0) {
      return people;
    }

      return [
      {
        id: "empty-people",
        title: "No saved pilots yet",
        detail: "Add a CFI or student record to reuse details in your workflows.",
        meta: "",
        href: "/dashboard/saved-people",
      },
    ];
  }, [overview.cfis, overview.students]);

  const notificationItems = useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      detail: string;
      meta: string;
      href: string;
    }> = [];

    if (overview.defaultCfi?.display_name) {
      items.push({
        id: "default-cfi",
        title: "Default CFI ready",
        detail: overview.defaultCfi.display_name,
        meta:
          overview.defaultCfi.cert_exp_date
            ? formatRelativeDate(overview.defaultCfi.cert_exp_date)
            : "",
        href: "/dashboard/saved-people",
      });
    }

    if (overview.medicalLastExam || overview.medicalExpiry) {
      items.push({
        id: "medical",
        title: "Medical record",
        detail: overview.medicalExpiry
          ? formatTimeUntilDate(overview.medicalExpiry)
          : overview.medicalLastExam || "No medical certificate saved",
        meta: "",
        href: "/dashboard/account-settings",
      });
    }

    overview.notifications.slice(0, 4).forEach((notification) => {
      items.push({
        id: notification.id,
        title: notification.title,
        detail: notification.message,
        meta: notification.status,
        href: "/dashboard/notifications",
      });
    });

    if (items.length > 0) {
      return items;
    }

    return [
      {
        id: "empty-rail",
        title: "Nothing urgent",
        detail: "Saved records and admin reminders will show here.",
        meta: "",
        href: "/dashboard/account-settings",
      },
    ];
  }, [overview.defaultCfi, overview.medicalExpiry, overview.medicalLastExam, overview.notifications]);

  return (
    <div className="space-y-4">
      {statusNote ? (
        <section className="border-b border-amber-200 bg-amber-50/70 py-4 text-sm text-amber-900">
          <p>{statusNote}</p>
        </section>
      ) : null}

      <section className="rounded-[20px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(247,250,254,0.98),rgba(255,255,255,0.96))] p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)] sm:p-5">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-slate-400">Overview</p>
            <h1 className="mt-1 text-[1.4rem] font-semibold tracking-[-0.03em] text-slate-950 sm:text-[1.6rem]">
              {loading ? "Loading..." : identityLabel}
            </h1>
          </div>
          <div className="hidden rounded-[14px] border border-slate-200/80 bg-white px-3 py-2 text-right shadow-[0_10px_24px_rgba(15,23,42,0.05)] sm:block">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-slate-400">Session</p>
            <p className="mt-1 text-sm font-medium text-slate-700">{overview.role || "User"}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {metricItems.map((item) => (
            <div
              key={item.label}
              className="rounded-[18px] border border-slate-200/80 bg-white px-4 py-4 shadow-[0_10px_26px_rgba(15,23,42,0.04)]"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-slate-500">{item.label}</p>
                <span className="h-2 w-2 rounded-full bg-sky-500" />
              </div>
              <p className="mt-3 text-[1.75rem] font-semibold tracking-[-0.04em] text-slate-950">{item.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
        <div className="space-y-4">
          <section className="rounded-[20px] border border-slate-200/80 bg-white p-4 shadow-[0_10px_26px_rgba(15,23,42,0.04)]">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Saved Pilots</h2>
              <Link href="/dashboard/saved-people" className="text-sm font-medium text-[var(--accent-strong)]">
                View all
              </Link>
            </div>

            <div className="mt-4 divide-y divide-slate-200/75">
              {savedPeopleItems.map((item) => (
                <Link key={item.id} href={item.href} className="flex items-center justify-between gap-4 py-4 first:pt-0">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold text-slate-950">{item.title}</h3>
                    <p className="mt-1 text-sm text-slate-500">{item.detail}</p>
                  </div>
                  {item.meta ? (
                    <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
                      {item.meta}
                    </span>
                  ) : null}
                </Link>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-[20px] border border-slate-200/80 bg-white p-4 shadow-[0_10px_26px_rgba(15,23,42,0.04)]">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Notifications</h2>
              <Link href="/dashboard/notifications" className="text-sm font-medium text-[var(--accent-strong)]">
                View all
              </Link>
            </div>

            <div className="mt-3 divide-y divide-slate-200/75">
              {notificationItems.map((item) => (
                <Link key={item.id} href={item.href} className="grid gap-1 py-3 first:pt-0">
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-sm font-semibold text-slate-950">{item.title}</h3>
                    {item.meta ? <span className="text-xs text-slate-400">{item.meta}</span> : null}
                  </div>
                  <p className="text-sm text-slate-500">{item.detail}</p>
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-[20px] border border-slate-200/80 bg-white p-4 shadow-[0_10px_26px_rgba(15,23,42,0.04)]">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Quick Actions</h2>
            </div>
            <div className="mt-3 grid gap-3">
              {[
                { href: "/tools/endorsement-generator", label: "New Endorsement" },
                { href: "/tools/flight-brief", label: "Create Flight Brief" },
                { href: "/tools/wb", label: "Weight & Balance" },
                { href: "/dashboard/saved-people", label: "Manage Saved People" },
              ].map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="rounded-[16px] border border-slate-200/80 bg-slate-50/70 px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white hover:text-slate-950"
                >
                  {action.label}
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}
