import type { FlightState } from "../../types";

export const STALL_AOA_DEG = 16;
export const MIN_SPEED = 40;
export const MAX_SPEED = 160;

export const DEFAULT_FLIGHT_STATE: FlightState = {
  pitchDeg: 5,
  flightPathDeg: 2,
  aoaDeg: 3,
  relativeWindDeg: 182,
  speed: 90,
  liftForce: 0.62,
  isStalled: false,
  warnings: [],
};
