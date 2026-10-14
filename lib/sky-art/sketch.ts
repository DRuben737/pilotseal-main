import { bounds, distance, intersects, simplify } from "./geometry";
import type { Point, SketchStroke } from "./types";

export const MAX_SKETCH_STROKES = 40;
export const MAX_SKETCH_SAMPLES = 1200;

export type HeldShape = { kind: "line" | "orthogonal" | "arc" | "ellipse" | "triangle" | "rectangle" | "square" | "polygon" | "star" | "heart" | "bubble" | "cloud" | "arrow"; points: Point[]; closed: boolean };

export function strokeLength(points: Point[]): number {
  return points.slice(1).reduce((sum, p, i) => sum + distance(points[i], p), 0);
}

function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1,
    ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return distance(p, { x: a.x + dx * t, y: a.y + dy * t });
}

function signedArea(points: Point[]): number {
  return points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length];
    return sum + p.x * q.y - q.x * p.y;
  }, 0) / 2;
}

function hasCrossing(points: Point[], diagonal: number): boolean {
  const line = simplify(points, diagonal * 0.012);
  for (let i = 0; i < line.length - 1; i++)
    for (let j = i + 2; j < line.length - 1; j++)
      if (intersects(line[i], line[i + 1], line[j], line[j + 1]) &&
          Math.min(
            segmentDistance(line[i], line[j], line[j + 1]),
            segmentDistance(line[i + 1], line[j], line[j + 1]),
            segmentDistance(line[j], line[i], line[i + 1]),
            segmentDistance(line[j + 1], line[i], line[i + 1]),
          ) > diagonal * 0.035) return true;
  return false;
}

function resampleClosed(points: Point[], count: number): Point[] {
  const closed = [...points, points[0]];
  const cumulative = [0];
  for (let i = 1; i < closed.length; i++)
    cumulative.push(cumulative[i - 1] + distance(closed[i - 1], closed[i]));
  const total = cumulative.at(-1)!;
  let edge = 1;
  return Array.from({ length: count }, (_, i) => {
    const target = total * i / count;
    while (edge < cumulative.length - 1 && cumulative[edge] < target) edge++;
    const a = closed[edge - 1], b = closed[edge];
    const t = (target - cumulative[edge - 1]) /
      (cumulative[edge] - cumulative[edge - 1] || 1);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  });
}

function isConvex(points: Point[]): boolean {
  let sign = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length],
      c = points[(i + 2) % points.length];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-6) return false;
    if (sign && Math.sign(cross) !== sign) return false;
    sign = Math.sign(cross);
  }
  return true;
}

function straightCoverage(points: Point[]): number {
  const sample = resampleClosed(points, 64);
  let straight = 0;
  for (let i = 0; i < sample.length; i++) {
    const before = sample[(i + 60) % 64], at = sample[i], after = sample[(i + 4) % 64];
    const ax = at.x - before.x, ay = at.y - before.y;
    const bx = after.x - at.x, by = after.y - at.y;
    const turn = Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by));
    if (turn < 0.16) straight++;
  }
  return straight / sample.length;
}

function removeFlatCorners(points: Point[], diagonal: number): Point[] {
  let result = points;
  for (let pass = 0; pass < 3; pass++) {
    const index = result.findIndex((p, i) =>
      segmentDistance(p, result[(i + result.length - 1) % result.length],
        result[(i + 1) % result.length]) < diagonal * 0.025);
    if (index < 0 || result.length <= 3) break;
    result = result.filter((_, i) => i !== index);
  }
  return result;
}

function regularizePolygon(vertices: Point[]): Point[] {
  const count = vertices.length;
  const center = { x: vertices.reduce((sum, p) => sum + p.x, 0) / count,
    y: vertices.reduce((sum, p) => sum + p.y, 0) / count };
  const radii = vertices.map((p) => distance(p, center));
  const radius = radii.reduce((sum, r) => sum + r, 0) / count;
  if (Math.max(...radii.map((r) => Math.abs(r - radius))) > radius * 0.18)
    return vertices;
  const direction = Math.sign(signedArea(vertices));
  let cosine = 0, sine = 0;
  for (let i = 0; i < count; i++) {
    const angle = Math.atan2(vertices[i].y - center.y, vertices[i].x - center.x) -
      direction * 2 * Math.PI * i / count;
    cosine += Math.cos(angle);
    sine += Math.sin(angle);
  }
  const phase = Math.atan2(sine, cosine);
  const fitted = vertices.map((_, i) => {
    const angle = phase + direction * 2 * Math.PI * i / count;
    return { x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle) };
  });
  return Math.max(...vertices.map((p, i) => distance(p, fitted[i]))) < radius * 0.2
    ? fitted : vertices;
}

