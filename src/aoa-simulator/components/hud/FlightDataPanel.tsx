"use client";

import Stat from "@/components/ui/Stat";
import { useAoaSimulatorStore } from "../../store/useAoaSimulatorStore";

export default function FlightDataPanel() {
  const pitchDeg = useAoaSimulatorStore((state) => state.pitchDeg);
  const flightPathDeg = useAoaSimulatorStore((state) => state.flightPathDeg);
  const relativeWindDeg = useAoaSimulatorStore((state) => state.relativeWindDeg);
  const liftForce = useAoaSimulatorStore((state) => state.liftForce);
  const speed = useAoaSimulatorStore((state) => state.speed);
  const isStalled = useAoaSimulatorStore((state) => state.isStalled);

  return (
    <section className="grid gap-3">
      <Stat label="Pitch" value={`${pitchDeg.toFixed(1)}°`} />
      <Stat
        label="Flight path"
        value={`${flightPathDeg.toFixed(1)}°`}
        accentClassName="text-emerald-600"
      />
      <Stat
        label="Relative wind"
        value={`${relativeWindDeg.toFixed(1)}°`}
        accentClassName="text-sky-600"
      />
      <Stat
        label="Lift"
        value={liftForce.toFixed(2)}
        accentClassName={isStalled ? "text-rose-600" : "text-amber-500"}
      />
      <Stat label="Speed" value={`${speed.toFixed(0)} kt`} />
      <Stat
        label="Status"
        value={isStalled ? "Stalled" : "Stable"}
        accentClassName={isStalled ? "text-rose-600" : "text-emerald-600"}
      />
    </section>
  );
}
