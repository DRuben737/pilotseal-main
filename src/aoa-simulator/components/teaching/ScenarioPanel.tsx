"use client";

import { aoaScenarios } from "../../lib/aoa/scenarios";
import ScenarioCard from "./ScenarioCard";

export default function ScenarioPanel() {
  return (
    <section className="content-card grid gap-4 p-4">
      <div>
        <p className="muted-kicker">Teaching layer</p>
        <h2 className="text-lg font-semibold">Scenario prompts</h2>
      </div>

      <div className="grid gap-3">
        <ScenarioCard />
        {aoaScenarios.map((scenario) => (
          <article
            key={scenario.id}
            className="rounded-2xl border border-black/8 bg-white/70 px-4 py-4"
          >
            <h3 className="text-base font-semibold">{scenario.title}</h3>
            <p className="mt-2 text-sm leading-7 text-[var(--muted)]">
              {scenario.description}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
