"use client";

import { useEffect, useState } from "react";

import { useOrganization } from "@/components/organizations/OrganizationProvider";
import {
  canManageOrganizationAdmins,
  fetchOrganizationRolePermissions,
  ORGANIZATION_PERMISSIONS,
  setOrganizationRolePermissions,
  type OrganizationPermission,
} from "@/lib/organizations";

const permissionLabels: Record<OrganizationPermission, { label: string; description: string }> = {
  members: { label: "Members", description: "Invite members and manage organization profiles." },
  fleet: { label: "Fleet", description: "Manage aircraft, models, inspections, and maintenance." },
  endorsements: { label: "Endorsements", description: "Review organization endorsement requests." },
  notifications: { label: "Notifications", description: "Publish notifications to organization members." },
  audit: { label: "Audit", description: "View organization assignment and activity logs." },
};

type ConfigurableRole = "organization_admin" | "member";

const roleLabels: Record<ConfigurableRole, string> = {
  organization_admin: "Organization Admin",
  member: "Member",
};

export default function OrganizationRolePermissions() {
  const { activeOrganization, refreshOrganizations } = useOrganization();
  const canConfigure = canManageOrganizationAdmins(activeOrganization?.member_role);
  const [drafts, setDrafts] = useState<Record<ConfigurableRole, OrganizationPermission[]>>({
    organization_admin: [],
    member: [],
  });
  const [saved, setSaved] = useState<Record<ConfigurableRole, OrganizationPermission[]>>({
    organization_admin: [],
    member: [],
  });
  const [loading, setLoading] = useState(true);
  const [savingRole, setSavingRole] = useState<ConfigurableRole | "">("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!activeOrganization?.id || !canConfigure) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setStatus("");
    void fetchOrganizationRolePermissions(activeOrganization.id)
      .then((settings) => {
        if (cancelled) return;
        const next = {
          organization_admin: settings.find((item) => item.role === "organization_admin")?.permissions ?? [],
          member: settings.find((item) => item.role === "member")?.permissions ?? [],
        };
        setDrafts(next);
        setSaved(next);
      })
      .catch(() => {
        if (!cancelled) setStatus("Unable to load role permissions.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeOrganization?.id, canConfigure]);

  if (!canConfigure) return null;

  function togglePermission(role: ConfigurableRole, permission: OrganizationPermission) {
    setDrafts((current) => ({
      ...current,
      [role]: current[role].includes(permission)
        ? current[role].filter((item) => item !== permission)
        : [...current[role], permission],
    }));
    setStatus("");
  }

  function isFixedPermission(role: ConfigurableRole, permission: OrganizationPermission) {
    return permission === "fleet" || (role === "organization_admin" && permission === "endorsements");
  }

  async function saveRole(role: ConfigurableRole) {
    if (!activeOrganization?.id) return;
    setSavingRole(role);
    setStatus("");
    try {
      await setOrganizationRolePermissions(activeOrganization.id, role, drafts[role]);
      setSaved((current) => ({ ...current, [role]: drafts[role] }));
      await refreshOrganizations();
      setStatus(`${roleLabels[role]} permissions saved.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save role permissions.");
    } finally {
      setSavingRole("");
    }
  }

  return (
    <section className="saas-panel" aria-labelledby="role-permissions-title">
      <header>
        <h2 id="role-permissions-title" className="text-base font-semibold text-slate-950">Role permissions</h2>
        <p className="mt-1 text-xs leading-5 text-slate-600">Choose the management areas available to each organization role. Owner always has full access.</p>
      </header>
      {status ? <p className="mt-3 text-sm text-slate-600" role="status">{status}</p> : null}
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {(["organization_admin", "member"] as const).map((role) => {
          const changed = ORGANIZATION_PERMISSIONS.some((permission) => drafts[role].includes(permission) !== saved[role].includes(permission));
          return (
            <fieldset key={role} className="rounded-xl border border-slate-200 bg-white p-3" disabled={loading || Boolean(savingRole)}>
              <legend className="px-1 text-sm font-semibold text-slate-900">{roleLabels[role]}</legend>
              <div className="mt-1 grid gap-1">
                {ORGANIZATION_PERMISSIONS.map((permission) => (
                  <label key={permission} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
                    <input className="mt-0.5 h-4 w-4 accent-blue-600" type="checkbox" checked={drafts[role].includes(permission)} disabled={isFixedPermission(role, permission)} onChange={() => togglePermission(role, permission)} />
                    <span>
                      <span className="block text-xs font-semibold text-slate-900">{permissionLabels[permission].label}</span>
                      <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">
                        {permission === "fleet"
                          ? role === "member" ? "Owner and Organization Admin only." : "Required for Organization Admin."
                          : role === "organization_admin" && permission === "endorsements"
                            ? "Required so Organization Admin can review issued records."
                            : permissionLabels[permission].description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2 border-t border-slate-200 pt-3">
                <button className="primary-button" type="button" disabled={!changed || Boolean(savingRole)} onClick={() => void saveRole(role)}>
                  {savingRole === role ? "Saving…" : "Apply"}
                </button>
                {changed ? <button className="ghost-button" type="button" disabled={Boolean(savingRole)} onClick={() => setDrafts((current) => ({ ...current, [role]: saved[role] }))}>Cancel</button> : null}
              </div>
            </fieldset>
          );
        })}
      </div>
    </section>
  );
}
