"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import Panel from "@/components/ui/Panel";
import {
  createPlatformOrganization,
  fetchPlatformAdminAuditLog,
  fetchPlatformAdmins,
  fetchPlatformOrganizations,
  PlatformAdminAccount,
  PlatformAdminAuditEntry,
  PlatformOrganization,
  setPlatformAdminByEmail,
} from "@/lib/platform-admin";
import { fetchCurrentProfile } from "@/lib/profile";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return "Unable to complete the platform access request.";
}

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
      const account = await setPlatformAdminByEmail({
        email,
        makeAdmin: true,
        reason: grantReason,
      });
      setEmail("");
      setGrantReason("");
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
      setStatus(
        `${organization?.name ?? "Organization"} was created and assigned to ${organization?.owner_email ?? "the owner"}.`,
      );
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
      await loadData();
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusy(false);
    }
  }

  if (authLoading || loading) {
    return <Panel className="p-6 text-sm text-slate-500">Loading platform access…</Panel>;
  }

  if (!authorized) {
    return (
      <Panel className="p-6">
        <p className="text-sm font-semibold text-slate-900">Platform administrator access required</p>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Organization Owner and Admin roles do not grant access to this page.
        </p>
      </Panel>
    );
  }

  return (
    <div className="grid gap-4">
      <section className="rounded-[24px] bg-[linear-gradient(135deg,#173b56,#0f2740)] px-6 py-7 text-white shadow-[0_18px_44px_rgba(15,23,42,0.12)]">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">Platform security</p>
        <h1 className="mt-2 text-2xl font-semibold">Platform Access</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/70">
          Manage the small group of accounts that can approve platform-level changes. Organization roles remain separate.
        </p>
      </section>

      {error ? (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
      {status ? (
        <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {status}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Panel className="p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Create organization</p>
          <h2 className="mt-2 text-lg font-semibold text-slate-900">Assign an organization to an existing user</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Enter the organization name and the exact email of a registered account. The organization and Owner assignment are created together.
          </p>
          <form className="mt-5 grid gap-4" onSubmit={handleCreateOrganization}>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Organization name
              <input
                type="text"
                required
                minLength={2}
                maxLength={120}
                value={organizationName}
                onChange={(event) => setOrganizationName(event.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900"
                placeholder="Enter organization name"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Owner&apos;s registered email
              <input
                type="email"
                autoComplete="off"
                required
                value={ownerEmail}
                onChange={(event) => setOwnerEmail(event.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900"
                placeholder="Enter registered email"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Reason
              <textarea
                required
                minLength={3}
                maxLength={500}
                rows={3}
                value={organizationReason}
                onChange={(event) => setOrganizationReason(event.target.value)}
                className="resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900"
                placeholder="Why this organization is being created"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Creating…" : "Create organization and assign Owner"}
            </button>
          </form>
        </Panel>

        <Panel className="p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Organization directory</p>
              <h2 className="mt-2 text-lg font-semibold text-slate-900">Existing organizations</h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {organizations.length} organization{organizations.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="mt-5 grid max-h-[32rem] gap-3 overflow-y-auto pr-1">
            {organizations.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                No organizations have been created yet.
              </p>
            ) : organizations.map((organization) => (
              <article key={organization.id} className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{organization.name}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      Owner: {organization.owner_display_name || organization.owner_email || "Unavailable"}
                    </p>
                    {organization.owner_display_name && organization.owner_email ? (
                      <p className="mt-1 truncate text-xs text-slate-400">{organization.owner_email}</p>
                    ) : null}
                  </div>
                  <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[0.7rem] font-semibold text-sky-700">
                    {organization.member_count} member{organization.member_count === 1 ? "" : "s"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-400">Created {formatDate(organization.created_at)}</p>
              </article>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Panel className="p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Grant access</p>
          <h2 className="mt-2 text-lg font-semibold text-slate-900">Add a platform administrator</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Enter the exact email of an existing registered account. This does not change any organization role.
          </p>
          <form className="mt-5 grid gap-4" onSubmit={handleGrant}>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Registered email
              <input
                type="email"
                autoComplete="off"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900"
                placeholder="admin@example.com"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Reason
              <textarea
                required
                minLength={3}
                maxLength={500}
                rows={3}
                value={grantReason}
                onChange={(event) => setGrantReason(event.target.value)}
                className="resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900"
                placeholder="Why this account needs platform-level access"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Saving…" : "Grant platform access"}
            </button>
          </form>
        </Panel>

        <Panel className="p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Current access</p>
              <h2 className="mt-2 text-lg font-semibold text-slate-900">Platform administrators</h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {admins.length} account{admins.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="mt-5 grid gap-3">
            {admins.map((admin) => {
              const isCurrentUser = admin.id === session?.user?.id;
              return (
                <article key={admin.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900">{admin.display_name || admin.email || "Unnamed account"}</p>
                      {isCurrentUser ? <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[0.68rem] font-semibold text-sky-700">You</span> : null}
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">{admin.email || "No email"}</p>
                  </div>
                  <button
                    type="button"
                    disabled={busy || isCurrentUser}
                    onClick={() => {
                      setRevokeTarget(admin);
                      setRevokeReason("");
                      setError("");
                      setStatus("");
                    }}
                    className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                    title={isCurrentUser ? "You cannot revoke your own platform access." : undefined}
                  >
                    Revoke
                  </button>
                </article>
              );
            })}
          </div>
        </Panel>
      </div>

      {revokeTarget ? (
        <Panel className="border-rose-200 p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rose-500">Confirm revocation</p>
          <h2 className="mt-2 text-lg font-semibold text-slate-900">Remove platform access from {revokeTarget.email}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Their account and organization memberships remain unchanged. They will lose platform-level approval and management access.
          </p>
          <label className="mt-4 grid gap-1.5 text-sm font-medium text-slate-700">
            Reason
            <textarea
              required
              minLength={3}
              maxLength={500}
              rows={3}
              value={revokeReason}
              onChange={(event) => setRevokeReason(event.target.value)}
              className="resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900"
            />
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || revokeReason.trim().length < 3}
              onClick={() => void handleRevoke()}
              className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Revoking…" : "Confirm revocation"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setRevokeTarget(null);
                setRevokeReason("");
              }}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </Panel>
      ) : null}

      <Panel className="overflow-hidden">
        <div className="border-b border-slate-200/80 px-5 py-4 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Audit trail</p>
          <h2 className="mt-2 text-lg font-semibold text-slate-900">Platform role changes</h2>
        </div>
        {auditLog.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-500 sm:px-6">No platform role changes have been recorded yet.</p>
        ) : (
          <div className="divide-y divide-slate-200/80">
            {auditLog.map((entry) => (
              <article key={entry.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-6">
                <div>
                  <p className="text-sm text-slate-700">
                    <span className="font-semibold text-slate-900">{entry.actor_email || "Deleted account"}</span>{" "}
                    {entry.action === "granted" ? "granted access to" : "revoked access from"}{" "}
                    <span className="font-semibold text-slate-900">{entry.target_email}</span>
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-500">{entry.reason}</p>
                </div>
                <time className="text-xs text-slate-400" dateTime={entry.created_at}>{formatDate(entry.created_at)}</time>
              </article>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
