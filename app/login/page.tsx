import { Suspense } from "react";

import AuthPageFallback from "@/components/auth/AuthPageFallback";
import LoginContent from "@/app/login/LoginContent";

export const metadata = {
  title: "Login | PilotSeal",
  description: "Sign in to the PilotSeal dashboard.",
};

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthPageFallback />}>
      <LoginContent />
    </Suspense>
  );
}
