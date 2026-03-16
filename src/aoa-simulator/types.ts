export type WarningLevel = "info" | "caution" | "warning";

export type SimulatorWarning = {
  code: string;
  message: string;
  level: WarningLevel;
};

export type FlightState = {
  pitchDeg: number;
  flightPathDeg: number;
  aoaDeg: number;
  relativeWindDeg: number;
  speed: number;
  liftForce: number;
  isStalled: boolean;
  warnings: SimulatorWarning[];
};

export type FlightControlInputs = {
  pitchDeg: number;
  flightPathDeg: number;
  speed: number;
};

export type ScenarioDefinition = {
  id: string;
  title: string;
  objective: string;
  prompt: string;
};
