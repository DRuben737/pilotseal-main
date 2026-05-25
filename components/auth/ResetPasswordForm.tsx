"use client";

import type { Session } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import AuthShell from "@/components/auth/AuthShell";
import { getSupabaseClient } from "@/lib/supabase";

export default function ResetPasswordForm({
  redirectTo = "/dashboard",
}: {
  redirectTo?: string;
}) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("Checking password reset link...");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    const supabase = getSupabaseClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) {
        return;
      }

      if (event === "PASSWORD_RECOVERY" || nextSession) {
        setSession(nextSession);
        setStatus(nextSession ? "" : "Open the reset link from your email again.");
      }
      setLoadingSession(false);
    });

    async function loadSession() {
      const {
        data: { session: currentSession },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      if (sessionError) {
        setError(sessionError.message);
        setStatus("");
      } else {
        setSession(currentSession);
        setStatus(currentSession ? "" : "Open the reset link from your email to continue.");
      }
      setLoadingSession(false);
    }

    void loadSession();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!session) {
      setError("This reset link is missing or expired. Request a new password reset email.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    setStatus("Updating password...");

    try {
      const supabase = getSupabaseClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        throw updateError;
      }

      await supabase.auth.signOut();
      router.replace(
        `/login?next=${encodeURIComponent(redirectTo)}&status=password-updated`
      );
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Failed to update password. Request a new reset link and try again."
      );
      setStatus("");
    } finally {
      setSubmitting(false);
    }
  }

  const loginHref = `/login?next=${encodeURIComponent(redirectTo)}`;

  return (
    <AuthShell>
      <h1 className="text-3xl font-semibold text-slate-950">Reset password</h1>

      <form className="grid gap-6" onSubmit={handleSubmit}>
        <label className="grid gap-2 border-b border-slate-200 pb-4">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            New password
          </span>
          <input
            type="password"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter a new password"
            className="bg-transparent text-base text-slate-950 outline-none placeholder:text-slate-400"
            required
          />
        </label>

        <label className="grid gap-2 border-b border-slate-200 pb-4">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            Confirm password
          </span>
          <input
            type="password"
            minLength={8}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Confirm your new password"
            className="bg-transparent text-base text-slate-950 outline-none placeholder:text-slate-400"
            required
          />
        </label>

        {status ? <p className="text-sm leading-7 text-slate-500">{status}</p> : null}
        {error ? <p className="text-sm leading-7 text-rose-700">{error}</p> : null}

        <div className="grid gap-3">
          <button
            className="primary-button min-w-[10rem] justify-center"
            type="submit"
            disabled={submitting || loadingSession || !session}
          >
            {submitting ? "Working..." : "Update password"}
          </button>
          <Link
            href={loginHref}
            className="w-fit text-sm font-medium text-slate-500 hover:text-slate-950"
          >
            Back to login
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
