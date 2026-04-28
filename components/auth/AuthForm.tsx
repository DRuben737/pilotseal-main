"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import authWorkspaceImage from "@/images/auth-workspace-illustration.png";
import { getSupabaseClient } from "@/lib/supabase";

type AuthMode = "login" | "register";

const modeCopy = {
  login: {
    eyebrow: "PilotSeal access",
    title: "Sign in to your control surface",
    description:
      "Move between endorsement drafting, saved records, and operational workflows without breaking context.",
    submitLabel: "Sign in",
    alternateHref: "/register",
    alternateLabel: "Create account",
    alternatePrompt: "Need a workspace?",
  },
  register: {
    eyebrow: "New workspace",
    title: "Create a PilotSeal account",
    description:
      "Set up a cleaner workspace for saved pilot records, preflight actions, and endorsement workflows.",
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
        <section className="grid min-h-[calc(100vh-11rem)] gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)] lg:items-stretch">
          <div className="relative overflow-hidden rounded-[2rem] border border-slate-200/80">
            <div className="absolute inset-0">
              <Image
                src={authWorkspaceImage}
                alt="PilotSeal workspace illustration"
                className="h-full w-full object-cover"
                priority={mode === "login"}
              />
            </div>
            <div className="absolute inset-0 bg-[linear-gradient(140deg,rgba(8,22,45,0.92),rgba(18,58,117,0.76),rgba(255,255,255,0.08))]" />
            <div className="relative flex h-full flex-col justify-between gap-12 px-7 py-8 sm:px-10 sm:py-10">
              <div className="space-y-4">
                <p className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/8 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/82">
                  {copy.eyebrow}
                </p>
                <div className="space-y-4">
                  <h1 className="max-w-3xl text-4xl font-semibold leading-[0.94] tracking-[-0.06em] text-white sm:text-5xl lg:text-6xl">
                    {copy.title}
                  </h1>
                  <p className="max-w-xl text-base leading-8 text-white/74">
                    {copy.description}
                  </p>
                </div>
              </div>

              <div className="grid gap-5 border-t border-white/12 pt-6 text-white/78 sm:grid-cols-3">
                {[
                  ["One surface", "Records, workflows, and guidance move together."],
                  ["Lower friction", "The right action should feel one step away."],
                  ["Operational clarity", "Less browsing, more actual training work."],
                ].map(([title, desc]) => (
                  <div key={title} className="space-y-2">
                    <p className="text-sm font-semibold text-white">{title}</p>
                    <p className="text-sm leading-7">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center lg:pl-8 lg:border-l lg:border-slate-200/70">
            <div className="w-full max-w-md space-y-8">
              <div className="space-y-4">
                <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
                  <Link
                    href="/login"
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                      mode === "login" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"
                    }`}
                  >
                    Login
                  </Link>
                  <Link
                    href="/register"
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                      mode === "register" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"
                    }`}
                  >
                    Register
                  </Link>
                </div>

                <div className="space-y-2">
                  <p className="muted-kicker">Workspace access</p>
                  <h2 className="text-3xl font-semibold tracking-[-0.05em] text-slate-950">
                    {mode === "login" ? "Enter your account" : "Start a new workspace"}
                  </h2>
                </div>
              </div>

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
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    className="bg-transparent text-base text-slate-950 outline-none placeholder:text-slate-400"
                    required
                  />
                </label>

                {status ? (
                  <p className="text-sm leading-7 text-slate-500">{status}</p>
                ) : null}
                {error ? (
                  <p className="text-sm leading-7 text-rose-700">{error}</p>
                ) : null}

                <div className="flex flex-wrap items-center gap-3">
                  <button className="primary-button min-w-[10rem] justify-center" type="submit" disabled={submitting}>
                    {submitting ? "Working..." : copy.submitLabel}
                  </button>
                  <Link href={copy.alternateHref} className="text-sm font-medium text-slate-500 hover:text-slate-950">
                    {copy.alternatePrompt} {copy.alternateLabel}
                  </Link>
                </div>
              </form>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
