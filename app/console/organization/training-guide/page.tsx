import TrainingGuideManager from "@/components/dashboard/TrainingGuideManager";

export const metadata = { title: "Organization Training Guide" };

export default function Page() {
  return <TrainingGuideManager workspace="organization" />;
}
