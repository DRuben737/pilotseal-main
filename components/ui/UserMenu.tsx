"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { getSupabaseClient } from "@/lib/supabase";

const accountLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/saved-people", label: "Saved People" },
  { href: "/dashboard/account-settings", label: "Account Settings" },
];

export default function UserMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  async function handleSignOut() {
    setSigningOut(true);

    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }

      setOpen(false);
    } catch (error) {
      console.error(error);
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="site-user-menu" ref={menuRef}>
      <button
        type="button"
        className="site-user-trigger"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="site-user-avatar">{(email[0] || "U").toUpperCase()}</span>
        <span className="site-user-meta">
          <span className="site-user-label">Account</span>
          <span className="site-user-email">{email}</span>
        </span>
      </button>

      <div className={`site-user-dropdown ${open ? "site-user-dropdown-open" : ""}`}>
        <div className="site-user-dropdown-head">
          <p className="site-user-dropdown-label">Signed in as</p>
          <p className="site-user-dropdown-email">{email}</p>
        </div>

        <div className="site-user-dropdown-links">
          {accountLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="site-user-dropdown-link"
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <button
          type="button"
          className="danger-button site-user-signout"
          disabled={signingOut}
          onClick={handleSignOut}
        >
          {signingOut ? "Signing out..." : "Sign out"}
        </button>
      </div>
    </div>
  );
}
