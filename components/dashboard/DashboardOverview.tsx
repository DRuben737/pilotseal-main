"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { QuickEditPopover } from "@/components/admin/AdminConsole";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import OrganizationAccessManager from "@/components/dashboard/OrganizationAccessManager";
import {
  DEFAULT_QUICK_ACTION_IDS,
  fetchEnabledFeatureIds,
  fetchScheduleEligibility,
  type ScheduleEligibility,
  fetchDashboardQuickActionIds,
  OPTIONAL_FEATURES,
  QUICK_ACTIONS,
  type OptionalFeatureId,
  type QuickActionId,
  updateEnabledFeatureIds,
  updateDashboardQuickActionIds,
} from "@/lib/dashboard-preferences";
import { formatTimeUntilDate } from "@/lib/identity";
import {
  fetchInboxNotifications,
  type NotificationRecord,
} from "@/lib/notifications";
import { fetchCurrentProfile } from "@/lib/profile";
import { fetchMyOrganizationRegistrationRequests, type PlatformOrganizationRequest } from "@/lib/platform-admin";
import { formatUsDate } from "@/lib/date-format";
import {
  fetchDefaultCfi,
  formatStoredDateForDisplay,
  type SavedPerson,
} from "@/lib/saved-people";

type OverviewState = {
  notifications: NotificationRecord[];
  defaultCfi: SavedPerson | null;
  medicalLastExam: string;
  medicalExpiry: string;
};

const emptyState: OverviewState = {
  notifications: [],
  defaultCfi: null,
  medicalLastExam: "",
  medicalExpiry: "",
};

function formatMedicalExam(value: string | null | undefined) {
  return formatStoredDateForDisplay(value ?? null);
}

function formatRelativeDate(value: string) {
  return formatUsDate(value, "");
}

