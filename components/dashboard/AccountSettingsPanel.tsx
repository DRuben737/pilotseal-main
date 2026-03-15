"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { fetchCurrentProfile } from "@/lib/profile";
import { getSupabaseClient } from "@/lib/supabase";

export default function AccountSettingsPanel() {
  const router = useRouter();
  const { loading, session } = useAuthSession();
  const [role, setRole] = useState("User");
  const [status, setStatus] = useState("Checking account settings...");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      if (!session?.user?.id) {
        if (!cancelled) {
          setRole("User");
          setStatus("No active session.");
        }
        return;
      }

      try {
        const profile = await fetchCurrentProfile(session.user.id);

        if (!cancelled) {
          setRole(profile?.role === "admin" ? "Admin" : "User");
          setStatus("Account settings are synchronized.");
        }
      } catch (error) {
        console.error(error);

        if (!cancelled) {
          setRole("User");
          setStatus("Unable to load account settings right now.");
        }
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  async function handleDeleteAccount() {
    if (!session?.user?.id) {
      setStatus("You must be signed in to delete your account.");
      return;
    }

    const confirmed = window.confirm(
      "This action permanently deletes your account and all saved data."
    );

    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setStatus("Deleting account...");

    try {
      const supabase = getSupabaseClient();
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (!currentSession?.access_token) {
        throw new Error("Account deletion failed. Please try again.");
      }

      const response = await fetch("/api/delete-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentSession.access_token}`,
        },
        body: JSON.stringify({ userId: session.user.id }),
      });

      const payload = (await response.json()) as { error?: string; success?: boolean };

      if (!response.ok || !payload.success) {
        throw new Error("Account deletion failed. Please try again.");
      }

      await supabase.auth.signOut();
      router.refresh();
      router.replace("/");
    } catch (error) {
      console.error(error);
      setStatus("Account deletion failed. Please try again.");
      setDeleting(false);
      return;
    }
  }

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
          <p className="saas-value">{role}</p>
        </article>

        <article className="saas-panel">
          <p className="saas-label">System status</p>
          <p className="saas-meta-text">{loading ? "Checking session..." : status}</p>
        </article>
      </section>

      <section className="saas-panel saas-danger-panel">
        <p className="saas-label">Danger zone</p>
        <h3 className="saas-subsection-title">Delete account</h3>
        <p className="saas-meta-text mt-3">
          This action permanently deletes your PilotSeal account and all saved data.
        </p>
        <button
          type="button"
          className="danger-button mt-5"
          disabled={!session?.user?.id || deleting}
          onClick={handleDeleteAccount}
        >
          {deleting ? "Deleting account..." : "Delete account"}
        </button>
      </section>
    </div>
  );
}
