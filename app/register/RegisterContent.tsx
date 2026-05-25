"use client";

import { useSearchParams } from "next/navigation";

import RegisterForm from "@/components/auth/RegisterForm";

export default function RegisterContent() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("next") || "/dashboard";

  return <RegisterForm redirectTo={redirectTo} />;
}
