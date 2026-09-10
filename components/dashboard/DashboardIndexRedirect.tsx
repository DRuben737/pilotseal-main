"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { fetchEnabledFeatureIds } from "@/lib/dashboard-preferences";
import { getPersonalDashboardHref } from "@/lib/dashboard-navigation";

export default function DashboardIndexRedirect() {
  const router = useRouter();
  const { loading, session } = useAuthSession();
  const userId = session?.user?.id ?? "";

  useEffect(() => {
    if (loading || !userId) return;

    let cancelled = false;
    async function openPersonalWorkspace() {
      let enabledFeatureIds: string[] = [];
      try {
        enabledFeatureIds = await fetchEnabledFeatureIds(userId);
      } catch {
        // Account settings is the safe fallback when preferences are unavailable.
      }
      if (!cancelled) router.replace(getPersonalDashboardHref(enabledFeatureIds));
    }

    void openPersonalWorkspace();
    return () => {
      cancelled = true;
    };
  }, [loading, router, userId]);

  return <div className="saas-panel">Opening your workspace...</div>;
}
