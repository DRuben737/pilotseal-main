import { Suspense } from "react";

import NotificationManager from "@/components/notifications/NotificationManager";

export const metadata = { title: "Notices" };

export default function Page() {
  return <Suspense fallback={null}><NotificationManager platformPublishingOnly /></Suspense>;
}
