import { AdminPageHeader } from "@/components/admin/AdminConsole";
import PreflightRecordsManager from "@/components/dashboard/PreflightRecordsManager";

export const metadata = { title: "Flight Briefs" };

export default function Page() {
  return <div className="grid gap-3"><AdminPageHeader eyebrow="Personal" title="Flight briefs" /><PreflightRecordsManager /></div>;
}
