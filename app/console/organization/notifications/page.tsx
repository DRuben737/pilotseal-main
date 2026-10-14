import OrganizationNotificationPublisher from "@/components/notifications/OrganizationNotificationPublisher";

export const metadata = { title: "Organization Notifications" };

export default function Page() {
  return <OrganizationNotificationPublisher activeOrganizationOnly />;
}
