import type { FlightControlInputs, FlightState, SimulatorWarning } from "../../types";
import { DEFAULT_FLIGHT_STATE, MAX_SPEED, MIN_SPEED, STALL_AOA_DEG } from "../constants/defaults";
import { clamp, normalizeDegrees } from "../math/angles";

export function calculateAOA(pitchDeg: number, flightPathDeg: number) {
  return pitchDeg - flightPathDeg;
}

export function calculateRelativeWind(pitchDeg: number, flightPathDeg: number) {
  return normalizeDegrees(180 + flightPathDeg - pitchDeg);
}

export function getLiftCoefficient(aoaDeg: number) {
  const linearLift = 0.18 + aoaDeg * 0.08;
  return clamp(linearLift, 0, 1.6);
}

export function buildWarnings(aoaDeg: number, isStalled: boolean): SimulatorWarning[] {
  const warnings: SimulatorWarning[] = [];

  if (aoaDeg >= STALL_AOA_DEG - 2 && !isStalled) {
    warnings.push({
      code: "approaching-stall",
      message: "Angle of attack is approaching the current placeholder stall threshold.",
      level: "caution",
    });
  }

  if (isStalled) {
    warnings.push({
      code: "stall",
      message: "Stall condition triggered by the placeholder AOA threshold.",
      level: "warning",
    });
  }

  return warnings;
}

export function updateFlightState(inputs: FlightControlInputs): FlightState {
  const speed = clamp(inputs.speed, MIN_SPEED, MAX_SPEED);
  const aoaDeg = calculateAOA(inputs.pitchDeg, inputs.flightPathDeg);
  const isStalled = aoaDeg >= STALL_AOA_DEG;

  return {
    ...DEFAULT_FLIGHT_STATE,
    pitchDeg: inputs.pitchDeg,
    flightPathDeg: inputs.flightPathDeg,
    aoaDeg,
    relativeWindDeg: calculateRelativeWind(inputs.pitchDeg, inputs.flightPathDeg),
    speed,
    liftForce: getLiftCoefficient(aoaDeg),
    isStalled,
    warnings: buildWarnings(aoaDeg, isStalled),
  };
}
