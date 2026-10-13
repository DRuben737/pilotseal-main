import { bounds, distance, lerp, pointInPolygon } from "./geometry";
import { connectionCurve, curveLength } from "./connections";
import type { Point, Stroke } from "./types";

export const edgeKey = (a: Point, b: Point) => `${a.x},${a.y}:${b.x},${b.y}`;
const area = (points: Point[]) =>
  points.reduce((sum, p, i) => {
    const next = points[(i + 1) % points.length];
    return sum + p.x * next.y - next.x * p.y;
  }, 0);

/** Join counters through a local slit, so all external entries/exits stay outside. */
export function joinCounters(strokes: Stroke[]): {
  strokes: Stroke[];
  bridges: Set<string>;
} {
  const bridges = new Set<string>();
  const result: Stroke[] = strokes
    .filter((s) => !s.hole)
    .map((s) => ({ ...s, points: [...s.points], externalPorts: s.points }));
  for (const hole of strokes.filter((s) => s.hole)) {
    const owner = result.find(
      (s) => s.closed && pointInPolygon(hole.points[0], s.points),
    );
    if (!owner) {
      result.push(hole);
      continue;
    }
    const inner =
      area(owner.points) * area(hole.points) > 0
        ? [...hole.points].reverse()
        : hole.points;
    // Prefer nearby mid-edge portals; a counter is never entered from another glyph.
    let oi = 0,
      hi = 0,
      nearest = Infinity;
    for (let i = 0; i < owner.points.length; i++) {
      const a = lerp(
        owner.points[i],
        owner.points[(i + 1) % owner.points.length],
        0.5,
      );
      for (let j = 0; j < inner.length; j++) {
        const b = lerp(inner[j], inner[(j + 1) % inner.length], 0.5);
        const d = distance(a, b);
        if (d < nearest) {
          oi = i;
          hi = j;
          nearest = d;
        }
      }
    }
    const outerA = owner.points[oi],
      outerB = owner.points[(oi + 1) % owner.points.length];
    const innerA = inner[hi],
      innerB = inner[(hi + 1) % inner.length];
    const span = bounds(inner),
      slit = Math.min(
        nearest * 0.15,
        Math.max(span.width, span.height) * 0.008,
      );
    const cut = (a: Point, b: Point) => {
      const delta = Math.min(0.2, slit / Math.max(distance(a, b), 1e-9));
      return [lerp(a, b, 0.5 - delta), lerp(a, b, 0.5 + delta)];
    };
    const [exit, reentry] = cut(outerA, outerB),
      [innerExit, innerEntry] = cut(innerA, innerB);
    const innerPath = [
      innerEntry,
      ...Array.from(
        { length: inner.length },
        (_, i) => inner[(hi + 1 + i) % inner.length],
      ),
      innerExit,
    ];
    const enter = connectionCurve([outerA, exit], innerPath);
    const leave = connectionCurve(innerPath, [reentry, outerB]);
    // Both bridges form the sides of one short slit, with inherited tangents.
    for (const curve of [enter, leave])
      for (let i = 1; i < curve.length; i++) {
        bridges.add(edgeKey(curve[i - 1], curve[i]));
        bridges.add(edgeKey(curve[i], curve[i - 1]));
      }
    if (!Number.isFinite(curveLength(enter) + curveLength(leave)))
      throw new Error("Could not connect an inner contour.");
    owner.points = [
      ...owner.points.slice(0, oi + 1),
      ...enter,
      ...innerPath.slice(1),
      ...leave.slice(1),
      ...owner.points.slice(oi + 1),
    ];
  }
  for (const stroke of result) {
    if (!stroke.closed || !stroke.externalPorts) continue;
    const exterior = new Set(stroke.externalPorts);
    const edges = stroke.points.flatMap((from, i) => {
      const to = stroke.points[(i + 1) % stroke.points.length];
      return exterior.has(from) && exterior.has(to)
        ? [{ i, point: lerp(from, to, 0.5) }]
        : [];
    });
    if (!edges.length) continue;
    const ports = [
      edges.reduce((a, b) => (b.point.x < a.point.x ? b : a)),
      edges.reduce((a, b) => (b.point.x > a.point.x ? b : a)),
      edges.reduce((a, b) => (b.point.y < a.point.y ? b : a)),
      edges.reduce((a, b) => (b.point.y > a.point.y ? b : a)),
    ];
    const inserts = new Map(ports.map((p) => [p.i, p.point]));
    stroke.points = stroke.points.flatMap((point, i) =>
      inserts.has(i) ? [point, inserts.get(i)!] : [point],
    );
    stroke.preferredPorts = [...inserts.values()];
    stroke.externalPorts = [...stroke.externalPorts, ...stroke.preferredPorts];
  }
  return { strokes: result, bridges };
}
