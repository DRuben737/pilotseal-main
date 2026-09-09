"use client";

import { useState } from "react";

import { useOrganization } from "@/components/organizations/OrganizationProvider";
import { leaveOrganization } from "@/lib/organizations";

export default function OrganizationMembershipSettings() {
  const { organizations, refreshOrganizations } = useOrganization();
  const [leavingId, setLeavingId] = useState("");
  const [status, setStatus] = useState("");

  if (!organizations.length) return null;

  async function handleLeave(organizationId: string, organizationName: string) {
    if (!window.confirm(`Leave ${organizationName}? Your earlier organization records will remain unchanged.`)) return;
    setLeavingId(organizationId);
    setStatus("");
    try {
      await leaveOrganization(organizationId, "Member self-service exit");
      await refreshOrganizations();
      setStatus(`You left ${organizationName}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to leave this organization.");
    } finally {
      setLeavingId("");
    }
  }

  return (
    <section className="saas-panel">
      <header>
        <h2 className="text-lg font-semibold text-slate-950">Organization membership</h2>
        <p className="mt-1 text-sm text-slate-600">Manage the organizations connected to your account.</p>
      </header>
      {status ? <p className="mt-3 text-sm text-slate-600" role="status">{status}</p> : null}
      <div className="mt-4 divide-y divide-slate-200">
        {organizations.map((organization) => (
          <div className="flex min-h-14 items-center justify-between gap-4 py-3" key={organization.id}>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950">{organization.name}</p>
              <p className="mt-0.5 text-xs text-slate-500">{organization.member_role.replaceAll("_", " ")}</p>
            </div>
            {organization.member_role === "owner" ? (
              <span className="text-xs text-slate-500">Transfer ownership before leaving</span>
            ) : (
              <button
                type="button"
                className="danger-button"
                disabled={Boolean(leavingId)}
                onClick={() => void handleLeave(organization.id, organization.name)}
              >
                {leavingId === organization.id ? "Leaving…" : "Leave"}
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
