import PlatformAccessManager from "@/components/dashboard/PlatformAccessManager";
import { Suspense } from "react";
export const metadata = { title: "Organizations | PilotSeal" };
export default function Page() { return <Suspense fallback={null}><PlatformAccessManager /></Suspense>; }