function polygonFit(points: Point[], count: number, diagonal: number): HeldShape | null {
  if (count <= 4 && straightCoverage(points) < 0.3) return null;
  const loop = [...points, points[0]];
  for (const tolerance of [0.055, 0.075, 0.1, 0.13]) {
    const candidate = simplify(loop, diagonal * tolerance);
    let vertices = candidate.slice(0, -1);
    if (count >= 5) vertices = removeFlatCorners(vertices, diagonal);
    if (vertices.length === count + 1 &&
        segmentDistance(vertices[0], vertices.at(-1)!, vertices[1]) < diagonal * 0.08)
      vertices = vertices.slice(1);
    if (vertices.length !== count) continue;
    if (count >= 5 && !isConvex(vertices)) continue;
    if (count === 4) {
      const sides = vertices.map((p, i) => ({
        x: vertices[(i + 1) % 4].x - p.x,
        y: vertices[(i + 1) % 4].y - p.y,
      }));
      const lengths = sides.map((side) => Math.hypot(side.x, side.y));
      if (Math.min(...lengths) < diagonal * 0.12) continue;
      const cornerError = sides.map((side, i) => {
        const next = sides[(i + 1) % 4];
        return Math.abs(side.x * next.x + side.y * next.y) /
          (lengths[i] * lengths[(i + 1) % 4]);
      });
      if (Math.max(...cornerError) > 0.28) continue;
      const axis = {
        x: vertices[1].x - vertices[0].x - vertices[3].x + vertices[2].x,
        y: vertices[1].y - vertices[0].y - vertices[3].y + vertices[2].y,
      };
      const length = Math.hypot(axis.x, axis.y);
      if (length < diagonal * 0.2) continue;
      const ux = axis.x / length, uy = axis.y / length;
      const vx = -uy, vy = ux;
      const projected = points.map((p) => ({ u: p.x * ux + p.y * uy, v: p.x * vx + p.y * vy }));
      const minU = Math.min(...projected.map((p) => p.u));
      const maxU = Math.max(...projected.map((p) => p.u));
      const minV = Math.min(...projected.map((p) => p.v));
      const maxV = Math.max(...projected.map((p) => p.v));
      const corners = [[minU, minV], [maxU, minV], [maxU, maxV], [minU, maxV]]
        .map(([u, v]) => ({ x: u * ux + v * vx, y: u * uy + v * vy }));
      if (signedArea(corners) * signedArea(points) < 0) corners.reverse();
      const first = corners.reduce((best, p, i) =>
        distance(p, points[0]) < distance(corners[best], points[0]) ? i : best, 0);
      vertices = [...corners.slice(first), ...corners.slice(0, first)];
    }
    const residuals = points.map((p) => Math.min(...vertices.map((v, i) =>
      segmentDistance(p, v, vertices[(i + 1) % count]))));
    const mean = residuals.reduce((sum, d) => sum + d, 0) / residuals.length;
    const maxMeanError = count >= 5 ? 0.014 : 0.035;
    if (mean < diagonal * maxMeanError &&
        Math.max(...residuals) < diagonal * (count >= 5 ? 0.055 : 0.12)) {
      if (count === 4) {
        const a = { x: vertices[1].x - vertices[0].x,
          y: vertices[1].y - vertices[0].y };
        const b = { x: vertices[3].x - vertices[0].x,
          y: vertices[3].y - vertices[0].y };
        const lengthA = Math.hypot(a.x, a.y), lengthB = Math.hypot(b.x, b.y);
        if (Math.max(lengthA, lengthB) / Math.min(lengthA, lengthB) < 1.16) {
          const center = { x: vertices.reduce((sum, p) => sum + p.x, 0) / 4,
            y: vertices.reduce((sum, p) => sum + p.y, 0) / 4 };
          const half = (lengthA + lengthB) / 4;
          const u = { x: a.x / lengthA * half, y: a.y / lengthA * half };
          const v = { x: b.x / lengthB * half, y: b.y / lengthB * half };
          const square = [
            { x: center.x - u.x - v.x, y: center.y - u.y - v.y },
            { x: center.x + u.x - v.x, y: center.y + u.y - v.y },
            { x: center.x + u.x + v.x, y: center.y + u.y + v.y },
            { x: center.x - u.x + v.x, y: center.y - u.y + v.y },
          ];
          const shape: HeldShape = { kind: "square", points: square, closed: true };
          if (fitResidual(points, shape) < diagonal * 0.05) return shape;
        }
      }
      const regularized = count === 3 || count >= 5 ? regularizePolygon(vertices) : vertices;
      const useRegular = count !== 3 || regularized === vertices ||
        fitResidual(points, { kind: "triangle", points: regularized, closed: true }) < diagonal * 0.05;
      return { kind: count === 3 ? "triangle" : count === 4 ? "rectangle" : "polygon",
        points: useRegular ? regularized : vertices, closed: true };
    }
  }
  return null;
}

function starFit(points: Point[], diagonal: number): HeldShape | null {
  const loop = [...points, points[0]];
  for (const tolerance of [0.045, 0.065, 0.085]) {
    const vertices = removeFlatCorners(simplify(loop, diagonal * tolerance).slice(0, -1), diagonal);
    if (vertices.length !== 10) continue;
    const center = {
      x: vertices.reduce((sum, p) => sum + p.x, 0) / 10,
      y: vertices.reduce((sum, p) => sum + p.y, 0) / 10,
    };
    const radii = vertices.map((p) => distance(p, center));
    const even = radii.filter((_, i) => i % 2 === 0);
    const odd = radii.filter((_, i) => i % 2 === 1);
    const mean = (values: number[]) => values.reduce((sum, n) => sum + n, 0) / values.length;
    const outerIsEven = mean(even) > mean(odd);
    const outer = mean(outerIsEven ? even : odd);
    const inner = mean(outerIsEven ? odd : even);
    if (inner / outer < 0.25 || inner / outer > 0.78 ||
        Math.max(...radii.map((r, i) => Math.abs(r - (i % 2 === (outerIsEven ? 0 : 1) ? outer : inner)))) > outer * 0.32)
      continue;
    const angles = vertices.map((p) => Math.atan2(p.y - center.y, p.x - center.x));
    const turns = angles.map((a, i) => {
      let delta = angles[(i + 1) % 10] - a;
      while (delta <= -Math.PI) delta += Math.PI * 2;
      while (delta > Math.PI) delta -= Math.PI * 2;
      return delta;
    });
    const direction = Math.sign(turns[0]);
    if (!direction || turns.some((turn) => Math.sign(turn) !== direction ||
        Math.abs(Math.abs(turn) - Math.PI / 5) > 0.36)) continue;
    const firstAngle = angles[0];
    const fitted = vertices.map((_, i) => {
      const angle = firstAngle + direction * i * Math.PI / 5;
      const r = i % 2 === (outerIsEven ? 0 : 1) ? outer : inner;
      return { x: center.x + r * Math.cos(angle), y: center.y + r * Math.sin(angle) };
    });
    const shape: HeldShape = { kind: "star", points: fitted, closed: true };
    if (fitResidual(points, shape) < diagonal * 0.055) return shape;
  }
  return null;
}

