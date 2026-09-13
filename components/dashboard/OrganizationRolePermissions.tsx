"use client";

import { useEffect, useState } from "react";

import { CompactButton, ConfirmDialog, DetailDrawer } from "@/components/admin/AdminConsole";
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
  const [editingRole, setEditingRole] = useState<ConfigurableRole | "">("");
  const [confirmingRole, setConfirmingRole] = useState<ConfigurableRole | "">("");
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
      setEditingRole("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save role permissions.");
    } finally {
      setSavingRole("");
    }
  }

  function closeEditor() {
    if (!editingRole || savingRole) return;
    setDrafts((current) => ({ ...current, [editingRole]: saved[editingRole] }));
    setEditingRole("");
  }

  const selectedRole = editingRole || null;
  const selectedRoleChanged = selectedRole
    ? ORGANIZATION_PERMISSIONS.some((permission) => drafts[selectedRole].includes(permission) !== saved[selectedRole].includes(permission))
    : false;

  return (
    <section className="saas-panel" aria-labelledby="role-permissions-title">
      <header>
        <h2 id="role-permissions-title" className="text-base font-semibold text-slate-950">Role permissions</h2>
        <p className="mt-1 text-xs leading-5 text-slate-600">Choose the management areas available to each organization role. Owner always has full access.</p>
      </header>
      {status ? <p className="mt-3 text-sm text-slate-600" role="status">{status}</p> : null}
      <div className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {(["organization_admin", "member"] as const).map((role) => {
          const enabledLabels = ORGANIZATION_PERMISSIONS
            .filter((permission) => saved[role].includes(permission))
            .map((permission) => permissionLabels[permission].label);
          return (
            <div key={role} className="flex min-h-16 items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-slate-950">{roleLabels[role]}</h3>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {loading ? "Loading permissions…" : enabledLabels.length ? enabledLabels.join(" · ") : "No optional permissions"}
                </p>
              </div>
              <CompactButton type="button" disabled={loading || Boolean(savingRole)} onClick={() => setEditingRole(role)}>
                Edit
              </CompactButton>
            </div>
          );
        })}
      </div>

      <DetailDrawer
        open={Boolean(selectedRole)}
        onClose={closeEditor}
        title={selectedRole ? `${roleLabels[selectedRole]} permissions` : "Role permissions"}
        description="Choose which organization areas this role can manage. Required permissions cannot be removed."
      >
        {selectedRole ? (
          <fieldset className="grid gap-1" disabled={loading || Boolean(savingRole)}>
            <legend className="sr-only">{roleLabels[selectedRole]} permissions</legend>
            {ORGANIZATION_PERMISSIONS.map((permission) => (
              <label key={permission} className={`flex min-h-14 items-start gap-3 rounded-xl border px-3 py-3 ${isFixedPermission(selectedRole, permission) ? "cursor-not-allowed border-slate-200 bg-slate-50" : "cursor-pointer border-transparent hover:bg-slate-50"}`}>
                <input className="mt-0.5 h-4 w-4 accent-blue-600" type="checkbox" checked={drafts[selectedRole].includes(permission)} disabled={isFixedPermission(selectedRole, permission)} onChange={() => togglePermission(selectedRole, permission)} />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">{permissionLabels[permission].label}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                    {permission === "fleet"
                      ? selectedRole === "member" ? "Owner and Organization Admin only." : "Required for Organization Admin."
                      : selectedRole === "organization_admin" && permission === "endorsements"
                        ? "Required so Organization Admin can review issued records."
                        : permissionLabels[permission].description}
                  </span>
                </span>
              </label>
            ))}
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-4">
              <button className="ghost-button" type="button" disabled={Boolean(savingRole)} onClick={closeEditor}>Cancel</button>
              <button className="primary-button" type="button" disabled={!selectedRoleChanged || Boolean(savingRole)} onClick={() => setConfirmingRole(selectedRole)}>Apply</button>
            </div>
          </fieldset>
        ) : null}
      </DetailDrawer>

      <ConfirmDialog
        open={Boolean(confirmingRole)}
        title="Apply role permission changes?"
        description={confirmingRole ? `This changes organization access for every ${roleLabels[confirmingRole]} account.` : ""}
        confirmLabel="Apply permissions"
        busy={Boolean(savingRole)}
        onCancel={() => setConfirmingRole("")}
        onConfirm={() => {
          if (!confirmingRole) return;
          const role = confirmingRole;
          setConfirmingRole("");
          void saveRole(role);
        }}
      />
    </section>
  );
}
