import { test } from "node:test";
import assert from "node:assert/strict";
import { compressSamples, MAX_SKETCH_SAMPLES, recognizeHeldShape } from "../lib/sky-art/sketch";
import { buildGeometry } from "../lib/sky-art/fonts";
import { planRoute } from "../lib/sky-art/planner";
import type { Point } from "../lib/sky-art/types";

const rotate = (p: Point, angle: number): Point => ({
  x: 320 + p.x * Math.cos(angle) - p.y * Math.sin(angle),
  y: 210 + p.x * Math.sin(angle) + p.y * Math.cos(angle),
});
const jitter = (i: number) => Math.sin(i * 7.7) * 1.5;
const polygon = (corners: Point[], samples = 16): Point[] => corners.flatMap((p, edge) => {
  const q = corners[(edge + 1) % corners.length];
  return Array.from({ length: samples }, (_, i) => ({
    x: p.x + (q.x - p.x) * i / samples,
    y: p.y + (q.y - p.y) * i / samples,
  }));
}).concat(corners[0]);

test("rotated rough rectangle becomes a square-cornered rectangle", () => {
  const corners = [
    { x: -85, y: -50 }, { x: 85, y: -50 },
    { x: 85, y: 50 }, { x: -85, y: 50 },
  ];
  const raw = polygon(corners).map((p, i) => rotate({ x: p.x + jitter(i), y: p.y + jitter(i + 3) }, 0.43));
  const shape = recognizeHeldShape(raw);
  assert.equal(shape?.kind, "rectangle");
  assert.equal(shape?.closed, true);
  assert.equal(shape?.points.length, 4);
  const edges = shape!.points.map((p, i) => ({
    x: shape!.points[(i + 1) % 4].x - p.x,
    y: shape!.points[(i + 1) % 4].y - p.y,
  }));
  for (let i = 0; i < 4; i++) {
    const a = edges[i], b = edges[(i + 1) % 4];
    assert.ok(Math.abs(a.x * b.x + a.y * b.y) < 1e-6);
  }
});

test("a slightly uneven square becomes equal-sided while an oblong remains rectangular", () => {
  const raw = polygon([
    { x: -54, y: -48 }, { x: 54, y: -48 },
    { x: 54, y: 48 }, { x: -54, y: 48 },
  ]).map((p, i) => rotate({ x: p.x + jitter(i) * 0.6,
    y: p.y + jitter(i + 3) * 0.6 }, 0.31));
  for (const drawn of [raw, [...raw].reverse()]) {
    const shape = recognizeHeldShape(drawn);
    assert.equal(shape?.kind, "square");
    const sides = shape!.points.map((p, i) => Math.hypot(
      p.x - shape!.points[(i + 1) % 4].x,
      p.y - shape!.points[(i + 1) % 4].y));
    assert.ok(Math.max(...sides) - Math.min(...sides) < 1e-6);
  }
  const oblong = polygon([
    { x: -70, y: -45 }, { x: 70, y: -45 },
    { x: 70, y: 45 }, { x: -70, y: 45 },
  ]);
  assert.equal(recognizeHeldShape(oblong)?.kind, "rectangle");
});

test("a held trapezoid is not silently redrawn as a rectangle", () => {
  const raw = polygon([
    { x: -90, y: -55 }, { x: 85, y: -55 },
    { x: 55, y: 55 }, { x: -55, y: 55 },
  ]).map((p, i) => ({ x: p.x + jitter(i) * 0.3, y: p.y + jitter(i + 3) * 0.3 }));
  assert.equal(recognizeHeldShape(raw), null);
});

test("rotated rough oval keeps its tilt and closes", () => {
  const raw = Array.from({ length: 73 }, (_, i) => {
    const a = i * Math.PI * 2 / 72;
    return rotate({ x: 115 * Math.cos(a) + jitter(i), y: 46 * Math.sin(a) + jitter(i + 4) }, 0.62);
  });
  const shape = recognizeHeldShape(raw);
  assert.equal(shape?.kind, "ellipse");
  assert.equal(shape?.closed, true);
  const points = shape!.points;
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  const cxy = points.reduce((sum, p) => sum + (p.x - cx) * (p.y - cy), 0);
  assert.ok(Math.abs(cxy) > 100000, "fitted oval should remain rotated");
});

