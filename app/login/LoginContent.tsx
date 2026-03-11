"use client";

import { useSearchParams } from "next/navigation";

import AuthForm from "@/components/auth/AuthForm";

export default function LoginContent() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("next") || "/dashboard";

  return <AuthForm mode="login" redirectTo={redirectTo} />;
}
