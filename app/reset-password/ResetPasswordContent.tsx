"use client";

import { useSearchParams } from "next/navigation";

import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

export default function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("next") || "/dashboard";

  return <ResetPasswordForm redirectTo={redirectTo} />;
}