test("a held open arc becomes a smooth continuous flight stroke", async () => {
  const raw = Array.from({ length: 65 }, (_, i) => {
    const angle = -Math.PI * 0.85 + i / 64 * Math.PI * 1.35;
    return { x: 130 * Math.cos(angle) + jitter(i),
      y: 130 * Math.sin(angle) + jitter(i + 5) };
  });
  for (const drawn of [raw, [...raw].reverse()]) {
    const shape = recognizeHeldShape(drawn);
    assert.equal(shape?.kind, "arc");
    assert.equal(shape?.closed, false);
    assert.equal(shape?.points.length, 48);
  }
  const shape = recognizeHeldShape(raw)!;
  const composition = { version: 2 as const, name: "Arc", elements: [{
    id: "arc", kind: "sketch" as const, value: "Sketch", x: 400, y: 300,
    scale: 1, rotation: 0, font: "outline" as const, spacing: 12, lineHeight: 130,
    strokes: [{ id: "stroke", raw, points: shape.points, closed: false }],
  }] };
  const route = planRoute(await buildGeometry(composition), composition);
  assert.ok(route.segments.length >= 8);
  for (let i = 1; i < route.segments.length; i++)
    assert.ok(Math.hypot(route.segments[i - 1].to.x - route.segments[i].from.x,
      route.segments[i - 1].to.y - route.segments[i].from.y) < 1e-6);
  const sharpV = [{ x: -60, y: -40 }, { x: 0, y: 60 }, { x: 60, y: -40 }];
  assert.notEqual(recognizeHeldShape(polygon(sharpV).slice(0, 34))?.kind, "arc");
});

test("one-stroke right-angle turns straighten without stealing a V", async () => {
  const openPolyline = (corners: Point[]) => corners.slice(0, -1).flatMap((p, edge) => {
    const next = corners[edge + 1];
    return Array.from({ length: 12 }, (_, i) => ({
      x: p.x + (next.x - p.x) * i / 12 + jitter(i + edge * 3) * 0.45,
      y: p.y + (next.y - p.y) * i / 12 + jitter(i + edge * 3 + 2) * 0.45,
    }));
  }).concat(corners.at(-1)!);
  const lShape = openPolyline([{ x: 0, y: 0 }, { x: 120, y: 4 }, { x: 116, y: 90 }]);
  const stairs = openPolyline([{ x: 0, y: 0 }, { x: 90, y: 3 },
    { x: 87, y: 65 }, { x: 160, y: 62 }, { x: 158, y: 125 }]);
  for (const angle of [0, 0.37, 0.85])
    for (const source of [lShape, [...lShape].reverse()])
      assert.equal(recognizeHeldShape(source.map((p) => rotate(p, angle)))?.kind,
        "orthogonal");
  for (const raw of [lShape, stairs, [...stairs].reverse(),
    stairs.map((p) => rotate(p, 0.57)),
    [...stairs].reverse().map((p) => rotate(p, 0.57))]) {
    const shape = recognizeHeldShape(raw);
    assert.equal(shape?.kind, "orthogonal");
    assert.equal(shape?.closed, false);
    assert.equal(shape?.points.length, raw === lShape ? 3 : 5);
    assert.ok(Math.hypot(shape!.points[0].x - raw[0].x,
      shape!.points[0].y - raw[0].y) < 5);
    assert.ok(Math.hypot(shape!.points.at(-1)!.x - raw.at(-1)!.x,
      shape!.points.at(-1)!.y - raw.at(-1)!.y) < 10);
    for (let i = 1; i < shape!.points.length - 1; i++) {
      const a = shape!.points[i - 1], b = shape!.points[i], c = shape!.points[i + 1];
      const ax = b.x - a.x, ay = b.y - a.y;
      const bx = c.x - b.x, by = c.y - b.y;
      assert.ok(Math.abs(ax * bx + ay * by) < 1e-5);
    }
  }
  const composition = { version: 2 as const, name: "L", elements: [{
    id: "l", kind: "sketch" as const, value: "Sketch", x: 400, y: 300,
    scale: 1, rotation: 0, font: "outline" as const, spacing: 12, lineHeight: 130,
    strokes: [{ id: "stroke", raw: lShape, points: recognizeHeldShape(lShape)!.points,
      closed: false }],
  }] };
  const route = planRoute(await buildGeometry(composition), composition);
  assert.ok(route.segments.length >= 2);
  for (let i = 1; i < route.segments.length; i++)
    assert.ok(Math.hypot(route.segments[i - 1].to.x - route.segments[i].from.x,
      route.segments[i - 1].to.y - route.segments[i].from.y) < 1e-6);
  const vShape = openPolyline([{ x: 0, y: 0 }, { x: 60, y: 90 }, { x: 120, y: 0 }]);
  assert.notEqual(recognizeHeldShape(vShape)?.kind, "orthogonal");
});

