"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { getSupabaseClient } from "@/lib/supabase";

type AuthMode = "login" | "register";

const modeCopy = {
  login: {
    eyebrow: "PilotSeal access",
    title: "Sign in to your control panel",
    description:
      "Manage saved people, operational notices, and account settings from one dashboard.",
    submitLabel: "Sign in",
    alternateHref: "/register",
    alternateLabel: "Create account",
    alternatePrompt: "Need a workspace?",
  },
  register: {
    eyebrow: "New workspace",
    title: "Create your PilotSeal account",
    description:
      "Set up a lightweight operations dashboard for saved pilot records and site notifications.",
    submitLabel: "Create account",
    alternateHref: "/login",
    alternateLabel: "Back to login",
    alternatePrompt: "Already have access?",
  },
};

export default function AuthForm({
  mode,
  redirectTo = "/dashboard",
}: {
  mode: AuthMode;
  redirectTo?: string;
}) {
  const router = useRouter();
  const { loading, session } = useAuthSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("");
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
    setStatus(mode === "login" ? "Signing you in..." : "Creating your account...");

    try {
      const supabase = getSupabaseClient();

      if (mode === "login") {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (authError) {
          throw authError;
        }

        setStatus("Session updated. Redirecting to your dashboard...");
      } else {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });

        if (authError) {
          throw authError;
        }

        setStatus(
          data.session
            ? "Account created. Redirecting to your dashboard..."
            : "Account created. Check your email to confirm your registration."
        );
      }

      setPassword("");
    } catch (submitError) {
      console.error(submitError);
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Authentication failed. Please try again."
      );
      setStatus("");
    } finally {
      setSubmitting(false);
    }
  }

  const copy = modeCopy[mode];

  return (
    <main className="page-shell px-3">
      <div className="site-shell page-stack">
        <section className="saas-auth-grid">
          <div className="saas-auth-aside">
            <p className="eyebrow">{copy.eyebrow}</p>
            <h1 className="saas-auth-title">{copy.title}</h1>
            <p className="saas-auth-copy">{copy.description}</p>

            <div className="saas-metric-grid">
              <article className="saas-metric-card">
                <p className="saas-metric-value">1</p>
                <p className="saas-metric-label">Unified session source</p>
              </article>
              <article className="saas-metric-card">
                <p className="saas-metric-value">3</p>
                <p className="saas-metric-label">Dashboard workspaces</p>
              </article>
              <article className="saas-metric-card">
                <p className="saas-metric-value">4</p>
                <p className="saas-metric-label">Notification priorities</p>
              </article>
            </div>
          </div>

          <div className="saas-auth-card">
            <div className="saas-auth-toggle">
              <Link
                href="/login"
                className={`saas-auth-tab ${mode === "login" ? "saas-auth-tab-active" : ""}`}
              >
                Login
              </Link>
              <Link
                href="/register"
                className={`saas-auth-tab ${mode === "register" ? "saas-auth-tab-active" : ""}`}
              >
                Register
              </Link>
            </div>

            <form className="mt-8 grid gap-5" onSubmit={handleSubmit}>
              <label className="saas-field">
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="cfi@pilotseal.com"
                  required
                />
              </label>

              <label className="saas-field">
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  required
                />
              </label>

              {status ? <p className="saas-feedback saas-feedback-info">{status}</p> : null}
              {error ? <p className="saas-feedback saas-feedback-error">{error}</p> : null}

              <button className="primary-button w-full justify-center" type="submit" disabled={submitting}>
                {submitting ? "Working..." : copy.submitLabel}
              </button>
            </form>

            <p className="mt-6 text-sm text-[var(--muted)]">
              {copy.alternatePrompt}{" "}
              <Link href={copy.alternateHref} className="font-semibold text-[var(--accent)]">
                {copy.alternateLabel}
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
