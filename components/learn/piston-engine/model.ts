export type EngineSystem =
  | "overview"
  | "cycle"
  | "fuel-air"
  | "ignition"
  | "oil"
  | "cooling-exhaust";

export type Stroke = "intake" | "compression" | "power" | "exhaust";

export interface CylinderFrame {
  id: "1" | "2" | "3" | "4";
  cycleAngle: number;
  crankAngle: number;
  stroke: Stroke;
  piston: number;
  pistonTravelInches: number;
  rodAngle: number;
  intakeLift: number;
  exhaustLift: number;
  spark: number;
  combustion: number;
}

export interface EngineFrame {
  angle: number;
  activeCylinder: CylinderFrame["id"];
  cylinders: CylinderFrame[];
}

export const ENGINE_DIMENSIONS = {
  boreInches: 5.125,
  strokeInches: 4.375,
  crankRadiusInches: 2.1875,
  connectingRodInches: 8.75,
  ignitionBeforeTdcDegrees: 25,
} as const;

// A clockwise O-360 fires 1-3-2-4. Offsets put each cylinder's power
// stroke 180 crankshaft degrees after the previous cylinder.
const CYLINDERS = [
  { id: "1", offset: 0 },
  { id: "3", offset: 540 },
  { id: "2", offset: 360 },
  { id: "4", offset: 180 },
] as const;

export const ENGINE_SYSTEMS: Array<{
  id: EngineSystem;
  label: string;
  note: string;
}> = [
  {
    id: "overview",
    label: "Overview",
    note: "A compact crankcase carries one crankshaft between four air-cooled cylinders arranged in opposing pairs.",
  },
  {
    id: "cycle",
    label: "Four-stroke cycle",
    note: "Cylinder 1 completes intake, compression, power, and exhaust during two full crankshaft revolutions.",
  },
  {
    id: "fuel-air",
    label: "Fuel & air",
    note: "The carburetor meters fuel into the induction air; intake runners deliver the mixture to each open intake valve.",
  },
  {
    id: "ignition",
    label: "Dual ignition",
    note: "Two engine-driven magnetos independently fire two spark plugs in every cylinder for redundancy and even combustion.",
  },
  {
    id: "oil",
    label: "Lubrication",
    note: "The pressure pump draws oil from the wet sump, feeds the crankshaft and valve train, and lets it drain back by gravity.",
  },
  {
    id: "cooling-exhaust",
    label: "Cooling & exhaust",
    note: "Baffled ram air passes through the cylinder fins while exhaust leaves through the exhaust valve and steel stack.",
  },
];

export const normalizeCycleAngle = (angle: number) => {
  const wrapped = angle % 720;
  return wrapped < 0 ? wrapped + 720 : wrapped;
};

export function strokeAt(cycleAngle: number): Stroke {
  const angle = normalizeCycleAngle(cycleAngle);
  if (angle < 180) return "intake";
  if (angle < 360) return "compression";
  if (angle < 540) return "power";
  return "exhaust";
}

const halfSine = (value: number, start: number, end: number) => {
  if (value <= start || value >= end) return 0;
  return Math.sin(((value - start) / (end - start)) * Math.PI);
};

const pulseAt = (angle: number, center: number, width: number) => {
  const direct = Math.abs(angle - center);
  const distance = Math.min(direct, Math.abs(direct - 720));
  return Math.max(0, 1 - distance / width);
};

export function sliderCrankAt(crankAngle: number) {
  const theta = (crankAngle * Math.PI) / 180;
  const r = ENGINE_DIMENSIONS.crankRadiusInches;
  const l = ENGINE_DIMENSIONS.connectingRodInches;
  const pin = r * Math.cos(theta) + Math.sqrt(l * l - (r * Math.sin(theta)) ** 2);
  const travel = r + l - pin;
  return {
    piston: travel / ENGINE_DIMENSIONS.strokeInches,
    pistonTravelInches: travel,
    rodAngle: (Math.asin((r / l) * Math.sin(theta)) * 180) / Math.PI,
  };
}

export function cylinderFrameAt(
  engineAngle: number,
  cylinder: (typeof CYLINDERS)[number],
): CylinderFrame {
  const cycleAngle = normalizeCycleAngle(engineAngle + cylinder.offset);
  const crankAngle = cycleAngle % 360;
  const motion = sliderCrankAt(crankAngle);
  const ignitionAt = 360 - ENGINE_DIMENSIONS.ignitionBeforeTdcDegrees;

  return {
    id: cylinder.id,
    cycleAngle,
    crankAngle,
    stroke: strokeAt(cycleAngle),
    ...motion,
    intakeLift: halfSine(cycleAngle, 0, 180),
    exhaustLift: halfSine(cycleAngle, 540, 720),
    spark: pulseAt(cycleAngle, ignitionAt, 10),
    combustion:
      cycleAngle >= 360 && cycleAngle <= 525
        ? Math.pow(1 - (cycleAngle - 360) / 165, 1.55)
        : 0,
  };
}

export function engineFrameAt(engineAngle: number): EngineFrame {
  const cylinders = CYLINDERS.map((cylinder) =>
    cylinderFrameAt(engineAngle, cylinder),
  );
  const active = cylinders.reduce((best, cylinder) =>
    cylinder.combustion > best.combustion ? cylinder : best,
  );

  return {
    angle: normalizeCycleAngle(engineAngle),
    activeCylinder: active.id,
    cylinders,
  };
}

export function frameReadout(frame: EngineFrame) {
  const focus = frame.cylinders[0]!;
  return `Cyl 1 · ${focus.stroke} · ${focus.pistonTravelInches.toFixed(1)} in · ${Math.round(frame.angle)}°`;
}

export function frameDescription(frame: EngineFrame) {
  const focus = frame.cylinders[0]!;
  const intake = focus.intakeLift > 0.02 ? "intake valve open" : "intake valve closed";
  const exhaust = focus.exhaustLift > 0.02 ? "exhaust valve open" : "exhaust valve closed";
  return `Cylinder 1 is on the ${focus.stroke} stroke at ${Math.round(frame.angle)} degrees, ${focus.pistonTravelInches.toFixed(1)} inches from top dead center; ${intake}; ${exhaust}.`;
}
