import type { ScenarioDefinition } from "../types";

export const aoaScenarios: ScenarioDefinition[] = [
  {
    id: "baseline-cruise",
    title: "Baseline Cruise",
    objective: "Observe the relationship between small pitch changes and AOA.",
    prompt: "Hold a stable flight path and note how AOA changes when pitch moves independently.",
  },
  {
    id: "approach-to-stall",
    title: "Approach to Stall",
    objective: "Recognize the placeholder warning logic before the stall threshold.",
    prompt: "Increase pitch while watching lift and warning cues in the HUD.",
  },
];
