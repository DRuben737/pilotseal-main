import NotificationManager from "@/components/notifications/NotificationManager";

export const metadata = {
  title: "Platform Notices | PilotSeal",
  description: "Create, schedule, and manage PilotSeal platform notices.",
};

export default function DashboardPlatformNotificationsPage() {
  return <NotificationManager platformPublishingOnly />;
}
