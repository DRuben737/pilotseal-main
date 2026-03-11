"use client";

import { useEffect, useState } from "react";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { fetchCurrentProfile } from "@/lib/profile";

export default function AccountSettingsPanel() {
  const { loading, session } = useAuthSession();
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("Checking account settings...");

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      if (!session?.user?.id) {
        if (!cancelled) {
          setRole("");
          setStatus("No active session.");
        }
        return;
      }

      try {
        const profile = await fetchCurrentProfile(session.user.id);

        if (!cancelled) {
          setRole(profile?.role ?? "");
          setStatus("Account settings are synchronized.");
        }
      } catch (error) {
        console.error(error);

        if (!cancelled) {
          setStatus("Unable to load account settings right now.");
        }
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  return (
    <div className="grid gap-6">
      <section className="saas-panel">
        <p className="eyebrow">Account settings</p>
        <h2 className="saas-section-title">Session and workspace details</h2>
        <p className="saas-section-copy">
          Review the authenticated identity driving your dashboard state.
        </p>
      </section>

      <section className="saas-card-grid">
        <article className="saas-panel">
          <p className="saas-label">Email</p>
          <p className="saas-value">{session?.user?.email ?? "Not signed in"}</p>
        </article>

        <article className="saas-panel">
          <p className="saas-label">User ID</p>
          <p className="saas-mono">{session?.user?.id ?? "Unavailable"}</p>
        </article>

        <article className="saas-panel">
          <p className="saas-label">Role</p>
          <p className="saas-value">{role || "Unknown"}</p>
        </article>

        <article className="saas-panel">
          <p className="saas-label">System status</p>
          <p className="saas-meta-text">{loading ? "Checking session..." : status}</p>
        </article>
      </section>
    </div>
  );
}
