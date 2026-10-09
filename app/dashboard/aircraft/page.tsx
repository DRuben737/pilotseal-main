import { Suspense } from "react";
import MyAircraftManager from "@/components/dashboard/MyAircraftManager";
export const metadata = { title: "Aircraft | PilotSeal" };
export default function Page() { return <Suspense fallback={null}><MyAircraftManager /></Suspense>; }
