import { parse, type Font, type PathCommand } from "opentype.js";
import type {
  Composition,
  Element,
  GeometryElement,
  Point,
  Stroke,
} from "./types";
import {
  distance,
  lerp,
  normalizeStrokes,
  pointInPolygon,
  simplify,
  transform,
} from "./geometry";
import { presetStrokes } from "./presets";
let fontPromise: Promise<Font> | undefined;
export async function loadOutlineFont(): Promise<Font> {
  fontPromise ??= fetch("/sky-art/fonts/NotoSansCJKsc-Bold.otf")
    .then((r) => {
      if (!r.ok) throw new Error("Unable to load the outline font.");
      return r.arrayBuffer();
    })
    .then((b) => parse(b))
    .catch((e) => {
      fontPromise = undefined;
      throw e;
    });
  return fontPromise;
}
function flattenCurve(points: Point[], out: Point[], depth = 0): void {
  const start = points[0],
    end = points[points.length - 1];
  const chord = distance(start, end),
    poly = points.slice(1).reduce((v, p, i) => v + distance(p, points[i]), 0);
  if (depth >= 12 || poly - chord < 0.05) {
    out.push(end);
    return;
  }
  const layers = [points];
  while (layers[layers.length - 1].length > 1) {
    const a = layers[layers.length - 1];
    layers.push(a.slice(1).map((p, i) => lerp(a[i], p, 0.5)));
  }
  flattenCurve(
    layers.map((a) => a[0]),
    out,
    depth + 1,
  );
  flattenCurve(layers.map((a) => a[a.length - 1]).reverse(), out, depth + 1);
}
export function commandsToStrokes(
  commands: PathCommand[],
  elementId: string,
  character: number,
): Stroke[] {
  const result: Stroke[] = [];
  let points: Point[] = [];
  const flush = (explicitlyClosed: boolean) => {
    const closed =
      explicitlyClosed ||
      (points.length > 2 &&
        distance(points[0], points[points.length - 1]) < 1e-6);
    if (points.length > 1) {
      if (closed && distance(points[0], points[points.length - 1]) < 1e-6)
        points.pop();
      const final = closed ? [...points, points[0]] : points;
      const simplified = simplify(final, 0.2);
      if (closed && simplified.length > 1) simplified.pop();
      if (simplified.length >= (closed ? 3 : 2))
        result.push({
          points: simplified,
          closed,
          elementId,
          character,
          hole: false,
        });
    }
    points = [];
  };
  for (const c of commands) {
    if (c.type === "M") {
      flush(true);
      points = [{ x: c.x, y: c.y }];
    } else if (c.type === "L") points.push({ x: c.x, y: c.y });
    else if (c.type === "Q" && points.length)
      flattenCurve(
        [points[points.length - 1], { x: c.x1, y: c.y1 }, { x: c.x, y: c.y }],
        points,
      );
    else if (c.type === "C" && points.length)
      flattenCurve(
        [
          points[points.length - 1],
          { x: c.x1, y: c.y1 },
          { x: c.x2, y: c.y2 },
          { x: c.x, y: c.y },
        ],
        points,
      );
    else if (c.type === "Z") flush(true);
  }
  flush(true);
  return result.map((s, i) => ({
    ...s,
    hole:
      s.closed &&
      result.filter(
        (other, j) =>
          j !== i && other.closed && pointInPolygon(s.points[0], other.points),
      ).length %
        2 ===
        1,
  }));
}
export function outlineText(e: Element, font: Font): Stroke[] {
  const chars = [...e.value.replace(/\s/g, "")];
  if (chars.length > 30 || e.value.split("\n").length > 3)
    throw new Error("Use up to 30 characters and 3 lines.");
  const missing = [
    ...new Set(chars.filter((c) => font.charToGlyphIndex(c) === 0)),
  ];
  if (missing.length)
    throw new Error(`Unsupported characters: ${missing.join(" ")}`);
  const strokes: Stroke[] = [];
  let charIndex = 0;
  for (const [lineIndex, text] of e.value.split("\n").entries()) {
    let x = 0;
    const glyphs = font.stringToGlyphs(text);
    for (let i = 0; i < glyphs.length; i++) {
      const glyph = glyphs[i];
      strokes.push(
        ...commandsToStrokes(
          glyph.getPath(x, lineIndex * e.lineHeight, 100).commands,
          e.id,
          charIndex++,
        ),
      );
      x +=
        ((glyph.advanceWidth ?? font.unitsPerEm) * 100) / font.unitsPerEm +
        e.spacing +
        (i + 1 < glyphs.length
          ? (font.getKerningValue(glyph, glyphs[i + 1]) * 100) / font.unitsPerEm
          : 0);
    }
  }
  return normalizeStrokes(strokes);
}
export async function buildGeometry(
  composition: Composition,
  font?: Font,
): Promise<GeometryElement[]> {
  if (!composition.elements.length)
    throw new Error("Add a pattern or text first.");
  if (composition.elements.length > 8) throw new Error("Use up to 8 elements.");
  if (
    composition.elements
      .filter((e) => e.kind === "text")
      .reduce((n, e) => n + [...e.value.replace(/\s/g, "")].length, 0) > 30
  )
    throw new Error("Use up to 30 characters across the artwork.");
  const outline =
    font ??
    (composition.elements.some((e) => e.kind === "text" && e.font === "outline")
      ? await loadOutlineFont()
      : undefined);
  const result: GeometryElement[] = [];
  for (const e of composition.elements) {
    if (!Number.isFinite(e.scale) || e.scale <= 0)
      throw new Error("Element size must be positive.");
    let strokes: Stroke[];
    if (e.kind === "preset")
      strokes = normalizeStrokes(presetStrokes(e.value, e.id));
    else if (e.font === "outline") strokes = outlineText(e, outline!);
    else {
      const { singleLineText } = await import("./single-fonts");
      strokes = await singleLineText(e);
    }
    result.push({
      id: e.id,
      strokes: strokes.map((s) => ({
        ...s,
        points: s.points.map((p) => transform(p, e)),
      })),
    });
  }
  return result;
}
