import type { FlightState, SimulatorWarning } from "../../types";
import { MAX_SPEED, MIN_SPEED } from "../constants/defaults";
import { clamp, normalizeDegrees } from "../math/angles";
import {
  DEFAULT_CRITICAL_AOA_DEG,
  getDragCoefficient,
  getLiftCoefficient,
  getStallMargin,
} from "./aeroModel";

const FLIGHT_PATH_RESPONSE_RATE = 1.45;
const MAX_FLIGHT_PATH_STEP_DEG_PER_SEC = 18;
const LIFT_RESPONSE_GAIN = 5.25;
const DRAG_RESPONSE_GAIN = 3.1;
const STALL_SINK_DEG_PER_SEC = 6.5;
const SPEED_RESPONSE_DAMPING = 0.55;

function buildWarnings(
  aoaDeg: number,
  criticalAOA: number,
  isStalled: boolean
): SimulatorWarning[] {
  const warnings: SimulatorWarning[] = [];
  const stallMargin = getStallMargin(aoaDeg, criticalAOA);

  if (stallMargin <= 3 && !isStalled) {
    warnings.push({
      code: "stall-margin-low",
      message: "AOA is approaching the critical region.",
      level: "caution",
    });
  }

  if (isStalled) {
    warnings.push({
      code: "stall",
      message: "STALL",
      level: "warning",
    });
  }

  return warnings;
}

export function stepFlightPhysics(
  state: FlightState,
  deltaTime: number,
  criticalAOA: number = DEFAULT_CRITICAL_AOA_DEG
): FlightState {
  const dt = clamp(deltaTime, 1 / 240, 1 / 24);
  const speed = clamp(state.speed, MIN_SPEED, MAX_SPEED);
  const speedFactor = clamp(speed / MAX_SPEED, 0.35, 1);

  const immediateAoa = state.pitchDeg - state.flightPathDeg;
  const immediateLiftCoefficient = getLiftCoefficient(immediateAoa, criticalAOA);
  const immediateDragCoefficient = getDragCoefficient(immediateAoa, criticalAOA);
  const immediateStallMargin = getStallMargin(immediateAoa, criticalAOA);
  const immediateStall = immediateStallMargin <= 0;

  const responseRate = FLIGHT_PATH_RESPONSE_RATE * speedFactor;
  const pitchFollowDelta = (state.pitchDeg - state.flightPathDeg) * responseRate * dt;
  const limitedPitchFollowDelta = clamp(
    pitchFollowDelta,
    -MAX_FLIGHT_PATH_STEP_DEG_PER_SEC * dt,
    MAX_FLIGHT_PATH_STEP_DEG_PER_SEC * dt
  );

  const liftBias = (immediateLiftCoefficient - 0.55) * LIFT_RESPONSE_GAIN * dt;
  const dragBias = immediateDragCoefficient * DRAG_RESPONSE_GAIN * SPEED_RESPONSE_DAMPING * dt;
  const stallSink = immediateStall ? STALL_SINK_DEG_PER_SEC * dt : 0;

  const nextFlightPathDeg = clamp(
    state.flightPathDeg + limitedPitchFollowDelta + liftBias - dragBias - stallSink,
    -20,
    25
  );

  const aoaDeg = state.pitchDeg - nextFlightPathDeg;
  const relativeWindDeg = normalizeDegrees(nextFlightPathDeg + 180);
  const liftForce = getLiftCoefficient(aoaDeg, criticalAOA);
  const stallMargin = getStallMargin(aoaDeg, criticalAOA);
  const isStalled = stallMargin <= 0;

  return {
    pitchDeg: state.pitchDeg,
    flightPathDeg: nextFlightPathDeg,
    aoaDeg,
    relativeWindDeg,
    speed,
    liftForce,
    isStalled,
    warnings: buildWarnings(aoaDeg, criticalAOA, isStalled),
  };
}
