"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { resolveDisplayIdentity } from "@/lib/identity";
import { fetchCurrentProfile } from "@/lib/profile";
import { fetchDefaultCfi } from "@/lib/saved-people";
import { getSupabaseClient } from "@/lib/supabase";

const dashboardLinks = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/saved-people", label: "Saved people" },
  { href: "/dashboard/notifications", label: "Notifications" },
  { href: "/dashboard/account-settings", label: "Account" },
];

function DashboardIcon({ kind }: { kind: string }) {
  const common = "h-[18px] w-[18px]";

  switch (kind) {
    case "Overview":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
          <rect x="4" y="4" width="7" height="7" rx="1.5" />
          <rect x="13" y="4" width="7" height="7" rx="1.5" />
          <rect x="4" y="13" width="7" height="7" rx="1.5" />
          <rect x="13" y="13" width="7" height="7" rx="1.5" />
        </svg>
      );
    case "Saved people":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
          <circle cx="9" cy="8" r="3" />
          <path d="M4.5 18c.9-2.5 3-4 5.5-4s4.6 1.5 5.5 4" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M15.5 18c.5-1.6 1.8-2.8 3.7-3.2" />
        </svg>
      );
    case "Notifications":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
          <path d="M12 4a4 4 0 0 1 4 4v2.7c0 1 .4 2 .9 2.9l1 1.5H6.1l1-1.5c.5-.9.9-1.9.9-2.9V8a4 4 0 0 1 4-4Z" />
          <path d="M10 18a2 2 0 0 0 4 0" />
        </svg>
      );
    case "Account":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5.5 19c1.2-3 3.6-4.7 6.5-4.7S17.3 16 18.5 19" />
        </svg>
      );
    case "Aircraft":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
          <path d="M2 13.5h7l5.2-7.2c.5-.7 1.5-.8 2.1-.3.5.4.7 1.1.4 1.7L15 13.5h5.2c.9 0 1.8.5 2.2 1.3l-.9.7H15l-1.4 4.1h-1.7l.2-4.1H8.7L7 18H5.4l.5-2.5H2v-2Z" />
        </svg>
      );
    case "new":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    case "signout":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
          <path d="M10 6H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4" />
          <path d="M14 16l4-4-4-4" />
          <path d="M18 12H9" />
        </svg>
      );
    default:
      return null;
  }
}

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, session } = useAuthSession();
  const [signingOut, setSigningOut] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [defaultCfiName, setDefaultCfiName] = useState("");
  const [profileRole, setProfileRole] = useState("");

  useEffect(() => {
    if (!loading && !session?.user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, pathname, router, session]);

  useEffect(() => {
    let cancelled = false;

    async function loadIdentity() {
      if (!session?.user?.id) {
        if (!cancelled) {
          setDisplayName("");
          setDefaultCfiName("");
          setProfileRole("");
        }
        return;
      }

      try {
        const [profile, defaultCfi] = await Promise.all([
          fetchCurrentProfile(session.user.id),
          fetchDefaultCfi(session.user.id),
        ]);
        if (!cancelled) {
          setDisplayName(profile?.display_name ?? "");
          setDefaultCfiName(defaultCfi?.display_name ?? "");
          setProfileRole(profile?.role ?? "");
        }
      } catch {
        if (!cancelled) {
          setDisplayName("");
          setDefaultCfiName("");
          setProfileRole("");
        }
      }
    }

    void loadIdentity();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const identityLabel = resolveDisplayIdentity({
    displayName,
    defaultCfiName,
    email: session?.user?.email,
  });

  const visibleDashboardLinks =
    profileRole === "admin"
      ? [...dashboardLinks, { href: "/dashboard/admin/aircraft", label: "Aircraft" }]
      : dashboardLinks;

  async function handleSignOut() {
    setSigningOut(true);

    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <main className="page-shell px-3">
      <div className="site-shell page-stack">
        {loading || !session?.user ? null : (
          <section className="flex items-start gap-3 sm:gap-4">
            <aside className="group shrink-0 overflow-hidden rounded-[24px] bg-[linear-gradient(180deg,#173b56_0%,#123149_100%)] p-2.5 text-white shadow-[0_18px_44px_rgba(15,23,42,0.14)] transition-[width] duration-200 w-[74px] sm:w-[78px] md:hover:w-[220px]">
              <div className="sticky top-24">
                <div className="block">
                  <div className="flex items-center justify-center gap-3 overflow-hidden md:justify-start">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] border border-white/12 bg-white/8 text-lg font-semibold">
                      PS
                    </div>
                    <div className="hidden min-w-0 md:block md:max-w-0 md:overflow-hidden md:translate-x-2 md:opacity-0 md:transition-[max-width,opacity,transform] md:duration-200 md:group-hover:max-w-[120px] md:group-hover:translate-x-0 md:group-hover:opacity-100">
                      <p className="truncate text-sm font-semibold text-white">PilotSeal</p>
                      <p className="truncate text-xs text-white/55">{identityLabel}</p>
                    </div>
                  </div>
                  <div className="mt-5 h-px w-full bg-white/10" />
                </div>

                <nav aria-label="Dashboard navigation" className="mt-4 grid gap-2">
                  {visibleDashboardLinks.map((item) => {
                    const active =
                      item.href === "/dashboard"
                        ? pathname === "/dashboard"
                        : pathname === item.href || pathname.startsWith(`${item.href}/`);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-label={item.label}
                        title={item.label}
                        className={`relative flex h-12 items-center overflow-hidden rounded-[16px] transition md:w-full ${
                          active
                            ? "bg-[#3b82d6] text-white"
                            : "text-white/72 hover:bg-white/8 hover:text-white"
                        }`}
                      >
                        <span className="ml-4 flex h-12 w-5 shrink-0 items-center justify-center">
                          <DashboardIcon kind={item.label} />
                        </span>
                        <span className="max-w-0 overflow-hidden whitespace-nowrap pl-3 text-sm font-medium md:translate-x-2 md:opacity-0 md:transition-[max-width,opacity,transform] md:duration-200 md:group-hover:max-w-[140px] md:group-hover:translate-x-0 md:group-hover:opacity-100">
                          {item.label}
                        </span>
                      </Link>
                    );
                  })}
                </nav>

                <div className="mt-4 grid gap-2 border-t border-white/10 pt-4">
                  <Link
                    href="/tools/endorsement-generator"
                    aria-label="New endorsement"
                    title="New endorsement"
                    className="relative flex h-12 items-center overflow-hidden rounded-[16px] text-white/72 transition hover:bg-white/8 hover:text-white md:w-full"
                  >
                    <span className="ml-4 flex h-12 w-5 shrink-0 items-center justify-center">
                      <DashboardIcon kind="new" />
                    </span>
                    <span className="max-w-0 overflow-hidden whitespace-nowrap pl-3 text-sm font-medium md:translate-x-2 md:opacity-0 md:transition-[max-width,opacity,transform] md:duration-200 md:group-hover:max-w-[140px] md:group-hover:translate-x-0 md:group-hover:opacity-100">
                      New endorsement
                    </span>
                  </Link>
                  <button
                    type="button"
                    aria-label="Sign out"
                    title={`Sign out ${identityLabel}`}
                    className="relative flex h-12 items-center overflow-hidden rounded-[16px] text-white/72 transition hover:bg-white/8 hover:text-white disabled:opacity-60 md:w-full"
                    disabled={!session?.user || signingOut}
                    onClick={handleSignOut}
                  >
                    <span className="ml-4 flex h-12 w-5 shrink-0 items-center justify-center">
                      <DashboardIcon kind="signout" />
                    </span>
                    <span className="max-w-0 overflow-hidden whitespace-nowrap pl-3 text-sm font-medium md:translate-x-2 md:opacity-0 md:transition-[max-width,opacity,transform] md:duration-200 md:group-hover:max-w-[140px] md:group-hover:translate-x-0 md:group-hover:opacity-100">
                      {signingOut ? "Signing out..." : "Sign out"}
                    </span>
                  </button>
                </div>
              </div>
            </aside>

            <div className="min-w-0 flex-1 rounded-[24px] border border-slate-200/75 bg-[linear-gradient(180deg,rgba(252,254,255,0.98),rgba(246,249,253,0.96))] p-4 shadow-[0_16px_42px_rgba(15,23,42,0.06)] sm:p-5 xl:p-6">
              {children}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
