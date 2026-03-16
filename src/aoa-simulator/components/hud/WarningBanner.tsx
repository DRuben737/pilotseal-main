"use client";

import { useAoaSimulatorStore } from "../../store/useAoaSimulatorStore";

export default function WarningBanner() {
  const isStalled = useAoaSimulatorStore((state) => state.isStalled);

  if (!isStalled) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-red-300 bg-red-500 px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white shadow-[0_10px_24px_rgba(239,68,68,0.22)]">
      Stall Warning
    </div>
  );
}
