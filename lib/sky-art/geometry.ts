import type { Bounds, Element, Point, Stroke } from "./types";
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
export function bounds(points: Point[]): Bounds {
  if (!points.length)
    return { minX: 0, minY: 0, maxX: 1, maxY: 1, width: 1, height: 1 };
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}
export function transform(p: Point, e: Element): Point {
  const a = (e.rotation * Math.PI) / 180,
    x = p.x * e.scale,
    y = p.y * e.scale;
  return {
    x: e.x + x * Math.cos(a) - y * Math.sin(a),
    y: e.y + x * Math.sin(a) + y * Math.cos(a),
  };
}
export function pointInPolygon(p: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}
export function intersects(a: Point, b: Point, c: Point, d: Point): boolean {
  const cross = (p: Point, q: Point, r: Point) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return (
    cross(a, b, c) * cross(a, b, d) < -1e-8 &&
    cross(c, d, a) * cross(c, d, b) < -1e-8
  );
}
export function simplify(points: Point[], tolerance = 0.35): Point[] {
  if (points.length <= 2) return points;
  const a = points[0],
    b = points[points.length - 1],
    len = distance(a, b) ** 2;
  let far = 0,
    index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const t = len
      ? Math.max(
          0,
          Math.min(
            1,
            ((points[i].x - a.x) * (b.x - a.x) +
              (points[i].y - a.y) * (b.y - a.y)) /
              len,
          ),
        )
      : 0;
    const d = distance(points[i], lerp(a, b, t));
    if (d > far) {
      far = d;
      index = i;
    }
  }
  if (far <= tolerance) return [a, b];
  return [
    ...simplify(points.slice(0, index + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(index), tolerance),
  ];
}
export function pathData(points: Point[], closed = false): string {
  return (
    points
      .map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(3)},${p.y.toFixed(3)}`)
      .join(" ") + (closed ? " Z" : "")
  );
}
export function normalizeStrokes(strokes: Stroke[]): Stroke[] {
  const b = bounds(strokes.flatMap((s) => s.points)),
    center = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  return strokes.map((s) => ({
    ...s,
    points: s.points.map((p) => ({ x: p.x - center.x, y: p.y - center.y })),
  }));
}
