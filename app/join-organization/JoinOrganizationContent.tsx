"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import AuthShell from "@/components/auth/AuthShell";
import { acceptOrganizationMemberInvitation, fetchOrganizationInvitation, type OrganizationInvitationPreview } from "@/lib/organizations";

export default function JoinOrganizationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("invite") || "";
  const { loading, session } = useAuthSession();
  const [invitation, setInvitation] = useState<OrganizationInvitationPreview | null>(null);
  const [message, setMessage] = useState("Checking your invitation…");
  const [error, setError] = useState(token ? "" : "Invitation token is missing.");

  useEffect(() => {
    if (!token) return;
    void fetchOrganizationInvitation(token).then(setInvitation).catch(() => setError("Unable to load this invitation."));
  }, [token]);

  useEffect(() => {
    if (loading || !token || !session?.user || !invitation || invitation.status !== "pending") return;
    let cancelled = false;
    void Promise.resolve()
      .then(() => {
        if (!cancelled) setMessage("Adding you to the organization…");
        return acceptOrganizationMemberInvitation(token);
      })
      .then(() => {
        if (cancelled) return;
        setMessage("Organization membership created. Redirecting…");
        router.replace("/dashboard/organization/overview");
        router.refresh();
      })
      .catch((nextError: unknown) => {
        if (!cancelled) setError(nextError && typeof nextError === "object" && "message" in nextError ? String(nextError.message) : "Unable to accept this invitation.");
      });
    return () => { cancelled = true; };
  }, [invitation, loading, router, session?.user, token]);

  const next = `/join-organization?invite=${encodeURIComponent(token)}`;
  return (
    <AuthShell>
      <h1 className="text-3xl font-semibold text-slate-950">Join organization</h1>
      {invitation ? <p className="text-sm leading-7 text-slate-600">You were invited to join <strong>{invitation.organization_name}</strong> as {invitation.teaching_role || "a member"} using {invitation.invited_email}.</p> : null}
      {invitation && invitation.status !== "pending" ? <p className="text-sm text-rose-700">This invitation is {invitation.status} and cannot be used.</p> : null}
      {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : <p role="status" className="text-sm text-slate-500">{message}</p>}
      {!loading && !session?.user && invitation?.status === "pending" ? <div className="flex gap-3"><Link className="primary-button" href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link><Link className="ghost-button" href={`/register?invite=${encodeURIComponent(token)}`}>Register</Link></div> : null}
    </AuthShell>
  );
}
