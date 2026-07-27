"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import AircraftReportsManager from "@/components/dashboard/AircraftReportsManager";
import AsrReportsManager from "@/components/dashboard/AsrReportsManager";

export default function ReportsManager() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeType = searchParams.get("type") === "asr" ? "asr" : "aircraft";

  return (
    <div className="space-y-4">
      <header className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-[0_6px_20px_rgba(15,23,42,0.04)]">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-blue-700">
          Safety reporting
        </p>
        <h1 className="mt-1 text-lg font-semibold text-slate-950">Safety Reports</h1>
        <p className="mt-1 text-xs text-slate-600">
          Submit an aircraft discrepancy or an internal ASR report.
        </p>
      </header>
      <nav
        className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-[0_6px_20px_rgba(15,23,42,0.04)]"
        aria-label="Report type"
      >
        <button
          type="button"
          onClick={() => router.replace(`${pathname}?type=aircraft`)}
          aria-pressed={activeType === "aircraft"}
          className={`min-h-8 shrink-0 rounded-lg px-3 text-xs font-semibold transition-colors ${
            activeType === "aircraft"
              ? "bg-blue-700 text-white"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
          }`}
        >
          Aircraft Discrepancy Reports
        </button>
        <button
          type="button"
          onClick={() => router.replace(`${pathname}?type=asr`)}
          aria-pressed={activeType === "asr"}
          className={`min-h-8 shrink-0 rounded-lg px-3 text-xs font-semibold transition-colors ${
            activeType === "asr"
              ? "bg-blue-700 text-white"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
          }`}
        >
          ASR Reports
        </button>
      </nav>
      {activeType === "aircraft" ? <AircraftReportsManager /> : <AsrReportsManager />}
    </div>
  );
}
