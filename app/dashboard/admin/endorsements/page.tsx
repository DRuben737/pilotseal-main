import { Suspense } from "react";
import PlatformEndorsementsWorkspace from "@/components/dashboard/PlatformEndorsementsWorkspace";

export const metadata = { title: "Endorsements | PilotSeal" };

export default function Page() {
  return <Suspense fallback={null}><PlatformEndorsementsWorkspace /></Suspense>;
}
