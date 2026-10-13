import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parse } from "opentype.js";
import { buildGeometry, outlineText } from "../lib/sky-art/fonts";
import { PRESETS } from "../lib/sky-art/presets";
import { planPlacedRoute } from "../lib/sky-art/placement-planner";
import { clearConnection } from "../lib/sky-art/clear-connections";
import { planRoute } from "../lib/sky-art/planner";
import { direct, inverse, projectRoute } from "../lib/sky-art/projection";
import {
  foreflightRoute,
  foreflightUrl,
  routeGpx,
  splitRoute,
  trackKml,
  waypointKml,
  navlogCsv,
  navlogPdf,
} from "../lib/sky-art/exports";
import { joinCounters } from "../lib/sky-art/contours";
import { navigationSegments } from "../lib/sky-art/navigation";
import { distance, lerp, intersects, bounds } from "../lib/sky-art/geometry";
import { validateProject } from "../lib/sky-art/storage";
import {
  DEFAULT_COMPOSITION,
  DEFAULT_PLACEMENT,
  type Composition,
  type Element,
} from "../lib/sky-art/types";
const fontBuffer = fs.readFileSync(
  "public/sky-art/fonts/NotoSansCJKsc-Bold.otf",
);
const font = parse(
  fontBuffer.buffer.slice(
    fontBuffer.byteOffset,
    fontBuffer.byteOffset + fontBuffer.byteLength,
  ),
);
const text = (value: string): Element => ({
  id: "text",
  kind: "text",
  value,
  x: 400,
  y: 300,
  scale: 1,
  rotation: 0,
  font: "outline",
  spacing: 12,
  lineHeight: 130,
});
const composition = (value: string): Composition => ({
  version: 1,
  name: value,
  elements: [text(value)],
});
const place = {
  ...DEFAULT_PLACEMENT,
  waypointToleranceNm: 0,
  anchor: { lat: 40, lon: -75 },
};
for (const value of [
  "LOVE",
  "2026",
  "USA 250",
  "B8O",
  "生日快乐",
  "平安2026",
  "LOVE\n2026",
])
  test(`preserves every contour in ${value}`, async () => {
    const c = composition(value),
      g = await buildGeometry(c, font),
      route = planRoute(g, c),
      plan = projectRoute(route, place);
    assert.ok(g[0].strokes.length > 0);
    assert.ok(plan.legs.length > 0);
    for (const stroke of g[0].strokes)
      for (const p of stroke.points)
        assert.ok(
          route.segments.some(
            (s) =>
              Math.hypot(s.from.x - p.x, s.from.y - p.y) < 1e-6 ||
              Math.hypot(s.to.x - p.x, s.to.y - p.y) < 1e-6,
          ),
          "contour vertex missing",
        );
    for (let i = 1; i < route.segments.length; i++)
      assert.deepEqual(route.segments[i - 1].to, route.segments[i].from);
    assert.equal(plan.waypoints.length, plan.legs.length + 1);
    assert.ok(
      Math.abs(
        plan.legs.reduce((v, l) => v + l.distanceNm, 0) - plan.distanceNm,
      ) < 1e-8,
    );
    assert.deepEqual(planRoute(g, c), route, "route must be deterministic");
  });
