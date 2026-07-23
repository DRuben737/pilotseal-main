"use client";

import { useEffect, useState } from "react";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { useOrganization } from "@/components/organizations/OrganizationProvider";
import {
  claimOrganizationPerson,
  fetchAvailableOrganizations,
  type AvailableOrganization,
} from "@/lib/organizations";

type Props = {
  showEmpty?: boolean;
};

export default function OrganizationAccessManager({ showEmpty = false }: Props) {
  const { session } = useAuthSession();
  const { refreshOrganizations } = useOrganization();
  const [available, setAvailable] = useState<AvailableOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState("");
  const [status, setStatus] = useState("");

  async function reload() {
    if (!session?.user?.id) {
      setAvailable([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setAvailable(await fetchAvailableOrganizations());
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to load available organizations."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  async function handleJoin(item: AvailableOrganization) {
    setJoiningId(item.person_id);
    setStatus("");
    try {
      await claimOrganizationPerson(item.person_id);
      await Promise.all([reload(), refreshOrganizations()]);
      setStatus(`You joined ${item.organization_name}.`);
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to join this organization."));
    } finally {
      setJoiningId("");
    }
  }

  if (!loading && available.length === 0 && !showEmpty && !status) return null;

  return (
    <section className="saas-panel dashboard-setting-row">
      <div>
        <p className="saas-kicker">Organization access</p>
        <h2 className="saas-subsection-title mt-1">Available organizations</h2>
        <p className="saas-meta-text mt-2">
          Only organizations that already listed your verified email appear here. Joining links your account without changing your personal profile.
        </p>
      </div>

      {status ? <p className="mt-3 text-sm text-slate-600" role="status">{status}</p> : null}
      {loading ? <p className="saas-meta-text mt-4">Checking organization access...</p> : null}
      {!loading && available.length === 0 ? (
        <p className="saas-meta-text mt-4">No organization is waiting to be linked to this account.</p>
      ) : null}

      <div className="mt-4 grid gap-3">
        {available.map((item) => (
          <article key={item.person_id} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{item.organization_name}</p>
                <p className="saas-meta-text mt-1">
                  {item.teaching_role ? formatTeachingRole(item.teaching_role) : "Member"}
                  {item.internal_id ? ` · ID ${item.internal_id}` : ""}
                </p>
                {item.organization_display_name ? (
                  <p className="saas-meta-text mt-1">Organization name: {item.organization_display_name}</p>
                ) : null}
              </div>
              <button
                type="button"
                className="primary-button"
                disabled={Boolean(joiningId)}
                onClick={() => void handleJoin(item)}
              >
                {joiningId === item.person_id ? "Joining..." : "Join organization"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function formatTeachingRole(value: string) {
  return value === "instructor" ? "Instructor" : "Student";
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return fallback;
}
