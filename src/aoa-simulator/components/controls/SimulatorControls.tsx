"use client";

import Button from "@/components/ui/Button";
import Panel from "@/components/ui/Panel";
import Slider from "@/components/ui/Slider";
import { resetGameplayState, setManualTargets } from "../../lib/aoa/gameplayState";
import { useAoaSimulatorStore } from "../../store/useAoaSimulatorStore";

export default function SimulatorControls() {
  const pitchDeg = useAoaSimulatorStore((state) => state.pitchDeg);
  const flightPathDeg = useAoaSimulatorStore((state) => state.flightPathDeg);
  const speed = useAoaSimulatorStore((state) => state.speed);
  const setPitchDeg = useAoaSimulatorStore((state) => state.setPitchDeg);
  const setFlightPathDeg = useAoaSimulatorStore((state) => state.setFlightPathDeg);
  const setSpeed = useAoaSimulatorStore((state) => state.setSpeed);
  const reset = useAoaSimulatorStore((state) => state.reset);

  function handlePitchChange(value: number) {
    setPitchDeg(value);
    setManualTargets({ targetPitchDeg: value });
  }

  function handleSpeedChange(value: number) {
    setSpeed(value);
    setManualTargets({ targetSpeed: value });
  }

  function handleReset() {
    reset();
    resetGameplayState();
  }

  return (
    <Panel className="grid gap-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="muted-kicker">Input layer</p>
          <h2 className="text-lg font-semibold">Primary controls</h2>
        </div>
        <Button type="button" onClick={handleReset}>
          Reset
        </Button>
      </div>

      <div className="grid gap-4">
        <Slider
          label="Pitch"
          value={pitchDeg}
          min={-10}
          max={20}
          step={0.5}
          onChange={handlePitchChange}
        />
        <Slider
          label="Flight Path"
          value={flightPathDeg}
          min={-10}
          max={15}
          step={0.5}
          onChange={setFlightPathDeg}
        />
        <Slider
          label="Speed"
          value={speed}
          min={40}
          max={160}
          step={1}
          onChange={handleSpeedChange}
        />
      </div>

      <p className="text-sm leading-7 text-[var(--muted)]">
        Keyboard: <kbd>↑</kbd>/<kbd>↓</kbd> pitch, <kbd>←</kbd>/<kbd>→</kbd>{" "}
        flight path, <kbd>Shift</kbd>/<kbd>Ctrl</kbd> speed.
      </p>
    </Panel>
  );
}
