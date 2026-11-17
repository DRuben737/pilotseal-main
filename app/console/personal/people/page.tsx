import { AdminPageHeader } from "@/components/admin/AdminConsole";
import SavedPeopleManager from "@/components/dashboard/SavedPeopleManager";

export const metadata = { title: "People" };

export default function Page() {
  return <div className="grid gap-3"><AdminPageHeader eyebrow="Personal" title="People" /><SavedPeopleManager /></div>;
}
