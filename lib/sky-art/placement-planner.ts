import type { RouteGeometry } from "./types";
import type { Composition, GeometryElement, Placement, Variant } from "./types";
import { planRoute } from "./planner";
export type RoutingPlacement = Pick<
  Placement,
  | "mode"
  | "metersPerUnit"
  | "rotation"
  | "offsetX"
  | "offsetY"
  | "airport"
  | "roundTrip"
>;
const baselineCache = new WeakMap<
  GeometryElement[],
  Map<string, RouteGeometry>
>();
export function planPlacedRoute(
  geometry: GeometryElement[],
  composition: Composition,
  variant: Variant,
  placement: RoutingPlacement,
) {
  // The reference pose is independent of movement and the adaptive entry port.
  const key = JSON.stringify({
    composition,
    variant,
    close:
      placement.mode === "start" && placement.roundTrip && placement.airport,
  });
  const cached =
    baselineCache.get(geometry) ?? new Map<string, RouteGeometry>();
  let baseline = cached.get(key);
  if (!baseline) {
    baseline = planRoute(
      geometry,
      composition,
      variant,
      placement.mode === "start" && placement.roundTrip && placement.airport,
    );
    cached.set(key, baseline);
    baselineCache.set(geometry, cached);
  }
  const b = baseline.bounds;
  const origin =
    placement.mode === "start"
      ? baseline.segments[0].from
      : { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  if (placement.mode !== "start" && !placement.airport) return baseline;
  const a = (placement.rotation * Math.PI) / 180,
    scale = placement.metersPerUnit;
  const point = {
    x:
      origin.x +
      (-placement.offsetX * Math.cos(a) + placement.offsetY * Math.sin(a)) /
        scale,
    y:
      origin.y +
      (placement.offsetX * Math.sin(a) + placement.offsetY * Math.cos(a)) /
        scale,
  };
  const route = planRoute(geometry, composition, variant, false, {
    point,
    return: placement.airport && placement.roundTrip,
  });
  return { ...route, origin };
}
