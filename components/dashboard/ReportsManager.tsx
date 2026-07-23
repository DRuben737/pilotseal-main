"use client";

import { useRouter, useSearchParams } from "next/navigation";

import AircraftReportsManager from "@/components/dashboard/AircraftReportsManager";
import AsrReportsManager from "@/components/dashboard/AsrReportsManager";

export default function ReportsManager() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeType = searchParams.get("type") === "asr" ? "asr" : "aircraft";

  return (
    <div className="space-y-4">
      <nav
        className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-2 sm:grid-cols-2"
        aria-label="Report type"
      >
        <button
          type="button"
          onClick={() => router.replace("/dashboard/reports?type=aircraft")}
          aria-pressed={activeType === "aircraft"}
          className={`rounded-xl px-4 py-3 text-left transition-colors ${
            activeType === "aircraft"
              ? "bg-blue-600 text-white"
              : "text-slate-700 hover:bg-slate-50"
          }`}
        >
          <span className="block text-sm font-semibold">Aircraft issues</span>
          <span
            className={`mt-1 block text-xs ${
              activeType === "aircraft" ? "text-blue-100" : "text-slate-500"
            }`}
          >
            Report a defect, damage, or maintenance concern.
          </span>
        </button>
        <button
          type="button"
          onClick={() => router.replace("/dashboard/reports?type=asr")}
          aria-pressed={activeType === "asr"}
          className={`rounded-xl px-4 py-3 text-left transition-colors ${
            activeType === "asr"
              ? "bg-blue-600 text-white"
              : "text-slate-700 hover:bg-slate-50"
          }`}
        >
          <span className="block text-sm font-semibold">Safety reports (ASR)</span>
          <span
            className={`mt-1 block text-xs ${
              activeType === "asr" ? "text-blue-100" : "text-slate-500"
            }`}
          >
            Record an internal safety event and its reviews.
          </span>
        </button>
      </nav>
      {activeType === "aircraft" ? <AircraftReportsManager /> : <AsrReportsManager />}
    </div>
  );
}
