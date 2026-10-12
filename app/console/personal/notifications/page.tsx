import { Suspense } from "react";

import NotificationManager from "@/components/notifications/NotificationManager";

export const metadata = { title: "Notifications" };

export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  return <Suspense fallback={null}><NotificationManager initialView={view === "organization" ? "organization" : "inbox"} /></Suspense>;
}