test("rough triangle and heart snap while a scribble stays freehand", () => {
  const triangle = polygon([{ x: 0, y: -85 }, { x: 82, y: 65 }, { x: -82, y: 65 }])
    .map((p, i) => ({ x: p.x + jitter(i), y: p.y + jitter(i + 2) }));
  const snappedTriangle = recognizeHeldShape(triangle);
  assert.equal(snappedTriangle?.kind, "triangle");
  const sides = snappedTriangle!.points.map((p, i) => Math.hypot(
    p.x - snappedTriangle!.points[(i + 1) % 3].x,
    p.y - snappedTriangle!.points[(i + 1) % 3].y));
  assert.ok(Math.max(...sides) - Math.min(...sides) < 1e-6);
  const tall = polygon([{ x: 0, y: -110 }, { x: 65, y: 65 }, { x: -65, y: 65 }]);
  const tallShape = recognizeHeldShape(tall);
  assert.equal(tallShape?.kind, "triangle");
  const tallSides = tallShape!.points.map((p, i) => Math.hypot(
    p.x - tallShape!.points[(i + 1) % 3].x,
    p.y - tallShape!.points[(i + 1) % 3].y));
  assert.ok(Math.max(...tallSides) - Math.min(...tallSides) > 15);
  const heart = polygon([
    { x: 0, y: -30 }, { x: -25, y: -55 }, { x: -60, y: -35 },
    { x: -55, y: 0 }, { x: 0, y: 60 }, { x: 55, y: 0 },
    { x: 60, y: -35 }, { x: 25, y: -55 },
  ]);
  assert.equal(recognizeHeldShape(heart)?.kind, "heart");
  assert.equal(recognizeHeldShape(heart)?.points.length, 64);
  const tilted = heart.map((p) => rotate(p, 0.53));
  assert.equal(recognizeHeldShape(tilted)?.kind, "heart");
  assert.equal(recognizeHeldShape([...tilted].reverse())?.kind, "heart");
  const scribble = [{ x: 0, y: 0 }, { x: 80, y: 60 }, { x: 0, y: 60 },
    { x: 80, y: 0 }, { x: 0, y: 0 }];
  assert.equal(recognizeHeldShape(scribble), null);
});

