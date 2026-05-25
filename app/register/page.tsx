import { Suspense } from "react";

import AuthPageFallback from "@/components/auth/AuthPageFallback";
import RegisterContent from "@/app/register/RegisterContent";

export const metadata = {
  title: "Register | PilotSeal",
  description: "Create a PilotSeal dashboard account.",
};

export default function RegisterPage() {
  return (
    <Suspense fallback={<AuthPageFallback />}>
      <RegisterContent />
    </Suspense>
  );
}
