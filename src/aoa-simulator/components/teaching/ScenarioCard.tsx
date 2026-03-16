"use client";

import { aoaScenarios } from "../../lib/aoa/scenarios";
import { useGameplayState } from "../../lib/aoa/gameplayState";

export default function ScenarioCard() {
  const activeScenarioId = useGameplayState((state) => state.scenario.activeScenarioId);
  const score = useGameplayState((state) => state.scenario.score);
  const secondsInBand = useGameplayState((state) => state.scenario.secondsInBand);
  const completed = useGameplayState((state) => state.scenario.completed);

  const scenario = aoaScenarios.find((item) => item.id === activeScenarioId) ?? aoaScenarios[0];

  return (
    <article className="rounded-2xl border border-black/8 bg-white/80 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-soft)]">
        Scenario
      </p>
      <h3 className="mt-2 text-base font-semibold">{scenario.title}</h3>
      <p className="mt-2 text-sm leading-7 text-[var(--muted)]">{scenario.description}</p>
      <div className="mt-3 grid gap-2 text-sm">
        <p>Target AOA: {scenario.targetAOA[0]}° to {scenario.targetAOA[1]}°</p>
        <p>Duration: {scenario.duration}s</p>
        <p>Score: {score}</p>
        <p>Time in band: {secondsInBand.toFixed(1)}s</p>
        <p>Status: {completed ? "Complete" : "In progress"}</p>
      </div>
    </article>
  );
}
