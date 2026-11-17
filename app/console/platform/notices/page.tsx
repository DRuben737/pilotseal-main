import { Suspense } from "react";

import { AdminPageHeader } from "@/components/admin/AdminConsole";
import NotificationManager from "@/components/notifications/NotificationManager";

export const metadata = { title: "Notices" };

export default function Page() {
  return <div className="grid gap-3"><AdminPageHeader eyebrow="Platform administration" title="Notices" /><Suspense fallback={null}><NotificationManager platformPublishingOnly /></Suspense></div>;
}
