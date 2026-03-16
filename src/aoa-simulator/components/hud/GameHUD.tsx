"use client";

import { resetGameplayState, useGameplayState } from "../../lib/aoa/gameplayState";
import { useAoaSimulatorStore } from "../../store/useAoaSimulatorStore";
import TeachingOverlay from "../teaching/TeachingOverlay";
import AoaGauge from "./AoaGauge";

export default function GameHUD() {
  const aoaDeg = useAoaSimulatorStore((state) => state.aoaDeg);
  const isStalled = useAoaSimulatorStore((state) => state.isStalled);
  const reset = useAoaSimulatorStore((state) => state.reset);
  const pitchDeg = useAoaSimulatorStore((state) => state.pitchDeg);
  const flightPathDeg = useAoaSimulatorStore((state) => state.flightPathDeg);
  const liftForce = useAoaSimulatorStore((state) => state.liftForce);
  const gameplayMode = useGameplayState((state) => state.gameplayMode);

  return (
    <section className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-3 sm:p-4">
      <div className="grid gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="pointer-events-auto mx-auto flex flex-col items-center">
            <p className="text-center text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-white/65">
              Angle of Attack
            </p>
            <p className="mt-1 text-4xl font-semibold tracking-tight text-white drop-shadow-[0_0_18px_rgba(255,255,255,0.2)] sm:text-5xl">
              {aoaDeg.toFixed(1)}°
            </p>
            <div className="-mt-2">
              <AoaGauge aoaDeg={aoaDeg} />
            </div>
          </div>

          <div className="pointer-events-auto flex items-center gap-2">
            {isStalled ? (
              <div className="animate-pulse rounded-full border border-red-300/50 bg-red-500/92 px-4 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-white">
                Stall Warning
              </div>
            ) : null}

            <div className="rounded-full border border-white/18 bg-black/24 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/80 backdrop-blur-sm">
              {gameplayMode.replace("Mode", "")}
            </div>
          </div>
        </div>

        <div className="max-w-xl">
          <TeachingOverlay />
        </div>
      </div>

      <div className="pointer-events-none flex items-end justify-between gap-3">
        <div className="pointer-events-auto hidden text-sm leading-6 text-white/68 sm:block">
          <p>
            Keyboard: <kbd>W</kbd>/<kbd>↑</kbd> pitch up, <kbd>S</kbd>/<kbd>↓</kbd> pitch down
          </p>
          <p>
            <kbd>Shift</kbd>/<kbd>Ctrl</kbd> throttle, Reset to replay
          </p>
        </div>

        <div className="pointer-events-auto ml-auto flex items-center gap-2">
          <button
            type="button"
            className="secondary-button pointer-events-auto border-white/18 bg-black/24 text-white backdrop-blur-sm"
            onClick={() => {
              reset();
              resetGameplayState();
            }}
          >
            Reset
          </button>
        </div>
      </div>

      <div className="pointer-events-none">
        <div className="pointer-events-auto rounded-full border border-white/16 bg-black/22 px-4 py-3 text-white backdrop-blur-sm">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-white/55">
                Pitch
              </p>
              <p className="mt-1 text-base font-semibold">{pitchDeg.toFixed(1)}°</p>
            </div>
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-white/55">
                Flight Path
              </p>
              <p className="mt-1 text-base font-semibold">{flightPathDeg.toFixed(1)}°</p>
            </div>
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-white/55">
                Lift
              </p>
              <p className="mt-1 text-base font-semibold">{liftForce.toFixed(2)}</p>
            </div>
            <div className="hidden sm:block">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-white/55">
                Status
              </p>
              <p className="mt-1 text-base font-semibold">
                {isStalled ? "Stalled" : "Nominal"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
