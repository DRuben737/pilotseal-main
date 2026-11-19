import { Suspense } from "react";

import { AdminPageHeader } from "@/components/admin/AdminConsole";
import NotificationManager from "@/components/notifications/NotificationManager";

export const metadata = { title: "Notifications" };

export default function Page() {
  return <div className="grid gap-3"><AdminPageHeader title="Notifications" /><Suspense fallback={null}><NotificationManager /></Suspense></div>;
}
