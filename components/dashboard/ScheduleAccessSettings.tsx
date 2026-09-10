"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";

import { ConfirmDialog } from "@/components/admin/AdminConsole";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { useOrganization } from "@/components/organizations/OrganizationProvider";
import {
  fetchEnabledFeatureIds,
  fetchScheduleEligibility,
  type OptionalFeatureId,
  type ScheduleEligibility,
  updateEnabledFeatureIds,
} from "@/lib/dashboard-preferences";
import {
  acceptOrganizationMemberInvitation,
  fetchOrganizationInvitation,
  type OrganizationInvitationPreview,
} from "@/lib/organizations";

const scheduleFeatureId: OptionalFeatureId = "cfi_schedule";

function getInvitationToken(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed, window.location.origin);
    return url.searchParams.get("invite")?.trim() || trimmed;
  } catch {
    return trimmed;
  }
}

export default function ScheduleAccessSettings({
  certificateRevision = 0,
  onAddInstructorCertificate,
}: {
  certificateRevision?: number;
  onAddInstructorCertificate?: () => void;
}) {
  const { loading: authLoading, session } = useAuthSession();
  const { refreshOrganizations } = useOrganization();
  const [enabledFeatureIds, setEnabledFeatureIds] = useState<OptionalFeatureId[]>([]);
  const [draftEnabled, setDraftEnabled] = useState(false);
  const [eligibility, setEligibility] = useState<ScheduleEligibility | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [message, setMessage] = useState("");
  const [showInvitation, setShowInvitation] = useState(false);
  const [invitationValue, setInvitationValue] = useState("");
  const [invitationToken, setInvitationToken] = useState("");
  const [invitation, setInvitation] = useState<OrganizationInvitationPreview | null>(null);
  const [invitationMessage, setInvitationMessage] = useState("");
  const [reviewingInvitation, setReviewingInvitation] = useState(false);
  const [acceptingInvitation, setAcceptingInvitation] = useState(false);
  const [confirmingInvitation, setConfirmingInvitation] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const userId = session?.user?.id;

    if (authLoading) return;
    if (!userId) {
      setLoading(false);
      return;
    }

    async function loadSettings(currentUserId: string) {
      setLoading(true);
      setLoadFailed(false);
      setMessage("");
      const [featureResult, eligibilityResult] = await Promise.allSettled([
        fetchEnabledFeatureIds(currentUserId),
        fetchScheduleEligibility(),
      ]);
      if (cancelled) return;

      if (featureResult.status === "fulfilled") {
        setEnabledFeatureIds(featureResult.value);
        setDraftEnabled(featureResult.value.includes(scheduleFeatureId));
      } else {
        setLoadFailed(true);
        setMessage("Schedule preferences are temporarily unavailable.");
      }
      setEligibility(eligibilityResult.status === "fulfilled" ? eligibilityResult.value : null);
      setLoading(false);
    }

    void loadSettings(userId);
    return () => { cancelled = true; };
  }, [authLoading, certificateRevision, session?.user?.id]);

  const enabled = enabledFeatureIds.includes(scheduleFeatureId);
  const eligible = Boolean(eligibility?.can_instruct || eligibility?.invited_student);
  const changed = draftEnabled !== enabled;
  const toggleDisabled = loading || saving || loadFailed || (!enabled && !eligible);
  const invitationEmailMatches = Boolean(
    invitation?.invited_email.trim().toLowerCase() === session?.user?.email?.trim().toLowerCase()
  );
  const invitationCanBeAccepted = Boolean(
    invitation?.status === "pending" && invitation.teaching_role === "student" && invitationEmailMatches
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const userId = session?.user?.id;
    if (!userId || !changed) return;
    setSaving(true);
    setMessage("");
    try {
      const nextFeatureIds = draftEnabled
        ? [...enabledFeatureIds.filter((id) => id !== scheduleFeatureId), scheduleFeatureId]
        : enabledFeatureIds.filter((id) => id !== scheduleFeatureId);
      const saved = await updateEnabledFeatureIds(userId, nextFeatureIds);
      setEnabledFeatureIds(saved);
      setDraftEnabled(saved.includes(scheduleFeatureId));
      setMessage(saved.includes(scheduleFeatureId)
        ? "Schedule is now available in your personal navigation."
        : "Schedule has been removed from your personal navigation.");
    } catch {
      setMessage("Unable to update Schedule. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReviewInvitation() {
    const token = getInvitationToken(invitationValue);
    if (!token) {
      setInvitationMessage("Paste the invitation link or code from your instructor.");
      return;
    }
    setReviewingInvitation(true);
    setInvitation(null);
    setInvitationMessage("");
    try {
      const preview = await fetchOrganizationInvitation(token);
      if (!preview) throw new Error("Invitation not found.");
      setInvitationToken(token);
      setInvitation(preview);
    } catch (error) {
      setInvitationMessage(error instanceof Error ? error.message : "Unable to review this invitation.");
    } finally {
      setReviewingInvitation(false);
    }
  }

  async function handleAcceptInvitation() {
    if (!invitationToken || !invitationCanBeAccepted) return;
    setAcceptingInvitation(true);
    setInvitationMessage("");
    try {
      await acceptOrganizationMemberInvitation(invitationToken);
      await refreshOrganizations();
      const nextEligibility = await fetchScheduleEligibility();
      setEligibility(nextEligibility);
      setDraftEnabled(true);
      setShowInvitation(false);
      setInvitation(null);
      setInvitationValue("");
      setInvitationToken("");
      setMessage("Invitation accepted. Apply to add Schedule to your navigation.");
    } catch (error) {
      setInvitationMessage(error instanceof Error ? error.message : "Unable to accept this invitation.");
    } finally {
      setAcceptingInvitation(false);
      setConfirmingInvitation(false);
    }
  }

  return (
    <section className="saas-panel dashboard-setting-row" aria-labelledby="schedule-access-title">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="schedule-access-title" className="saas-subsection-title">Schedule</h2>
          <p className="saas-meta-text mt-1">
            {enabled ? "Shown in your personal workspace" : eligible ? "Ready to enable" : "Complete one access option below"}
          </p>
        </div>
        {enabled ? <Link className="secondary-button" href="/dashboard/schedule">Open Schedule</Link> : null}
      </header>

      <form className="mt-4" onSubmit={handleSubmit}>
        <label className={`flex min-h-14 items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 ${toggleDisabled ? "cursor-not-allowed bg-slate-50" : "cursor-pointer bg-white"}`}>
          <input type="checkbox" className="h-5 w-5 shrink-0 accent-blue-600" checked={draftEnabled} disabled={toggleDisabled} onChange={(event) => { setDraftEnabled(event.target.checked); setMessage(""); }} />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-slate-950">Show Schedule in navigation</span>
            <span className="mt-0.5 block text-xs leading-5 text-slate-500">Manage lesson availability and training appointments.</span>
          </span>
        </label>

        {!loading && !eligible ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">Instructor certificate</p>
                <p className="mt-0.5 text-xs leading-5 text-slate-500">Add a complete flight or ground instructor certificate.</p>
              </div>
              <button className="secondary-button shrink-0" type="button" onClick={onAddInstructorCertificate}>Add</button>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">Student invitation</p>
                <p className="mt-0.5 text-xs leading-5 text-slate-500">Use the invitation link or code sent by your instructor.</p>
              </div>
              <button className="secondary-button shrink-0" type="button" aria-expanded={showInvitation} onClick={() => { setShowInvitation((current) => !current); setInvitationMessage(""); }}>
                {showInvitation ? "Close" : "Use invite"}
              </button>
            </div>
          </div>
        ) : null}

        {!loading && eligibility?.can_instruct ? <p className="mt-3 text-sm text-emerald-700">Instructor certificate verified.</p> : null}
        {!loading && eligibility?.invited_student ? <p className="mt-3 text-sm text-emerald-700">Student invitation accepted.</p> : null}

        {showInvitation && !eligible ? (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <label className="saas-field">
                <span>Invitation link or code</span>
                <input value={invitationValue} onChange={(event) => { setInvitationValue(event.target.value); setInvitation(null); setInvitationMessage(""); }} placeholder="Paste invitation" autoComplete="off" />
              </label>
              <button className="primary-button" type="button" disabled={reviewingInvitation || !invitationValue.trim()} onClick={() => void handleReviewInvitation()}>
                {reviewingInvitation ? "Checking…" : "Review"}
              </button>
            </div>

            {invitation ? (
              <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-sm font-semibold text-slate-900">{invitation.organization_name}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  {invitation.teaching_role === "student" ? "Student invitation" : "Organization invitation"}
                  {invitation.assigned_instructor_name ? ` · Instructor: ${invitation.assigned_instructor_name}` : ""}
                  {` · ${invitation.invited_email}`}
                </p>
                {!invitationEmailMatches ? <p className="mt-2 text-xs text-rose-700">This invitation belongs to a different email address.</p> : null}
                {invitation.status !== "pending" ? <p className="mt-2 text-xs text-rose-700">This invitation is {invitation.status}.</p> : null}
                {invitation.teaching_role !== "student" ? <p className="mt-2 text-xs text-amber-700">Only a student invitation unlocks Schedule without an instructor certificate.</p> : null}
                <button className="primary-button mt-3" type="button" disabled={!invitationCanBeAccepted} onClick={() => setConfirmingInvitation(true)}>Accept invitation</button>
              </div>
            ) : null}
            {invitationMessage ? <p className="mt-3 text-sm text-rose-700" role="alert">{invitationMessage}</p> : null}
          </div>
        ) : null}

        {message ? <p className="mt-3 text-sm text-slate-600" role={message.startsWith("Unable") ? "alert" : "status"}>{message}</p> : null}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className="primary-button" type="submit" disabled={!changed || saving || loadFailed}>{saving ? "Saving…" : "Apply"}</button>
          {changed ? <button className="ghost-button" type="button" disabled={saving} onClick={() => { setDraftEnabled(enabled); setMessage(""); }}>Cancel</button> : null}
        </div>
      </form>

      <ConfirmDialog
        open={confirmingInvitation}
        title="Accept student invitation?"
        description={invitation ? `Join ${invitation.organization_name} as a student${invitation.assigned_instructor_name ? ` with ${invitation.assigned_instructor_name} as your instructor` : ""}.` : "Accept this student invitation."}
        confirmLabel="Accept invitation"
        busy={acceptingInvitation}
        onCancel={() => setConfirmingInvitation(false)}
        onConfirm={() => void handleAcceptInvitation()}
      />
    </section>
  );
}