test("a tilted speech bubble and tail become one closed flight stroke", async () => {
  const corners = [{ x: -90, y: 50 }, { x: -90, y: -55 },
    { x: 90, y: -55 }, { x: 90, y: 50 }, { x: 28, y: 50 },
    { x: 8, y: 90 }, { x: -15, y: 50 }];
  for (const outline of [corners, [...corners].reverse()]) {
    for (const start of [0, 3, 5]) {
      const shifted = [...outline.slice(start), ...outline.slice(0, start)];
      const raw = polygon(shifted).map((p, i) =>
        rotate({ x: p.x + jitter(i) * 0.35, y: p.y + jitter(i + 2) * 0.35 }, 0.37));
      const shape = recognizeHeldShape(raw);
      assert.equal(shape?.kind, "bubble");
      assert.equal(shape?.closed, true);
      assert.equal(shape?.points.length, 7);
      const composition = { version: 2 as const, name: "Bubble", elements: [{
        id: "bubble", kind: "sketch" as const, value: "Sketch", x: 400, y: 300,
        scale: 1, rotation: 0, font: "outline" as const, spacing: 12, lineHeight: 130,
        strokes: [{ id: "stroke", raw, points: shape!.points, closed: true }],
      }] };
      const route = planRoute(await buildGeometry(composition), composition);
      assert.equal(route.segments.filter((segment) => segment.kind !== "art").length, 0);
      assert.ok(Math.hypot(route.segments.at(-1)!.to.x - route.segments[0].from.x,
        route.segments.at(-1)!.to.y - route.segments[0].from.y) < 1e-6);
    }
  }
  const house = polygon([{ x: -90, y: 50 }, { x: -90, y: -30 },
    { x: 0, y: -90 }, { x: 90, y: -30 }, { x: 90, y: 50 }]);
  assert.notEqual(recognizeHeldShape(house)?.kind, "bubble");
});

test("a hand-drawn rounded speech bubble with an off-center tail snaps", () => {
  const rounded = [
    { x: -90, y: 32 }, { x: -90, y: -30 }, { x: -84, y: -47 },
    { x: -70, y: -55 }, { x: 68, y: -55 }, { x: 84, y: -48 },
    { x: 90, y: -30 }, { x: 90, y: 30 }, { x: 84, y: 44 },
    { x: 70, y: 50 }, { x: 30, y: 50 }, { x: 5, y: 90 },
    { x: -10, y: 50 }, { x: -70, y: 50 }, { x: -84, y: 45 },
  ];
  const raw = polygon(rounded, 8).map((p, i) => rotate({
    x: p.x + jitter(i) * 0.7,
    y: p.y + jitter(i + 4) * 0.7,
  }, 0.22));
  assert.equal(recognizeHeldShape(raw)?.kind, "bubble");
  assert.equal(recognizeHeldShape([...raw].reverse())?.kind, "bubble");
});

test("a held scalloped cloud smooths into one continuous closed line", async () => {
  const makeCloud = (phase: number, reverse = false) => {
    const points = Array.from({ length: 145 }, (_, i) => {
      const angle = phase + i * Math.PI * 2 / 144;
      const radius = 80 + 18 * Math.cos(6 * angle) + 4 * Math.cos(2 * angle);
      return rotate({ x: radius * Math.cos(angle) + jitter(i) * 0.45,
        y: radius * Math.sin(angle) + jitter(i + 3) * 0.45 }, 0.3);
    });
    return reverse ? points.reverse() : points;
  };
  for (const phase of [0, 0.4, 1.1]) for (const reverse of [false, true]) {
    const raw = makeCloud(phase, reverse);
    const shape = recognizeHeldShape(raw);
    assert.equal(shape?.kind, "cloud");
    assert.equal(shape?.closed, true);
    assert.equal(shape?.points.length, 64);
    const composition = { version: 2 as const, name: "Cloud", elements: [{
      id: "cloud", kind: "sketch" as const, value: "Sketch", x: 400, y: 300,
      scale: 1, rotation: 0, font: "outline" as const, spacing: 12, lineHeight: 130,
      strokes: [{ id: "stroke", raw, points: shape!.points, closed: true }],
    }] };
    const route = planRoute(await buildGeometry(composition), composition);
    assert.equal(route.segments.filter((segment) => segment.kind !== "art").length, 0);
    assert.ok(Math.hypot(route.segments.at(-1)!.to.x - route.segments[0].from.x,
      route.segments.at(-1)!.to.y - route.segments[0].from.y) < 1e-6);
  }
  const ellipse = Array.from({ length: 145 }, (_, i) => {
    const angle = i * Math.PI * 2 / 144;
    return rotate({ x: 105 * Math.cos(angle) + jitter(i) * 0.4,
      y: 65 * Math.sin(angle) + jitter(i + 2) * 0.4 }, 0.5);
  });
  assert.equal(recognizeHeldShape(ellipse)?.kind, "ellipse");
});

