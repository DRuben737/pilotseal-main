import GeographicLib from "geographiclib-geodesic";
import type {
  Coordinate,
  Leg,
  Placement,
  Point,
  RouteGeometry,
  RoutePlan,
  RouteSegment,
  Waypoint,
} from "./types";
import { distance, lerp } from "./geometry";
import { clearConnection } from "./clear-connections";
import { connectionCurve, joinAngle } from "./connections";
import { navigationSegments } from "./navigation";
const geodesic = GeographicLib.Geodesic.WGS84;
export function inverse(a: Coordinate, b: Coordinate) {
  const r = geodesic.Inverse(a.lat, a.lon, b.lat, b.lon);
  return { distanceNm: r.s12! / 1852, track: ((r.azi1! % 360) + 360) % 360 };
}
export function direct(a: Coordinate, east: number, north: number): Coordinate {
  const d = Math.hypot(east, north);
  if (d === 0) return { ...a };
  const r = geodesic.Direct(
    a.lat,
    a.lon,
    (Math.atan2(east, north) * 180) / Math.PI,
    d,
  );
  return { lat: r.lat2!, lon: r.lon2! };
}
function roundedSegments(
  geometry: RouteGeometry,
  placement: Placement,
): { segments: RouteSegment[]; warnings: string[] } {
  if (placement.radiusNm <= 0)
    return { segments: geometry.segments, warnings: [] };
  const radius = (placement.radiusNm * 1852) / placement.metersPerUnit,
    points = [geometry.segments[0].from, ...geometry.segments.map((s) => s.to)],
    out: RouteSegment[] = [];
  let previous = points[0];
  const failed: number[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1],
      b = points[i],
      c = points[i + 1],
      l1 = distance(a, b),
      l2 = distance(b, c);
    const u = { x: (b.x - a.x) / l1, y: (b.y - a.y) / l1 },
      v = { x: (c.x - b.x) / l2, y: (c.y - b.y) / l2 };
    const angle = Math.acos(Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y))),
      t = radius * Math.tan(angle / 2),
      s = geometry.segments[i - 1];
    if (angle < 0.04) {
      out.push({ ...s, from: previous, to: b });
      previous = b;
      continue;
    }
    if (
      !Number.isFinite(t) ||
      angle > 3.05 ||
      t > l1 * 0.45 ||
      t > l2 * 0.45 ||
      s.kind !== geometry.segments[i].kind
    ) {
      out.push({ ...s, from: previous, to: b });
      previous = b;
      failed.push(i);
      continue;
    }
    const entry = lerp(b, a, t / l1),
      exit = lerp(b, c, t / l2),
      sign = u.x * v.y - u.y * v.x > 0 ? 1 : -1,
      center = {
        x: entry.x - sign * u.y * radius,
        y: entry.y + sign * u.x * radius,
      };
    out.push({ ...s, from: previous, to: entry });
    let last = entry;
    const start = Math.atan2(entry.y - center.y, entry.x - center.x),
      n = Math.max(2, Math.ceil(angle / (Math.PI / 18)));
    for (let j = 1; j <= n; j++) {
      const p =
        j === n
          ? exit
          : {
              x: center.x + radius * Math.cos(start + (sign * angle * j) / n),
              y: center.y + radius * Math.sin(start + (sign * angle * j) / n),
            };
      out.push({ ...s, from: last, to: p });
      last = p;
    }
    previous = exit;
  }
  out.push({
    ...geometry.segments[geometry.segments.length - 1],
    from: previous,
    to: points[points.length - 1],
  });
  return {
    segments: out,
    warnings: failed.length
      ? [
          `${failed.length} turns could not fit the selected radius. Unrounded turn vertices: ${failed.slice(0, 25).join(", ")}${failed.length > 25 ? "…" : ""}.`,
        ]
      : [],
  };
}
export function projectRoute(
  geometry: RouteGeometry,
  placement: Placement,
): RoutePlan {
  if (!geometry.segments.length) throw new Error("Route is empty.");
  if (
    !Number.isFinite(placement.anchor.lat) ||
    Math.abs(placement.anchor.lat) > 85 ||
    !Number.isFinite(placement.anchor.lon) ||
    Math.abs(placement.anchor.lon) > 180
  )
    throw new Error(
      "Enter latitude between −85 and 85 and longitude between −180 and 180.",
    );
  if (!Number.isFinite(placement.metersPerUnit) || placement.metersPerUnit <= 0)
    throw new Error("Route scale must be positive.");
  const { segments, warnings } = roundedSegments(geometry, placement),
    b = geometry.bounds,
    origin =
      placement.mode === "start"
        ? (geometry.origin ?? segments[0].from)
        : { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 },
    a = (placement.rotation * Math.PI) / 180;
  const locate = (p: Point) => {
    const x = (p.x - origin.x) * placement.metersPerUnit,
      y = -(p.y - origin.y) * placement.metersPerUnit;
    return direct(
      placement.anchor,
      x * Math.cos(a) + y * Math.sin(a) + placement.offsetX,
      -x * Math.sin(a) + y * Math.cos(a) + placement.offsetY,
    );
  };
  const anchorLocal: Point = {
    x:
      origin.x +
      (-placement.offsetX * Math.cos(a) + placement.offsetY * Math.sin(a)) /
        placement.metersPerUnit,
    y:
      origin.y +
      (placement.offsetX * Math.sin(a) + placement.offsetY * Math.cos(a)) /
        placement.metersPerUnit,
  };
  const travelSegments = [...segments];
  const link = (points: Point[], kind: RouteSegment["kind"]): RouteSegment[] =>
    points
      .slice(1)
      .flatMap((to, i) =>
        distance(points[i], to) > 1e-7
          ? [{ from: points[i], to, kind, elementId: "anchor" }]
          : [],
      );
  const departure = placement.mode === "start" || placement.airport;
  const start = segments[0].from,
    end = segments[segments.length - 1].to;
  const hasDeparture = departure && distance(anchorLocal, start) > 1e-7;
  const hasReturn =
    placement.roundTrip &&
    placement.airport &&
    distance(end, anchorLocal) > 1e-7;
  const connect = (previous: Point[], next: Point[]) => {
    const from = previous.at(-1)!, to = next[0];
    const direct = distance(from, to) < 1e-7 ? [from] : [from, to];
    const sharp = previous.length > 1 && next.length > 1 &&
      (joinAngle(previous.at(-2)!, from, to) > 12 ||
        joinAngle(from, to, next[1]) > 12);
    if (geometry.variant === "shortest" || !sharp) return direct;
    if (!geometry.outlines) return connectionCurve(previous, next);
    return clearConnection(previous, next,
      geometry.outlines.map((points) => ({ points, closed: true })), true);
  };
  if (hasDeparture) {
    const curve = connect(
      [lerp(anchorLocal, start, -0.2), anchorLocal],
      [start, segments[0].to],
    );
    travelSegments.unshift(
      ...link(curve, placement.airport ? "airport" : "connection"),
    );
  }
  if (hasReturn) {
    const curve = connect(
      [segments[segments.length - 1].from, end],
      [anchorLocal, lerp(end, anchorLocal, 1.2)],
    );
    travelSegments.push(...link(curve, "airport"));
  }
  const toleranceNm = placement.waypointToleranceNm ?? 0.05;
  if (!Number.isFinite(toleranceNm) || toleranceNm < 0 || toleranceNm > 0.2)
    throw new Error("Waypoint tolerance must be between 0 and 0.2 NM.");
  // Cap relative error for small artwork as well as its physical distance.
  const tolerance = Math.min(
    (toleranceNm * 1852) / placement.metersPerUnit,
    Math.min(b.width, b.height) * 0.01,
  );
  const navigation = navigationSegments(travelSegments, tolerance);
  const coords = [
    locate(navigation[0].from),
    ...navigation.map((s) => locate(s.to)),
  ];
  // Avoid numerical inverse-rotation residue at the declared anchor.
  if (hasDeparture) coords[0] = { ...placement.anchor };
  if (hasReturn) coords[coords.length - 1] = { ...placement.anchor };
  const kinds = navigation.map((s) => s.kind);
  const waypoints: Waypoint[] = coords.map((p, i) => ({
    ...p,
    id: `SA${String(i + 1).padStart(4, "0")}`,
  }));
  let cumulativeNm = 0;
  const legs: Leg[] = waypoints.slice(1).map((to, i) => {
    const from = waypoints[i],
      r = inverse(from, to);
    cumulativeNm += r.distanceNm;
    return { index: i + 1, from, to, ...r, cumulativeNm, kind: kinds[i] };
  });
  if (Math.max(b.width, b.height) * placement.metersPerUnit > 1000000)
    warnings.push(
      "This artwork spans more than 1,000 km; map projection can change its appearance.",
    );
  return {
    waypoints,
    legs,
    distanceNm: cumulativeNm,
    warnings: [...geometry.warnings, ...warnings],
    geometry,
    placement: { ...placement, anchor: { ...placement.anchor } },
    algorithmVersion: "sky-art-2.1",
  };
}
