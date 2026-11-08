import type { Metadata } from "next";
import { Suspense } from "react";
import TrainingRecordsManager from "@/components/dashboard/TrainingRecordsManager";

export const metadata: Metadata = {
  title: "Organization Training Records",
};

export default function OrganizationTrainingRecordsPage() {
  return (
    <Suspense fallback={null}>
      <TrainingRecordsManager organizationView />
    </Suspense>
  );
}