test("an uneven hand-drawn cloud with a flatter base still snaps", () => {
  const anchors = [
    [-92, 30], [-106, 0], [-92, -24], [-66, -28],
    [-52, -56], [-27, -70], [-2, -51], [20, -72],
    [51, -58], [65, -33], [94, -26], [108, -2],
    [94, 27], [71, 34], [48, 48], [18, 46],
    [-10, 58], [-36, 47], [-67, 53], [-83, 42],
  ].map(([x, y]) => ({ x, y }));
  const curve = anchors.flatMap((p, i) => {
    const before = anchors[(i + anchors.length - 1) % anchors.length];
    const after = anchors[(i + 1) % anchors.length];
    const next = anchors[(i + 2) % anchors.length];
    return Array.from({ length: 8 }, (_, step) => {
      const t = step / 8, t2 = t * t, t3 = t2 * t;
      return { x: 0.5 * (2 * p.x + (-before.x + after.x) * t +
          (2 * before.x - 5 * p.x + 4 * after.x - next.x) * t2 +
          (-before.x + 3 * p.x - 3 * after.x + next.x) * t3),
        y: 0.5 * (2 * p.y + (-before.y + after.y) * t +
          (2 * before.y - 5 * p.y + 4 * after.y - next.y) * t2 +
          (-before.y + 3 * p.y - 3 * after.y + next.y) * t3) };
    });
  }).concat(anchors[0]);
  for (const raw of [curve, [...curve].reverse()])
    assert.equal(recognizeHeldShape(raw)?.kind, "cloud");
});

test("four to eight rounded cloud lobes do not become squares or polygons", () => {
  for (const lobes of [4, 5, 6, 7, 8])
    for (const phase of [0, 0.37])
      for (const reverse of [false, true]) {
        let raw = Array.from({ length: 129 }, (_, i) => {
          const angle = phase + i * Math.PI * 2 / 128;
          const radius = 80 + 16 * Math.cos(lobes * angle) + 3 * Math.cos(2 * angle);
          return { x: radius * Math.cos(angle) + Math.sin(i * 6) * 0.5,
            y: radius * Math.sin(angle) + Math.cos(i * 7) * 0.5 };
        });
        if (reverse) raw = raw.reverse();
        assert.equal(recognizeHeldShape(raw)?.kind, "cloud");
      }
});

test("cloud fitting keeps its main lobes while calming small hand wobble", () => {
  const raw = Array.from({ length: 129 }, (_, i) => {
    const angle = i * Math.PI * 2 / 128;
    const radius = 80 + 17 * Math.cos(6 * angle) + 2.8 * Math.cos(10 * angle);
    return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
  });
  const shape = recognizeHeldShape(raw);
  assert.equal(shape?.kind, "cloud");
  const radialAmplitude = (points: { x: number; y: number }[], harmonic: number) => {
    const center = { x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
      y: points.reduce((sum, p) => sum + p.y, 0) / points.length };
    const values = points.map((p) => Math.hypot(p.x - center.x, p.y - center.y));
    const cosine = values.reduce((sum, value, i) =>
      sum + value * Math.cos(2 * Math.PI * harmonic * i / values.length), 0);
    const sine = values.reduce((sum, value, i) =>
      sum + value * Math.sin(2 * Math.PI * harmonic * i / values.length), 0);
    return 2 * Math.hypot(cosine, sine) / values.length;
  };
  const sampledRaw = raw.filter((_, i) => i < 128 && i % 2 === 0);
  assert.ok(radialAmplitude(shape!.points, 6) > radialAmplitude(sampledRaw, 6) * 0.85);
  assert.ok(radialAmplitude(shape!.points, 10) < radialAmplitude(sampledRaw, 10) * 0.75);
});

