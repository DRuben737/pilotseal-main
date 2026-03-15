"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { fetchNotificationHistory } from "@/lib/notifications";
import { fetchCurrentProfile } from "@/lib/profile";
import { fetchSavedPeople } from "@/lib/saved-people";

type OverviewMetrics = {
  cfiCount: number;
  studentCount: number;
  notificationCount: number;
  role: string;
};

const defaultMetrics: OverviewMetrics = {
  cfiCount: 0,
  studentCount: 0,
  notificationCount: 0,
  role: "",
};

const quickLinks = [
  {
    href: "/dashboard/notifications",
    title: "Notification center",
    description: "Draft, schedule, send, and audit site notices.",
  },
  {
    href: "/dashboard/saved-people",
    title: "Saved people",
    description: "Keep CFI and student records ready for workflows.",
  },
  {
    href: "/dashboard/account-settings",
    title: "Account settings",
    description: "Review session state and workspace access.",
  },
];

export default function DashboardOverview() {
  const { session } = useAuthSession();
  const [loading, setLoading] = useState(true);
  const [statusNote, setStatusNote] = useState("");
  const [metrics, setMetrics] = useState<OverviewMetrics>(defaultMetrics);

  useEffect(() => {
    let cancelled = false;

    async function loadOverview() {
      if (!session?.user?.id) {
        if (!cancelled) {
          setMetrics(defaultMetrics);
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        setStatusNote("");

        const results = await Promise.allSettled([
          fetchSavedPeople(session.user.id, "cfi"),
          fetchSavedPeople(session.user.id, "student"),
          fetchCurrentProfile(session.user.id),
        ]);

        const cfis = results[0].status === "fulfilled" ? results[0].value : [];
        const students = results[1].status === "fulfilled" ? results[1].value : [];
        const profile = results[2].status === "fulfilled" ? results[2].value : null;

        const notificationsResult =
          profile?.role === "admin"
            ? await Promise.allSettled([fetchNotificationHistory()])
            : null;

        const notifications =
          notificationsResult?.[0]?.status === "fulfilled" ? notificationsResult[0].value : [];
        const failedSources = [
          ...results.map((result, index) => ({
            label: ["saved_cfis", "saved_students", "profile"][index],
            result,
          })),
          ...((notificationsResult ?? []).map((result) => ({
            label: "notification_history",
            result,
          })) ?? []),
        ];

        failedSources.forEach(({ label, result }) => {
          if (result.status === "rejected") {
            console.error("Dashboard metric failed:", label, result.reason);
          }
        });

        if (!cancelled) {
          setMetrics({
            cfiCount: cfis.length,
            studentCount: students.length,
            notificationCount: notifications.length,
            role: profile?.role ?? "",
          });
          setStatusNote("");
        }
      } catch (loadError) {
        console.error(loadError);

        if (!cancelled) {
          setMetrics(defaultMetrics);
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

  return (
    <div className="grid gap-6">
      <section className="saas-panel">
        <p className="eyebrow">Dashboard</p>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="saas-section-title">Operations overview</h2>
            <p className="saas-section-copy">
              Monitor authentication, saved records, and outbound site messaging from a single
              workspace.
            </p>
          </div>
          <div className="saas-status-chip">
            <span className="saas-status-dot" />
            {loading ? "Refreshing dashboard..." : "System synchronized"}
          </div>
        </div>
        {statusNote ? <p className="saas-meta-text mt-4">{statusNote}</p> : null}
      </section>

      <section className="saas-card-grid">
        <article className="saas-panel">
          <p className="saas-label">User email</p>
          <p className="saas-value">{session?.user?.email ?? "Unknown"}</p>
          <p className="saas-meta-text mt-2">Primary identity from the active Supabase session.</p>
        </article>

        <article className="saas-panel">
          <p className="saas-label">Saved CFIs</p>
          <p className="saas-stat">{loading ? "..." : metrics.cfiCount}</p>
          <p className="saas-meta-text mt-2">CFI templates ready for endorsement workflows.</p>
        </article>

        <article className="saas-panel">
          <p className="saas-label">Saved students</p>
          <p className="saas-stat">{loading ? "..." : metrics.studentCount}</p>
          <p className="saas-meta-text mt-2">Student records available for quick autofill.</p>
        </article>

        <article className="saas-panel">
          <p className="saas-label">Notifications tracked</p>
          <p className="saas-stat">{loading ? "..." : metrics.notificationCount}</p>
          <p className="saas-meta-text mt-2">
            {metrics.role === "admin" ? "Current role: Admin" : "Current role: User"}
          </p>
        </article>
      </section>

      <section className="saas-panel">
        <p className="saas-label">Quick navigation</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {quickLinks.map((link) => (
            <Link key={link.href} href={link.href} className="saas-quick-link">
              <h3 className="saas-card-title">{link.title}</h3>
              <p className="saas-meta-text">{link.description}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
