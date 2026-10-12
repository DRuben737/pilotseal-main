"use client";

import { useEffect, useState } from "react";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { useOrganization } from "@/components/organizations/OrganizationProvider";
import { getSupabaseClient } from "@/lib/supabase";
import type { Organization } from "@/lib/organizations";

// Keep platform-wide report management separate from the user's personal organization context.
export function useReportOrganization() {
  const base = useOrganization();
  const { session } = useAuthSession();
  const [scope, setScope] = useState<{ userId: string; organizations: Organization[]; selectedId: string; error: string } | null>(null);
  const userId = session?.user?.id ?? "";
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getSupabaseClient().rpc("list_report_organizations").then(({ data, error }) => {
      if (cancelled) return;
      const organizations = (data ?? []) as Organization[];
      const stored = window.sessionStorage.getItem(`report-organization:${userId}`) ?? "";
      setScope({ userId, organizations, selectedId: stored, error: error?.message ?? "" });
    }, error => { if (!cancelled) setScope({ userId, organizations: [], selectedId: "", error: String(error?.message ?? "Unable to load organizations.") }); });
    return () => { cancelled = true; };
  }, [userId]);
  const currentScope = scope?.userId === userId ? scope : null;
  const organizations = currentScope?.organizations.length ? currentScope.organizations : base.organizations;
  const activeOrganization = organizations.find(value => value.id === currentScope?.selectedId)
    ?? organizations.find(value => value.id === base.activeOrganizationId) ?? organizations[0] ?? null;
  function setActiveOrganizationId(id: string) {
    if (!organizations.some(value => value.id === id) || !currentScope) return;
    window.sessionStorage.setItem(`report-organization:${userId}`, id);
    setScope({ ...currentScope, selectedId: id });
  }
  return { organizations, activeOrganization, setActiveOrganizationId, loading: base.loading || Boolean(userId && !currentScope),
    canSubmit: Boolean(activeOrganization && base.organizations.some(value => value.id === activeOrganization.id)), error: currentScope?.error ?? "" };
}
