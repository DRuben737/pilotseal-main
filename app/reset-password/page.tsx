import { Suspense } from "react";

import ResetPasswordContent from "@/app/reset-password/ResetPasswordContent";
import AuthPageFallback from "@/components/auth/AuthPageFallback";

export const metadata = {
  title: "Reset Password | PilotSeal",
  description: "Reset your PilotSeal account password.",
};

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthPageFallback />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
