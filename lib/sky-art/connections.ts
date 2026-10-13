import type { Point } from "./types";
import { distance, lerp, simplify } from "./geometry";
function unit(a: Point, b: Point): Point {
  const d = distance(a, b);
  return d > 1e-9 ? { x: (b.x - a.x) / d, y: (b.y - a.y) / d } : { x: 1, y: 0 };
}
function cubic(a: Point, c1: Point, c2: Point, b: Point, n: number): Point[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n,
      s = 1 - t;
    return {
      x:
        s * s * s * a.x +
        3 * s * s * t * c1.x +
        3 * s * t * t * c2.x +
        t * t * t * b.x,
      y:
        s * s * s * a.y +
        3 * s * s * t * c1.y +
        3 * s * t * t * c2.y +
        t * t * t * b.y,
    };
  });
}
/** One pen-down transition with endpoint tangents inherited from both artwork paths. */
export function connectionCurve(
  previous: Point[],
  next: Point[],
  coarse = false,
): Point[] {
  const a = previous[previous.length - 1],
    b = next[0],
    u = unit(previous[Math.max(0, previous.length - 2)], a),
    v = unit(b, next[1] ?? b),
    d = distance(a, b),
    chord = unit(a, b),
    alignment = u.x * v.x + u.y * v.y;
  if (d < 1e-7 && alignment > 0.999) return [a];
  const edge = Math.max(
      1e-3,
      Math.min(
        distance(previous[Math.max(0, previous.length - 2)], a),
        distance(b, next[1] ?? b),
      ),
    ),
    handle = Math.min(d * 0.12, Math.max(edge * 0.6, 1e-3));
  const c1 = { x: a.x + u.x * handle, y: a.y + u.y * handle },
    c2 = { x: b.x - v.x * handle, y: b.y - v.y * handle };
  let points = cubic(a, c1, c2, b, coarse ? 8 : 48);
  if (!coarse && d > 1e-7) {
    const sample = (t: number) => {
      const left = lerp(lerp(a, c1, t), lerp(c1, c2, t), t);
      const right = lerp(lerp(c1, c2, t), lerp(c2, b, t), t);
      return lerp(left, right, t);
    };
    const t = Math.min(1 / 96, handle / (d * 24));
    points = [a, sample(t), ...points.slice(1, -1), sample(1 - t), b];
  }
  const sourceOpposes = u.x * chord.x + u.y * chord.y < -0.6,
    entryOpposes = v.x * chord.x + v.y * chord.y < -0.6;
  const nearlyCollinear =
    Math.abs(u.x * chord.y - u.y * chord.x) < 0.12 &&
    Math.abs(v.x * chord.y - v.y * chord.x) < 0.12;
  // Collinear reversal needs a real lateral loop; a cubic on the same line has a cusp.
  if (d < 1e-7 || (nearlyCollinear && (sourceOpposes || entryOpposes))) {
    const reference = d < 1e-7 ? u : chord,
      offset = Math.max(d * 0.4, edge * 0.8),
      mid = {
        x: (a.x + b.x) / 2 - reference.y * offset,
        y: (a.y + b.y) / 2 + reference.x * offset,
      },
      tangent = d < 1e-7 ? { x: -u.x, y: -u.y } : chord,
      h = Math.max(d * 0.22, edge * 0.5);
    const first = cubic(
      a,
      { x: a.x + u.x * h, y: a.y + u.y * h },
      { x: mid.x - tangent.x * h, y: mid.y - tangent.y * h },
      mid,
      coarse ? 8 : 32,
    );
    const second = cubic(
      mid,
      { x: mid.x + tangent.x * h, y: mid.y + tangent.y * h },
      { x: b.x - v.x * h, y: b.y - v.y * h },
      b,
      coarse ? 8 : 32,
    );
    points = [...first, ...second.slice(1)];
  }
  if (coarse) return points;
  // Keep the endpoint tangent samples while simplifying only the curve interior.
  const tolerance = Math.max(
    1e-5,
    Math.min(Math.max(d, edge) * 0.002, edge * 0.04),
  );
  return [
    points[0],
    ...simplify(
      points
        .slice(1, -1)
        .filter((p) => distance(p, a) > 1e-6 && distance(p, b) > 1e-6),
      tolerance,
    ),
    points[points.length - 1],
  ];
}
export function curveLength(points: Point[]): number {
  return points.slice(1).reduce((sum, p, i) => sum + distance(points[i], p), 0);
}
export function joinAngle(a: Point, b: Point, c: Point): number {
  const u = unit(a, b),
    v = unit(b, c);
  return (
    (Math.acos(Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y))) * 180) /
    Math.PI
  );
}
export function connectionMidpoint(points: Point[]): Point {
  return lerp(
    points[Math.floor((points.length - 1) / 2)],
    points[Math.ceil((points.length - 1) / 2)],
    0.5,
  );
}
