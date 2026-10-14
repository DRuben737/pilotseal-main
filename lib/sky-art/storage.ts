import { get, set } from "idb-keyval";
import type { Composition, Element, Placement, SavedProject } from "./types";
import { MAX_SKETCH_SAMPLES, MAX_SKETCH_STROKES } from "./sketch";
const KEY = "pilotseal-sky-art-v1";
export const saveProject = (p: SavedProject) => set(KEY, p);
export const loadProject = async () => {
  const p = await get(KEY);
  return p ? validateProject(p) : undefined;
};
const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v);
export function validateProject(raw: unknown): SavedProject {
  if (!raw || typeof raw !== "object") throw new Error("Invalid project file.");
  const p = raw as SavedProject;
  if (p.schema !== "pilotseal-sky-art" || ![1, 2].includes(p.version))
    throw new Error("Unsupported project format or version.");
  const c = p.composition as Composition,
    place = p.placement as Placement;
  if (
    !c ||
    ![1, 2].includes(c.version) ||
    typeof c.name !== "string" ||
    c.name.length > 200 ||
    !Array.isArray(c.elements) ||
    c.elements.length > 8
  )
    throw new Error("Invalid composition.");
  const ids = new Set<string>();
  let sketchCount = 0;
  for (const e of c.elements as Element[]) {
    if (
      !e ||
      typeof e.id !== "string" ||
      ids.has(e.id) ||
      !["text", "preset", "sketch"].includes(e.kind) ||
      typeof e.value !== "string" ||
      e.value.length > 200 ||
      !["outline", "single", "script"].includes(e.font) ||
      ![e.x, e.y, e.scale, e.rotation, e.spacing, e.lineHeight].every(finite) ||
      e.scale <= 0 ||
      e.scale > 100 ||
      e.spacing < 0 ||
      e.spacing > 100 ||
      e.lineHeight < 20 ||
      e.lineHeight > 400
    )
      throw new Error("Invalid element.");
    if (e.kind === "sketch") {
      if (e.sketchOrderLocked !== undefined && typeof e.sketchOrderLocked !== "boolean")
        throw new Error("Invalid sketch order setting.");
      if (!Array.isArray(e.strokes) || e.strokes.length > MAX_SKETCH_STROKES)
        throw new Error("Invalid sketch strokes.");
      sketchCount += e.strokes.length;
      const strokeIds = new Set<string>();
      for (const stroke of e.strokes) {
        if (!stroke || typeof stroke.id !== "string" || strokeIds.has(stroke.id) ||
          typeof stroke.closed !== "boolean" || !Array.isArray(stroke.raw) ||
          !Array.isArray(stroke.points) || stroke.raw.length < 2 ||
          stroke.points.length < 2 || stroke.raw.length > MAX_SKETCH_SAMPLES ||
          stroke.points.length > MAX_SKETCH_SAMPLES ||
          [...stroke.raw, ...stroke.points].some((point) =>
            !point || !finite(point.x) || !finite(point.y)))
          throw new Error("Invalid sketch stroke.");
        strokeIds.add(stroke.id);
      }
    }
    ids.add(e.id);
  }
  if (sketchCount > MAX_SKETCH_STROKES) throw new Error("Too many sketch strokes.");
  if (
    c.connectionMode !== undefined &&
    !["complete", "open"].includes(c.connectionMode)
  )
    throw new Error("Invalid contour mode.");
  if (c.firstElement && !ids.has(c.firstElement))
    throw new Error("Invalid first element.");
  if (c.sketchStart) {
    const { elementId, strokeId, pointIndex } = c.sketchStart;
    const element = c.elements.find((e) => e.id === elementId && e.kind === "sketch");
    const stroke = element?.strokes?.find((s) => s.id === strokeId);
    if (!stroke || !Number.isInteger(pointIndex) || pointIndex < 0 || pointIndex >= stroke.points.length)
      throw new Error("Invalid sketch start.");
  }
  if (c.connectors !== undefined) {
    if (!c.connectors || typeof c.connectors !== "object" || Array.isArray(c.connectors) ||
      Object.keys(c.connectors).length > 100 ||
      Object.entries(c.connectors).some(([key, point]) =>
        key.length > 200 || !point || !finite(point.x) || !finite(point.y)))
      throw new Error("Invalid connector positions.");
  }
  if (c.firstCharacter !== undefined) {
    const element = c.elements.find((e) => e.id === c.firstElement);
    const chars = element ? [...element.value.replace(/\n/g, "")] : [];
    if (
      !element ||
      element.kind !== "text" ||
      !Number.isInteger(c.firstCharacter) ||
      c.firstCharacter < 0 ||
      c.firstCharacter >= chars.length ||
      /\s/.test(chars[c.firstCharacter])
    )
      throw new Error("Invalid first character.");
  }
  if (
    !place ||
    !place.anchor ||
    ![
      place.anchor.lat,
      place.anchor.lon,
      place.metersPerUnit,
      place.rotation,
      place.offsetX,
      place.offsetY,
      place.radiusNm,
    ].every(finite) ||
    Math.abs(place.anchor.lat) > 85 ||
    Math.abs(place.anchor.lon) > 180 ||
    place.metersPerUnit <= 0 ||
    place.metersPerUnit > 100000 ||
    place.radiusNm < 0 ||
    place.radiusNm > 20 ||
    !["center", "start"].includes(place.mode) ||
    typeof place.roundTrip !== "boolean" ||
    typeof place.airport !== "boolean" ||
    !["balanced", "shortest", "cleanest"].includes(p.variant)
  )
    throw new Error("Invalid map placement.");
  if (
    place.anchorName !== undefined &&
    (typeof place.anchorName !== "string" || place.anchorName.length > 300)
  )
    throw new Error("Invalid anchor name.");
  if (
    place.waypointToleranceNm !== undefined &&
    (!finite(place.waypointToleranceNm) ||
      place.waypointToleranceNm < 0 ||
      place.waypointToleranceNm > 0.2)
  )
    throw new Error("Invalid waypoint tolerance.");
  // Imported routes are regenerated; never trust stale geometry or computed leg fields.
  return {
    schema: p.schema,
    version: 2,
    composition: { ...c, version: 2 },
    placement: place,
    variant: p.variant,
    savedAt: typeof p.savedAt === "string" ? p.savedAt : "",
  };
}
