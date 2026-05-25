"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { isExistingAccountError } from "@/components/auth/auth-errors";
import AuthShell from "@/components/auth/AuthShell";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { getSupabaseClient } from "@/lib/supabase";

export default function RegisterForm({
  redirectTo = "/dashboard",
}: {
  redirectTo?: string;
}) {
  const router = useRouter();
  const { loading, session } = useAuthSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [existingAccountEmail, setExistingAccountEmail] = useState("");

  useEffect(() => {
    if (!loading && session?.user) {
      router.replace(redirectTo);
    }
  }, [loading, redirectTo, router, session]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setExistingAccountEmail("");
    setStatus("Creating your account...");

    try {
      const supabase = getSupabaseClient();
      const normalizedEmail = email.trim();
      const emailRedirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/login?next=${encodeURIComponent(redirectTo)}`
          : undefined;
      const { data, error: authError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo,
        },
      });

      if (authError) {
        if (!isExistingAccountError(authError)) {
          throw authError;
        }

        setExistingAccountEmail(normalizedEmail);
        setStatus("");
        return;
      }

      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        setExistingAccountEmail(normalizedEmail);
        setStatus("");
        return;
      }

      setPassword("");

      if (data.session) {
        setStatus("Account created. Redirecting to your dashboard...");
        return;
      }

      setStatus("Account created. Please sign in.");
      router.replace(`/login?next=${encodeURIComponent(redirectTo)}`);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Registration failed. Please try again."
      );
      setStatus("");
    } finally {
      setSubmitting(false);
    }
  }

  const loginHref = `/login?next=${encodeURIComponent(redirectTo)}`;

  return (
    <AuthShell>
      {existingAccountEmail ? (
        <div className="Overlay auth-onboarding-overlay">
          <div className="auth-onboarding-modal">
            <div className="auth-onboarding-content">
              <div className="auth-onboarding-head">
                <p className="saas-kicker">Account exists</p>
                <h2 className="tools-child-title">Please sign in</h2>
                <p className="auth-onboarding-copy">
                  This email is already registered. Please sign in instead.
                </p>
              </div>
              <div className="auth-onboarding-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setExistingAccountEmail("")}
                >
                  Stay here
                </button>
                <Link className="primary-button" href={loginHref}>
                  Go to login
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <h1 className="text-3xl font-semibold text-slate-950">Register</h1>

      <form className="grid gap-6" onSubmit={handleSubmit}>
        <label className="grid gap-2 border-b border-slate-200 pb-4">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            Email
          </span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="cfi@pilotseal.com"
            className="bg-transparent text-base text-slate-950 outline-none placeholder:text-slate-400"
            required
          />
        </label>

        <label className="grid gap-2 border-b border-slate-200 pb-4">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            Password
          </span>
          <input
            type="password"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Create a password"
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
            disabled={submitting}
          >
            {submitting ? "Working..." : "Create account"}
          </button>
          <Link
            href={loginHref}
            className="w-fit text-sm font-medium text-slate-500 hover:text-slate-950"
          >
            Already have an account? Login
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
