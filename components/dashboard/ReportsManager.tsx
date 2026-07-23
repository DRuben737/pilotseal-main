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
        className="inline-flex rounded-xl border border-slate-200 bg-white p-1"
        aria-label="Report type"
      >
        <button
          type="button"
          onClick={() => router.replace("/dashboard/reports?type=aircraft")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            activeType === "aircraft" ? "bg-blue-600 text-white" : "text-slate-600"
          }`}
        >
          Aircraft Reports
        </button>
        <button
          type="button"
          onClick={() => router.replace("/dashboard/reports?type=asr")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            activeType === "asr" ? "bg-blue-600 text-white" : "text-slate-600"
          }`}
        >
          ASR
        </button>
      </nav>
      {activeType === "aircraft" ? <AircraftReportsManager /> : <AsrReportsManager />}
    </div>
  );
}
