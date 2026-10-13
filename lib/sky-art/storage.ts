import { get, set } from "idb-keyval";
import type { Composition, Element, Placement, SavedProject } from "./types";
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
  if (p.schema !== "pilotseal-sky-art" || p.version !== 1)
    throw new Error("Unsupported project format or version.");
  const c = p.composition as Composition,
    place = p.placement as Placement;
  if (
    !c ||
    c.version !== 1 ||
    typeof c.name !== "string" ||
    c.name.length > 200 ||
    !Array.isArray(c.elements) ||
    c.elements.length > 8
  )
    throw new Error("Invalid composition.");
  const ids = new Set<string>();
  for (const e of c.elements as Element[]) {
    if (
      !e ||
      typeof e.id !== "string" ||
      ids.has(e.id) ||
      !["text", "preset"].includes(e.kind) ||
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
    ids.add(e.id);
  }
  if (
    c.connectionMode !== undefined &&
    !["complete", "open"].includes(c.connectionMode)
  )
    throw new Error("Invalid contour mode.");
  if (c.firstElement && !ids.has(c.firstElement))
    throw new Error("Invalid first element.");
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
    version: 1,
    composition: c,
    placement: place,
    variant: p.variant,
    savedAt: typeof p.savedAt === "string" ? p.savedAt : "",
  };
}
