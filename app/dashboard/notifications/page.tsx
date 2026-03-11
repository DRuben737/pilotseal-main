import NotificationManager from "@/components/notifications/NotificationManager";

export const metadata = {
  title: "Notification Management | PilotSeal",
  description: "Manage PilotSeal notifications, schedules, and delivery priority.",
};

export default function DashboardNotificationsPage() {
  return <NotificationManager />;
}
