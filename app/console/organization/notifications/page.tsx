import { AdminPageHeader } from "@/components/admin/AdminConsole";
import OrganizationNotificationPublisher from "@/components/notifications/OrganizationNotificationPublisher";

export const metadata = { title: "Organization Notifications" };

export default function Page() {
  return <div className="grid gap-3"><AdminPageHeader eyebrow="Organization" title="Notifications" /><OrganizationNotificationPublisher activeOrganizationOnly /></div>;
}
