"use client";

import KeyboardController from "./controls/KeyboardController";
import ModeSwitch from "./controls/ModeSwitch";
import SimulatorControls from "./controls/SimulatorControls";
import FlightHud from "./hud/FlightHud";
import SceneRoot from "./scene/SceneRoot";
import ScenarioPanel from "./teaching/ScenarioPanel";

export default function AoaSimulator() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
      <KeyboardController />

      <section className="grid gap-4">
        <div className="content-card p-4 sm:p-5">
          <div className="flex flex-col gap-2">
            <p className="muted-kicker">AOA simulator</p>
            <h2 className="text-xl font-semibold">Interactive training sandbox</h2>
            <p className="text-sm leading-7 text-[var(--muted)]">
              Initial project skeleton for pitch, flight path, relative wind, angle
              of attack, lift, and stall cue visualization.
            </p>
          </div>
          <div className="mt-4">
            <SceneRoot />
          </div>
        </div>

        <FlightHud />
      </section>

      <aside className="grid gap-4">
        <ModeSwitch />
        <SimulatorControls />
        <ScenarioPanel />
      </aside>
    </div>
  );
}
