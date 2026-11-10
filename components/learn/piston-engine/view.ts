import {
  fitProjection,
  iso,
  pathOf,
  type Flat,
  type Point3,
} from "@/components/iso/iso-kit";

export const FIGURE_WIDTH = 780;
export const FIGURE_HEIGHT = 470;

const bounds: Point3[] = [
  [-112, -132, -24],
  [-112, -132, 118],
  [-112, 132, -24],
  [-112, 132, 118],
  [116, -132, -24],
  [116, -132, 118],
  [116, 132, -24],
  [116, 132, 118],
];

const fittedProjection = fitProjection(bounds, FIGURE_WIDTH, FIGURE_HEIGHT, {
  pad: 30,
  azimuth: 40,
  elevation: 30,
});

export const ENGINE_PROJECTION = {
  ...fittedProjection,
  scale: fittedProjection.scale * 1.8,
};

export const at = (point: Point3): Flat => iso(point, ENGINE_PROJECTION);
export const path3 = (points: Point3[], closed = false) =>
  pathOf(points.map(at), closed);

export const CUTAWAY_PATH = path3(
  [
    [47, -12, 30],
    [47, 111, 38],
    [47, 111, 86],
    [47, 76, 86],
    [47, 48, 74],
    [47, -12, 74],
  ],
  true,
);

export const CRANK_CENTER: Point3 = [28, 0, 54];
export const PISTON_TDC: Point3 = [28, 94, 62];
export const PISTON_STROKE_WORLD = 43;
export const CRANK_RADIUS_WORLD = 13;