function pentagramFit(points: Point[], diagonal: number): HeldShape | null {
  const loop = [...points, points[0]];
  for (const tolerance of [0.045, 0.07, 0.1]) {
    const vertices = removeFlatCorners(simplify(loop, diagonal * tolerance).slice(0, -1), diagonal);
    if (vertices.length !== 5) continue;
    const center = {
      x: vertices.reduce((sum, p) => sum + p.x, 0) / 5,
      y: vertices.reduce((sum, p) => sum + p.y, 0) / 5,
    };
    const radii = vertices.map((p) => distance(p, center));
    const radius = radii.reduce((sum, r) => sum + r, 0) / 5;
    if (Math.max(...radii.map((r) => Math.abs(r - radius))) > radius * 0.27) continue;
    const angles = vertices.map((p) => Math.atan2(p.y - center.y, p.x - center.x));
    const turns = angles.map((a, i) => {
      let delta = angles[(i + 1) % 5] - a;
      while (delta <= -Math.PI) delta += Math.PI * 2;
      while (delta > Math.PI) delta -= Math.PI * 2;
      return delta;
    });
    const direction = Math.sign(turns[0]);
    if (!direction || turns.some((turn) => Math.sign(turn) !== direction ||
        Math.abs(Math.abs(turn) - Math.PI * 4 / 5) > 0.3)) continue;
    const fitted = vertices.map((_, i) => {
      const angle = angles[0] + direction * i * Math.PI * 4 / 5;
      return { x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle) };
    });
    const shape: HeldShape = { kind: "star", points: fitted, closed: true };
    if (fitResidual(points, shape) < diagonal * 0.05) return shape;
  }
  return null;
}

function heartFit(points: Point[], diagonal: number): HeldShape | null {
  const vertices = simplify([...points, points[0]], diagonal * 0.05).slice(0, -1);
  if (vertices.length < 6 || vertices.length > 14) return null;
  const orientation = Math.sign(signedArea(vertices));
  if (!orientation) return null;
  const center = {
    x: vertices.reduce((sum, p) => sum + p.x, 0) / vertices.length,
    y: vertices.reduce((sum, p) => sum + p.y, 0) / vertices.length,
  };
  const reflex = vertices.map((p, i) => {
    const previous = vertices[(i + vertices.length - 1) % vertices.length];
    const next = vertices[(i + 1) % vertices.length];
    const ax = p.x - previous.x, ay = p.y - previous.y;
    const bx = next.x - p.x, by = next.y - p.y;
    return orientation * (ax * by - ay * bx) /
      (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1);
  });
  const notchIndex = reflex.indexOf(Math.min(...reflex));
  if (reflex[notchIndex] > -0.35 || reflex.filter((turn) => turn < -0.35).length !== 1)
    return null;
  const notch = vertices[notchIndex];
  const towardCenter = { x: center.x - notch.x, y: center.y - notch.y };
  const axisLength = Math.hypot(towardCenter.x, towardCenter.y);
  if (axisLength < diagonal * 0.02) return null;
  const vy = { x: towardCenter.x / axisLength, y: towardCenter.y / axisLength };
  const tip = vertices.reduce((best, p) =>
    (p.x - notch.x) * vy.x + (p.y - notch.y) * vy.y >
    (best.x - notch.x) * vy.x + (best.y - notch.y) * vy.y ? p : best);
  const height = distance(notch, tip);
  if (height < diagonal * 0.48) return null;
  const down = { x: (tip.x - notch.x) / height, y: (tip.y - notch.y) / height };
  const right = { x: down.y, y: -down.x };
  const projected = resampleClosed(points, 64).map((p) => ({
    x: (p.x - notch.x) * right.x + (p.y - notch.y) * right.y,
    y: (p.x - notch.x) * down.x + (p.y - notch.y) * down.y,
  }));
  const leftWidth = -Math.min(...projected.map((p) => p.x));
  const rightWidth = Math.max(...projected.map((p) => p.x));
  if (Math.min(leftWidth, rightWidth) < height * 0.22 ||
      Math.max(leftWidth, rightWidth) / Math.min(leftWidth, rightWidth) > 1.45)
    return null;
  const width = (leftWidth + rightWidth) / 2;
  const cubic = (a: Point, b: Point, c: Point, d: Point, t: number): Point => {
    const s = 1 - t;
    return { x: s ** 3 * a.x + 3 * s ** 2 * t * b.x + 3 * s * t ** 2 * c.x + t ** 3 * d.x,
      y: s ** 3 * a.y + 3 * s ** 2 * t * b.y + 3 * s * t ** 2 * c.y + t ** 3 * d.y };
  };
  const curves: [Point, Point, Point, Point][] = [
    [{ x: 0, y: 0 }, { x: -0.28, y: -0.38 }, { x: -1.1, y: -0.22 }, { x: -1, y: 0.24 }],
    [{ x: -1, y: 0.24 }, { x: -0.92, y: 0.58 }, { x: -0.22, y: 0.94 }, { x: 0, y: 1 }],
    [{ x: 0, y: 1 }, { x: 0.22, y: 0.94 }, { x: 0.92, y: 0.58 }, { x: 1, y: 0.24 }],
    [{ x: 1, y: 0.24 }, { x: 1.1, y: -0.22 }, { x: 0.28, y: -0.38 }, { x: 0, y: 0 }],
  ];
  let fitted = curves.flatMap(([a, b, c, d]) => Array.from({ length: 16 }, (_, i) => {
    const p = cubic(a, b, c, d, i / 16);
    return { x: notch.x + p.x * width * right.x + p.y * height * down.x,
      y: notch.y + p.x * width * right.y + p.y * height * down.y };
  }));
  if (signedArea(fitted) * signedArea(points) < 0) fitted = fitted.reverse();
  const startIndex = fitted.reduce((best, p, i) =>
    distance(p, points[0]) < distance(fitted[best], points[0]) ? i : best, 0);
  fitted = [...fitted.slice(startIndex), ...fitted.slice(0, startIndex)];
  const shape: HeldShape = { kind: "heart", points: fitted, closed: true };
  return fitResidual(points, shape) < diagonal * 0.14 ? shape : null;
}

