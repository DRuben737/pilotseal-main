export type GameplayMode = "TeachingMode" | "FreeFlightMode" | "ChallengeMode";
export type CameraMode = "SideView" | "ChaseView";

export type AoaScenario = {
  id: string;
  title: string;
  targetAOA: [number, number];
  duration: number;
  description: string;
};

export const aoaScenarios: AoaScenario[] = [
  {
    id: "maintain-optimal-aoa",
    title: "Maintain Optimal Angle of Attack",
    targetAOA: [6, 8],
    duration: 10,
    description: "Hold the aircraft inside the target AOA band long enough to complete the exercise.",
  },
];
