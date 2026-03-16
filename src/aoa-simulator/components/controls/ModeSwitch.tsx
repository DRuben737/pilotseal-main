"use client";

import { setCameraMode, setGameplayMode, useGameplayState } from "../../lib/aoa/gameplayState";
import { useAoaSimulatorStore } from "../../store/useAoaSimulatorStore";
import type { CameraMode, GameplayMode } from "../../lib/aoa/scenarios";

const gameplayModes: GameplayMode[] = ["TeachingMode", "FreeFlightMode", "ChallengeMode"];
const cameraModes: CameraMode[] = ["SideView", "ChaseView"];

export default function ModeSwitch() {
  const cameraMode = useGameplayState((state) => state.cameraMode);
  const gameplayMode = useGameplayState((state) => state.gameplayMode);
  const pitchDeg = useAoaSimulatorStore((state) => state.pitchDeg);
  const flightPathDeg = useAoaSimulatorStore((state) => state.flightPathDeg);
  const aoaDeg = useAoaSimulatorStore((state) => state.aoaDeg);
  const relativeWindDeg = useAoaSimulatorStore((state) => state.relativeWindDeg);
  const speed = useAoaSimulatorStore((state) => state.speed);
  const liftForce = useAoaSimulatorStore((state) => state.liftForce);
  const isStalled = useAoaSimulatorStore((state) => state.isStalled);
  const warnings = useAoaSimulatorStore((state) => state.warnings);

  const flightState = {
    pitchDeg,
    flightPathDeg,
    aoaDeg,
    relativeWindDeg,
    speed,
    liftForce,
    isStalled,
    warnings,
  };

  return (
    <section className="content-card grid gap-4 p-4">
      <div>
        <p className="muted-kicker">Gameplay</p>
        <h2 className="text-lg font-semibold">Modes and camera</h2>
      </div>

      <div className="grid gap-3">
        <div className="grid gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
            Flight mode
          </p>
          <div className="flex flex-wrap gap-2">
            {gameplayModes.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setGameplayMode(mode, flightState)}
                className={mode === gameplayMode ? "primary-button" : "secondary-button"}
              >
                {mode.replace("Mode", "")}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
            Camera
          </p>
          <div className="flex flex-wrap gap-2">
            {cameraModes.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setCameraMode(mode)}
                className={mode === cameraMode ? "primary-button" : "secondary-button"}
              >
                {mode === "SideView" ? "Side View" : "Chase View"}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
