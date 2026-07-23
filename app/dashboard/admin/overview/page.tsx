import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminConsole";

const tasks = [
  ["Organizations & Access", "/dashboard/admin/access", "Create organizations and manage Platform Super Admin access."],
  ["Platform Fleet", "/dashboard/admin/aircraft", "Maintain global aircraft models and platform aircraft."],
  ["Aircraft Assignments", "/dashboard/admin/aircraft-assignments", "Batch-add or remove organization access for your private aircraft."],
  ["Endorsement Approvals", "/dashboard/admin/endorsements", "Approve or reject organization template changes."],
  ["Audit Log", "/dashboard/admin/audit", "Review aircraft access changes."],
] as const;

export default function Page() {
  return <section className="space-y-5"><AdminPageHeader eyebrow="Platform administration" title="Platform Overview" description="Choose one administrative task. Each workspace keeps its filters, records, and actions focused." /><div className="grid gap-3 md:grid-cols-2">{tasks.map(([label, href, description]) => <Link key={href} href={href} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition hover:border-blue-300 hover:shadow-md"><h2 className="font-semibold text-slate-950">{label}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{description}</p><p className="mt-4 text-sm font-semibold text-blue-700">Open workspace →</p></Link>)}</div></section>;
}
