import { distance, simplify } from "./geometry";
import type { Point, RouteSegment } from "./types";

/** Simplify in route order, retaining visits, corners and transition tangents. */
export function navigationSegments(
  segments: RouteSegment[],
  tolerance: number,
): RouteSegment[] {
  if (!segments.length || tolerance <= 0) return segments;
  const points = [segments[0].from, ...segments.map((s) => s.to)];
  const keep = new Set([0, points.length - 1]);
  const visits = new Map<string, number[]>();
  const key = (p: Point) => `${p.x.toFixed(7)},${p.y.toFixed(7)}`;
  points.forEach((p, i) => {
    const k = key(p);
    visits.set(k, [...(visits.get(k) ?? []), i]);
  });
  for (const indices of visits.values())
    if (indices.length > 1) indices.forEach((i) => keep.add(i));
  for (let i = 1; i < points.length - 1; i++) {
    const before = segments[i - 1],
      after = segments[i];
    if (before.kind !== after.kind || before.elementId !== after.elementId) {
      keep.add(i);
    }
    if (before.manualConnector && after.manualConnector &&
      before.connectorId === after.connectorId)
      keep.add(i);
    const a = points[i - 1],
      b = points[i],
      c = points[i + 1];
    const lengths = distance(a, b) * distance(b, c);
    const cosine = lengths
      ? ((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)) / lengths
      : -1;
    if (cosine < Math.cos(Math.PI / 4)) keep.add(i);
  }
  const boundaries = [...keep].sort((a, b) => a - b);
  const result: RouteSegment[] = [];
  for (let i = 1; i < boundaries.length; i++) {
    const start = boundaries[i - 1],
      end = boundaries[i];
    const reduced = simplify(points.slice(start, end + 1), tolerance);
    for (let j = 1; j < reduced.length; j++)
      result.push({ ...segments[start], from: reduced[j - 1], to: reduced[j] });
  }
  return result;
}