test("preserves O/B/8 internal contours", () => {
  const strokes = outlineText(text("OB8"), font);
  assert.ok(strokes.filter((s) => s.hole).length >= 5);
});
test("all 30 presets generate nonzero continuous tracks", async () => {
  assert.equal(PRESETS.length, 30);
  for (const preset of PRESETS) {
    const c: Composition = {
      version: 1,
      name: preset.name,
      elements: [{ ...text(""), kind: "preset", value: preset.id }],
    };
    const g = await buildGeometry(c, font),
      r = planRoute(g, c);
    assert.ok(r.segments.length > 0, preset.id);
    for (let i = 1; i < r.segments.length; i++)
      assert.deepEqual(r.segments[i - 1].to, r.segments[i].from);
    assert.ok(projectRoute(r, place).distanceNm > 0);
  }
});
test("Christmas 2026 composition preserves first element and connections", async () => {
  const c = { ...DEFAULT_COMPOSITION, firstElement: "year" };
  const g = await buildGeometry(c, font),
    r = planRoute(g, c);
  assert.equal(r.segments[0].elementId, "year");
  assert.ok(r.segments.some((s) => s.kind === "connection"));
});
test("start anchor, doubled scale, repositioning and return legs", async () => {
  const c = composition("LOVE"),
    r = planRoute(await buildGeometry(c, font), c),
    p = projectRoute(r, { ...place, mode: "start" });
  assert.deepEqual(
    { lat: p.waypoints[0].lat, lon: p.waypoints[0].lon },
    place.anchor,
  );
  const p2 = projectRoute(r, {
    ...place,
    mode: "start",
    metersPerUnit: place.metersPerUnit * 2,
  });
  assert.ok(Math.abs(p2.distanceNm / p.distanceNm - 2) < 0.001);
  const trip = projectRoute(r, { ...place, airport: true, roundTrip: true });
  assert.deepEqual(
    { lat: trip.waypoints[0].lat, lon: trip.waypoints[0].lon },
    place.anchor,
  );
  assert.equal(trip.legs[0].kind, "airport");
  assert.equal(trip.legs.at(-1)!.kind, "airport");
  assert.ok(trip.distanceNm > p.distanceNm);
});
test("geodesics in northern/southern hemispheres and across date line", () => {
  for (const anchor of [
    { lat: 40, lon: -75 },
    { lat: -33, lon: 151 },
    { lat: 0, lon: 179.99 },
  ]) {
    const east = direct(anchor, 1852, 0),
      north = direct(anchor, 0, 1852);
    assert.ok(Math.abs(inverse(anchor, east).distanceNm - 1) < 1e-8);
    assert.ok(Math.abs(inverse(anchor, east).track - 90) < 1e-6);
    assert.ok(Math.abs(inverse(anchor, north).track) < 1e-6);
  }
  assert.ok(direct({ lat: 0, lon: 179.99 }, 5000, 0).lon < 0);
});
test("exports preserve waypoint count, order and boundary overlaps", async () => {
  const c = composition("O"),
    plan = projectRoute(planRoute(await buildGeometry(c, font), c), place),
    tokens = foreflightRoute(plan).split(" ");
  assert.equal(tokens.length, plan.waypoints.length);
  tokens.forEach((t, i) => {
    const [lat, lon] = t.split("/");
    assert.ok(
      Math.abs(
        parseFloat(lat) * (lat.endsWith("S") ? -1 : 1) - plan.waypoints[i].lat,
      ) < 1e-7,
    );
    assert.ok(
      Math.abs(
        parseFloat(lon) * (lon.endsWith("W") ? -1 : 1) - plan.waypoints[i].lon,
      ) < 1e-7,
    );
  });
  assert.ok(
    tokens.every((t) => /^\d{1,2}\.\d{7}[NS]\/\d{1,3}\.\d{7}[EW]$/.test(t)),
  );
  const parts = splitRoute(plan, 20).map((p) => p.split(" "));
  for (let i = 1; i < parts.length; i++)
    assert.equal(parts[i - 1].at(-1), parts[i][0]);
  assert.equal(
    parts.reduce((n, p) => n + p.length, 0) - (parts.length - 1),
    tokens.length,
  );
  assert.equal(
    (waypointKml(plan).match(/<Point>/g) ?? []).length,
    plan.waypoints.length,
  );
  assert.ok(trackKml(plan).includes(plan.waypoints[0].lon.toFixed(7)));
  assert.equal(navlogCsv(plan, 100).split("\r\n").length, plan.legs.length + 1);
  const pdf = await navlogPdf(plan, 100);
  assert.ok(new TextDecoder().decode(pdf.slice(0, 4)).startsWith("%PDF"));
});
test("rounding does not silently shrink impossible radii", async () => {
  const c: Composition = {
      version: 1,
      name: "square",
      elements: [{ ...text(""), kind: "preset", value: "square" }],
    },
    r = planRoute(await buildGeometry(c, font), c),
    p = projectRoute(r, { ...place, radiusNm: 20 });
  assert.ok(p.warnings.some((w) => w.includes("could not fit")));
  assert.ok(p.legs.length >= r.segments.length);
});
test("rejects missing characters, invalid scale and corrupted saved projects", async () => {
  assert.throws(() => outlineText(text("🦄"), font), /Unsupported/);
  const c = composition("LOVE"),
    r = planRoute(await buildGeometry(c, font), c);
  assert.throws(
    () => projectRoute(r, { ...place, metersPerUnit: 0 }),
    /positive/,
  );
  assert.throws(() => validateProject({ schema: "wrong" }));
  const p = {
    schema: "pilotseal-sky-art",
    version: 1,
    composition: c,
    placement: place,
    variant: "balanced",
    savedAt: "",
  };
  assert.equal(validateProject(p).composition.name, "LOVE");
  assert.throws(() =>
    validateProject({
      ...p,
      composition: { ...c, elements: [c.elements[0], c.elements[0]] },
    }),
  );
});
test("open contour paths remain continuous and preserve inner-loop identity", async () => {
  const c = { ...composition("B8O"), connectionMode: "open" as const },
    g = await buildGeometry(c, font),
    r = planRoute(g, c);
  for (let i = 1; i < r.segments.length; i++)
    assert.deepEqual(r.segments[i - 1].to, r.segments[i].from);
  assert.ok(g[0].strokes.filter((s) => s.hole).length >= 5);
  assert.ok(r.segments.some((s) => s.kind === "connection"));
  assert.ok(r.segments.length > g[0].strokes.length);
});
test("10-character performance cases, all variants and total text limit", async () => {
  for (const value of ["LOVE2026AB", "生日快乐平安顺遂幸福"]) {
    const c = composition(value),
      g = await buildGeometry(c, font);
    const start = performance.now();
    const r = planRoute(g, c);
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 3000, `${value}: ${elapsed.toFixed(0)} ms`);
    assert.ok(r.segments.length > 0);
    for (const variant of ["shortest", "cleanest"] as const)
      assert.ok(planRoute(g, c, variant).segments.length > 0);
  }
  await assert.rejects(
    buildGeometry(
      {
        ...composition("A".repeat(20)),
        elements: [
          text("A".repeat(20)),
          { ...text("B".repeat(20)), id: "second" },
        ],
      },
      font,
    ),
    /30 characters/,
  );
});
test("one-line connections preserve endpoint directions without a collinear U-turn cusp", async () => {
  const { connectionCurve, joinAngle } =
    await import("../lib/sky-art/connections");
  for (const [before, after] of [
    [
      [
        { x: -10, y: 0 },
        { x: 0, y: 0 },
      ],
      [
        { x: 20, y: 20 },
        { x: 20, y: 30 },
      ],
    ],
    [
      [
        { x: -10, y: 0 },
        { x: 0, y: 0 },
      ],
      [
        { x: -20, y: 0 },
        { x: -30, y: 0 },
      ],
    ],
    [
      [
        { x: -10, y: 0 },
        { x: 0, y: 0 },
      ],
      [
        { x: 0, y: 0 },
        { x: 0, y: 10 },
      ],
    ],
  ]) {
    const p = connectionCurve(before, after);
    assert.deepEqual(p[0], before.at(-1));
    assert.deepEqual(p.at(-1), after[0]);
    assert.ok(joinAngle(before[0], p[0], p[1]) < 10);
    assert.ok(joinAngle(p.at(-2)!, p.at(-1)!, after[1]) < 10);
    for (let i = 1; i < p.length - 1; i++)
      assert.ok(
        joinAngle(p[i - 1], p[i], p[i + 1]) < 90,
        "transition should not reverse at a cusp",
      );
  }
  const c = composition("LOVE"),
    r = planRoute(await buildGeometry(c, font), c);
  for (let i = 1; i < r.segments.length; i++)
    assert.deepEqual(r.segments[i - 1].to, r.segments[i].from);
  for (let i = 1; i < r.segments.length; i++) {
    const a = r.segments[i - 1],
      b = r.segments[i];
    if (a.kind !== b.kind)
      assert.ok(
        joinAngle(a.from, a.to, b.to) < 12,
        "art-to-connection tangent discontinuity",
      );
  }
});
test("single-line and English script fonts use local assets and generate continuous routes", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    assert.ok(
      [
        "/sky-art/fonts/hershey.json",
        "/sky-art/fonts/chinese-single.json",
      ].includes(url),
    );
    return new Response(fs.readFileSync(`public${url}`), {
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    for (const [value, style] of [
      ["LOVE", "single"],
      ["生日快乐", "single"],
      ["Love2026", "script"],
    ] as const) {
      const c = composition(value);
      c.elements[0].font = style;
      const g = await buildGeometry(c, font),
        r = planRoute(g, c);
      assert.ok(r.segments.length > 0);
      for (let i = 1; i < r.segments.length; i++)
        assert.deepEqual(r.segments[i - 1].to, r.segments[i].from);
    }
    const c = composition("平安");
    c.elements[0].font = "script";
    await assert.rejects(buildGeometry(c, font), /English/);
  } finally {
    globalThis.fetch = original;
  }
});
test("branched presets do not contain an instantaneous reversal in the one-line trace", async () => {
  const { joinAngle } = await import("../lib/sky-art/connections");
  for (const id of PRESETS.map((p) => p.id)) {
    const c: Composition = {
        version: 1,
        name: id,
        elements: [{ ...text(""), kind: "preset", value: id }],
      },
      r = planRoute(await buildGeometry(c, font), c);
    for (let i = 1; i < r.segments.length; i++) {
      const a = r.segments[i - 1],
        b = r.segments[i];
      assert.deepEqual(a.to, b.from);
      assert.ok(
        joinAngle(a.from, a.to, b.to) < 150,
        `${id}: unresolved reversal at segment ${i}`,
      );
    }
  }
});
test("moved start and airport return remain one tangent-connected track from the anchor", async () => {
  const c = composition("LOVE"),
    r = planRoute(await buildGeometry(c, font), c);
  for (const rotation of [0, 45, 180]) {
    const p = projectRoute(r, {
      ...place,
      mode: "start",
      offsetX: 5000,
      offsetY: -3000,
      rotation,
      airport: true,
      roundTrip: true,
    });
    assert.deepEqual(
      { lat: p.waypoints[0].lat, lon: p.waypoints[0].lon },
      place.anchor,
    );
    assert.deepEqual(
      { lat: p.waypoints.at(-1)!.lat, lon: p.waypoints.at(-1)!.lon },
      place.anchor,
    );
    for (let i = 1; i < p.legs.length; i++) {
      const a = p.legs[i - 1],
        b = p.legs[i];
      assert.deepEqual(a.to, b.from);
      if ((a.kind === "airport") !== (b.kind === "airport")) {
        const diff = Math.abs(((b.track - a.track + 540) % 360) - 180);
        assert.ok(diff < 12, `anchor transition ${i}: ${diff}`);
      }
    }
  }
});

