import { Suspense } from "react";
import NotificationManager from "@/components/notifications/NotificationManager";

export const metadata = {
  title: "Notifications | PilotSeal",
  description: "View personal reminders, organization messages, and PilotSeal notices.",
};

export default function Page() {
  return <Suspense fallback={null}><NotificationManager /></Suspense>;
}
