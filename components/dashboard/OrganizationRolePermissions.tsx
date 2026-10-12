"use client";

import { useEffect, useState } from "react";

import {
  CompactButton,
  ConfirmDialog,
  DetailDrawer,
} from "@/components/admin/AdminConsole";
import { useOrganization } from "@/components/organizations/OrganizationProvider";
import {
  canManageOrganizationAdmins,
  fetchOrganizationRolePermissions,
  ORGANIZATION_PERMISSIONS,
  setOrganizationRolePermissions,
  type OrganizationPermission,
} from "@/lib/organizations";

const permissionLabels: Record<OrganizationPermission, { label: string; description: string }> = {
  members: { label: "People", description: "Invite members and manage organization profiles." },
  fleet: { label: "Aircraft", description: "Manage aircraft, models, inspections, and maintenance." },
  endorsements: { label: "Endorsements", description: "Review organization endorsement requests." },
  notifications: { label: "Notifications", description: "Publish notifications to organization members." },
  audit: { label: "Audit access", description: "Reserved for compatibility with existing organization roles." },
};

const configurablePermissions = ORGANIZATION_PERMISSIONS.filter(
  (permission) => permission !== "audit",
);

type ConfigurableRole = "organization_admin" | "member";

const roleLabels: Record<ConfigurableRole, string> = {
  organization_admin: "Organization admin",
  member: "Standard member",
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
  const [permissionsOpen, setPermissionsOpen] = useState(false);
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
    setPermissionsOpen(false);
  }

  const selectedRole = editingRole || null;
  const selectedRoleChanged = selectedRole
    ? configurablePermissions.some((permission) => drafts[selectedRole].includes(permission) !== saved[selectedRole].includes(permission))
    : false;

  return (
    <>
      <CompactButton type="button" onClick={() => { setPermissionsOpen(true); setEditingRole("organization_admin"); }}>
        Role settings
      </CompactButton>

      <DetailDrawer
        open={permissionsOpen}
        onClose={closeEditor}
        title="Role access settings"
      >
        <div className="mb-4 flex border-b border-slate-200" role="tablist" aria-label="Organization roles">
          {(["organization_admin", "member"] as const).map((role) => (
            <button key={role} type="button" role="tab" aria-selected={selectedRole === role} className={`border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${selectedRole === role ? "border-blue-600 text-blue-700" : "border-transparent text-slate-600 hover:text-slate-950"}`} onClick={() => setEditingRole(role)}>
              {roleLabels[role]}
            </button>
          ))}
        </div>
        {status ? <p className="mb-3 text-sm text-slate-600" role="status">{status}</p> : null}
        {selectedRole ? (
          <fieldset className="grid gap-1" disabled={loading || Boolean(savingRole)}>
            <legend className="sr-only">{roleLabels[selectedRole]} permissions</legend>
            {configurablePermissions.map((permission) => (
              <label key={permission} className={`flex min-h-12 items-start gap-3 border-b border-slate-200 px-1 py-2.5 ${isFixedPermission(selectedRole, permission) ? "cursor-not-allowed bg-slate-50" : "cursor-pointer hover:bg-slate-50"}`}>
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
    </>
  );
}
