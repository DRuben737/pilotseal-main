import { redirect } from "next/navigation";

export const metadata = {
  title: "Organization Safety Reports | PilotSeal",
  description:
    "Submit and manage organization aircraft discrepancy and ASR reports.",
};

export default function OrganizationReportsPage() {
  redirect("/dashboard/reports");
}