function bubbleFit(points: Point[], diagonal: number): HeldShape | null {
  const loop = [...points, points[0]];
  for (const tolerance of [0.035, 0.05, 0.07]) {
    const vertices = removeFlatCorners(simplify(loop, diagonal * tolerance).slice(0, -1), diagonal);
    if (vertices.length !== 7) continue;
    const orientation = Math.sign(signedArea(vertices));
    if (!orientation) continue;
    const turns = vertices.map((p, i) => {
      const before = vertices[(i + 6) % 7], after = vertices[(i + 1) % 7];
      return orientation * ((p.x - before.x) * (after.y - p.y) -
        (p.y - before.y) * (after.x - p.x)) /
        (distance(before, p) * distance(p, after) || 1);
    });
    const reflex = turns.flatMap((turn, i) => turn < -0.25 ? [i] : []);
    if (reflex.length !== 2) continue;
    const firstReflex = reflex.find((index) => reflex.includes((index + 2) % 7));
    if (firstReflex === undefined) continue;
    const tipIndex = (firstReflex + 1) % 7;
    const at = (offset: number) => vertices[(tipIndex + offset + 7) % 7];
    const corners = [at(2), at(3), at(4), at(5)];
    const uEdge = { x: corners[2].x - corners[1].x,
      y: corners[2].y - corners[1].y };
    const vEdge = { x: corners[1].x - corners[0].x,
      y: corners[1].y - corners[0].y };
    const width = Math.hypot(uEdge.x, uEdge.y);
    const height = Math.hypot(vEdge.x, vEdge.y);
    if (Math.min(width, height) < diagonal * 0.25 ||
        Math.abs(uEdge.x * vEdge.x + uEdge.y * vEdge.y) / (width * height) > 0.25)
      continue;
    const u = { x: uEdge.x / width, y: uEdge.y / width };
    const v = { x: vEdge.x / height, y: vEdge.y / height };
    const origin = corners[0];
    const project = (p: Point) => ({
      x: (p.x - origin.x) * u.x + (p.y - origin.y) * u.y,
      y: (p.x - origin.x) * v.x + (p.y - origin.y) * v.y,
    });
    const localCorners = corners.map(project);
    if (Math.abs(localCorners[2].y - localCorners[1].y) > height * 0.18 ||
        Math.abs(localCorners[3].y - localCorners[0].y) > height * 0.18 ||
        Math.abs(localCorners[3].x - localCorners[2].x) > width * 0.18 ||
        Math.abs(localCorners[0].x - localCorners[1].x) > width * 0.18)
      continue;
    const baseA = project(at(-1)), tip = project(at(0)), baseB = project(at(1));
    if (Math.abs(baseA.y) > height * 0.13 || Math.abs(baseB.y) > height * 0.13 ||
        baseA.x < width * 0.1 || baseA.x > width * 0.9 ||
        baseB.x < width * 0.1 || baseB.x > width * 0.9 ||
        Math.abs(baseA.x - baseB.x) < width * 0.1 ||
        tip.y > -height * 0.18 || tip.y < -height * 0.85 ||
        tip.x < Math.min(baseA.x, baseB.x) - width * 0.2 ||
        tip.x > Math.max(baseA.x, baseB.x) + width * 0.2)
      continue;
    const fromLocal = (x: number, y: number): Point => ({
      x: origin.x + x * u.x + y * v.x,
      y: origin.y + x * u.y + y * v.y,
    });
    let fitted = [fromLocal(0, 0), fromLocal(0, height),
      fromLocal(width, height), fromLocal(width, 0),
      fromLocal(baseA.x, 0), fromLocal(tip.x, tip.y), fromLocal(baseB.x, 0)];
    const start = fitted.reduce((best, p, i) =>
      distance(p, points[0]) < distance(fitted[best], points[0]) ? i : best, 0);
    fitted = [...fitted.slice(start), ...fitted.slice(0, start)];
    const shape: HeldShape = { kind: "bubble", points: fitted, closed: true };
    if (fitResidual(points, shape) < diagonal * 0.045) return shape;
  }
  return null;
}

