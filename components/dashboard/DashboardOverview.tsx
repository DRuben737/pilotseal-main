"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { formatTimeUntilDate, resolveDisplayIdentity } from "@/lib/identity";
import { fetchNotificationHistory } from "@/lib/notifications";
import { fetchCurrentProfile } from "@/lib/profile";
import { fetchDefaultCfi, fetchSavedPeople, formatStoredDateForDisplay } from "@/lib/saved-people";

type OverviewMetrics = {
  cfiCount: number;
  studentCount: number;
  notificationCount: number;
  role: string;
  displayName: string;
  defaultCfiName: string;
  defaultCfiExpiry: string;
  medicalLastExam: string;
  medicalExpiry: string;
};

const defaultMetrics: OverviewMetrics = {
  cfiCount: 0,
  studentCount: 0,
  notificationCount: 0,
  role: "",
  displayName: "",
  defaultCfiName: "",
  defaultCfiExpiry: "",
  medicalLastExam: "",
  medicalExpiry: "",
};

function formatMedicalExam(value: string | null | undefined) {
  return formatStoredDateForDisplay(value ?? null);
}

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
          fetchDefaultCfi(session.user.id),
        ]);

        const cfis = results[0].status === "fulfilled" ? results[0].value : [];
        const students = results[1].status === "fulfilled" ? results[1].value : [];
        const profile = results[2].status === "fulfilled" ? results[2].value : null;
        const defaultCfi = results[3].status === "fulfilled" ? results[3].value : null;

        const notificationsResult =
          profile?.role === "admin"
            ? await Promise.allSettled([fetchNotificationHistory()])
            : null;

        const notifications =
          notificationsResult?.[0]?.status === "fulfilled" ? notificationsResult[0].value : [];

        if (!cancelled) {
          setMetrics({
            cfiCount: cfis.length,
            studentCount: students.length,
            notificationCount: notifications.length,
            role: profile?.role ?? "",
            displayName: profile?.display_name ?? "",
            defaultCfiName: defaultCfi?.display_name ?? "",
            defaultCfiExpiry: defaultCfi?.cert_exp_date ?? "",
            medicalLastExam: formatMedicalExam(profile?.medical_exam_date),
            medicalExpiry: profile?.medical_exp_date ?? "",
          });
          setStatusNote("");
        }
      } catch (loadError) {
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

  const identityLabel = resolveDisplayIdentity({
    displayName: metrics.displayName,
    defaultCfiName: metrics.defaultCfiName,
    email: session?.user?.email,
  });

  return (
    <div className="grid gap-5">
      {statusNote ? (
        <section className="saas-panel">
          <p className="saas-meta-text">{statusNote}</p>
        </section>
      ) : null}

      <section className="saas-panel">
        <div className="saas-overview-list">
          <div className="saas-overview-row">
            <div>
              <p className="saas-label">User</p>
              <p className="saas-value">
                {loading ? "..." : identityLabel}
              </p>
            </div>
            <p className="saas-meta-text">Profile identity</p>
          </div>

          <Link href="/dashboard/saved-people" className="saas-overview-row saas-overview-row-link">
            <div>
              <p className="saas-label">Default CFI</p>
              <p className="saas-value">{loading ? "..." : metrics.defaultCfiName || "No default CFI set"}</p>
            </div>
            <p className="saas-meta-text">
              {loading
                ? "..."
                : metrics.defaultCfiExpiry
                  ? formatTimeUntilDate(metrics.defaultCfiExpiry)
                  : "Add in saved people"}
            </p>
          </Link>

          <Link href="/dashboard/account-settings" className="saas-overview-row saas-overview-row-link">
            <div>
              <p className="saas-label">Medical last exam</p>
              <p className="saas-value">
                {loading ? "..." : metrics.medicalLastExam || "No medical certificate saved"}
              </p>
            </div>
            <p className="saas-meta-text">
              {loading
                ? "..."
                : metrics.medicalExpiry
                  ? formatTimeUntilDate(metrics.medicalExpiry)
                  : "Add in account settings"}
            </p>
          </Link>
        </div>
      </section>
    </div>
  );
}
