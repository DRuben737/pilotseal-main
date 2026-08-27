"use client";

import { useSearchParams } from "next/navigation";

import RegisterForm from "@/components/auth/RegisterForm";

export default function RegisterContent() {
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite") || "";
  const redirectTo = inviteToken
    ? `/join-organization?invite=${encodeURIComponent(inviteToken)}`
    : searchParams.get("next") || "/dashboard";

  return <RegisterForm redirectTo={redirectTo} inviteToken={inviteToken} />;
}
