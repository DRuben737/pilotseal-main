import { AdminPageHeader } from "@/components/admin/AdminConsole";
import CfiScheduleManager from "@/components/dashboard/CfiScheduleManager";

export const metadata = { title: "Schedule" };

export default function Page() {
  return <div className="grid gap-3"><AdminPageHeader eyebrow="Personal" title="Schedule" /><CfiScheduleManager /></div>;
}
