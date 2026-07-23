import AircraftAssignmentsManager from "@/components/dashboard/AircraftAssignmentsManager";

export const metadata = {
  title: "Aircraft Assignments | PilotSeal",
  description: "Batch-manage organization access to Platform Super Admin aircraft.",
};

export default function AircraftAssignmentsPage() {
  return <AircraftAssignmentsManager />;
}
