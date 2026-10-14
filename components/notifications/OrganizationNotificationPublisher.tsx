"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  CompactButton,
  DetailDrawer,
  ManagementDisclosure,
  WorksheetCell,
  WorksheetGrid,
  WorksheetHeader,
  worksheetInputClass,
} from "@/components/admin/AdminConsole";
import { useOrganization } from "@/components/organizations/OrganizationProvider";
import {
  createOrganizationNotification,
  fetchOrganizationNotificationRecipientCount,
  type NotificationPriority,
} from "@/lib/notifications";
import { hasOrganizationPermission } from "@/lib/organizations";

export default function OrganizationNotificationPublisher({ activeOrganizationOnly = false }: { activeOrganizationOnly?: boolean }) {
  const { activeOrganizationId, activeOrganization, organizations, setActiveOrganizationId, loading: organizationsLoading } = useOrganization();
  const [memberCount, setMemberCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerOrganizationId, setComposerOrganizationId] = useState("");
  const [composerError, setComposerError] = useState("");
  const savingRef = useRef(false);
  const [status, setStatus] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<NotificationPriority>("normal");
  const managedOrganizations = organizations.filter((organization) => hasOrganizationPermission(organization, "notifications"));
  const publishingOrganization = activeOrganizationOnly
    ? (hasOrganizationPermission(activeOrganization, "notifications") ? activeOrganization : null)
    : managedOrganizations.find((organization) => organization.id === activeOrganizationId) ?? managedOrganizations[0] ?? null;
  const canPublish = Boolean(publishingOrganization);

  useEffect(() => {
    let cancelled = false;
    async function loadMemberCount() {
      if (!publishingOrganization?.id || !canPublish) {
        setMemberCount(0);
        return;
      }
      setLoading(true);
      try {
        const count = await fetchOrganizationNotificationRecipientCount(publishingOrganization.id);
        if (!cancelled) setMemberCount(count);
      } catch {
        if (!cancelled) setStatus("Unable to load the organization audience.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadMemberCount();
    return () => {
      cancelled = true;
    };
  }, [canPublish, publishingOrganization?.id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    if (!publishingOrganization?.id || !canPublish || publishingOrganization.id !== composerOrganizationId) {
      setComposerError("The organization changed. Close and reopen the notification before sending.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setStatus("");
    setComposerError("");
    try {
      const recipientCount = await createOrganizationNotification({
        organizationId: publishingOrganization.id,
        title,
        message,
        priority,
      });
      setTitle("");
      setMessage("");
      setPriority("normal");
      setComposerOpen(false);
      setStatus(`Organization notification sent to ${recipientCount} member${recipientCount === 1 ? "" : "s"}.`);
    } catch (error) {
      setComposerError(getErrorMessage(error, "Unable to send the organization notification."));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (organizationsLoading) return <p className="saas-panel">Loading organization…</p>;
  if (!publishingOrganization) return activeOrganizationOnly ? <p className="saas-panel">You do not have permission to publish notifications for this organization.</p> : null;

  return (
    <div className="grid gap-4">
      {!activeOrganizationOnly && managedOrganizations.length > 1 ? (
        <label className="dashboard-notification-organization-picker">
          <span>Publishing for</span>
          <select
            aria-label="Organization to notify"
            value={publishingOrganization?.id ?? ""}
            disabled={composerOpen || saving}
            onChange={(event) => setActiveOrganizationId(event.target.value)}
          >
            {managedOrganizations.map((organization) => (
              <option key={organization.id} value={organization.id}>{organization.name}</option>
            ))}
          </select>
        </label>
      ) : null}

      {status ? <p role="status" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">{status}</p> : null}

      <ManagementDisclosure
        id="organization-notifications"
        eyebrow="Organization administration"
        title="Organization notifications"
        summary={loading ? "Loading audience..." : `${memberCount} recipients`}
        actions={<CompactButton type="button" tone="primary" disabled={saving || composerOpen} onClick={() => { setComposerOrganizationId(publishingOrganization.id); setComposerError(""); setComposerOpen(true); }}>New notification</CompactButton>}
        openOnAction
      >
        <p className="break-words text-sm text-slate-600">{publishingOrganization.name}</p>
      </ManagementDisclosure>

      <DetailDrawer
        open={composerOpen}
        onClose={() => { if (!savingRef.current) setComposerOpen(false); }}
        title="New organization notification"
        description={organizations.find(organization => organization.id === composerOrganizationId)?.name ?? ""}
      >
        <form onSubmit={handleSubmit}>
          {composerError ? <p role="alert" className="mb-3 text-sm text-rose-700">{composerError}</p> : null}
          <fieldset disabled={saving}>
          <WorksheetGrid label="Organization notification details">
            <thead><tr><WorksheetHeader>Title</WorksheetHeader><WorksheetHeader>Priority</WorksheetHeader></tr></thead>
            <tbody><tr>
              <WorksheetCell><input autoFocus required aria-label="Notification title" value={title} onChange={(event) => setTitle(event.target.value)} className={worksheetInputClass} /></WorksheetCell>
              <WorksheetCell>
                <select aria-label="Notification priority" value={priority} onChange={(event) => setPriority(event.target.value as NotificationPriority)} className={worksheetInputClass}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </WorksheetCell>
            </tr></tbody>
          </WorksheetGrid>
          <label className="mt-3 grid gap-1 text-xs font-semibold text-slate-700">
            Message
            <textarea required rows={5} value={message} onChange={(event) => setMessage(event.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm font-normal" />
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <CompactButton type="button" onClick={() => setComposerOpen(false)}>Cancel</CompactButton>
            <CompactButton type="submit" tone="primary" disabled={saving || !title.trim() || !message.trim()}>{saving ? "Sending..." : "Send notification"}</CompactButton>
          </div>
          </fieldset>
        </form>
      </DetailDrawer>
    </div>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return fallback;
}