test("a snapped heart remains one continuous loop in the flight route", async () => {
  const raw = polygon([
    { x: 0, y: -30 }, { x: -25, y: -55 }, { x: -60, y: -35 },
    { x: -55, y: 0 }, { x: 0, y: 60 }, { x: 55, y: 0 },
    { x: 60, y: -35 }, { x: 25, y: -55 },
  ]);
  const shape = recognizeHeldShape(raw);
  assert.equal(shape?.kind, "heart");
  const composition = { version: 2 as const, name: "Heart", elements: [{
    id: "heart", kind: "sketch" as const, value: "Sketch", x: 400, y: 300,
    scale: 1, rotation: 0, font: "outline" as const, spacing: 12, lineHeight: 130,
    strokes: [{ id: "stroke", raw, points: shape!.points, closed: true }],
  }] };
  const route = planRoute(await buildGeometry(composition), composition);
  assert.ok(route.segments.length >= 16);
  assert.equal(route.segments.filter((segment) => segment.kind !== "art").length, 0);
  for (let i = 1; i < route.segments.length; i++)
    assert.ok(Math.hypot(route.segments[i - 1].to.x - route.segments[i].from.x,
      route.segments[i - 1].to.y - route.segments[i].from.y) < 1e-6);
  assert.ok(Math.hypot(route.segments.at(-1)!.to.x - route.segments[0].from.x,
    route.segments.at(-1)!.to.y - route.segments[0].from.y) < 1e-6);
});

test("a held one-stroke arrow becomes symmetric and remains one flyable line", async () => {
  const vertices = [{ x: 0, y: 0 }, { x: 120, y: 0 },
    { x: 78, y: -42 }, { x: 120, y: 0 }, { x: 78, y: 42 }];
  const raw = vertices.slice(0, -1).flatMap((p, edge) => {
    const q = vertices[edge + 1];
    return Array.from({ length: 12 }, (_, i) => ({
      x: p.x + (q.x - p.x) * i / 12 + jitter(i + edge * 4),
      y: p.y + (q.y - p.y) * i / 12 + jitter(i + edge * 4 + 2),
    }));
  }).concat(vertices.at(-1)!);
  const shape = recognizeHeldShape(raw);
  assert.equal(shape?.kind, "arrow");
  assert.equal(shape?.closed, false);
  assert.equal(shape?.points.length, 5);
  assert.deepEqual(shape?.points[1], shape?.points[3]);
  const reversed = recognizeHeldShape([...raw].reverse());
  assert.equal(reversed?.kind, "arrow");
  assert.deepEqual(reversed?.points, [...shape!.points].reverse());
  const composition = { version: 2 as const, name: "Arrow", elements: [{
    id: "arrow", kind: "sketch" as const, value: "Sketch", x: 400, y: 300,
    scale: 1, rotation: 0, font: "outline" as const, spacing: 12, lineHeight: 130,
    strokes: [{ id: "stroke", raw, points: shape!.points, closed: false }],
  }] };
  const route = planRoute(await buildGeometry(composition), composition);
  assert.ok(route.segments.length >= 4);
  for (let i = 1; i < route.segments.length; i++) {
    const a = route.segments[i - 1].to, b = route.segments[i].from;
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1e-6);
  }
  const zigzag = [{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 75, y: -42 },
    { x: 105, y: 22 }, { x: 78, y: 42 }];
  assert.notEqual(recognizeHeldShape(zigzag)?.kind, "arrow");
});

