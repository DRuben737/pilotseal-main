"use client";

import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { getSessionSnapshot, subscribeToAuthStateChange } from "@/lib/auth";

type AuthSessionContextValue = {
  loading: boolean;
  session: Session | null;
};

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        const nextSession = await getSessionSnapshot();

        if (mounted) {
          setSession(nextSession);
        }
      } catch (error) {
        console.error(error);

        if (mounted) {
          setSession(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void initialize();

    const unsubscribe = subscribeToAuthStateChange((nextSession) => {
      if (!mounted) {
        return;
      }

      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      loading,
      session,
    }),
    [loading, session]
  );

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession() {
  const context = useContext(AuthSessionContext);

  if (!context) {
    throw new Error("useAuthSession must be used within AuthSessionProvider.");
  }

  return context;
}
