"use client";

import { createContext, useContext, useEffect, useState } from "react";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import {
  ACTIVE_ORGANIZATION_STORAGE_KEY,
  fetchUserOrganizations,
  type Organization,
} from "@/lib/organizations";

type OrganizationContextValue = {
  organizations: Organization[];
  activeOrganization: Organization | null;
  activeOrganizationId: string;
  loading: boolean;
  setActiveOrganizationId: (organizationId: string) => void;
  refreshOrganizations: () => Promise<void>;
};

const OrganizationContext = createContext<OrganizationContextValue | null>(null);

export default function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuthSession();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [activeOrganizationId, setActiveOrganizationIdState] = useState("");
  const [loading, setLoading] = useState(true);

  async function refreshOrganizations() {
    if (!session?.user?.id) {
      setOrganizations([]);
      setActiveOrganizationIdState("");
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const nextOrganizations = await fetchUserOrganizations();
      const storedId = window.localStorage.getItem(ACTIVE_ORGANIZATION_STORAGE_KEY) ?? "";
      const currentId = activeOrganizationId || storedId;
      const nextActiveId = nextOrganizations.some((organization) => organization.id === currentId)
        ? currentId
        : nextOrganizations[0]?.id ?? "";

      setOrganizations(nextOrganizations);
      setActiveOrganizationIdState(nextActiveId);
      if (nextActiveId) {
        window.localStorage.setItem(ACTIVE_ORGANIZATION_STORAGE_KEY, nextActiveId);
      } else {
        window.localStorage.removeItem(ACTIVE_ORGANIZATION_STORAGE_KEY);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshOrganizations();
    // activeOrganizationId is deliberately excluded so changing organizations does not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  function setActiveOrganizationId(organizationId: string) {
    if (!organizations.some((organization) => organization.id === organizationId)) {
      return;
    }
    setActiveOrganizationIdState(organizationId);
    window.localStorage.setItem(ACTIVE_ORGANIZATION_STORAGE_KEY, organizationId);
  }

  const value: OrganizationContextValue = {
    organizations,
    activeOrganization:
      organizations.find((organization) => organization.id === activeOrganizationId) ?? null,
    activeOrganizationId,
    loading,
    setActiveOrganizationId,
    refreshOrganizations,
  };

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error("useOrganization must be used inside OrganizationProvider.");
  }
  return context;
}
