import { AdminPageHeader } from "@/components/admin/AdminConsole";
import OrganizationNotificationPublisher from "@/components/notifications/OrganizationNotificationPublisher";

export const metadata = { title: "Organization Notifications" };

export default function Page() {
  return <div className="grid gap-3"><AdminPageHeader title="Notifications" /><OrganizationNotificationPublisher activeOrganizationOnly /></div>;
}