test("convex five- and six-sided drawings straighten without taking over an oval", () => {
  for (const count of [5, 6]) {
    const corners = Array.from({ length: count }, (_, i) => {
      const angle = -Math.PI / 2 + i * Math.PI * 2 / count;
      return rotate({ x: 95 * Math.cos(angle), y: 95 * Math.sin(angle) }, 0.27);
    });
    const raw = polygon(corners).map((p, i) => ({ x: p.x + jitter(i), y: p.y + jitter(i + 3) }));
    const shape = recognizeHeldShape(raw);
    assert.equal(shape?.kind, "polygon");
    assert.equal(shape?.points.length, count);
    assert.equal(shape?.closed, true);
    const sides = shape!.points.map((p, i) =>
      Math.hypot(shape!.points[(i + 1) % count].x - p.x,
        shape!.points[(i + 1) % count].y - p.y));
    assert.ok(Math.max(...sides) - Math.min(...sides) < 1e-6,
      "A near-regular hand-drawn polygon should have equal sides after snapping");
  }
  const oval = Array.from({ length: 73 }, (_, i) => {
    const a = i * Math.PI * 2 / 72;
    return rotate({ x: 110 * Math.cos(a), y: 42 * Math.sin(a) }, 0.4);
  });
  assert.equal(recognizeHeldShape(oval)?.kind, "ellipse");
});

test("a held star outline becomes a single closed flyable stroke", async () => {
  const corners = Array.from({ length: 10 }, (_, i) => {
    const angle = -Math.PI / 2 + i * Math.PI / 5;
    const radius = i % 2 ? 42 : 95;
    return rotate({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) }, 0.28);
  });
  const raw = polygon(corners).map((p, i) => ({
    x: p.x + jitter(i) * 0.45, y: p.y + jitter(i + 4) * 0.45,
  }));
  const shape = recognizeHeldShape(raw);
  assert.equal(shape?.kind, "star");
  assert.equal(shape?.closed, true);
  assert.equal(shape?.points.length, 10);
  const reverse = polygon([...corners].reverse()).map((p, i) => ({
    x: p.x + jitter(i) * 0.45, y: p.y + jitter(i + 4) * 0.45,
  }));
  assert.equal(recognizeHeldShape(reverse)?.kind, "star");
  const composition = { version: 2 as const, name: "Star", elements: [{
    id: "star", kind: "sketch" as const, value: "Sketch", x: 400, y: 300,
    scale: 1, rotation: 0, font: "outline" as const, spacing: 12, lineHeight: 130,
    strokes: [{ id: "stroke", raw, points: shape!.points, closed: true }],
  }] };
  const route = planRoute(await buildGeometry(composition), composition);
  assert.ok(route.segments.length >= 10);
  for (let i = 1; i < route.segments.length; i++)
    assert.ok(Math.hypot(route.segments[i - 1].to.x - route.segments[i].from.x,
      route.segments[i - 1].to.y - route.segments[i].from.y) < 1e-6);
});

test("a one-stroke crossing pentagram snaps without changing its stroke order", () => {
  const corners = Array.from({ length: 5 }, (_, i) => {
    const angle = -Math.PI / 2 + i * Math.PI * 4 / 5;
    return { x: 95 * Math.cos(angle), y: 95 * Math.sin(angle) };
  });
  const raw = polygon(corners).map((p, i) => ({
    x: p.x + jitter(i) * 0.6, y: p.y + jitter(i + 3) * 0.6,
  }));
  for (const drawing of [raw, [...raw].reverse()]) {
    const shape = recognizeHeldShape(drawing);
    assert.equal(shape?.kind, "star");
    assert.equal(shape?.points.length, 5);
    assert.equal(shape?.closed, true);
  }
});