function roundedBubbleFit(points: Point[], diagonal: number): HeldShape | null {
  const loop = [...points, points[0]];
  for (const tolerance of [0.025, 0.04, 0.06, 0.08]) {
    const vertices = simplify(loop, diagonal * tolerance).slice(0, -1);
    if (vertices.length < 7 || vertices.length > 16) continue;
    const orientation = Math.sign(signedArea(vertices));
    if (!orientation) continue;
    const turns = vertices.map((p, i) => {
      const before = vertices[(i + vertices.length - 1) % vertices.length];
      const after = vertices[(i + 1) % vertices.length];
      return orientation * ((p.x - before.x) * (after.y - p.y) -
        (p.y - before.y) * (after.x - p.x)) /
        (distance(before, p) * distance(p, after) || 1);
    });
    const reflex = turns.flatMap((turn, i) => turn < -0.32 ? [i] : []);
    if (reflex.length !== 2) continue;
    const firstReflex = reflex.find((index) => reflex.includes((index + 2) % vertices.length));
    if (firstReflex === undefined) continue;
    const baseA = vertices[firstReflex];
    const tip = vertices[(firstReflex + 1) % vertices.length];
    const baseB = vertices[(firstReflex + 2) % vertices.length];
    const start = points.indexOf(baseB), end = points.indexOf(baseA);
    if (start < 0 || end < 0) continue;
    const body: Point[] = [];
    for (let index = start, steps = 0; steps <= points.length; steps++, index = (index + 1) % points.length) {
      body.push(points[index]);
      if (index === end) break;
    }
    if (body.length < 12 || body.length > points.length * 0.94) continue;
    const bodyVertices = vertices.filter((_, index) =>
      index !== firstReflex && index !== (firstReflex + 1) % vertices.length &&
      index !== (firstReflex + 2) % vertices.length);
    for (let edge = 0; edge < bodyVertices.length; edge++) {
      const a = bodyVertices[edge], b = bodyVertices[(edge + 1) % bodyVertices.length];
      const edgeLength = distance(a, b);
      if (edgeLength < diagonal * 0.3) continue;
      const u = { x: (b.x - a.x) / edgeLength, y: (b.y - a.y) / edgeLength };
      for (const side of [-1, 1]) {
        const v = { x: -u.y * side, y: u.x * side };
        const project = (p: Point) => ({ x: (p.x - a.x) * u.x + (p.y - a.y) * u.y,
          y: (p.x - a.x) * v.x + (p.y - a.y) * v.y });
        const projected = body.map(project);
        const minX = Math.min(...projected.map((p) => p.x));
        const maxX = Math.max(...projected.map((p) => p.x));
        const minY = Math.min(...projected.map((p) => p.y));
        const maxY = Math.max(...projected.map((p) => p.y));
        const width = maxX - minX, height = maxY - minY;
        if (Math.min(width, height) < diagonal * 0.3) continue;
        const tail = project(tip), leftBase = project(baseA), rightBase = project(baseB);
        if (tail.y > minY - height * 0.17 || tail.y < minY - height * 0.95 ||
            Math.abs(leftBase.y - minY) > height * 0.13 ||
            Math.abs(rightBase.y - minY) > height * 0.13 ||
            Math.min(leftBase.x, rightBase.x) < minX + width * 0.08 ||
            Math.max(leftBase.x, rightBase.x) > maxX - width * 0.08 ||
            Math.abs(leftBase.x - rightBase.x) < width * 0.1 ||
            tail.x < Math.min(leftBase.x, rightBase.x) - width * 0.2 ||
            tail.x > Math.max(leftBase.x, rightBase.x) + width * 0.2) continue;
        const edgeError = projected.reduce((sum, p) => sum + Math.min(
          Math.abs(p.x - minX), Math.abs(p.x - maxX),
          Math.abs(p.y - minY), Math.abs(p.y - maxY)), 0) / projected.length;
        if (edgeError > diagonal * 0.04) continue;
        const radius = Math.min(width, height) * 0.12;
        const arc = (cx: number, cy: number, from: number, to: number) =>
          Array.from({ length: 7 }, (_, i) => ({
            x: cx + radius * Math.cos(from + (to - from) * i / 6),
            y: cy + radius * Math.sin(from + (to - from) * i / 6),
          }));
        const local = [
          { x: rightBase.x, y: minY },
          ...arc(minX + radius, minY + radius, -Math.PI / 2, -Math.PI),
          ...arc(minX + radius, maxY - radius, Math.PI, Math.PI / 2),
          ...arc(maxX - radius, maxY - radius, Math.PI / 2, 0),
          ...arc(maxX - radius, minY + radius, 0, -Math.PI / 2),
          { x: leftBase.x, y: minY }, { x: tail.x, y: tail.y },
        ];
        let fitted = local.map((p) => ({ x: a.x + p.x * u.x + p.y * v.x,
          y: a.y + p.x * u.y + p.y * v.y }));
        if (signedArea(fitted) * signedArea(points) < 0) fitted = fitted.reverse();
        const first = fitted.reduce((best, p, i) =>
          distance(p, points[0]) < distance(fitted[best], points[0]) ? i : best, 0);
        fitted = [...fitted.slice(first), ...fitted.slice(0, first)];
        const shape: HeldShape = { kind: "bubble", points: fitted, closed: true };
        if (fitResidual(points, shape) < diagonal * 0.055) return shape;
      }
    }
  }
  return null;
}