export default function DashboardOverview() {
  const { session } = useAuthSession();
  const [statusNote, setStatusNote] = useState("");
  const [overview, setOverview] = useState<OverviewState>(emptyState);
  const [quickActionIds, setQuickActionIds] = useState<QuickActionId[]>(DEFAULT_QUICK_ACTION_IDS);
  const [quickActionDraft, setQuickActionDraft] = useState<QuickActionId[]>(DEFAULT_QUICK_ACTION_IDS);
  const [customizingQuickActions, setCustomizingQuickActions] = useState(false);
  const [savingQuickActions, setSavingQuickActions] = useState(false);
  const [quickActionError, setQuickActionError] = useState("");
  const [enabledFeatureIds, setEnabledFeatureIds] = useState<OptionalFeatureId[]>([]);
  const [featureDraft, setFeatureDraft] = useState<OptionalFeatureId[]>([]);
  const [customizingFeatures, setCustomizingFeatures] = useState(false);
  const [savingFeatures, setSavingFeatures] = useState(false);
  const [featureError, setFeatureError] = useState("");
  const [scheduleEligibility, setScheduleEligibility] = useState<ScheduleEligibility | null>(null);
  const [companyRequest, setCompanyRequest] = useState<PlatformOrganizationRequest | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadOverview() {
      if (!session?.user?.id) {
        if (!cancelled) {
          setOverview(emptyState);
          setQuickActionIds(DEFAULT_QUICK_ACTION_IDS);
          setEnabledFeatureIds([]);
        }
        return;
      }

      try {
        setStatusNote("");

        const [profile, defaultCfi, notifications, selectedQuickActionIds, selectedFeatureIds, companyRequests, eligibility] = await Promise.all([
          fetchCurrentProfile(session.user.id),
          fetchDefaultCfi(session.user.id),
          fetchInboxNotifications(session.user.id),
          fetchDashboardQuickActionIds(session.user.id),
          fetchEnabledFeatureIds(session.user.id),
          fetchMyOrganizationRegistrationRequests(),
          fetchScheduleEligibility(),
        ]);

        if (!cancelled) {
          setOverview({
            notifications,
            defaultCfi,
            medicalLastExam: formatMedicalExam(profile?.medical_exam_date),
            medicalExpiry: profile?.medical_exp_date ?? "",
          });
          setQuickActionIds(selectedQuickActionIds);
          setEnabledFeatureIds(selectedFeatureIds);
          setCompanyRequest(companyRequests[0] ?? null);
          setScheduleEligibility(eligibility);
        }
      } catch {
        if (!cancelled) {
          setOverview(emptyState);
          setStatusNote("Dashboard data is temporarily unavailable.");
        }
      }
    }

    void loadOverview();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const selectedQuickActions = useMemo(
    () => QUICK_ACTIONS.filter((action) => quickActionIds.includes(action.id)),
    [quickActionIds]
  );

  function setQuickActionCustomizerOpen(open: boolean) {
    setCustomizingQuickActions(open);
    setQuickActionError("");
    if (open) setQuickActionDraft(quickActionIds);
  }

  function toggleQuickAction(id: QuickActionId) {
    setQuickActionDraft((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
    setQuickActionError("");
  }

  async function saveQuickActions() {
    if (!session?.user?.id) return;
    if (quickActionDraft.length === 0) {
      setQuickActionError("Select at least one quick action.");
      return;
    }

    setSavingQuickActions(true);
    setQuickActionError("");
    try {
      const saved = await updateDashboardQuickActionIds(session.user.id, quickActionDraft);
      setQuickActionIds(saved);
      setCustomizingQuickActions(false);
    } catch {
      setQuickActionError("Unable to save quick actions. Try again.");
    } finally {
      setSavingQuickActions(false);
    }
  }

  function setFeatureCustomizerOpen(open: boolean) {
    setCustomizingFeatures(open);
    setFeatureError("");
    if (open) setFeatureDraft(enabledFeatureIds);
  }

  function toggleFeature(id: OptionalFeatureId) {
    setFeatureDraft((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  async function saveFeatures() {
    if (!session?.user?.id) return;
    setSavingFeatures(true);
    setFeatureError("");
    try {
      const saved = await updateEnabledFeatureIds(session.user.id, featureDraft);
      setEnabledFeatureIds(saved);
      setCustomizingFeatures(false);
    } catch {
      setFeatureError("Unable to update your features. Try again.");
    } finally {
      setSavingFeatures(false);
    }
  }

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

      <OrganizationAccessManager />

      {companyRequest ? <section className={`rounded-[16px] border px-4 py-3 text-sm ${companyRequest.status === "approved" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : companyRequest.status === "rejected" ? "border-rose-200 bg-rose-50 text-rose-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
        <p className="font-semibold">{companyRequest.requested_name}: {companyRequest.status === "pending" ? "awaiting platform approval" : companyRequest.status}</p>
        <p className="mt-1 text-xs">{companyRequest.status === "pending" ? "The organization has not been created yet. You will be notified after a platform administrator reviews it." : companyRequest.review_reason || "Review completed."}</p>
      </section> : null}

      <section className="rounded-[20px] border border-slate-200/80 bg-white p-4 shadow-[0_10px_26px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Personal features</h2>
            <p className="mt-1 text-sm text-slate-500">Add only the workspace features you want to use.</p>
          </div>
          <QuickEditPopover
            open={customizingFeatures}
            onOpenChange={setFeatureCustomizerOpen}
            label="Add personal features"
            trigger={<button type="button" className="secondary-button">Add features</button>}
          >
            <div className="grid gap-2">
              {OPTIONAL_FEATURES.map((feature) => (
                <label key={feature.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={featureDraft.includes(feature.id)}
                    disabled={!enabledFeatureIds.includes(feature.id) && !scheduleEligibility?.can_instruct && !scheduleEligibility?.invited_student}
                    onChange={() => toggleFeature(feature.id)}
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">{feature.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">{feature.description}</span>
                  </span>
                </label>
              ))}
            </div>
            {!scheduleEligibility?.can_instruct && !scheduleEligibility?.invited_student ? <p className="mt-2 text-xs text-slate-600">Complete your own Flight Instructor or Ground Instructor certificate in <Link className="text-blue-700 underline" href="/dashboard/saved-people">People → My information</Link>: name, certificate number, ratings, and last activity/issuance date. Students need an instructor invitation.</p> : null}
            {featureError ? <p role="alert" className="mt-2 text-xs text-rose-600">{featureError}</p> : null}
            <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button type="button" className="ghost-button" onClick={() => setFeatureCustomizerOpen(false)}>Cancel</button>
              <button type="button" className="primary-button" disabled={savingFeatures} onClick={() => void saveFeatures()}>
                {savingFeatures ? "Saving…" : "Apply"}
              </button>
            </div>
          </QuickEditPopover>
        </div>
        {enabledFeatureIds.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {OPTIONAL_FEATURES.filter((feature) => enabledFeatureIds.includes(feature.id)).map((feature) => (
              <Link key={feature.id} href={feature.href} className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4 transition hover:bg-sky-50">
                <span className="block text-sm font-semibold text-slate-950">{feature.label}</span>
                <span className="mt-1 block text-sm text-slate-600">{feature.description}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">No optional features added.</p>
        )}
      </section>

      <section className="grid items-start gap-4 lg:grid-cols-2">
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
              <QuickEditPopover
                open={customizingQuickActions}
                onOpenChange={setQuickActionCustomizerOpen}
                label="Customize quick actions"
                trigger={(
                  <button type="button" className="text-sm font-medium text-[var(--accent-strong)]">
                    Customize
                  </button>
                )}
              >
                <div className="max-h-72 overflow-y-auto pr-1">
                  {QUICK_ACTIONS.map((action) => (
                    <label key={action.id} className="flex min-h-9 cursor-pointer items-center gap-2 border-b border-slate-100 text-sm text-slate-700 last:border-0">
                      <input
                        type="checkbox"
                        checked={quickActionDraft.includes(action.id)}
                        onChange={() => toggleQuickAction(action.id)}
                      />
                      <span>{action.label}</span>
                    </label>
                  ))}
                </div>
                {quickActionError ? <p role="alert" className="mt-2 text-xs text-rose-600">{quickActionError}</p> : null}
                <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    disabled={savingQuickActions}
                    onClick={() => setQuickActionCustomizerOpen(false)}
                    className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={savingQuickActions}
                    onClick={() => void saveQuickActions()}
                    className="h-9 rounded-lg bg-blue-700 px-3 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
                  >
                    {savingQuickActions ? "Saving…" : "Save"}
                  </button>
                </div>
              </QuickEditPopover>
            </div>
            <div className="mt-3 grid gap-3">
              {selectedQuickActions.map((action) => (
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
      </section>
    </div>
  );
}