test("recognition remains stable across rotated and mid-edge starting points", () => {
  const cases: Array<{ kind: string; corners: Point[] }> = [
    { kind: "triangle", corners: [{ x: 0, y: -90 }, { x: 90, y: 65 }, { x: -90, y: 65 }] },
    { kind: "rectangle", corners: [{ x: -95, y: -50 }, { x: 95, y: -50 },
      { x: 95, y: 50 }, { x: -95, y: 50 }] },
    { kind: "star", corners: Array.from({ length: 10 }, (_, i) => {
      const angle = i * Math.PI / 5 - Math.PI / 2;
      const radius = i % 2 ? 40 : 90;
      return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
    }) },
    ...[5, 6].map((count) => ({ kind: "polygon", corners: Array.from({ length: count }, (_, i) => {
      const angle = i * Math.PI * 2 / count - Math.PI / 2;
      return { x: 90 * Math.cos(angle), y: 90 * Math.sin(angle) };
    }) })),
  ];
  const failures: string[] = [];
  for (const { kind, corners } of cases)
    for (const angle of [0, 0.27, 0.65, 1.05])
      for (const seam of [0, 5]) {
        const base = polygon(corners, 14).slice(0, -1);
        const shifted = [...base.slice(seam), ...base.slice(0, seam)];
        const raw = [...shifted, shifted[0]].map((p, i) =>
          rotate({ x: p.x + jitter(i) * 0.7, y: p.y + jitter(i + 5) * 0.7 }, angle));
        const actual = recognizeHeldShape(raw)?.kind;
        if (actual !== kind) failures.push(`${kind} angle=${angle} seam=${seam}: ${actual ?? "none"}`);
      }
  assert.deepEqual(failures, []);
});

test("circle and oval fitting tolerates direction, phase, rotation and uneven speed", () => {
  const failures: string[] = [];
  for (const aspect of [1, 1.6, 2.6])
    for (const rotation of [0, 0.4, 0.85])
      for (const direction of [-1, 1])
        for (const phase of [0, 0.73]) {
          const raw = Array.from({ length: 81 }, (_, i) => {
            const progress = (i / 80) ** 1.25;
            const a = phase + direction * progress * Math.PI * 2;
            return rotate({ x: 60 * aspect * Math.cos(a) + jitter(i),
              y: 60 * Math.sin(a) + jitter(i + 6) }, rotation);
          });
          const actual = recognizeHeldShape(raw)?.kind;
          if (actual !== "ellipse") failures.push(`aspect=${aspect} rotation=${rotation} direction=${direction} phase=${phase}: ${actual ?? "none"}`);
        }
  assert.deepEqual(failures, []);
});

test("a slightly shaky circle snaps round while an oval keeps its aspect ratio", () => {
  const circle = Array.from({ length: 97 }, (_, i) => {
    const angle = i * Math.PI * 2 / 96;
    return { x: 70 * Math.cos(angle) + jitter(i) * 1.7,
      y: 67 * Math.sin(angle) + jitter(i + 5) * 1.7 };
  });
  const round = recognizeHeldShape(circle);
  assert.equal(round?.kind, "ellipse");
  const span = (points: Point[], axis: "x" | "y") =>
    Math.max(...points.map((p) => p[axis])) - Math.min(...points.map((p) => p[axis]));
  assert.ok(Math.abs(span(round!.points, "x") / span(round!.points, "y") - 1) < 0.015);
  const oval = Array.from({ length: 97 }, (_, i) => {
    const angle = i * Math.PI * 2 / 96;
    return { x: 105 * Math.cos(angle) + jitter(i),
      y: 55 * Math.sin(angle) + jitter(i + 5) };
  });
  const stretched = recognizeHeldShape(oval);
  assert.equal(stretched?.kind, "ellipse");
  assert.ok(span(stretched!.points, "x") / span(stretched!.points, "y") > 1.6);
});

test("a long Pencil stroke can be compressed without losing its shape", () => {
  const raw = Array.from({ length: 3001 }, (_, i) => {
    const angle = i * Math.PI * 2 / 3000;
    return { x: 110 * Math.cos(angle), y: 65 * Math.sin(angle) };
  });
  const points = compressSamples(raw);
  assert.ok(points.length <= MAX_SKETCH_SAMPLES);
  assert.equal(recognizeHeldShape(points)?.kind, "ellipse");
});