function cloudFit(points: Point[], diagonal: number): HeldShape | null {
  const coverage = straightCoverage(points);
  if (coverage > 0.55) return null;
  const sample = resampleClosed(points, 128);
  const center = { x: sample.reduce((sum, p) => sum + p.x, 0) / sample.length,
    y: sample.reduce((sum, p) => sum + p.y, 0) / sample.length };
  const radii = sample.map((p) => distance(p, center));
  const meanRadius = radii.reduce((sum, radius) => sum + radius, 0) / radii.length;
  if (meanRadius < 12 || Math.min(...radii) < meanRadius * 0.45) return null;
  let winding = 0, backtrack = 0;
  const angles = sample.map((p) => Math.atan2(p.y - center.y, p.x - center.x));
  for (let i = 0; i < sample.length; i++) {
    let turn = angles[(i + 1) % sample.length] - angles[i];
    while (turn <= -Math.PI) turn += Math.PI * 2;
    while (turn > Math.PI) turn -= Math.PI * 2;
    winding += turn;
    if (i) backtrack += Math.max(0, -Math.sign(signedArea(sample)) * turn);
  }
  if (Math.abs(winding) < Math.PI * 1.8 || backtrack > Math.PI * 0.35) return null;
  const frequency = (values: number[], harmonic: number) => {
    let cosine = 0, sine = 0;
    for (let i = 0; i < values.length; i++) {
      const angle = 2 * Math.PI * harmonic * i / values.length;
      cosine += values[i] * Math.cos(angle);
      sine += values[i] * Math.sin(angle);
    }
    return { cosine: cosine * 2 / values.length, sine: sine * 2 / values.length };
  };
  const amplitudes = Array.from({ length: 12 }, (_, i) => {
    const { cosine, sine } = frequency(radii, i + 1);
    return Math.hypot(cosine, sine);
  });
  const lobe = amplitudes.slice(3, 8).reduce((best, value, i, all) =>
    value > all[best] ? i : best, 0) + 4;
  const strength = amplitudes[lobe - 1];
  const lobeEnergy = Math.hypot(...amplitudes.slice(3, 8));
  if (strength < meanRadius * 0.04 || lobeEnergy < meanRadius * 0.08 ||
      strength > meanRadius * 0.38 ||
      amplitudes.slice(8).some((value) => value > strength * 0.55)) return null;
  const xs = sample.map((p) => p.x), ys = sample.map((p) => p.y);
  const xCoefficients = Array.from({ length: 11 }, (_, i) => frequency(xs, i + 1));
  const yCoefficients = Array.from({ length: 11 }, (_, i) => frequency(ys, i + 1));
  // Keep the lobes and the broad silhouette, but progressively suppress the
  // higher-frequency wobble instead of fitting every small hand movement.
  const fitted = sample.map((_, i) => {
    let x = center.x, y = center.y;
    for (let k = 1; k <= 11; k++) {
      const angle = 2 * Math.PI * k * i / sample.length;
      const weight = k <= lobe + 1 ? 1 : Math.pow(0.55, k - lobe - 1);
      x += weight * (xCoefficients[k - 1].cosine * Math.cos(angle) +
        xCoefficients[k - 1].sine * Math.sin(angle));
      y += weight * (yCoefficients[k - 1].cosine * Math.cos(angle) +
        yCoefficients[k - 1].sine * Math.sin(angle));
    }
    return { x, y };
  });
  const shape: HeldShape = { kind: "cloud",
    points: fitted.filter((_, index) => index % 2 === 0), closed: true };
  return fitResidual(points, shape) < diagonal * 0.045 ? shape : null;
}

function arrowFit(points: Point[], diagonal: number): HeldShape | null {
  for (const tolerance of [0.035, 0.055, 0.08]) {
    const vertices = simplify(points, diagonal * tolerance);
    if (vertices.length !== 5) continue;
    const [tail, tip, wingA, returnTip, wingB] = vertices;
    const shaft = distance(tail, tip);
    if (shaft < diagonal * 0.55 || distance(tip, returnTip) > diagonal * 0.09) continue;
    const ux = (tip.x - tail.x) / shaft, uy = (tip.y - tail.y) / shaft;
    const backwardA = (tip.x - wingA.x) * ux + (tip.y - wingA.y) * uy;
    const backwardB = (tip.x - wingB.x) * ux + (tip.y - wingB.y) * uy;
    const sideA = (wingA.x - tip.x) * -uy + (wingA.y - tip.y) * ux;
    const sideB = (wingB.x - tip.x) * -uy + (wingB.y - tip.y) * ux;
    if (Math.min(backwardA, backwardB) < shaft * 0.12 ||
        Math.max(backwardA, backwardB) > shaft * 0.58 ||
        sideA * sideB >= 0 ||
        Math.min(Math.abs(sideA), Math.abs(sideB)) < shaft * 0.12) continue;
    const backward = (backwardA + backwardB) / 2;
    const side = (Math.abs(sideA) + Math.abs(sideB)) / 2;
    const canonicalA = { x: tip.x - backward * ux - Math.sign(sideA) * side * uy,
      y: tip.y - backward * uy + Math.sign(sideA) * side * ux };
    const canonicalB = { x: tip.x - backward * ux - Math.sign(sideB) * side * uy,
      y: tip.y - backward * uy + Math.sign(sideB) * side * ux };
    const canonical = [tail, tip, canonicalA, tip, canonicalB];
    const segments = [[tail, tip], [tip, canonicalA], [canonicalA, tip], [tip, canonicalB]];
    const residual = points.reduce((sum, p) => sum + Math.min(...segments.map(([a, b]) =>
      segmentDistance(p, a, b))), 0) / points.length;
    if (residual < diagonal * 0.025)
      return { kind: "arrow", points: canonical, closed: false };
  }
  return null;
}

