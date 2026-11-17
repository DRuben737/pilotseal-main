import { AdminPageHeader } from "@/components/admin/AdminConsole";
import TrainingGuideManager from "@/components/dashboard/TrainingGuideManager";

export const metadata = { title: "Platform Training Guide" };

export default function Page() {
  return <div className="grid gap-3"><AdminPageHeader eyebrow="Platform administration" title="Training guide" /><TrainingGuideManager workspace="platform" /></div>;
}
