import { clamp } from "../math/angles";

export const DEFAULT_CRITICAL_AOA_DEG = 15;

export function getLiftCoefficient(
  aoaDeg: number,
  criticalAOA: number = DEFAULT_CRITICAL_AOA_DEG
) {
  const safeCritical = Math.max(criticalAOA, 1);

  if (aoaDeg <= safeCritical) {
    const normalized = clamp((aoaDeg + 4) / (safeCritical + 4), 0, 1);
    return 0.18 + normalized * 1.08;
  }

  const postStallAoA = aoaDeg - safeCritical;
  const postStallLift = 1.26 - postStallAoA * 0.15;
  return clamp(postStallLift, 0.12, 1.26);
}

export function getDragCoefficient(
  aoaDeg: number,
  criticalAOA: number = DEFAULT_CRITICAL_AOA_DEG
) {
  const absoluteAoa = Math.abs(aoaDeg);
  const preStallDrag = 0.04 + absoluteAoa * 0.012 + absoluteAoa * absoluteAoa * 0.0012;

  if (aoaDeg <= criticalAOA) {
    return clamp(preStallDrag, 0.04, 0.9);
  }

  const postStallAoA = aoaDeg - criticalAOA;
  return clamp(preStallDrag + 0.18 + postStallAoA * 0.045, 0.04, 1.4);
}

export function getStallMargin(
  aoaDeg: number,
  criticalAOA: number = DEFAULT_CRITICAL_AOA_DEG
) {
  return criticalAOA - aoaDeg;
}
