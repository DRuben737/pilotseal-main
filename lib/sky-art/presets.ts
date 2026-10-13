import type { Point, Stroke } from "./types";
type Shape = { points: Point[]; closed?: boolean };
export type Preset = {
  id: string;
  name: string;
  category: string;
  shapes: Shape[];
};
const line = (v: number[][], closed = false): Shape => ({
  points: v.map(([x, y]) => ({ x, y })),
  closed,
});
const ellipse = (
  cx: number,
  cy: number,
  rx: number,
  ry = rx,
  start = 0,
  end = 2 * Math.PI,
): Shape => ({
  points: Array.from({ length: 65 }, (_, i) => ({
    x: cx + rx * Math.cos(start + ((end - start) * i) / 64),
    y: cy + ry * Math.sin(start + ((end - start) * i) / 64),
  })),
  closed: end - start >= 2 * Math.PI - 0.01,
});
const polygon = (n: number, r = 80, offset = -Math.PI / 2): Shape => ({
  points: Array.from({ length: n }, (_, i) => ({
    x: r * Math.cos(offset + (i * 2 * Math.PI) / n),
    y: r * Math.sin(offset + (i * 2 * Math.PI) / n),
  })),
  closed: true,
});
const star: Shape = {
  points: Array.from({ length: 10 }, (_, i) => ({
    x: (i % 2 ? 32 : 80) * Math.cos(-Math.PI / 2 + (i * Math.PI) / 5),
    y: (i % 2 ? 32 : 80) * Math.sin(-Math.PI / 2 + (i * Math.PI) / 5),
  })),
  closed: true,
};
const heart: Shape = {
  points: Array.from({ length: 97 }, (_, i) => {
    const t = (i * 2 * Math.PI) / 96;
    return {
      x: 5 * 16 * Math.sin(t) ** 3,
      y:
        -5 *
        (13 * Math.cos(t) -
          5 * Math.cos(2 * t) -
          2 * Math.cos(3 * t) -
          Math.cos(4 * t)),
    };
  }),
  closed: true,
};
const shifted = (s: Shape, x: number, y: number, k = 1): Shape => ({
  ...s,
  points: s.points.map((p) => ({ x: p.x * k + x, y: p.y * k + y })),
});
const sample = (fn: (t: number) => Point, n = 80): Shape => ({
  points: Array.from({ length: n + 1 }, (_, i) => fn(i / n)),
});
export const PRESETS: Preset[] = [
  {
    id: "christmas-tree",
    name: "Christmas tree",
    category: "Holiday",
    shapes: [
      line(
        [
          [0, -100],
          [35, -55],
          [18, -55],
          [58, -10],
          [35, -10],
          [85, 48],
          [20, 48],
          [20, 85],
          [-20, 85],
          [-20, 48],
          [-85, 48],
          [-35, -10],
          [-58, -10],
          [-18, -55],
          [-35, -55],
        ],
        true,
      ),
    ],
  },
  {
    id: "snowflake",
    name: "Snowflake",
    category: "Holiday",
    shapes: Array.from({ length: 6 }, (_, i) => {
      const a = (i * Math.PI) / 3;
      return line(
        [
          [0, 0],
          [0, -85],
          [-17, -65],
          [0, -85],
          [17, -65],
          [0, -85],
        ].map(([x, y]) => [
          x * Math.cos(a) - y * Math.sin(a),
          x * Math.sin(a) + y * Math.cos(a),
        ]),
      );
    }),
  },
  {
    id: "bell",
    name: "Bell",
    category: "Holiday",
    shapes: [
      sample((t) => ({
        x: 65 * Math.cos(Math.PI + Math.PI * t),
        y: 55 + 115 * Math.sin(Math.PI + Math.PI * t),
      })),
      line([
        [-65, 55],
        [65, 55],
      ]),
      ellipse(0, 64, 13, 10),
    ],
  },
  {
    id: "gift",
    name: "Gift",
    category: "Holiday",
    shapes: [
      line(
        [
          [-75, -30],
          [75, -30],
          [75, 80],
          [-75, 80],
        ],
        true,
      ),
      line([
        [0, -30],
        [0, 80],
      ]),
      line([
        [-75, 0],
        [75, 0],
      ]),
      ellipse(-24, -48, 25, 18),
      ellipse(24, -48, 25, 18),
    ],
  },
  {
    id: "candy-cane",
    name: "Candy cane",
    category: "Holiday",
    shapes: [
      sample((t) => ({
        x: 30 + 40 * Math.cos(Math.PI - Math.PI * t),
        y: -40 - 40 * Math.sin(Math.PI - Math.PI * t),
      })),
      line([
        [-10, -40],
        [-10, 90],
        [10, 90],
        [10, -40],
      ]),
      sample((t) => ({
        x: 30 + 20 * Math.cos(Math.PI - Math.PI * t),
        y: -40 - 20 * Math.sin(Math.PI - Math.PI * t),
      })),
      line([
        [50, -40],
        [70, -40],
      ]),
    ],
  },
  {
    id: "pumpkin",
    name: "Pumpkin",
    category: "Holiday",
    shapes: [
      ellipse(0, 10, 85, 65),
      ellipse(0, 10, 36, 65),
      line([
        [-10, -55],
        [-10, -80],
        [10, -90],
        [15, -55],
      ]),
    ],
  },
  { id: "heart", name: "Heart", category: "Celebration", shapes: [heart] },
  {
    id: "double-heart",
    name: "Double heart",
    category: "Celebration",
    shapes: [shifted(heart, -40, 0, 0.72), shifted(heart, 40, 0, 0.72)],
  },
  {
    id: "infinity",
    name: "Infinity",
    category: "Celebration",
    shapes: [
      {
        ...sample((t) => ({
          x: 90 * Math.cos(t * 2 * Math.PI),
          y: 45 * Math.sin(t * 4 * Math.PI),
        })),
        closed: true,
      },
    ],
  },
  {
    id: "ribbon",
    name: "Ribbon",
    category: "Celebration",
    shapes: [
      line(
        [
          [-80, -30],
          [80, -30],
          [65, 0],
          [80, 30],
          [-80, 30],
          [-65, 0],
        ],
        true,
      ),
    ],
  },
  {
    id: "cake",
    name: "Cake",
    category: "Celebration",
    shapes: [
      line(
        [
          [-75, 0],
          [75, 0],
          [75, 70],
          [-75, 70],
        ],
        true,
      ),
      line([
        [-75, 25],
        [-50, 35],
        [-25, 25],
        [0, 35],
        [25, 25],
        [50, 35],
        [75, 25],
      ]),
      line([
        [-30, 0],
        [-30, -40],
        [-20, -40],
        [-20, 0],
      ]),
      line([
        [20, 0],
        [20, -40],
        [30, -40],
        [30, 0],
      ]),
      ellipse(-25, -53, 6, 10),
      ellipse(25, -53, 6, 10),
    ],
  },
  {
    id: "balloon",
    name: "Balloon",
    category: "Celebration",
    shapes: [
      ellipse(0, -30, 50, 65),
      line(
        [
          [-7, 35],
          [7, 35],
          [0, 44],
        ],
        true,
      ),
      sample((t) => ({ x: 15 * Math.sin(t * 2 * Math.PI), y: 44 + 70 * t })),
    ],
  },
  {
    id: "circle",
    name: "Circle",
    category: "Geometry",
    shapes: [ellipse(0, 0, 80)],
  },
  {
    id: "ellipse",
    name: "Ellipse",
    category: "Geometry",
    shapes: [ellipse(0, 0, 95, 55)],
  },
  {
    id: "triangle",
    name: "Triangle",
    category: "Geometry",
    shapes: [polygon(3)],
  },
  {
    id: "square",
    name: "Square",
    category: "Geometry",
    shapes: [
      line(
        [
          [-65, -65],
          [65, -65],
          [65, 65],
          [-65, 65],
        ],
        true,
      ),
    ],
  },
  {
    id: "rectangle",
    name: "Rectangle",
    category: "Geometry",
    shapes: [
      line(
        [
          [-90, -50],
          [90, -50],
          [90, 50],
          [-90, 50],
        ],
        true,
      ),
    ],
  },
  {
    id: "diamond",
    name: "Diamond",
    category: "Geometry",
    shapes: [
      line(
        [
          [0, -90],
          [60, 0],
          [0, 90],
          [-60, 0],
        ],
        true,
      ),
    ],
  },
  { id: "star", name: "Star", category: "Geometry", shapes: [star] },
  {
    id: "hexagon",
    name: "Hexagon",
    category: "Geometry",
    shapes: [polygon(6)],
  },
  {
    id: "spiral",
    name: "Spiral",
    category: "Geometry",
    shapes: [
      sample(
        (t) => ({
          x: (10 + 75 * t) * Math.cos(t * 5 * Math.PI),
          y: (10 + 75 * t) * Math.sin(t * 5 * Math.PI),
        }),
        120,
      ),
    ],
  },
  {
    id: "wave",
    name: "Wave",
    category: "Geometry",
    shapes: [
      sample((t) => ({ x: -100 + 200 * t, y: 40 * Math.sin(t * 4 * Math.PI) })),
    ],
  },
  {
    id: "airplane",
    name: "Airplane",
    category: "Aviation & nature",
    shapes: [
      line(
        [
          [0, -95],
          [12, -60],
          [12, -15],
          [90, 35],
          [90, 50],
          [12, 20],
          [12, 65],
          [35, 80],
          [35, 90],
          [0, 80],
          [-35, 90],
          [-35, 80],
          [-12, 65],
          [-12, 20],
          [-90, 50],
          [-90, 35],
          [-12, -15],
          [-12, -60],
        ],
        true,
      ),
    ],
  },
  {
    id: "paper-plane",
    name: "Paper plane",
    category: "Aviation & nature",
    shapes: [
      line(
        [
          [-90, -40],
          [95, -85],
          [20, 85],
          [-15, 20],
        ],
        true,
      ),
      line([
        [-15, 20],
        [95, -85],
        [0, 40],
        [20, 85],
      ]),
    ],
  },
  {
    id: "wing",
    name: "Wing",
    category: "Aviation & nature",
    shapes: [
      line(
        [
          [-95, 50],
          [-50, -30],
          [95, -75],
          [60, -15],
          [0, 35],
        ],
        true,
      ),
    ],
  },
  {
    id: "cloud",
    name: "Cloud",
    category: "Aviation & nature",
    shapes: [
      sample((t) => ({
        x: 80 * Math.cos(t * 2 * Math.PI),
        y:
          40 * Math.sin(t * 2 * Math.PI) -
          (t > 0.5 ? 20 * Math.sin(t * 6 * Math.PI) ** 2 : 0),
      })),
    ],
  },
  {
    id: "sun",
    name: "Sun",
    category: "Aviation & nature",
    shapes: [
      ellipse(0, 0, 45),
      ...Array.from({ length: 12 }, (_, i) =>
        line([
          [60 * Math.cos((i * Math.PI) / 6), 60 * Math.sin((i * Math.PI) / 6)],
          [85 * Math.cos((i * Math.PI) / 6), 85 * Math.sin((i * Math.PI) / 6)],
        ]),
      ),
    ],
  },
  {
    id: "moon",
    name: "Crescent",
    category: "Aviation & nature",
    shapes: [
      {
        points: [
          ...ellipse(0, 0, 80, 80, Math.PI / 3, (5 * Math.PI) / 3).points,
          ...sample((t) => ({
            x: 40 - 55 * Math.sin(t * Math.PI),
            y: -69.28 + 138.56 * t,
          })).points,
        ],
        closed: true,
      },
    ],
  },
  {
    id: "mountains",
    name: "Mountains",
    category: "Aviation & nature",
    shapes: [
      line(
        [
          [-95, 65],
          [-40, -80],
          [0, 15],
          [40, -45],
          [95, 65],
        ],
        true,
      ),
      line([
        [-57, -35],
        [-40, -15],
        [-23, -35],
      ]),
    ],
  },
  {
    id: "flower",
    name: "Flower",
    category: "Aviation & nature",
    shapes: [
      {
        ...sample((t) => {
          const a = t * 2 * Math.PI,
            r = 55 + 25 * Math.cos(5 * a);
          return { x: r * Math.cos(a), y: r * Math.sin(a) };
        }, 120),
        closed: true,
      },
      ellipse(0, 0, 18),
    ],
  },
];
export function presetStrokes(id: string, elementId: string): Stroke[] {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`Unknown pattern: ${id}`);
  return preset.shapes.map((s) => ({
    points: s.points,
    closed: !!s.closed,
    elementId,
    character: 0,
    hole: false,
  }));
}
