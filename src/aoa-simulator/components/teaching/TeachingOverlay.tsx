"use client";

import { useMemo } from "react";
import { useGameplayState } from "../../lib/aoa/gameplayState";
import { useAoaSimulatorStore } from "../../store/useAoaSimulatorStore";

export default function TeachingOverlay() {
  const gameplayMode = useGameplayState((state) => state.gameplayMode);
  const pitchUpActive = useGameplayState((state) => state.controls.pitchUp);
  const pitchDownActive = useGameplayState((state) => state.controls.pitchDown);
  const secondsInBand = useGameplayState((state) => state.scenario.secondsInBand);
  const completed = useGameplayState((state) => state.scenario.completed);
  const aoaDeg = useAoaSimulatorStore((state) => state.aoaDeg);
  const pitchDeg = useAoaSimulatorStore((state) => state.pitchDeg);
  const flightPathDeg = useAoaSimulatorStore((state) => state.flightPathDeg);
  const isStalled = useAoaSimulatorStore((state) => state.isStalled);

  const helperText = useMemo(() => {
    if (isStalled) {
      return "The wing has exceeded the critical angle. Lower AOA and regain smooth airflow.";
    }

    if (pitchUpActive && pitchDeg > flightPathDeg + 1.5) {
      return "Notice that pitch increased first, causing AOA to rise before the flight path changed.";
    }

    if (pitchDownActive && pitchDeg < flightPathDeg - 1) {
      return "Pitch decreased immediately, while the flight path is still catching up to the new attitude.";
    }

    if (pitchDeg > flightPathDeg + 2) {
      return "Notice that the aircraft nose is above the horizon, but the flight path is still lagging behind.";
    }

    if (gameplayMode === "ChallengeMode") {
      return `Keep AOA between 6° and 8°. Stable time: ${secondsInBand.toFixed(1)}s.`;
    }

    return "Watch how pitch changes first, then the flight path gradually follows as lift responds.";
  }, [
    flightPathDeg,
    gameplayMode,
    isStalled,
    pitchDeg,
    pitchDownActive,
    pitchUpActive,
    secondsInBand,
  ]);

  if (gameplayMode === "FreeFlightMode") {
    return null;
  }

  return (
    <div className="max-w-xl text-white/88 transition-opacity duration-300">
      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-cyan-200/80">
        {gameplayMode === "ChallengeMode" ? "Challenge" : "Teaching prompt"}
      </p>
      <p className="mt-2 text-sm leading-7 text-white/88">{helperText}</p>
      <p className="mt-2 text-xs font-medium tracking-[0.08em] text-white/60">
        AOA {aoaDeg.toFixed(1)}° | Pitch {pitchDeg.toFixed(1)}° | FP {flightPathDeg.toFixed(1)}°
      </p>
      {completed ? (
        <p className="mt-2 text-sm font-semibold text-emerald-300">
          Target maintained. Challenge complete.
        </p>
      ) : null}
    </div>
  );
}