function orthogonalFit(points: Point[], diagonal: number): HeldShape | null {
  if (distance(points[0], points.at(-1)!) < diagonal * 0.22) return null;
  for (const tolerance of [0.035, 0.055, 0.075]) {
    const vertices = simplify(points, diagonal * tolerance);
    if (vertices.length < 3 || vertices.length > 7) continue;
    const edges = vertices.slice(1).map((p, i) => ({
      x: p.x - vertices[i].x, y: p.y - vertices[i].y,
    }));
    const lengths = edges.map((e) => Math.hypot(e.x, e.y));
    if (Math.min(...lengths) < diagonal * 0.12) continue;
    if (edges.slice(1).some((edge, i) =>
      Math.abs(edges[i].x * edge.x + edges[i].y * edge.y) /
        (lengths[i] * lengths[i + 1]) > 0.28)) continue;
    const first = { x: edges[0].x / lengths[0], y: edges[0].y / lengths[0] };
    const fitted = [vertices[0], {
      x: vertices[0].x + first.x * lengths[0],
      y: vertices[0].y + first.y * lengths[0],
    }];
    let direction = first;
    for (let i = 1; i < edges.length; i++) {
      const side = Math.sign(direction.x * edges[i].y - direction.y * edges[i].x);
      if (!side) break;
      direction = { x: -direction.y * side, y: direction.x * side };
      const along = edges[i].x * direction.x + edges[i].y * direction.y;
      if (along < diagonal * 0.12) break;
      fitted.push({ x: fitted.at(-1)!.x + direction.x * along,
        y: fitted.at(-1)!.y + direction.y * along });
    }
    if (fitted.length !== vertices.length ||
        distance(fitted.at(-1)!, points.at(-1)!) > diagonal * 0.09) continue;
    const shape: HeldShape = { kind: "orthogonal", points: fitted, closed: false };
    if (fitResidual(points, shape) < diagonal * 0.04) return shape;
  }
  return null;
}

function arcFit(points: Point[], diagonal: number): HeldShape | null {
  const sample = points.filter((_, i) => i % Math.max(1, Math.floor(points.length / 80)) === 0);
  if (sample.at(-1) !== points.at(-1)) sample.push(points.at(-1)!);
  if (sample.length < 6) return null;
  const origin = {
    x: sample.reduce((sum, p) => sum + p.x, 0) / sample.length,
    y: sample.reduce((sum, p) => sum + p.y, 0) / sample.length,
  };
  let xx = 0, xy = 0, yy = 0, xz = 0, yz = 0;
  for (const p of sample) {
    const x = p.x - origin.x, y = p.y - origin.y, z = x * x + y * y;
    xx += x * x; xy += x * y; yy += y * y;
    xz += x * z; yz += y * z;
  }
  const determinant = xx * yy - xy * xy;
  if (determinant < diagonal ** 4 * 0.0001) return null;
  const center = {
    x: origin.x + (xz * yy - yz * xy) / (2 * determinant),
    y: origin.y + (yz * xx - xz * xy) / (2 * determinant),
  };
  const radii = sample.map((p) => distance(p, center));
  const radius = radii.reduce((sum, r) => sum + r, 0) / radii.length;
  if (radius < diagonal * 0.2 || radius > diagonal * 4) return null;
  const errors = radii.map((r) => Math.abs(r - radius));
  if (errors.reduce((sum, n) => sum + n, 0) / errors.length > diagonal * 0.025 ||
      Math.max(...errors) > diagonal * 0.07) return null;
  let sweep = 0, backtrack = 0;
  const angles = sample.map((p) => Math.atan2(p.y - center.y, p.x - center.x));
  const turns = angles.slice(1).map((angle, i) => {
    let delta = angle - angles[i];
    while (delta <= -Math.PI) delta += Math.PI * 2;
    while (delta > Math.PI) delta -= Math.PI * 2;
    return delta;
  });
  const direction = Math.sign(turns.reduce((sum, turn) => sum + turn, 0));
  if (!direction) return null;
  for (const turn of turns) {
    sweep += turn;
    if (Math.sign(turn) !== direction) backtrack += Math.abs(turn);
  }
  if (Math.abs(sweep) < Math.PI * 0.22 || Math.abs(sweep) > Math.PI * 1.85 ||
      backtrack > Math.abs(sweep) * 0.2) return null;
  const startAngle = angles[0];
  const fitted = Array.from({ length: 48 }, (_, i) => {
    const angle = startAngle + sweep * i / 47;
    return { x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle) };
  });
  const shape: HeldShape = { kind: "arc", points: fitted, closed: false };
  return fitResidual(points, shape) < diagonal * 0.025 ? shape : null;
}

function ellipseFit(points: Point[], diagonal: number): HeldShape | null {
  const sample = resampleClosed(points, 64);
  const cx = sample.reduce((sum, p) => sum + p.x, 0) / sample.length;
  const cy = sample.reduce((sum, p) => sum + p.y, 0) / sample.length;
  let xx = 0, yy = 0, xy = 0;
  for (const p of sample) {
    const x = p.x - cx, y = p.y - cy;
    xx += x * x; yy += y * y; xy += x * y;
  }
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  const ux = Math.cos(angle), uy = Math.sin(angle), vx = -uy, vy = ux;
  const projected = sample.map((p) => ({
    x: (p.x - cx) * ux + (p.y - cy) * uy,
    y: (p.x - cx) * vx + (p.y - cy) * vy,
  }));
  const minX = Math.min(...projected.map((p) => p.x));
  const maxX = Math.max(...projected.map((p) => p.x));
  const minY = Math.min(...projected.map((p) => p.y));
  const maxY = Math.max(...projected.map((p) => p.y));
  const mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
  let rx = (maxX - minX) / 2, ry = (maxY - minY) / 2;
  if (Math.min(rx, ry) < 8 || Math.max(rx, ry) / Math.min(rx, ry) > 8) return null;
  const radial = projected.map((p) => Math.abs(Math.hypot((p.x - mx) / rx, (p.y - my) / ry) - 1));
  if (radial.reduce((sum, n) => sum + n, 0) / radial.length > 0.115 ||
      Math.max(...radial) > 0.32) return null;
  let winding = 0, absoluteWinding = 0;
  for (let i = 0; i < sample.length; i++) {
    const a = sample[i], b = sample[(i + 1) % sample.length];
    const ax = a.x - cx, ay = a.y - cy, bx = b.x - cx, by = b.y - cy;
    const delta = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
    winding += delta;
    absoluteWinding += Math.abs(delta);
  }
  if (Math.abs(winding) < Math.PI * 1.8 || absoluteWinding > Math.PI * 2.7) return null;
  const center = { x: cx + mx * ux + my * vx, y: cy + mx * uy + my * vy };
  if (Math.max(rx, ry) / Math.min(rx, ry) < 1.18) {
    const radii = sample.map((p) => distance(p, center));
    const radius = radii.reduce((sum, r) => sum + r, 0) / radii.length;
    const radialError = radii.reduce((sum, r) => sum + Math.abs(r - radius), 0) /
      radii.length / radius;
    if (radialError < 0.065) rx = ry = radius;
  }
  const start = points[0];
  const startAngle = Math.atan2(
    ((start.x - center.x) * vx + (start.y - center.y) * vy) / ry,
    ((start.x - center.x) * ux + (start.y - center.y) * uy) / rx,
  );
  const direction = winding >= 0 ? 1 : -1;
  return { kind: "ellipse", closed: true,
    points: Array.from({ length: 64 }, (_, i) => {
      const a = startAngle + direction * i * Math.PI * 2 / 64;
      const x = rx * Math.cos(a), y = ry * Math.sin(a);
      return { x: center.x + x * ux + y * vx, y: center.y + x * uy + y * vy };
    }) };
}

