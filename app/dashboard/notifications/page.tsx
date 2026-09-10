import NotificationManager from "@/components/notifications/NotificationManager";

export const metadata = {
  title: "Notifications | PilotSeal",
  description: "View personal reminders, organization messages, and PilotSeal notices.",
};

export default async function DashboardNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  return <NotificationManager initialView={view === "organization" ? "organization" : "inbox"} />;
}
