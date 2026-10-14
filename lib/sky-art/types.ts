export type Point = { x: number; y: number };
export type Coordinate = { lat: number; lon: number };
export type SketchStroke = {
  id: string;
  raw: Point[];
  points: Point[];
  closed: boolean;
};
export type Element = {
  id: string;
  kind: "preset" | "text" | "sketch";
  value: string;
  strokes?: SketchStroke[];
  sketchOrderLocked?: boolean;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  group?: string;
  font: "outline" | "single" | "script";
  spacing: number;
  lineHeight: number;
};
export type Composition = {
  version: 1 | 2;
  name: string;
  elements: Element[];
  firstElement?: string;
  firstCharacter?: number;
  sketchStart?: { elementId: string; strokeId: string; pointIndex: number };
  connectors?: Record<string, Point>;
  connectionMode?: "complete" | "open";
};
export type Stroke = {
  id?: string;
  points: Point[];
  closed: boolean;
  elementId: string;
  character: number;
  hole: boolean;
  gap?: boolean;
  externalPorts?: Point[];
  preferredPorts?: Point[];
};
export type GeometryElement = { id: string; strokes: Stroke[] };
export type RouteSegment = {
  from: Point;
  to: Point;
  kind: "art" | "connection" | "airport";
  elementId: string;
  connectorId?: string;
  manualConnector?: boolean;
};
export type RouteGeometry = {
  visitOrder?: { elementId: string; character: number }[];
  origin?: Point;
  outlines?: Point[][];
  segments: RouteSegment[];
  bounds: Bounds;
  warnings: string[];
  variant: Variant;
};
export type Variant = "balanced" | "shortest" | "cleanest";
export type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};
export type Placement = {
  anchorName?: string;
  anchor: Coordinate;
  mode: "center" | "start";
  metersPerUnit: number;
  rotation: number;
  offsetX: number;
  offsetY: number;
  roundTrip: boolean;
  airport: boolean;
  radiusNm: number;
  waypointToleranceNm?: number;
};
export type Waypoint = Coordinate & { id: string };
export type Leg = {
  index: number;
  from: Waypoint;
  to: Waypoint;
  track: number;
  distanceNm: number;
  cumulativeNm: number;
  kind: RouteSegment["kind"];
};
export type RoutePlan = {
  waypoints: Waypoint[];
  legs: Leg[];
  distanceNm: number;
  warnings: string[];
  geometry: RouteGeometry;
  placement: Placement;
  algorithmVersion: string;
};
export type SavedProject = {
  schema: "pilotseal-sky-art";
  version: 1 | 2;
  composition: Composition;
  placement: Placement;
  variant: Variant;
  route?: RoutePlan;
  savedAt: string;
};
export const DEFAULT_COMPOSITION: Composition = {
  version: 2,
  name: "Christmas 2026",
  connectionMode: "open",
  elements: [
    {
      id: "tree",
      kind: "preset",
      value: "christmas-tree",
      x: 400,
      y: 200,
      scale: 1.4,
      rotation: 0,
      font: "outline",
      spacing: 12,
      lineHeight: 130,
    },
    {
      id: "year",
      kind: "text",
      value: "2026",
      x: 400,
      y: 430,
      scale: 0.85,
      rotation: 0,
      font: "outline",
      spacing: 12,
      lineHeight: 130,
    },
  ],
};
export const DEFAULT_PLACEMENT: Placement = {
  anchor: { lat: 41.2448, lon: -82.5512 },
  mode: "center",
  metersPerUnit: 80,
  rotation: 0,
  offsetX: 0,
  offsetY: 0,
  roundTrip: false,
  airport: false,
  radiusNm: 0,
  waypointToleranceNm: 0.05,
};