test("ForeFlight GPX conforms to GPX 1.1 and preserves repeated visits and date-line points", async () => {
  const c = composition("O"),
    plan = projectRoute(planRoute(await buildGeometry(c, font), c), place);
  const cases = [
    plan,
    {
      ...plan,
      waypoints: [
        { id: "A", lat: 40, lon: -75 },
        { id: "B", lat: 40.000001, lon: -75.000001 },
        { id: "C", lat: 40, lon: -75 },
        { id: "D", lat: -33, lon: 180 },
        { id: "E", lat: -33.000001, lon: 179.99999999 },
        { id: "F", lat: 0, lon: -180 },
      ],
    },
  ];
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pilotseal-gpx-"));
  try {
    for (const [index, sample] of cases.entries()) {
      const name = "LOVE & <2026> 中文",
        gpx = path.join(directory, `route-${index}.gpx`),
        expected = path.join(directory, `expected-${index}.json`);
      fs.writeFileSync(gpx, routeGpx(sample, name));
      fs.writeFileSync(
        expected,
        JSON.stringify({ name, waypoints: sample.waypoints }),
      );
      const python =
        process.env.SKY_ART_PYTHON ??
        "/Users/ruben/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
      const result = spawnSync(
        python,
        ["scripts/validate-sky-art-gpx.py", gpx, "--expected", expected],
        { encoding: "utf8" },
      );
      assert.equal(result.status, 0, result.stderr || result.error?.message);
      assert.match(result.stdout, /GPX 1.1 validated/);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("navigation reduction bounds error and retains corners, visits and transition tangents", () => {
  const points = Array.from({ length: 101 }, (_, i) => ({
    x: i,
    y: 10 * Math.sin(i / 25),
  }));
  points.push({ x: 100, y: 30 }, { x: 0, y: 30 }, points[0]);
  const segments = points.slice(1).map((to, i) => ({
    from: points[i],
    to,
    kind: "art" as const,
    elementId: "test",
  }));
  const reduced = navigationSegments(segments, 0.5);
  assert.ok(reduced.length < segments.length / 2);
  assert.deepEqual(reduced[0].from, points[0]);
  assert.deepEqual(reduced.at(-1)!.to, points[0]);
  let sourceIndex = 0;
  for (const s of reduced) {
    const end = points.findIndex((p, i) => i > sourceIndex && p === s.to);
    assert.ok(end > sourceIndex, "route order preserved");
    const length2 = distance(s.from, s.to) ** 2;
    for (const p of points.slice(sourceIndex, end + 1)) {
      const t = Math.max(
        0,
        Math.min(
          1,
          ((p.x - s.from.x) * (s.to.x - s.from.x) +
            (p.y - s.from.y) * (s.to.y - s.from.y)) /
            length2,
        ),
      );
      assert.ok(distance(p, lerp(s.from, s.to, t)) <= 0.500001);
    }
    sourceIndex = end;
  }
  assert.ok(
    reduced.some((s) => s.to === points[101]),
    "sharp corner retained",
  );
  const transition = segments.map((s, i) => ({
    ...s,
    kind: i < 50 ? ("art" as const) : ("connection" as const),
  }));
  const joined = navigationSegments(transition, 5);
  for (const index of [48, 50, 52])
    assert.ok(
      joined.some((s) => s.from === points[index] || s.to === points[index]),
    );
});
test("Christmas export reduces navigation points while sharing one route across all outputs", async () => {
  const geometry = planRoute(
    await buildGeometry(DEFAULT_COMPOSITION, font),
    DEFAULT_COMPOSITION,
  );
  const placement = {
    ...DEFAULT_PLACEMENT,
    mode: "start" as const,
    airport: true,
    roundTrip: true,
  };
  const full = projectRoute(geometry, { ...placement, waypointToleranceNm: 0 });
  const reduced = projectRoute(geometry, placement);
  assert.ok(reduced.waypoints.length < full.waypoints.length * 0.6);
  assert.ok(
    Math.abs(full.distanceNm - reduced.distanceNm) / full.distanceNm < 0.01,
  );
  assert.deepEqual(reduced.waypoints[0], full.waypoints[0]);
  assert.deepEqual(
    { lat: reduced.waypoints.at(-1)!.lat, lon: reduced.waypoints.at(-1)!.lon },
    placement.anchor,
  );
  assert.equal(
    (routeGpx(reduced, "test").match(/<rtept /g) ?? []).length,
    reduced.waypoints.length,
  );
  assert.equal(
    navlogCsv(reduced).trim().split("\n").length,
    reduced.legs.length + 1,
  );
  assert.throws(() =>
    projectRoute(geometry, { ...placement, waypointToleranceNm: -1 }),
  );
});

test("Christmas 2026 contour seam refinement avoids the extra lettering crossing", async () => {
  const geometry = await buildGeometry(DEFAULT_COMPOSITION, font);
  const route = planRoute(geometry, DEFAULT_COMPOSITION);
  const strokes = geometry.flatMap((e) => e.strokes);
  const crossings = route.segments
    .filter((s) => s.kind === "connection")
    .reduce(
      (total, s) =>
        total +
        strokes.reduce(
          (count, stroke) =>
            count +
            stroke.points.filter((p, i) =>
              intersects(
                s.from,
                s.to,
                p,
                stroke.points[(i + 1) % stroke.points.length],
              ),
            ).length,
          0,
        ),
      0,
    );
  assert.ok(crossings <= 2, `unnecessary lettering crossings: ${crossings}`);
  for (const stroke of strokes) {
    const b = bounds(stroke.points);
    const allowedGap =
      stroke.elementId === "year" ? Math.max(b.width, b.height) * 0.008 : 0;
    for (const point of stroke.points)
      assert.ok(
        route.segments.some(
          (s) =>
            distance(s.from, point) <= allowedGap + 1e-6 ||
            distance(s.to, point) <= allowedGap + 1e-6,
        ),
        "contour preserved apart from configured small openings",
      );
  }
  const complete = planRoute(geometry, {
    ...DEFAULT_COMPOSITION,
    connectionMode: "complete",
  });
  for (const stroke of strokes)
    for (const point of stroke.points)
      assert.ok(
        complete.segments.some(
          (s) => distance(s.from, point) < 1e-6 || distance(s.to, point) < 1e-6,
        ),
        "complete mode preserves every contour vertex",
      );
  for (let i = 1; i < route.segments.length; i++)
    assert.deepEqual(route.segments[i - 1].to, route.segments[i].from);
});

test("outline counters are local detours with external-only flight ports", () => {
  for (const value of ["0", "6", "8", "9", "B", "日"]) {
    const source = outlineText(text(value), font);
    const joined = joinCounters(source);
    assert.equal(joined.strokes.filter((s) => s.hole).length, 0, value);
    for (const stroke of source)
      for (const point of stroke.points)
        assert.ok(
          joined.strokes.some((s) => s.points.includes(point)),
          `${value}: original outline remains`,
        );
    for (const stroke of joined.strokes)
      for (const port of stroke.externalPorts ?? [])
        assert.ok(
          source.some(
            (s) =>
              !s.hole &&
              s.points.some((a, i) => {
                const b = s.points[(i + 1) % s.points.length];
                return (
                  distance(a, port) + distance(port, b) - distance(a, b) < 1e-6
                );
              }),
          ),
          `${value}: counter cannot become an external entry`,
        );
    assert.ok(joined.bridges.size > 0, value);
  }
});
test("2026 inter-character connections stay within the lettering band without large U detours", async () => {
  const c = {
    ...DEFAULT_COMPOSITION,
    elements: DEFAULT_COMPOSITION.elements.filter((e) => e.id === "year"),
  };
  const source = await buildGeometry(c, font),
    route = planRoute(source, c);
  const b = bounds(source.flatMap((e) => e.strokes.flatMap((s) => s.points)));
  for (const s of route.segments.filter((s) => s.kind === "connection"))
    for (const p of [s.from, s.to]) {
      assert.ok(
        p.y >= b.minY - 3 && p.y <= b.maxY + 3,
        "connector must stay beside the letters",
      );
      assert.ok(
        p.x >= b.minX - 3 && p.x <= b.maxX + 3,
        "connector must stay beside the letters",
      );
    }
});

test("maximum 30-character outline composition still generates with a preset and local counter detours", async () => {
  const c = structuredClone(DEFAULT_COMPOSITION);
  c.elements[1].value = "B8O".repeat(10);
  const geometry = await buildGeometry(c, font);
  const route = planRoute(geometry, c);
  assert.ok(route.segments.length > 0);
  for (let i = 1; i < route.segments.length; i++)
    assert.deepEqual(route.segments[i - 1].to, route.segments[i].from);
  assert.ok(projectRoute(route, DEFAULT_PLACEMENT).distanceNm > 0);
});

test("general outline routing does not add repeated contour edges to change exits", async () => {
  for (const value of [
    "202",
    "2026",
    "0123456789",
    "LOVE",
    "HAPPY",
    "平安2026",
  ]) {
    const c = { ...composition(value), connectionMode: "open" as const };
    const route = planRoute(await buildGeometry(c, font), c);
    const edges = new Set<string>();
    for (const s of route.segments.filter((s) => s.kind === "art")) {
      const points = [s.from, s.to]
        .map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`)
        .sort();
      const key = points.join(":");
      assert.ok(!edges.has(key), `${value}: unnecessary repeated contour edge`);
      edges.add(key);
    }
  }
});
test("round-trip candidate optimisation does not lengthen a simple outline word return", async () => {
  const c = { ...composition("2026"), connectionMode: "open" as const };
  const geometry = await buildGeometry(c, font);
  const placement = {
    ...DEFAULT_PLACEMENT,
    mode: "start" as const,
    airport: true,
    roundTrip: true,
  };
  const open = projectRoute(
    planRoute(geometry, c, "shortest", false),
    placement,
  );
  const closed = projectRoute(
    planRoute(geometry, c, "shortest", true),
    placement,
  );
  assert.ok(closed.distanceNm <= open.distanceNm + 0.02);
  assert.deepEqual(
    { lat: closed.waypoints[0].lat, lon: closed.waypoints[0].lon },
    placement.anchor,
  );
  assert.deepEqual(
    { lat: closed.waypoints.at(-1)!.lat, lon: closed.waypoints.at(-1)!.lon },
    placement.anchor,
  );
});

test("moving SWAN reselects the drawing end without moving the artwork frame", async () => {
  const c = { ...composition("SWAN"), connectionMode: "open" as const },
    g = await buildGeometry(c, font);
  const p = {
    ...DEFAULT_PLACEMENT,
    mode: "center" as const,
    airport: true,
    roundTrip: false,
  };
  const ne = planPlacedRoute(g, c, "balanced", {
    ...p,
    offsetX: -15000,
    offsetY: -5000,
  });
  const sw = planPlacedRoute(g, c, "balanced", {
    ...p,
    offsetX: 15000,
    offsetY: 5000,
  });
  assert.ok(
    ne.segments[0].from.x > sw.segments[0].from.x + 100,
    "entry follows the airport-facing end of the word",
  );
  assert.deepEqual(ne.bounds, sw.bounds);
  assert.deepEqual(ne.origin, sw.origin);
  const plan = projectRoute(ne, { ...p, offsetX: -15000, offsetY: -5000 });
  assert.equal(plan.legs[0].kind, "airport");
  assert.deepEqual(
    { lat: plan.waypoints[0].lat, lon: plan.waypoints[0].lon },
    p.anchor,
  );
});
test("movement in start mode preserves the artwork reference while reseaming the route", async () => {
  const c = { ...composition("SWAN"), connectionMode: "open" as const },
    g = await buildGeometry(c, font);
  const p = {
    ...DEFAULT_PLACEMENT,
    mode: "start" as const,
    airport: true,
    roundTrip: true,
  };
  const first = planPlacedRoute(g, c, "balanced", p),
    moved = planPlacedRoute(g, c, "balanced", {
      ...p,
      offsetX: -15000,
      offsetY: -5000,
    });
  assert.deepEqual(first.origin, moved.origin);
  assert.deepEqual(first.bounds, moved.bounds);
  const plan = projectRoute(moved, { ...p, offsetX: -15000, offsetY: -5000 });
  assert.deepEqual(plan.waypoints[0].lat, plan.waypoints.at(-1)!.lat);
  assert.deepEqual(plan.waypoints[0].lon, plan.waypoints.at(-1)!.lon);
});
test("cross-element connector avoids traversing the interior of a closed box", () => {
  const box = {
    closed: true,
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ],
  };
  const curve = clearConnection(
    [
      { x: 50, y: 160 },
      { x: 50, y: 140 },
    ],
    [
      { x: 50, y: -40 },
      { x: 50, y: -60 },
    ],
    [box],
  );
  assert.deepEqual(curve[0], { x: 50, y: 140 });
  assert.deepEqual(curve.at(-1), { x: 50, y: -40 });
  for (const p of curve)
    assert.ok(
      !(p.x > 0 && p.x < 100 && p.y > 0 && p.y < 100),
      "connector must go around the box",
    );
});

test("airport-facing element is drawn first in an RSW and cake composition", async () => {
  const c: Composition = {
    version: 1,
    name: "RSW cake",
    connectionMode: "open",
    elements: [
      { ...text("RSW"), id: "word", x: 250, y: 250 },
      {
        ...text(""),
        id: "cake",
        kind: "preset",
        value: "cake",
        x: 650,
        y: 150,
      },
    ],
  };
  const g = await buildGeometry(c, font),
    p = {
      ...DEFAULT_PLACEMENT,
      mode: "center" as const,
      airport: true,
      roundTrip: true,
      offsetX: -25000,
      offsetY: -14000,
    };
  const route = planPlacedRoute(g, c, "balanced", p);
  assert.equal(route.segments[0].elementId, "cake");
  const plan = projectRoute(route, p);
  assert.equal(plan.legs[0].kind, "airport");
  for (let i = 1; i < route.segments.length; i++)
    assert.deepEqual(route.segments[i - 1].to, route.segments[i].from);
});

test("ForeFlight launch URL preserves the complete ordered route", async () => {
  const c = composition("2026");
  const plan = projectRoute(planRoute(await buildGeometry(c, font), c), place);
  const url = new URL(foreflightUrl(plan));
  assert.equal(url.protocol, "foreflightmobile:");
  assert.equal(url.hostname, "maps");
  assert.equal(url.pathname, "/search");
  assert.equal(url.searchParams.get("q"), foreflightRoute(plan));
});

test("successive text blocks choose independent directions", async () => {
  const c: Composition = {
    version: 1,
    name: "Independent word directions",
    connectionMode: "open",
    firstElement: "heart",
    elements: [
      {
        ...text(""),
        id: "heart",
        kind: "preset",
        value: "heart",
        x: 900,
        y: 100,
      },
      { ...text("RSW"), id: "word", x: 100, y: 100 },
      { ...text("生日快乐"), id: "birthday", x: 100, y: 500 },
    ],
  };
  const g = await buildGeometry(c, font);
  const route = planRoute(g, c, "balanced", false, {
    point: { x: 1100, y: -100 },
    return: false,
  });
  assert.deepEqual(
    route.visitOrder
      ?.filter((v) => v.elementId === "word")
      .map((v) => v.character),
    [2, 1, 0],
  );
  assert.deepEqual(
    route.visitOrder
      ?.filter((v) => v.elementId === "birthday")
      .map((v) => v.character),
    [0, 1, 2, 3],
  );
  for (let i = 1; i < route.segments.length; i++)
    assert.deepEqual(route.segments[i - 1].to, route.segments[i].from);
});
