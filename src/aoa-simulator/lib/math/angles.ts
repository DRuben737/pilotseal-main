export function normalizeDegrees(angle: number) {
  return ((angle % 360) + 360) % 360;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
