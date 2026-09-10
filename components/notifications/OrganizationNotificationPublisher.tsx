"use client";

import { useEffect, useState, type FormEvent } from "react";

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

export default function OrganizationNotificationPublisher() {
  const { activeOrganizationId, organizations, setActiveOrganizationId } = useOrganization();
  const [memberCount, setMemberCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<NotificationPriority>("normal");
  const managedOrganizations = organizations.filter((organization) => hasOrganizationPermission(organization, "notifications"));
  const publishingOrganization = managedOrganizations.find((organization) => organization.id === activeOrganizationId)
    ?? managedOrganizations[0]
    ?? null;
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
    if (!publishingOrganization?.id || !canPublish) return;
    setSaving(true);
    setStatus("");
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
      setStatus(getErrorMessage(error, "Unable to send the organization notification."));
    } finally {
      setSaving(false);
    }
  }

  if (!canPublish) return null;

  return (
    <div className="grid gap-4">
      {managedOrganizations.length > 1 ? (
        <label className="dashboard-notification-organization-picker">
          <span>Publishing for</span>
          <select
            aria-label="Organization to notify"
            value={publishingOrganization?.id ?? ""}
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
        actions={<CompactButton type="button" tone="primary" onClick={() => setComposerOpen(true)}>New notification</CompactButton>}
        openOnAction
        helpContent={<p>Send an operational announcement or urgent notice to every current member of the selected organization.</p>}
      >
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          Notifications appear in each member&apos;s unified inbox. Use this channel for organization-wide operational information.
        </div>
      </ManagementDisclosure>

      <DetailDrawer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        title="New organization notification"
        description={`Send one notification to ${memberCount} current member${memberCount === 1 ? "" : "s"}.`}
      >
        <form onSubmit={handleSubmit}>
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
