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
  const [accountType, setAccountType] = useState<"personal" | "company">("personal");
  const [companyName, setCompanyName] = useState("");
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
      const normalizedCompanyName = companyName.trim();
      if (accountType === "company" && normalizedCompanyName.length < 2) {
        throw new Error("Enter a company name with at least 2 characters.");
      }
      const emailRedirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/login?next=${encodeURIComponent(redirectTo)}`
          : undefined;
      const { data, error: authError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo,
          data: {
            account_type: accountType,
            ...(accountType === "company" ? { company_name: normalizedCompanyName } : {}),
          },
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
        <fieldset className="grid gap-3">
          <legend className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            Account type
          </legend>
          <div className="grid grid-cols-2 gap-2 rounded-[16px] bg-slate-100 p-1">
            {(["personal", "company"] as const).map((type) => (
              <button
                key={type}
                type="button"
                className={`rounded-[12px] px-4 py-2.5 text-sm font-semibold transition ${
                  accountType === type
                    ? "bg-white text-slate-950 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
                onClick={() => setAccountType(type)}
              >
                {type === "personal" ? "Personal" : "Company"}
              </button>
            ))}
          </div>
        </fieldset>

        {accountType === "company" ? (
          <label className="grid gap-2 border-b border-slate-200 pb-4">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              Company name
            </span>
            <input
              type="text"
              minLength={2}
              maxLength={120}
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              placeholder="Flight school or company"
              className="bg-transparent text-base text-slate-950 outline-none placeholder:text-slate-400"
              required
            />
          </label>
        ) : null}

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
