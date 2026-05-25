"use client";

import { useSearchParams } from "next/navigation";

import LoginForm from "@/components/auth/LoginForm";

export default function LoginContent() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("next") || "/dashboard";
  const status =
    searchParams.get("status") === "password-updated"
      ? "Password updated. Sign in with your new password."
      : "";

  return <LoginForm redirectTo={redirectTo} initialStatus={status} />;
}
