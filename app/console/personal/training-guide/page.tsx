import { AdminPageHeader } from "@/components/admin/AdminConsole";
import TrainingGuideManager from "@/components/dashboard/TrainingGuideManager";

export const metadata = { title: "Training Guide" };

export default function Page() {
  return <div className="grid gap-3"><AdminPageHeader title="Training guide" /><TrainingGuideManager workspace="personal" /></div>;
}
