import { Suspense } from "react";

import ReportsManager from "@/components/dashboard/ReportsManager";

export const metadata = { title: "Reports" };

export default function Page() {
  return <Suspense fallback={null}><ReportsManager /></Suspense>;
}
