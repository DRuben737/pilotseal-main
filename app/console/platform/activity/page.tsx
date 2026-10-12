import { Suspense } from "react";

import PlatformActivityWorkspace from "@/components/dashboard/PlatformActivityWorkspace";

export const metadata = { title: "Platform Activity" };

export default function Page() {
  return <Suspense fallback={null}><PlatformActivityWorkspace /></Suspense>;
}
