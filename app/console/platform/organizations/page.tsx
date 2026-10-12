import { Suspense } from "react";

import PlatformAccessManager from "@/components/dashboard/PlatformAccessManager";

export const metadata = { title: "Organizations" };

export default function Page() {
  return <Suspense fallback={null}><PlatformAccessManager /></Suspense>;
}
