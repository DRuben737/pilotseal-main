import { Suspense } from "react";

import AuthForm from "@/components/auth/AuthForm";
import AuthPageFallback from "@/components/auth/AuthPageFallback";

export const metadata = {
  title: "Register | PilotSeal",
  description: "Create a PilotSeal dashboard account.",
};

export default function RegisterPage() {
  return (
    <Suspense fallback={<AuthPageFallback />}>
      <AuthForm mode="register" />
    </Suspense>
  );
}