function fitResidual(raw: Point[], shape: HeldShape): number {
  const step = Math.max(1, Math.ceil(raw.length / 200));
  const segments = shape.points.map((p, i) => [p, shape.points[i + 1]])
    .filter((segment): segment is [Point, Point] => Boolean(segment[1]));
  if (shape.closed) segments.push([shape.points.at(-1)!, shape.points[0]]);
  let total = 0, count = 0;
  for (let i = 0; i < raw.length; i += step) {
    total += Math.min(...segments.map(([a, b]) => segmentDistance(raw[i], a, b)));
    count++;
  }
  return total / count;
}

export function recognizeHeldShape(points: Point[]): HeldShape | null {
  if (points.length < 4 || strokeLength(points) < 20) return null;
  const b = bounds(points), diagonal = Math.hypot(b.width, b.height);
  const start = points[0], end = points.at(-1)!;
  const travel = strokeLength(points);
  if (distance(start, end) > 20 && travel / distance(start, end) < 1.13 &&
      Math.max(...points.map((p) => segmentDistance(p, start, end))) < diagonal * 0.07)
    return { kind: "line", points: [start, end], closed: false };
  const forwardArrow = arrowFit(points, diagonal);
  const reverseArrow = forwardArrow ? null : arrowFit([...points].reverse(), diagonal);
  const arrow = forwardArrow ?? (reverseArrow ? {
    ...reverseArrow, points: [...reverseArrow.points].reverse(),
  } : null);
  if (arrow) return arrow;
  if (distance(start, end) > diagonal * 0.22) {
    const orthogonal = orthogonalFit(points, diagonal);
    if (orthogonal) return orthogonal;
    const arc = arcFit(points, diagonal);
    if (arc) return arc;
  }
  if (diagonal < 20 || distance(start, end) > diagonal * 0.22) return null;
  const pentagram = pentagramFit(points, diagonal);
  if (pentagram) return pentagram;
  if (hasCrossing(points, diagonal)) return null;
  const basic = polygonFit(points, 3, diagonal) ?? polygonFit(points, 4, diagonal);
  if (basic) return basic;
  const star = starFit(points, diagonal);
  if (star) return star;
  const heart = heartFit(points, diagonal);
  if (heart) return heart;
  const bubble = bubbleFit(points, diagonal) ?? roundedBubbleFit(points, diagonal);
  if (bubble) return bubble;
  const ellipse = ellipseFit(points, diagonal);
  if (straightCoverage(points) > 0.32) {
    const polygon = [5, 6, 7, 8].map((count) => polygonFit(points, count, diagonal)).find(Boolean);
    if (polygon && (!ellipse || fitResidual(points, polygon) < fitResidual(points, ellipse) * 0.9))
      return polygon;
  }
  const cloud = cloudFit(points, diagonal);
  if (cloud) return cloud;
  return ellipse;
}

export function compressSamples(points: Point[]): Point[] {
  if (points.length < 2) return [...points];
  const filtered = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (distance(p, filtered.at(-1)!) >= 0.35) filtered.push(p);
    else if (i === points.length - 1 && filtered.length > 1)
      filtered[filtered.length - 1] = p;
  }
  if (filtered.length < 2) return [points[0], points.at(-1)!];
  const reduced = simplify(filtered, 0.45);
  if (reduced.length <= MAX_SKETCH_SAMPLES) return reduced;
  return Array.from({ length: MAX_SKETCH_SAMPLES }, (_, i) =>
    reduced[Math.round(i * (reduced.length - 1) / (MAX_SKETCH_SAMPLES - 1))],
  );
}

export function cleanStroke(stroke: SketchStroke): SketchStroke {
  const raw = stroke.raw;
  const size = bounds(raw);
  const tolerance = Math.max(0.5, Math.min(2.5, Math.max(size.width, size.height) * 0.008));
  const simple = simplify(raw, tolerance);
  if (simple.length < 3) return { ...stroke, points: simple };
  const points = simple.map((p, i) => {
    if (!i || i === simple.length - 1) return p;
    const before = simple[i - 1], after = simple[i + 1];
    const ax = p.x - before.x, ay = p.y - before.y;
    const bx = after.x - p.x, by = after.y - p.y;
    const cosine = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1);
    // Preserve corners and intersections; only soften locally straight sections.
    if (cosine < 0.75) return p;
    return { x: p.x * 0.75 + (before.x + after.x) * 0.125,
      y: p.y * 0.75 + (before.y + after.y) * 0.125 };
  });
  return { ...stroke, points };
}
