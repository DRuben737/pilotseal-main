"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  getAuthErrorMessage,
  getPasswordValidationError,
  isExistingAccountError,
  PASSWORD_HELP_TEXT,
  PASSWORD_MIN_LENGTH,
} from "@/components/auth/auth-errors";
import AuthShell from "@/components/auth/AuthShell";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { getSupabaseClient } from "@/lib/supabase";
import { fetchOrganizationInvitation, type OrganizationInvitationPreview } from "@/lib/organizations";

export default function RegisterForm({
  redirectTo = "/dashboard",
  inviteToken = "",
}: {
  redirectTo?: string;
  inviteToken?: string;
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
  const [invitation, setInvitation] = useState<OrganizationInvitationPreview | null>(null);
  const [invitationLoading, setInvitationLoading] = useState(Boolean(inviteToken));

  useEffect(() => {
    if (!inviteToken) return;
    let cancelled = false;
    void fetchOrganizationInvitation(inviteToken)
      .then((preview) => {
        if (cancelled) return;
        setInvitation(preview);
        if (!preview || preview.status !== "pending") {
          setError("This organization invitation is invalid, expired, or already used.");
          return;
        }
        setEmail(preview.invited_email);
        setAccountType("personal");
      })
      .catch(() => {
        if (!cancelled) setError("Unable to verify this organization invitation.");
      })
      .finally(() => {
        if (!cancelled) setInvitationLoading(false);
      });
    return () => { cancelled = true; };
  }, [inviteToken]);

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
      if (inviteToken && (!invitation || invitation.status !== "pending")) {
        throw new Error("This organization invitation is not available.");
      }
      if (accountType === "company" && normalizedCompanyName.length < 2) {
        throw new Error("Enter a company name with at least 2 characters.");
      }
      const passwordError = getPasswordValidationError(password);
      if (passwordError) {
        throw new Error(passwordError);
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
            account_type: inviteToken ? "personal" : accountType,
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

      setStatus(accountType === "company" && !inviteToken ? "Account created. Your company request is pending platform approval." : "Account created. Please sign in to finish joining the organization.");
      router.replace(`/login?next=${encodeURIComponent(redirectTo)}`);
    } catch (submitError) {
      setError(getAuthErrorMessage(submitError, "Registration failed. Please try again.", "password"));
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
        {invitation ? <p className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">Invitation to join <strong>{invitation.organization_name}</strong>. Register with {invitation.invited_email}; membership is added after email verification.</p> : null}

        {!inviteToken ? <fieldset className="grid gap-3">
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
        </fieldset> : null}

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
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            readOnly={Boolean(inviteToken)}
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
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
            aria-describedby="register-password-help"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Create a password"
            className="bg-transparent text-base text-slate-950 outline-none placeholder:text-slate-400"
            required
          />
          <span id="register-password-help" className="text-sm leading-6 text-slate-500">
            {PASSWORD_HELP_TEXT}
          </span>
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
            disabled={submitting || invitationLoading || (Boolean(inviteToken) && !invitation)}
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
