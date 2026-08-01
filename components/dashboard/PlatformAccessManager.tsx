"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";

import {
  AdminDataTable,
  AdminPageHeader,
  CompactButton,
  CompactToolbar,
  ConfirmDialog,
  DetailDrawer,
  EmptyState,
  StatusBadge,
  WorksheetCell,
  WorksheetGrid,
  WorksheetHeader,
  worksheetInputClass,
} from "@/components/admin/AdminConsole";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { formatUsDateTime } from "@/lib/date-format";
import Panel from "@/components/ui/Panel";
import {
  createPlatformOrganization,
  fetchPlatformAdminAuditLog,
  fetchPlatformAdmins,
  fetchPlatformOrganizations,
  type PlatformAdminAccount,
  type PlatformAdminAuditEntry,
  type PlatformOrganization,
  setPlatformAdminByEmail,
} from "@/lib/platform-admin";
import { fetchCurrentProfile } from "@/lib/profile";

type DrawerMode = "organization" | "admin" | "revoke" | null;

export default function PlatformAccessManager() {
  const { loading: authLoading, session } = useAuthSession();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [admins, setAdmins] = useState<PlatformAdminAccount[]>([]);
  const [auditLog, setAuditLog] = useState<PlatformAdminAuditEntry[]>([]);
  const [organizations, setOrganizations] = useState<PlatformOrganization[]>([]);
  const [organizationName, setOrganizationName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [organizationReason, setOrganizationReason] = useState("");
  const [email, setEmail] = useState("");
  const [grantReason, setGrantReason] = useState("");
  const [revokeTarget, setRevokeTarget] = useState<PlatformAdminAccount | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null);
  const [revokeConfirmOpen, setRevokeConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const loadData = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) return;
    setLoading(true);
    setError("");
    try {
      const profile = await fetchCurrentProfile(userId);
      const isAdmin = profile?.role === "admin";
      setAuthorized(isAdmin);
      if (!isAdmin) return;
      const [nextAdmins, nextAuditLog, nextOrganizations] = await Promise.all([
        fetchPlatformAdmins(),
        fetchPlatformAdminAuditLog(),
        fetchPlatformOrganizations(),
      ]);
      setAdmins(nextAdmins);
      setAuditLog(nextAuditLog);
      setOrganizations(nextOrganizations);
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (authLoading) return;
    if (!session?.user) {
      setAuthorized(false);
      setLoading(false);
      return;
    }
    void loadData();
  }, [authLoading, loadData, session?.user]);

  async function handleGrant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const account = await setPlatformAdminByEmail({ email, makeAdmin: true, reason: grantReason });
      setEmail("");
      setGrantReason("");
      setDrawerMode(null);
      setStatus(`Platform access granted to ${account?.email ?? "the account"}.`);
      await loadData();
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const organization = await createPlatformOrganization({
        name: organizationName,
        ownerEmail,
        reason: organizationReason,
      });
      setOrganizationName("");
      setOwnerEmail("");
      setOrganizationReason("");
      setDrawerMode(null);
      setStatus(`${organization?.name ?? "Organization"} was created and assigned to ${organization?.owner_email ?? "the owner"}.`);
      await loadData();
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke() {
    if (!revokeTarget) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await setPlatformAdminByEmail({
        email: revokeTarget.email ?? "",
        makeAdmin: false,
        reason: revokeReason,
      });
      setStatus(`Platform access revoked from ${revokeTarget.email ?? "the account"}.`);
      setRevokeTarget(null);
      setRevokeReason("");
      setDrawerMode(null);
      setRevokeConfirmOpen(false);
      await loadData();
    } catch (nextError) {
      setError(errorMessage(nextError));
      setRevokeConfirmOpen(false);
    } finally {
      setBusy(false);
    }
  }

  if (authLoading || loading) {
    return <Panel className="p-4 text-sm text-slate-500">Loading platform access…</Panel>;
  }
  if (!authorized) {
    return <Panel className="p-4 text-sm text-slate-600">Platform administrator access is required.</Panel>;
  }

  return (
    <div className="grid gap-3">
      <AdminPageHeader
        eyebrow="Platform administration"
        title="Platform Access"
        description="Organizations and the small group of accounts with platform-level approval access."
        action={(
          <div className="flex gap-2">
            <CompactButton type="button" onClick={() => setDrawerMode("admin")}>Grant access</CompactButton>
            <CompactButton type="button" tone="primary" onClick={() => setDrawerMode("organization")}>Add organization</CompactButton>
          </div>
        )}
      />
      {error ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      {status ? <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{status}</p> : null}

      <AdminDataTable label="Organizations">
        <thead>
          <tr><th colSpan={5} className="p-0 font-normal"><CompactToolbar resultLabel={`${organizations.length} organizations`} /></th></tr>
          <tr className="border-b border-slate-200 bg-slate-100 text-xs font-semibold text-slate-700">
            <th className="px-3 py-2">Organization</th>
            <th className="px-3 py-2">Owner</th>
            <th className="px-3 py-2">Email</th>
            <th className="px-3 py-2 text-center">Members</th>
            <th className="px-3 py-2">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {!organizations.length ? <tr><td colSpan={5}><EmptyState title="No organizations" description="Create the first organization with the button above." /></td></tr> : null}
          {organizations.map((organization) => (
            <tr key={organization.id} className="hover:bg-blue-50/40">
              <td className="px-3 py-2 font-semibold text-slate-950">{organization.name}</td>
              <td className="px-3 py-2 text-slate-700">{organization.owner_display_name || "—"}</td>
              <td className="px-3 py-2 text-xs text-slate-600">{organization.owner_email || "—"}</td>
              <td className="px-3 py-2 text-center tabular-nums text-slate-700">{organization.member_count}</td>
              <td className="px-3 py-2 text-xs text-slate-500">{formatDate(organization.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </AdminDataTable>

      <AdminDataTable label="Platform administrators">
        <thead>
          <tr><th colSpan={4} className="p-0 font-normal"><CompactToolbar resultLabel={`${admins.length} accounts`} /></th></tr>
          <tr className="border-b border-slate-200 bg-slate-100 text-xs font-semibold text-slate-700">
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Email</th>
            <th className="px-3 py-2">Access</th>
            <th className="px-3 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {admins.map((admin) => {
            const isCurrentUser = admin.id === session?.user?.id;
            return (
              <tr key={admin.id} className="hover:bg-blue-50/40">
                <td className="px-3 py-2 font-semibold text-slate-950">{admin.display_name || "Unnamed account"} {isCurrentUser ? <span className="text-xs font-normal text-blue-700">(You)</span> : null}</td>
                <td className="px-3 py-2 text-xs text-slate-600">{admin.email || "—"}</td>
                <td className="px-3 py-2"><StatusBadge tone="info">Platform Admin</StatusBadge></td>
                <td className="px-3 py-2 text-right">
                  <CompactButton
                    type="button"
                    tone="danger"
                    disabled={busy || isCurrentUser}
                    title={isCurrentUser ? "You cannot revoke your own platform access." : undefined}
                    onClick={() => {
                      setRevokeTarget(admin);
                      setRevokeReason("");
                      setDrawerMode("revoke");
                    }}
                  >
                    Revoke
                  </CompactButton>
                </td>
              </tr>
            );
          })}
        </tbody>
      </AdminDataTable>

      <AdminDataTable label="Platform role audit trail">
        <thead className="bg-slate-100 text-xs font-semibold text-slate-700">
          <tr><th className="px-3 py-2">Changed by</th><th className="px-3 py-2">Action</th><th className="px-3 py-2">Account</th><th className="px-3 py-2">Reason</th><th className="px-3 py-2">When</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {!auditLog.length ? <tr><td colSpan={5}><EmptyState title="No role changes" description="Platform access changes will appear here." /></td></tr> : null}
          {auditLog.map((entry) => (
            <tr key={entry.id} className="hover:bg-slate-50">
              <td className="px-3 py-2 text-xs text-slate-700">{entry.actor_email || "Deleted account"}</td>
              <td className="px-3 py-2"><StatusBadge tone={entry.action === "granted" ? "success" : "danger"}>{entry.action === "granted" ? "Granted" : "Revoked"}</StatusBadge></td>
              <td className="px-3 py-2 text-xs font-semibold text-slate-800">{entry.target_email}</td>
              <td className="max-w-md px-3 py-2 text-xs text-slate-600">{entry.reason}</td>
              <td className="px-3 py-2 text-xs text-slate-500">{formatDate(entry.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </AdminDataTable>

      <DetailDrawer open={drawerMode === "organization"} onClose={() => setDrawerMode(null)} title="Add organization" description="Create the organization and assign its first Owner in one step.">
        <form onSubmit={handleCreateOrganization}>
          <WorksheetGrid label="New organization details">
            <thead><tr><WorksheetHeader>Organization name</WorksheetHeader><WorksheetHeader>Owner email</WorksheetHeader></tr></thead>
            <tbody><tr>
              <WorksheetCell><input autoFocus required minLength={2} maxLength={120} aria-label="Organization name" value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} className={worksheetInputClass} placeholder="Flight school name" /></WorksheetCell>
              <WorksheetCell><input required type="email" autoComplete="off" aria-label="Owner registered email" value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} className={worksheetInputClass} placeholder="owner@example.com" /></WorksheetCell>
            </tr></tbody>
          </WorksheetGrid>
          <label className="mt-3 grid gap-1 text-xs font-semibold text-slate-700">Reason<textarea required minLength={3} maxLength={500} rows={3} value={organizationReason} onChange={(event) => setOrganizationReason(event.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm font-normal" /></label>
          <DrawerActions busy={busy} onCancel={() => setDrawerMode(null)} submitLabel="Create organization" />
        </form>
      </DetailDrawer>

      <DetailDrawer open={drawerMode === "admin"} onClose={() => setDrawerMode(null)} title="Grant platform access" description="This does not change the account's organization role.">
        <form onSubmit={handleGrant}>
          <WorksheetGrid label="Platform administrator details">
            <thead><tr><WorksheetHeader>Registered email</WorksheetHeader><WorksheetHeader>Reason</WorksheetHeader></tr></thead>
            <tbody><tr>
              <WorksheetCell><input autoFocus required type="email" autoComplete="off" aria-label="Registered email" value={email} onChange={(event) => setEmail(event.target.value)} className={worksheetInputClass} placeholder="admin@example.com" /></WorksheetCell>
              <WorksheetCell><input required minLength={3} maxLength={500} aria-label="Reason" value={grantReason} onChange={(event) => setGrantReason(event.target.value)} className={worksheetInputClass} placeholder="Why access is needed" /></WorksheetCell>
            </tr></tbody>
          </WorksheetGrid>
          <DrawerActions busy={busy} onCancel={() => setDrawerMode(null)} submitLabel="Grant access" />
        </form>
      </DetailDrawer>

      <DetailDrawer open={drawerMode === "revoke" && Boolean(revokeTarget)} onClose={() => setDrawerMode(null)} title={`Revoke ${revokeTarget?.email ?? "platform access"}`} description="The account and organization memberships will remain unchanged.">
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Reason<textarea autoFocus required minLength={3} maxLength={500} rows={4} value={revokeReason} onChange={(event) => setRevokeReason(event.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm font-normal" /></label>
        <div className="mt-4 flex justify-end gap-2"><CompactButton type="button" onClick={() => setDrawerMode(null)}>Cancel</CompactButton><CompactButton type="button" tone="danger" disabled={revokeReason.trim().length < 3} onClick={() => setRevokeConfirmOpen(true)}>Continue</CompactButton></div>
      </DetailDrawer>
      <ConfirmDialog open={revokeConfirmOpen} title="Revoke platform access?" description={`This removes platform-level approval access from ${revokeTarget?.email ?? "this account"}. Organization memberships are not changed.`} confirmLabel="Revoke access" destructive busy={busy} onCancel={() => setRevokeConfirmOpen(false)} onConfirm={() => void handleRevoke()} />
    </div>
  );
}

function DrawerActions({ busy, onCancel, submitLabel }: { busy: boolean; onCancel: () => void; submitLabel: string }) {
  return <div className="mt-4 flex justify-end gap-2"><CompactButton type="button" onClick={onCancel}>Cancel</CompactButton><CompactButton type="submit" tone="primary" disabled={busy}>{busy ? "Saving…" : submitLabel}</CompactButton></div>;
}

function formatDate(value: string | null) {
  return formatUsDateTime(value);
}

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return "Unable to complete the platform access request.";
}
