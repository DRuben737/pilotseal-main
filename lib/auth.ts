import type { Session } from "@supabase/supabase-js";

import { getSupabaseClient } from "@/lib/supabase";

export async function getSessionSnapshot() {
  const supabase = getSupabaseClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  return session;
}

export function subscribeToAuthStateChange(
  callback: (session: Session | null) => void | Promise<void>
) {
  const supabase = getSupabaseClient();
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    void callback(session);
  });

  return () => {
    subscription.unsubscribe();
  };
}
