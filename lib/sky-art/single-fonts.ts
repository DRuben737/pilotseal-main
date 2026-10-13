import type { Element, Stroke } from "./types";
import { normalizeStrokes } from "./geometry";
type Hershey = Record<string, { chars: { d: string; o: number }[] }>;
type Chinese = Record<string, number[][][]>;
let latin: Promise<Hershey> | undefined, chinese: Promise<Chinese> | undefined;
async function resource<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error("Unable to load single-line font.");
  return r.json();
}
export async function singleLineText(e: Element): Promise<Stroke[]> {
  latin ??= resource<Hershey>("/sky-art/fonts/hershey.json").catch((err) => {
    latin = undefined;
    throw err;
  });
  const h = await latin;
  const font = h[e.font === "script" ? "scriptc" : "futural"];
  const chars = [...e.value.replace(/\s/g, "")];
  if (chars.length > 30 || e.value.split("\n").length > 3)
    throw new Error("Use up to 30 characters and 3 lines.");
  if (e.font === "script" && chars.some((c) => c.codePointAt(0)! > 126))
    throw new Error(
      "Connected script supports English and numbers. Use outline for Chinese.",
    );
  let c: Chinese = {};
  if (chars.some((ch) => ch.codePointAt(0)! > 126)) {
    chinese ??= resource<Chinese>("/sky-art/fonts/chinese-single.json").catch(
      (err) => {
        chinese = undefined;
        throw err;
      },
    );
    c = await chinese;
  }
  const result: Stroke[] = [];
  let character = 0;
  for (const [row, text] of e.value.split("\n").entries()) {
    let x = 0;
    for (const ch of text) {
      if (ch === " ") {
        x += 45 + e.spacing;
        character++;
        continue;
      }
      const ascii = ch.codePointAt(0)!;
      const glyph = ascii >= 33 && ascii <= 126 ? font.chars[ascii - 33] : null;
      const polylines: number[][][] = [];
      let width = 100;
      if (glyph) {
        let line: number[][] = [];
        const tokens = glyph.d.match(/[ML]|-?\d+(?:\.\d+)?/g) ?? [];
        for (let i = 0; i < tokens.length; ) {
          if (tokens[i] === "M") {
            if (line.length) polylines.push(line);
            line = [];
            i++;
          } else if (tokens[i] === "L") i++;
          else {
            line.push([Number(tokens[i]) * 4, Number(tokens[i + 1]) * 4]);
            i += 2;
          }
        }
        if (line.length) polylines.push(line);
        width = glyph.o * 8;
      } else {
        const data =
          c[`U+${ascii.toString(16).toUpperCase().padStart(4, "0")}`];
        if (!data) throw new Error(`Unsupported character: ${ch}`);
        polylines.push(
          ...data.map((s) => s.map(([a, b]) => [a * 100, b * 100])),
        );
      }
      for (const p of polylines)
        if (p.length > 1)
          result.push({
            points: p.map(([a, b]) => ({
              x: a + x,
              y: b + row * e.lineHeight,
            })),
            closed: false,
            elementId: e.id,
            character,
            hole: false,
          });
      x += width + e.spacing;
      character++;
    }
  }
  return normalizeStrokes(result);
}
