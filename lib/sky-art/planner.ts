import type {
  Composition,
  GeometryElement,
  Point,
  RouteGeometry,
  RouteSegment,
  Stroke,
  Variant,
} from "./types";
import { connectionCurve, curveLength, joinAngle } from "./connections";
import { bounds, distance, intersects, pointInPolygon, lerp } from "./geometry";
import { clearConnection } from "./clear-connections";
import { joinCounters, edgeKey } from "./contours";
function openStroke(s: Stroke, start: number, reverse: boolean): Point[] {
  if (!s.closed) return reverse ? [...s.points].reverse() : s.points;
  const p = Array.from(
    { length: s.points.length },
    (_, i) =>
      s.points[
        (start + (reverse ? -i : i) + s.points.length) % s.points.length
      ],
  );
  if (s.gap) {
    const r = bounds(p),
      gap = Math.max(r.width, r.height) * 0.008,
      first = p[0],
      second = p[1],
      last = p[p.length - 1],
      entry = lerp(
        first,
        second,
        Math.min(0.2, gap / Math.max(1e-9, distance(first, second))),
      ),
      exit = lerp(
        first,
        last,
        Math.min(0.2, gap / Math.max(1e-9, distance(first, last))),
      );
    return [entry, ...p.slice(1), exit];
  }
  return [...p, p[0]];
}
function options(s: Stroke): Point[][] {
  if (!s.closed) return [s.points, [...s.points].reverse()];
  const ports = s.points
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => !s.externalPorts || s.externalPorts.includes(p));
  const extrema = [
    ports.reduce((a, b) => (b.p.x < a.p.x ? b : a)),
    ports.reduce((a, b) => (b.p.x > a.p.x ? b : a)),
    ports.reduce((a, b) => (b.p.y < a.p.y ? b : a)),
    ports.reduce((a, b) => (b.p.y > a.p.y ? b : a)),
  ].map((p) => p.i);
  const n = Math.min(8, ports.length);
  const seams = [
    ...new Set([
      ...(s.preferredPorts ?? []).map((point) => s.points.indexOf(point)),
      ...extrema,
      ...Array.from(
        { length: n },
        (_, i) => ports[Math.floor((i * ports.length) / n)].i,
      ),
    ]),
  ];
  return seams.flatMap((i) => [
    openStroke(s, i, false),
    openStroke(s, i, true),
  ]);
}

type Obstacle = {
  stroke: Stroke;
  bounds: ReturnType<typeof bounds>;
  edges: {
    from: Point;
    to: Point;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  }[];
};
const pointOwners = new WeakMap<Point, string>();
function isCrossElement(previous: Point[], next: Point[]) {
  const from = pointOwners.get(previous.at(-2) ?? previous[0]),
    to = pointOwners.get(next[1] ?? next[0]);
  return !from || !to || from !== to;
}
function connectionCost(
  previous: Point[],
  next: Point[],
  obstacles: Obstacle[],
  height: number,
  variant: Variant,
  clearCrossElement = false,
): number {
  const curve =
      variant === "shortest" ||
      !clearCrossElement ||
      !isCrossElement(previous, next)
        ? connectionCurve(previous, next)
        : clearConnection(
            previous,
            next,
            obstacles.map((o) => o.stroke),
          ),
    d = curveLength(curve);
  let penalty = 0;
  const a = previous.at(-1)!,
    prior = previous.at(-2) ?? a,
    b = next[0],
    after = next[1] ?? b;
  const chord = { x: b.x - a.x, y: b.y - a.y },
    chordLength = Math.hypot(chord.x, chord.y);
  if (variant !== "shortest" && chordLength > 1e-7) {
    const forward = (u: Point) =>
      (u.x * chord.x + u.y * chord.y) /
      (Math.hypot(u.x, u.y) * chordLength || 1);
    // A normal transition progresses toward its destination at both ends.
    // Reversal is a fallback when the supplied geometry offers no such port.
    if (forward({ x: a.x - prior.x, y: a.y - prior.y }) < -0.05)
      penalty += height * 20;
    if (forward({ x: after.x - b.x, y: after.y - b.y }) < -0.05)
      penalty += height * 20;
  }

  const r = bounds(curve);
  if (variant !== "shortest")
    for (const { stroke: s, bounds: o, edges } of obstacles) {
      if (
        r.maxX < o.minX ||
        r.minX > o.maxX ||
        r.maxY < o.minY ||
        r.minY > o.maxY
      )
        continue;
      for (let k = 1; k < curve.length; k++) {
        const start = curve[k - 1],
          end = curve[k],
          midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
        if (
          s.hole &&
          midpoint.x > o.minX &&
          midpoint.x < o.maxX &&
          midpoint.y > o.minY &&
          midpoint.y < o.maxY &&
          pointInPolygon(midpoint, s.points)
        )
          penalty += height * (variant === "cleanest" ? 3 : 1.5);
        const minX = Math.min(start.x, end.x),
          maxX = Math.max(start.x, end.x),
          minY = Math.min(start.y, end.y),
          maxY = Math.max(start.y, end.y);
        for (const edge of edges) {
          if (
            maxX < edge.minX ||
            minX > edge.maxX ||
            maxY < edge.minY ||
            minY > edge.maxY
          )
            continue;
          if (intersects(start, end, edge.from, edge.to)) {
            const u = { x: end.x - start.x, y: end.y - start.y },
              v = { x: edge.to.x - edge.from.x, y: edge.to.y - edge.from.y };
            const denominator = u.x * v.y - u.y * v.x;
            const t =
              ((edge.from.x - start.x) * v.y - (edge.from.y - start.y) * v.x) /
              denominator;
            const crossing = lerp(start, end, t);
            const first = curve[0],
              last = curve[curve.length - 1];
            const clearance = Math.max(o.width, o.height) * 0.012;
            if (
              distance(crossing, first) > clearance &&
              distance(crossing, last) > clearance
            )
              penalty += height * (variant === "cleanest" ? 2 : 0.8);
          }
        }
      }
    }
  return d + penalty;
}

