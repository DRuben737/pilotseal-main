"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import AuthShell from "@/components/auth/AuthShell";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { getAuthErrorMessage } from "@/components/auth/auth-errors";
import { getSupabaseClient } from "@/lib/supabase";

const USERNAME_EMAIL_DOMAIN = "pilotseal.com";

function loginEmailFromIdentifier(identifier: string) {
  const normalizedIdentifier = identifier.trim().toLowerCase();

  return normalizedIdentifier.includes("@")
    ? normalizedIdentifier
    : `${normalizedIdentifier}@${USERNAME_EMAIL_DOMAIN}`;
}

export default function LoginForm({
  redirectTo = "/dashboard",
  initialStatus = "",
}: {
  redirectTo?: string;
  initialStatus?: string;
}) {
  const router = useRouter();
  const { loading, session } = useAuthSession();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && session?.user) {
      router.replace(redirectTo);
    }
  }, [loading, redirectTo, router, session]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setStatus("Signing you in...");

    try {
      const supabase = getSupabaseClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: loginEmailFromIdentifier(identifier),
        password,
      });

      if (authError) {
        throw authError;
      }

      setPassword("");
      setStatus("Session updated. Redirecting to your dashboard...");
    } catch (submitError) {
      setError(getAuthErrorMessage(submitError, "Authentication failed. Please try again.", "login"));
      setStatus("");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgotPassword() {
    const normalizedIdentifier = identifier.trim();
    if (!normalizedIdentifier) {
      setError("Enter your username or email first, then request a password reset.");
      setStatus("");
      return;
    }

    const normalizedEmail = loginEmailFromIdentifier(normalizedIdentifier);

    setSubmitting(true);
    setError("");
    setStatus("Sending password reset email...");

    try {
      const supabase = getSupabaseClient();
      const redirectToUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}/reset-password?next=${encodeURIComponent(redirectTo)}`
          : undefined;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        normalizedEmail,
        {
          redirectTo: redirectToUrl,
        }
      );

      if (resetError) {
        throw resetError;
      }

      setStatus("Password reset email sent. Check your inbox.");
    } catch (resetError) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : "Failed to send password reset email."
      );
      setStatus("");
    } finally {
      setSubmitting(false);
    }
  }

  const registerHref = `/register?next=${encodeURIComponent(redirectTo)}`;

  return (
    <AuthShell imagePriority>
      <h1 className="text-3xl font-semibold text-slate-950">Login</h1>

      <form className="grid gap-6" onSubmit={handleSubmit}>
        <label className="grid gap-2 border-b border-slate-200 pb-4">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            Username or email
          </span>
          <input
            type="text"
            autoCapitalize="none"
            autoComplete="username"
            spellCheck={false}
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder="Enter username or email"
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
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
            className="bg-transparent text-base text-slate-950 outline-none placeholder:text-slate-400"
            required
          />
        </label>

        {status ? (
          <p className="text-sm leading-7 text-slate-500" role="status" aria-live="polite">
            {status}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm leading-7 text-rose-700" role="alert">
            {error}
          </p>
        ) : null}

        <div className="grid gap-3">
          <button
            className="primary-button min-w-[10rem] justify-center"
            type="submit"
            disabled={submitting}
          >
            {submitting ? "Working..." : "Sign in"}
          </button>
          <button
            type="button"
            className="w-fit text-sm font-medium text-slate-500 hover:text-slate-950"
            disabled={submitting}
            onClick={() => void handleForgotPassword()}
          >
            Forgot password
          </button>
          <Link
            href={registerHref}
            className="w-fit text-sm font-medium text-slate-500 hover:text-slate-950"
          >
            Register
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
