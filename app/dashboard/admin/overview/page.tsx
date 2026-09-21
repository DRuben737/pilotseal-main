import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminConsole";

const tasks = [
  ["Organizations & Access", "/dashboard/admin/access", "Create organizations and manage platform administrator access."],
  ["Aircraft Library", "/dashboard/admin/aircraft", "Manage the aircraft models and shared aircraft available across PilotSeal."],
  ["Aircraft Assignments", "/dashboard/admin/aircraft-assignments", "Batch-add or remove organization access for your private aircraft."],
  ["Endorsement Approvals", "/dashboard/admin/endorsements", "Approve or reject organization template changes."],
  ["Audit Log", "/dashboard/admin/audit", "Review aircraft access changes."],
] as const;

export default function Page() {
  return (
    <section className="space-y-3">
      <AdminPageHeader
        eyebrow="Platform administration"
        title="Platform Overview"
        description="Select an area to manage. Each page keeps its records and actions together."
      />
      <nav aria-label="Platform administration areas" className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {tasks.map(([label, href, description]) => (
          <Link
            key={href}
            href={href}
            className="group grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-slate-100 px-3 py-2.5 transition-colors last:border-b-0 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 sm:grid-cols-[13rem_minmax(0,1fr)_auto] sm:px-4"
          >
            <h2 className="text-sm font-semibold text-slate-950">{label}</h2>
            <p className="col-span-2 row-start-2 text-xs leading-5 text-slate-500 sm:col-span-1 sm:row-start-auto sm:text-sm">
              {description}
            </p>
            <span className="col-start-2 row-start-1 text-lg text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-700 sm:col-start-3" aria-hidden="true">→</span>
          </Link>
        ))}
      </nav>
    </section>
  );
}