function planCharacter(
  strokes: Stroke[],
  previous: Point[] | undefined,
  obstacles: Obstacle[],
  height: number,
  variant: Variant,
  target: Point[][] | undefined,
  memo: Map<string, number>,
): Point[][] {
  const memoCost = (a: Point[], b: Point[]) => {
    const last = a[a.length - 1],
      prior = a[Math.max(0, a.length - 2)],
      first = b[0],
      second = b[1] ?? first,
      key = `${prior.x},${prior.y},${last.x},${last.y},${first.x},${first.y},${second.x},${second.y}`;
    const found = memo.get(key);
    if (found !== undefined) return found;
    const value = connectionCost(a, b, obstacles, height, variant);
    memo.set(key, value);
    return value;
  };
  const original = strokes.map((s) => ({ s, choices: options(s) })),
    initial = original
      .flatMap((o, index) =>
        o.choices.map((path) => ({
          index,
          path,
          cost: previous ? memoCost(previous, path) : 0,
        })),
      )
      .sort((a, b) => a.cost - b.cost);
  // Include geographically distinct starting seams, rather than only the nearest point.
  const distinctSeeds = initial
    .filter(
      (v, i) =>
        i === 0 || distance(v.path[0], initial[i - 1].path[0]) > height * 0.01,
    )
    .slice(0, 8);
  // A nearer outer contour must not exclude every inner-contour start.
  const contourSeeds = original.map((_, index) =>
    initial.find((s) => s.index === index)!,
  );
  const seeds = [...contourSeeds, ...distinctSeeds]
    .filter(
      (seed, index, list) =>
        list.findIndex((s) => s.path === seed.path) === index,
    )
    .slice(0, Math.max(8, contourSeeds.length));
  const score = (paths: Point[][]) => {
    let cost =
      paths.reduce((sum, path) => sum + curveLength(path), 0) +
      (previous ? memoCost(previous, paths[0]) : 0);
    for (let i = 1; i < paths.length; i++)
      cost += memoCost(paths[i - 1], paths[i]);
    if (target?.length)
      cost += Math.min(
        ...target.map((p) => memoCost(paths[paths.length - 1], p)),
      );
    return cost;
  };
  if (original.length === 1) {
    const candidates = original[0].choices;
    return [
      candidates.reduce((best, path) =>
        score([path]) < score([best]) ? path : best,
      ),
    ];
  }
  let best: Point[][] = [],
    bestCost = Infinity;
  for (const seed of seeds) {
    const remaining = original.filter((_, i) => i !== seed.index),
      ordered = [seed.path];
    while (remaining.length) {
      let selected = 0,
        path = remaining[0].choices[0],
        low = Infinity;
      for (let i = 0; i < remaining.length; i++)
        for (const p of remaining[i].choices) {
          let c = memoCost(ordered[ordered.length - 1], p);
          if (remaining.length === 1 && target?.length)
            c += Math.min(...target.map((t) => memoCost(p, t)));
          if (c < low) {
            low = c;
            selected = i;
            path = p;
          }
        }
      ordered.push(path);
      remaining.splice(selected, 1);
    }
    // Two-opt reverses a contiguous block and each stroke's flight direction.
    for (let pass = 0; pass < 2; pass++) {
      let changed = false;
      for (let i = 0; i < ordered.length; i++)
        for (let j = i; j < ordered.length; j++) {
          if (ordered.length > 24 && j - i > 4) continue;
          const candidate = [
            ...ordered.slice(0, i),
            ...ordered
              .slice(i, j + 1)
              .reverse()
              .map((p) => [...p].reverse()),
            ...ordered.slice(j + 1),
          ];
          if (score(candidate) + 1e-6 < score(ordered)) {
            ordered.splice(0, ordered.length, ...candidate);
            changed = true;
          }
        }
      if (!changed) break;
    }
    const cost = score(ordered);
    if (cost < bestCost) {
      bestCost = cost;
      best = ordered;
    }
  }
  // Ordering alone cannot fix a poor entry/exit seam. Revisit each contour
  // against both neighbours after choosing the complete character route.
  const owners = best.map((path) =>
    original.find((o) => path.some((point) => o.s.points.includes(point)))!,
  );
  const localScore = (index: number, path: Point[]) => {
    const before = index ? best[index - 1] : previous;
    const after = best[index + 1];
    let cost = curveLength(path) + (before ? memoCost(before, path) : 0);
    if (after) cost += memoCost(path, after);
    else if (target?.length)
      cost += Math.min(...target.map((p) => memoCost(path, p)));
    return cost;
  };
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (let i = 0; i < best.length; i++) {
      let selected = best[i],
        low = localScore(i, selected);
      for (const candidate of owners[i].choices) {
        const cost = localScore(i, candidate);
        if (cost + 1e-6 < low) {
          selected = candidate;
          low = cost;
        }
      }
      if (selected !== best[i]) {
        best[i] = selected;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return best;
}
export function planRoute(
  geometry: GeometryElement[],
  composition: Composition,
  variant: Variant = "balanced",
  returnToStart = false,
  approach?: { point: Point; return: boolean },
): RouteGeometry {
  const textIds = new Set(
    composition.elements.filter((e) => e.kind === "text").map((e) => e.id),
  );
  geometry = geometry.map((e) => ({
    ...e,
    strokes: e.strokes.map((s) => ({
      ...s,
      gap: composition.connectionMode === "open" && textIds.has(e.id),
    })),
  }));
  const bridgeEdges = new Set<string>();
  if (composition.connectionMode === "open")
    geometry = geometry.map((element) => {
      if (!textIds.has(element.id)) return element;
      const strokes: Stroke[] = [];
      for (const character of new Set(
        element.strokes.map((s) => s.character),
      )) {
        const joined = joinCounters(
          element.strokes.filter((s) => s.character === character),
        );
        strokes.push(...joined.strokes);
        joined.bridges.forEach((edge) => bridgeEdges.add(edge));
      }
      return { ...element, strokes };
    });
  const all = geometry.flatMap((e) => e.strokes);
  if (!all.length)
    throw new Error("No paths found. Add visible text or a pattern.");
  const b = bounds(all.flatMap((s) => s.points)),
    height = Math.max(1, b.height),
    obstacles: Obstacle[] = all.map((stroke) => ({
      stroke,
      bounds: bounds(stroke.points),
      edges: Array.from(
        {
          length: stroke.closed
            ? stroke.points.length
            : stroke.points.length - 1,
        },
        (_, i) => {
          const from = stroke.points[i],
            to = stroke.points[(i + 1) % stroke.points.length];
          return {
            from,
            to,
            minX: Math.min(from.x, to.x),
            maxX: Math.max(from.x, to.x),
            minY: Math.min(from.y, to.y),
            maxY: Math.max(from.y, to.y),
          };
        },
      ),
    }));
  all.forEach((s) =>
    s.points.forEach((point) => pointOwners.set(point, s.elementId)),
  );
  const memo = new Map<string, number>();
  const remaining = [...geometry],
    orderedElements: GeometryElement[] = [];
  // Element order is fixed for a given composition; geographic transforms do not change it.
  const first = composition.firstElement
    ? remaining.findIndex((e) => e.id === composition.firstElement)
    : approach
      ? remaining.reduce((chosen, element, i) => {
          const near = (e: GeometryElement) =>
            Math.min(
              ...e.strokes.flatMap((s) =>
                s.points.map((p) => distance(p, approach.point)),
              ),
            );
          return near(element) < near(remaining[chosen]) ? i : chosen;
        }, 0)
      : 0;
  orderedElements.push(remaining.splice(Math.max(0, first), 1)[0]);
  while (remaining.length) {
    const last = orderedElements[orderedElements.length - 1];
    let chosen = 0,
      low = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const a = bounds(last.strokes.flatMap((s) => s.points)),
        b = bounds(remaining[i].strokes.flatMap((s) => s.points)),
        d = Math.hypot(
          Math.max(0, a.minX - b.maxX, b.minX - a.maxX),
          Math.max(0, a.minY - b.maxY, b.minY - a.maxY),
        );
      if (d < low) {
        low = d;
        chosen = i;
      }
    }
    orderedElements.push(remaining.splice(chosen, 1)[0]);
  }
  const groups = orderedElements.flatMap((element) =>
    [...new Set(element.strokes.map((s) => s.character))]
      .sort((a, b) => a - b)
      .map((ch) => ({
        id: element.id,
        character: ch,
        strokes: element.strokes.filter((s) => s.character === ch),
      })),
  );
  const costMemo = new Map<string, number>();
  const between = (a: Point[], b: Point[]) => {
    const key = [a[a.length - 2] ?? a[0], a[a.length - 1], b[0], b[1] ?? b[0]]
      .map((p) => `${p.x},${p.y}`)
      .join(":");
    const cached = costMemo.get(key);
    if (cached !== undefined) return cached;
    const cost = connectionCost(a, b, obstacles, height, variant, true);
    costMemo.set(key, cost);
    return cost;
  };
  // Compare complete character candidates together. A locally cheap exit must
  // not force the following character into a longer approach.
  const candidates = groups.map((group) => {
    if (group.strokes.length === 1)
      return options(group.strokes[0]).map((path) => [path]);
    const b = bounds(group.strokes.flatMap((s) => s.points));
    const center = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    const reach = Math.max(b.width, b.height, 1);
    const approaches: (Point[] | undefined)[] = [
      undefined,
      ...[
        { x: -1, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: -1 },
        { x: 0, y: 1 },
      ].map((v) => [
        { x: center.x + v.x * reach * 2, y: center.y + v.y * reach * 2 },
        { x: center.x + v.x * reach, y: center.y + v.y * reach },
      ]),
    ];
    const plans = approaches.map((previous) =>
      planCharacter(
        group.strokes,
        previous,
        obstacles,
        height,
        variant,
        undefined,
        memo,
      ),
    );
    return plans.flatMap((paths) => [
      paths,
      [...paths].reverse().map((path) => [...path].reverse()),
    ]);
  });
  const ownCosts = new WeakMap<Point[][], number>();
  const ownCost = (paths: Point[][]) => {
    const cached = ownCosts.get(paths);
    if (cached !== undefined) return cached;
    const cost = paths.reduce(
      (sum, path, i) =>
        sum + curveLength(path) + (i ? between(paths[i - 1], path) : 0),
      0,
    );
    ownCosts.set(paths, cost);
    return cost;
  };
  // Round trips also compare the return leg, instead of optimising the
  // artwork and attaching an unpriced return afterwards.
  let selected: number[] = [],
    selectedOrder: number[] = [],
    bestTotal = Infinity;
  const forward = groups.map((_, i) => i);
  // Each text block chooses its own traversal direction. Reversing every
  // block together prevents a right-to-left word followed by a left-to-right line.
  const permute = (items: GeometryElement[]): GeometryElement[][] =>
    items.length <= 1
      ? [items]
      : items.flatMap((item, i) =>
          permute(items.filter((_, j) => i !== j)).map((tail) => [
            item,
            ...tail,
          ]),
        );
  const tails =
    orderedElements.length <= 4
      ? permute(orderedElements.slice(1))
      : [orderedElements.slice(1)];
  const orders: number[][] = [];
  for (const tail of tails) {
    let variants: number[][] = [[]];
    for (const element of [orderedElements[0], ...tail]) {
      const block = forward.filter((i) => groups[i].id === element.id);
      const choices =
        approach && block.length > 1 ? [block, [...block].reverse()] : [block];
      variants = variants.flatMap((prefix) =>
        choices.map((choice) => [...prefix, ...choice]),
      );
    }
    orders.push(...variants);
  }
  const transitions = new Map<string, number[][]>();
  const transition = (from: number, to: number): number[][] => {
    const key = `${from}:${to}`;
    const cached = transitions.get(key);
    if (cached) return cached;
    const matrix = candidates[to].map((paths) =>
      candidates[from].map((before) => between(before.at(-1)!, paths[0])),
    );
    transitions.set(key, matrix);
    return matrix;
  };
  for (const order of orders) {
    const starts =
      returnToStart && !approach ? candidates[order[0]].map((_, i) => i) : [-1];
    for (const fixedStart of starts) {
      let costs = candidates[order[0]].map((paths, i) => {
        if (fixedStart >= 0 && i !== fixedStart) return Infinity;
        const entry = approach
          ? between(
              [lerp(approach.point, paths[0][0], -0.2), approach.point],
              paths[0],
            )
          : 0;
        return ownCost(paths) + entry;
      });
      const parents: number[][] = [costs.map(() => -1)];
      for (let step = 1; step < order.length; step++) {
        const previousCosts = costs,
          parent: number[] = [];
        const matrix = transition(order[step - 1], order[step]);
        costs = candidates[order[step]].map((paths, targetIndex) => {
          let best = Infinity,
            chosen = 0;
          candidates[order[step - 1]].forEach((before, i) => {
            const cost = previousCosts[i] + matrix[targetIndex][i];
            if (cost < best) {
              best = cost;
              chosen = i;
            }
          });
          parent.push(chosen);
          return best + ownCost(paths);
        });
        parents.push(parent);
      }
      const finalCosts = costs.map((cost, i) => {
        const last = candidates[order.at(-1)!][i].at(-1)!;
        const target = approach?.return
          ? approach.point
          : returnToStart && !approach
            ? candidates[order[0]][fixedStart][0][0]
            : undefined;
        return (
          cost +
          (target
            ? between(last, [target, lerp(last.at(-1)!, target, 1.2)])
            : 0)
        );
      });
      const end = finalCosts.reduce(
        (best, cost, i) => (cost < finalCosts[best] ? i : best),
        0,
      );
      if (finalCosts[end] < bestTotal) {
        bestTotal = finalCosts[end];
        selected = new Array(order.length);
        selectedOrder = order;
        selected[selected.length - 1] = end;
        for (let step = selected.length - 1; step > 0; step--)
          selected[step - 1] = parents[step][selected[step]];
      }
    }
  }
  const segments: RouteSegment[] = [];
  let previous: Point[] | undefined;
  for (let g = 0; g < groups.length; g++) {
    const index = selectedOrder[g],
      group = groups[index],
      paths = candidates[index][selected[g]];
    for (const p of paths) {
      if (previous) {
        const connection =
          variant === "shortest" || !isCrossElement(previous, p)
            ? connectionCurve(previous, p)
            : clearConnection(previous, p, all);
        for (let i = 1; i < connection.length; i++)
          if (distance(connection[i - 1], connection[i]) > 1e-6)
            segments.push({
              from: connection[i - 1],
              to: connection[i],
              kind: "connection",
              elementId: group.id,
            });
      }
      for (let i = 1; i < p.length; i++)
        if (distance(p[i - 1], p[i]) > 1e-6)
          segments.push({
            from: p[i - 1],
            to: p[i],
            kind: bridgeEdges.has(edgeKey(p[i - 1], p[i]))
              ? "connection"
              : "art",
            elementId: group.id,
          });
      previous = p;
    }
  }
  const continuous: RouteSegment[] = [];
  for (let i = 0; i < segments.length; i++) {
    const current = segments[i];
    continuous.push(current);
    const next = segments[i + 1];
    if (next && joinAngle(current.from, current.to, next.to) > 150) {
      const vertex = current.to,
        reach = Math.min(
          distance(current.from, vertex),
          distance(vertex, next.to),
          height * 0.03,
        ),
        before = lerp(
          vertex,
          current.from,
          reach / Math.max(1e-9, distance(current.from, vertex)),
        ),
        after = lerp(
          vertex,
          next.to,
          reach / Math.max(1e-9, distance(vertex, next.to)),
        );
      const loop = connectionCurve([before, vertex], [vertex, after]);
      for (let j = 1; j < loop.length; j++)
        if (distance(loop[j - 1], loop[j]) > 1e-6)
          continuous.push({
            from: loop[j - 1],
            to: loop[j],
            kind: "connection",
            elementId: current.elementId,
          });
    }
  }
  if (continuous.length > 12000)
    throw new Error(
      "This composition is too complex. Reduce text or use simpler patterns.",
    );
  return {
    visitOrder: selectedOrder.map((i) => ({
      elementId: groups[i].id,
      character: groups[i].character,
    })),
    segments: continuous,
    bounds: b,
    warnings: [],
    variant,
    outlines: all.filter((s) => s.closed).map((s) => s.points),
  };
}
