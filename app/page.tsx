"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";

export default function RootPage() {
  const router = useRouter();
  const { loading, session } = useAuthSession();

  useEffect(() => {
    if (loading) return;
    router.replace(session ? "/dashboard" : "/tools/endorsement-generator");
  }, [loading, router, session]);

  return null;
}
