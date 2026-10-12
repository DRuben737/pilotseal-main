import { Suspense } from "react";

import JoinOrganizationContent from "./JoinOrganizationContent";

export default function JoinOrganizationPage() {
  return <Suspense fallback={<main className="mx-auto max-w-xl p-8 text-sm text-slate-500">Loading invitation…</main>}><JoinOrganizationContent /></Suspense>;
}
