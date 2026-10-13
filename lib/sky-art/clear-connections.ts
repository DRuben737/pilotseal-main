import { connectionCurve, curveLength } from "./connections";
import { bounds, distance, intersects, lerp, pointInPolygon } from "./geometry";
import type { Point, Stroke } from "./types";

type Outline = Pick<Stroke, "points" | "closed">;
const shapeCache = new WeakMap<
  Outline,
  {
    stroke: Outline;
    b: ReturnType<typeof bounds>;
    edges: {
      a: Point;
      b: Point;
      minX: number;
      maxX: number;
      minY: number;
      maxY: number;
    }[];
  }
>();
function shape(stroke: Outline) {
  const old = shapeCache.get(stroke);
  if (old) return old;
  const edges = stroke.points.map((a, i) => {
    const b = stroke.points[(i + 1) % stroke.points.length];
    return {
      a,
      b,
      minX: Math.min(a.x, b.x),
      maxX: Math.max(a.x, b.x),
      minY: Math.min(a.y, b.y),
      maxY: Math.max(a.y, b.y),
    };
  });
  const result = { stroke, b: bounds(stroke.points), edges };
  shapeCache.set(stroke, result);
  return result;
}
function crossingPoint(a: Point, b: Point, c: Point, d: Point) {
  const u = { x: b.x - a.x, y: b.y - a.y },
    v = { x: d.x - c.x, y: d.y - c.y };
  const t = ((c.x - a.x) * v.y - (c.y - a.y) * v.x) / (u.x * v.y - u.y * v.x);
  return lerp(a, b, t);
}
function segmentDistance(p: Point, a: Point, b: Point) {
  const length = distance(a, b) ** 2;
  const t = length
    ? Math.max(
        0,
        Math.min(
          1,
          ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / length,
        ),
      )
    : 0;
  return distance(p, lerp(a, b, t));
}
/** Keep cross-element travel outside closed silhouettes when both ports are outside. */
export function clearConnection(
  previous: Point[],
  next: Point[],
  strokes: Pick<Stroke, "points" | "closed">[],
): Point[] {
  const a = previous.at(-1)!,
    b = next[0],
    direct = connectionCurve(previous, next);
  const region = bounds(direct);
  const blockers = strokes
    .filter((s) => s.closed)
    .map(shape)
    .filter(({ stroke, b: o }) => {
      if (
        region.maxX < o.minX ||
        region.minX > o.maxX ||
        region.maxY < o.minY ||
        region.minY > o.maxY
      )
        return false;
      const clearance = Math.max(o.width, o.height) * 0.012;
      const inside = (p: Point) =>
        pointInPolygon(p, stroke.points) &&
        stroke.points.every(
          (q, i) =>
            segmentDistance(
              p,
              q,
              stroke.points[(i + 1) % stroke.points.length],
            ) > clearance,
        );
      return !inside(a) && !inside(b);
    });
  const crossings = (curve: Point[]) =>
    blockers.reduce((count, { edges, b: o }) => {
      const clearance = Math.max(o.width, o.height) * 0.012;
      for (let i = 1; i < curve.length; i++)
        for (const edge of edges) {
          const from = curve[i - 1],
            to = curve[i];
          if (
            Math.max(from.x, to.x) < edge.minX ||
            Math.min(from.x, to.x) > edge.maxX ||
            Math.max(from.y, to.y) < edge.minY ||
            Math.min(from.y, to.y) > edge.maxY
          )
            continue;
          const c = edge.a,
            d = edge.b;
          if (!intersects(curve[i - 1], curve[i], c, d)) continue;
          const p = crossingPoint(curve[i - 1], curve[i], c, d);
          if (distance(p, a) > clearance && distance(p, b) > clearance) count++;
        }
      return count;
    }, 0);
  const original = crossings(direct);
  if (!original) return direct;
  let best = direct,
    bestCross = original,
    bestLength = curveLength(direct);
  for (const { b: o } of blockers) {
    const margin = Math.max(1, Math.max(o.width, o.height) * 0.06);
    const corridors = [
      [
        { x: o.minX - margin, y: a.y },
        { x: o.minX - margin, y: b.y },
      ],
      [
        { x: o.maxX + margin, y: a.y },
        { x: o.maxX + margin, y: b.y },
      ],
      [
        { x: a.x, y: o.minY - margin },
        { x: b.x, y: o.minY - margin },
      ],
      [
        { x: a.x, y: o.maxY + margin },
        { x: b.x, y: o.maxY + margin },
      ],
    ];
    for (const corridor of corridors) {
      const knots = [a, ...corridor, b].filter(
        (p, i, ps) => i === 0 || distance(p, ps[i - 1]) > 1e-6,
      );
      const tangents = knots.map((p, i) => {
        const before = i === 0 ? (previous.at(-2) ?? p) : knots[i - 1];
        const after = i === knots.length - 1 ? (next[1] ?? p) : knots[i + 1];
        if (i === 0) return { x: p.x - before.x, y: p.y - before.y };
        if (i === knots.length - 1)
          return { x: after.x - p.x, y: after.y - p.y };
        const l = distance(before, p) || 1,
          r = distance(p, after) || 1;
        return {
          x: (p.x - before.x) / l + (after.x - p.x) / r,
          y: (p.y - before.y) / l + (after.y - p.y) / r,
        };
      });
      const curve: Point[] = [a];
      for (let i = 1; i < knots.length; i++) {
        const from = knots[i - 1],
          to = knots[i],
          u = tangents[i - 1],
          v = tangents[i];
        const scale = Math.min(distance(from, to) * 0.2, margin);
        const ul = Math.hypot(u.x, u.y) || 1,
          vl = Math.hypot(v.x, v.y) || 1;
        curve.push(
          ...connectionCurve(
            [
              {
                x: from.x - (u.x / ul) * scale,
                y: from.y - (u.y / ul) * scale,
              },
              from,
            ],
            [
              to,
              { x: to.x + (v.x / vl) * scale, y: to.y + (v.y / vl) * scale },
            ],
          ).slice(1),
        );
      }
      const count = crossings(curve),
        length = curveLength(curve);
      if (count < bestCross || (count === bestCross && length < bestLength)) {
        best = curve;
        bestCross = count;
        bestLength = length;
      }
    }
  }
  return best;
}
