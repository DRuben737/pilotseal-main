import * as React from "react";

import {
  cylinder,
  iso,
  lineOnTop,
  pathOf,
  planOutline,
  ring,
  slabOf,
  type Point3,
  type SolidPaths,
  type Tone,
} from "@/components/iso/iso-kit";
import { Dots, Line, Solid } from "@/components/iso/react/draw";
import {
  disc,
  fillet,
  frameAlong,
  prismOf,
  solidOf,
} from "@/components/iso/lathe.mjs";
import { tubePieces, tubeSvg } from "@/components/iso/tube.mjs";

import {
  CRANK_CENTER,
  CUTAWAY_PATH,
  ENGINE_PROJECTION as P,
  at,
  path3,
} from "./view";

type ProfilePoint = [number, number] | [number, number, number];

function Turned({
  origin,
  axis,
  profile,
  tone = "hi",
  className,
  lit = false,
  steps = 48,
}: {
  origin: Point3;
  axis: Point3;
  profile: ProfilePoint[];
  tone?: Tone;
  className?: string;
  lit?: boolean;
  steps?: number;
}) {
  const paths = solidOf(profile, frameAlong(origin, axis), P, { steps }) as SolidPaths;
  return <Solid paths={paths} tone={tone} className={className} lit={lit} />;
}

function Tube({
  points,
  radius,
  className,
  tone = "hi",
  flow = false,
}: {
  points: Point3[];
  radius: number;
  className?: string;
  tone?: Tone;
  flow?: boolean;
}) {
  const route = fillet(points, Math.max(radius * 2.7, 4), 8) as Point3[];
  const pieces = tubePieces(route, radius, P, {
    maxLength: 17,
    spacing: 1.7,
  });
  const path = pathOf(route.map((point) => iso(point, P)));
  return (
    <g className={className}>
      <g dangerouslySetInnerHTML={{ __html: pieces.map((piece: unknown) => tubeSvg(piece, { tone })).join("") }} />
      {flow ? (
        <g className="engine-flow" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <circle key={index} r="1.7">
              <animateMotion
                dur="2.4s"
                begin={`${index * -0.8}s`}
                repeatCount="indefinite"
                path={path}
              />
            </circle>
          ))}
        </g>
      ) : null}
    </g>
  );
}

function FinStack({
  origin,
  axis,
  count,
  spacing,
  radius,
  className,
}: {
  origin: Point3;
  axis: Point3;
  count: number;
  spacing: number;
  radius: number;
  className?: string;
}) {
  const frame = frameAlong(origin, axis);
  return (
    <g className={className}>
      {Array.from({ length: count }, (_, index) => (
        <Solid
          key={index}
          paths={disc(index * spacing, index * spacing + 0.9, radius, frame, P, {
            steps: 48,
          }) as SolidPaths}
          tone="mid"
        />
      ))}
    </g>
  );
}

function CylinderAssembly({
  x,
  side,
  number,
  cutaway = false,
}: {
  x: number;
  side: -1 | 1;
  number: string;
  cutaway?: boolean;
}) {
  const y = side * 34;
  const axis: Point3 = [0, side, 0];
  const origin: Point3 = [x, y, 62];
  const coverFrame = frameAlong([x, side * 108, 62], axis);
  const coverProfile: Array<[number, number]> = [
    [-22, -15],
    [22, -15],
    [25, 13],
    [18, 18],
    [-18, 18],
    [-25, 13],
  ];
  const shellClass = cutaway ? "engine-cylinder engine-cutaway-shell" : "engine-cylinder";

  return (
    <g className={shellClass} data-cylinder={number} data-system-part="cycle cooling-exhaust">
      <Turned
        origin={origin}
        axis={axis}
        profile={[
          [0, 18],
          [5, 23],
          [43, 23],
          [48, 26],
        ]}
        tone="hi"
      />
      <FinStack
        origin={[x, side * 40, 62]}
        axis={axis}
        count={9}
        spacing={4.6}
        radius={28}
        className="engine-barrel-fins"
      />
      <Turned
        origin={[x, side * 82, 62]}
        axis={axis}
        profile={[
          [0, 26],
          [5, 30],
          [24, 30],
          [28, 26],
        ]}
        tone="hi"
      />
      <FinStack
        origin={[x, side * 84, 62]}
        axis={axis}
        count={6}
        spacing={4.2}
        radius={34}
        className="engine-head-fins"
      />
      <Solid
        paths={prismOf(coverFrame, coverProfile, 0, 15, P) as SolidPaths}
        tone="hi"
        className="engine-rocker-cover"
      />
      <Line
        d={path3([
          [x - 17, side * 109, 76],
          [x + 17, side * 109, 76],
        ])}
        tone="faint"
        free
      />
      <Dots
        points={[
          at([x - 14, side * 111, 72]),
          at([x + 14, side * 111, 72]),
        ]}
        size={1.5}
        tone="mid"
      />
      <g className="engine-pushrods">
        <Line d={path3([[x - 16, side * 38, 49], [x - 16, side * 103, 82]])} tone="mid" free />
        <Line d={path3([[x + 16, side * 38, 49], [x + 16, side * 103, 82]])} tone="mid" free />
      </g>
    </g>
  );
}

function Magneto({ y }: { y: number }) {
  return (
    <g data-system-part="ignition" className="engine-magneto">
      <Turned
        origin={[-83, y, 70]}
        axis={[-1, 0, 0]}
        profile={[
          [0, 13],
          [4, 16],
          [20, 16],
          [24, 12],
        ]}
        tone="mid"
      />
      <Line d={ring(-105, y, 8, 70, P, 30)} tone="mid" />
      <Dots
        points={Array.from({ length: 6 }, (_, index) => {
          const a = (index / 6) * Math.PI * 2;
          return at([-105, y + Math.cos(a) * 7, 70 + Math.sin(a) * 7]);
        })}
        size={1.1}
        tone="hi"
      />
    </g>
  );
}

const inductionRoutes: Point3[][] = [
  [[-4, 0, 1], [-30, 18, 17], [-30, 72, 38], [-30, 98, 46]],
  [[4, 0, 1], [30, 18, 17], [30, 72, 38], [30, 98, 46]],
  [[-4, 0, 1], [-30, -18, 17], [-30, -72, 38], [-30, -98, 46]],
  [[4, 0, 1], [30, -18, 17], [30, -72, 38], [30, -98, 46]],
];

const exhaustRoutes: Point3[][] = [
  [[-42, 102, 54], [-54, 116, 42], [-54, 119, 5], [-34, 119, -10]],
  [[18, 102, 54], [8, 116, 42], [8, 119, 4], [30, 119, -10]],
  [[-42, -102, 54], [-54, -116, 42], [-54, -119, 5], [-34, -119, -10]],
  [[18, -102, 54], [8, -116, 42], [8, -119, 4], [30, -119, -10]],
];

const ignitionRoutes: Point3[][] = [
  [[-104, 18, 72], [-72, 34, 94], [-30, 74, 94], [-30, 108, 72]],
  [[-104, 18, 72], [-68, 38, 98], [30, 74, 94], [30, 108, 72]],
  [[-104, -18, 72], [-72, -34, 94], [-30, -74, 94], [-30, -108, 72]],
  [[-104, -18, 72], [-68, -38, 98], [30, -74, 94], [30, -108, 72]],
  [[-104, 18, 68], [-60, 28, 84], [-30, 80, 58], [-30, 108, 55]],
  [[-104, 18, 68], [-54, 30, 86], [30, 80, 58], [30, 108, 55]],
  [[-104, -18, 68], [-60, -28, 84], [-30, -80, 58], [-30, -108, 55]],
  [[-104, -18, 68], [-54, -30, 86], [30, -80, 58], [30, -108, 55]],
];

function EngineCase() {
  const boltPoints = [
    [-43, 34, 76], [-15, 34, 82], [15, 34, 82], [43, 34, 76],
    [-43, 34, 39], [-15, 34, 34], [15, 34, 34], [43, 34, 39],
  ] as Point3[];
  return (
    <g data-system-part="cycle oil" className="engine-case">
      <Solid paths={slabOf({ x: -61, y: -35, w: 124, d: 70, r: 15 }, 24, 57, P, 14, 3)} tone="hi" />
      <Solid paths={slabOf({ x: -52, y: -31, w: 105, d: 62, r: 12 }, 78, 15, P, 14, 2)} tone="mid" />
      <Line d={planOutline({ x: -48, y: -28, w: 97, d: 56, r: 10 }, 92.3, P, 14)} tone="faint" />
      <Line d={path3([[-58, 35, 54], [61, 35, 54]])} tone="faint" free />
      <Dots points={boltPoints.map(at)} size={1.25} tone="mid" />
      <Solid paths={slabOf({ x: -53, y: -30, w: 107, d: 60, r: 8 }, -9, 35, P, 10, 2)} tone="mid" className="engine-sump" />
      <Solid paths={slabOf({ x: -45, y: -26, w: 91, d: 52, r: 6 }, -16, 8, P, 8, 1)} tone="lo" />
      {[-30, -10, 10, 30].map((x) => (
          <Line key={x} d={lineOnTop([x, -23], [x, 23], -7.5, P)} tone="faint" free />
      ))}
      <Turned
        origin={[62, 0, 55]}
        axis={[1, 0, 0]}
        profile={[
          [0, 36],
          [6, 40],
          [12, 40],
          [16, 29],
        ]}
        tone="hi"
      />
      <Turned
        origin={[77, 0, 55]}
        axis={[1, 0, 0]}
        profile={[
          [0, 21],
          [8, 21],
          [11, 25],
          [15, 25],
        ]}
        tone="mid"
      />
      <Line d={ring(88, 0, 18, 55, P, 42)} tone="hi" />
      <Dots
        points={Array.from({ length: 6 }, (_, index) => {
          const a = (index / 6) * Math.PI * 2;
          return at([88, Math.cos(a) * 19, 55 + Math.sin(a) * 19]);
        })}
        size={1.35}
        tone="hi"
      />
      <Turned
        origin={[-62, 0, 55]}
        axis={[-1, 0, 0]}
        profile={[
          [0, 34],
          [10, 34],
          [20, 27],
        ]}
        tone="mid"
      />
    </g>
  );
}

function CutawayMechanism() {
  const crank = at(CRANK_CENTER);
  const intakeStem = path3([[18, 101, 87], [22, 84, 68]]);
  const exhaustStem = path3([[40, 101, 87], [37, 84, 68]]);
  return (
    <g className="engine-cutaway" data-system-part="cycle">
      <defs>
        <clipPath id="engine-cutaway-clip">
          <path d={CUTAWAY_PATH} />
        </clipPath>
        <radialGradient id="engine-combustion-fill" cx="68%" cy="45%" r="62%">
          <stop offset="0" stopColor="#fff2a8" />
          <stop offset="0.42" stopColor="#f5a742" />
          <stop offset="1" stopColor="#d75a2d" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="engine-cut-window-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#263f4d" />
          <stop offset="0.55" stopColor="#455d69" />
          <stop offset="1" stopColor="#71838c" />
        </linearGradient>
      </defs>
      <path className="engine-cut-window" d={CUTAWAY_PATH} />
      <g clipPath="url(#engine-cutaway-clip)">
        <path
          data-motion="combustion"
          className="engine-combustion"
          d={path3([[8, 91, 46], [48, 91, 46], [48, 112, 82], [8, 112, 82]])}
        />
        <g data-motion="piston">
          <Turned
            origin={[28, 84, 62]}
            axis={[0, 1, 0]}
            profile={[
              [0, 19],
              [3, 22],
              [18, 22],
              [21, 19],
            ]}
            tone="hi"
            lit
          />
          <Line d={path3([[7, 88, 62], [49, 88, 62]])} tone="mid" free />
          <Line d={path3([[7, 92, 62], [49, 92, 62]])} tone="mid" free />
          <circle className="engine-wrist-pin" cx={at([28, 89, 62])[0]} cy={at([28, 89, 62])[1]} r="5" />
        </g>
        <path data-motion="rod" className="engine-rod" d={path3([[28, 89, 62], CRANK_CENTER])} />
        <g data-motion="crank" transform={`rotate(0 ${crank[0]} ${crank[1]})`}>
          <ellipse className="engine-crank-web" cx={crank[0]} cy={crank[1]} rx="27" ry="18" />
          <circle className="engine-crank-journal" cx={crank[0]} cy={crank[1]} r="9" />
          <circle className="engine-crank-pin" cx={crank[0]} cy={crank[1] - 13} r="5" />
          <path className="engine-counterweight" d={`M${crank[0] - 19} ${crank[1] + 2}Q${crank[0]} ${crank[1] + 25} ${crank[0] + 19} ${crank[1] + 2}Z`} />
        </g>
      </g>
      <g data-motion="intake-valve" className="engine-valve engine-intake-valve">
        <path d={intakeStem} />
        <ellipse cx={at([22, 83, 67])[0]} cy={at([22, 83, 67])[1]} rx="7" ry="3" />
      </g>
      <g data-motion="exhaust-valve" className="engine-valve engine-exhaust-valve">
        <path d={exhaustStem} />
        <ellipse cx={at([37, 83, 67])[0]} cy={at([37, 83, 67])[1]} rx="7" ry="3" />
      </g>
      <g className="engine-valve-springs">
        {[0, 1, 2, 3, 4].map((index) => (
          <React.Fragment key={index}>
            <Line d={path3([[16, 100 - index * 2.4, 89 - index], [25, 100 - index * 2.4, 89 - index]])} tone="mid" free />
            <Line d={path3([[35, 100 - index * 2.4, 89 - index], [44, 100 - index * 2.4, 89 - index]])} tone="mid" free />
          </React.Fragment>
        ))}
      </g>
      <g className="engine-rockers">
        <path d={path3([[8, 105, 91], [24, 99, 91], [30, 104, 91]])} />
        <path d={path3([[31, 104, 91], [38, 99, 91], [51, 106, 91]])} />
        <circle cx={at([24, 99, 91])[0]} cy={at([24, 99, 91])[1]} r="3" />
        <circle cx={at([38, 99, 91])[0]} cy={at([38, 99, 91])[1]} r="3" />
      </g>
      <g className="engine-spark-plugs" data-system-part="ignition cycle">
        <Line d={path3([[12, 113, 79], [21, 101, 73]])} tone="hi" free />
        <Line d={path3([[47, 113, 76], [39, 101, 70]])} tone="hi" free />
        <g data-motion="spark" className="engine-spark">
          <path d={path3([[20, 99, 72], [24, 96, 69], [21, 94, 67], [27, 91, 65]])} />
          <path d={path3([[40, 99, 69], [36, 96, 67], [41, 93, 65], [36, 90, 63]])} />
        </g>
      </g>
      <path className="engine-cut-edge" d={CUTAWAY_PATH} />
    </g>
  );
}

export function EngineArt() {
  return (
    <g className="engine-art" data-engine-art>
      <path
        className="iso-halo engine-halo"
        d={slabOf({ x: -90, y: -118, w: 188, d: 236, r: 36 }, -23, 2, P, 18).fill}
      />

      <g className="engine-mounts" data-system-part="overview">
        {[
          [-57, -45], [48, -45], [-57, 45], [48, 45],
        ].map(([x, y], index) => (
          <g key={index}>
            <Solid paths={cylinder(x, y, 9, -21, 8, P, 30, 1)} tone="mid" />
            <Solid paths={cylinder(x, y, 5, -13, 14, P, 30, 1)} tone="hi" />
          </g>
        ))}
      </g>

      <g className="engine-far-exhaust" data-system-part="cooling-exhaust">
        {exhaustRoutes.slice(2).map((route, index) => (
          <Tube key={index} points={route} radius={4.5} tone="mid" className="engine-exhaust-tube" flow />
        ))}
      </g>

      <CylinderAssembly x={-30} side={-1} number="4" />
      <CylinderAssembly x={30} side={-1} number="2" />

      <g className="engine-induction" data-system-part="fuel-air">
        {inductionRoutes.slice(2).map((route, index) => (
          <Tube key={`far-${index}`} points={route} radius={4.2} tone="mid" className="engine-intake-tube" flow />
        ))}
      </g>

      <EngineCase />

      <g className="engine-crankshaft" data-system-part="cycle oil">
        <Turned
          origin={[-55, 0, 54]}
          axis={[1, 0, 0]}
          profile={[
            [0, 7], [18, 7], [20, 12], [25, 12], [27, 7], [83, 7], [85, 12], [90, 12], [92, 7], [112, 7],
          ]}
          tone="hi"
          lit
        />
      </g>

      <g className="engine-oil-system" data-system-part="oil">
        <Turned
          origin={[-74, 0, 8]}
          axis={[-1, 0, 0]}
          profile={[[0, 11], [4, 14], [17, 14], [21, 10]]}
          tone="mid"
        />
        <Tube points={[[-76, 0, 7], [-50, 0, 2], [-32, 0, 35], [28, 0, 50]]} radius={2.2} tone="mid" flow />
        <Tube points={[[28, 0, 50], [28, 25, 57], [28, 62, 62], [28, 91, 70]]} radius={1.5} tone="mid" flow />
      </g>

      <g className="engine-carburetor" data-system-part="fuel-air">
        <Solid paths={cylinder(0, 0, 15, -20, 22, P, 40, 2)} tone="mid" />
        <Solid paths={cylinder(0, 0, 10, 2, 11, P, 40, 1)} tone="hi" />
        <Line d={ring(0, 0, 7, 13.2, P, 36)} tone="hi" />
        <Line d={lineOnTop([-7, 0], [7, 0], 13.3, P)} tone="mid" />
      </g>

      <g className="engine-near-induction" data-system-part="fuel-air">
        {inductionRoutes.slice(0, 2).map((route, index) => (
          <Tube key={index} points={route} radius={4.2} tone="mid" className="engine-intake-tube" flow />
        ))}
      </g>

      <CylinderAssembly x={-30} side={1} number="3" />
      <CylinderAssembly x={30} side={1} number="1" cutaway />

      <g className="engine-near-exhaust" data-system-part="cooling-exhaust">
        {exhaustRoutes.slice(0, 2).map((route, index) => (
          <Tube key={index} points={route} radius={4.5} tone="mid" className="engine-exhaust-tube" flow />
        ))}
      </g>

      <g className="engine-cooling-baffles" data-system-part="cooling-exhaust">
        <Solid paths={slabOf({ x: -57, y: 42, w: 115, d: 8, r: 2 }, 92, 3, P, 5, 0.5)} tone="mid" />
        <Solid paths={slabOf({ x: -57, y: -50, w: 115, d: 8, r: 2 }, 92, 3, P, 5, 0.5)} tone="mid" />
        <Line d={path3([[-52, 47, 96], [52, 47, 96]])} tone="faint" free />
        <Line d={path3([[-52, -47, 96], [52, -47, 96]])} tone="faint" free />
      </g>

      <Magneto y={18} />
      <Magneto y={-18} />

      <g className="engine-ignition-harness" data-system-part="ignition">
        {ignitionRoutes.map((route, index) => (
          <Tube key={index} points={route} radius={0.9} tone="mid" className="engine-ignition-wire" flow />
        ))}
      </g>

      <CutawayMechanism />

      <g className="engine-details" data-system-part="overview">
        <Solid paths={slabOf({ x: -18, y: 33, w: 36, d: 2.5, r: 1 }, 37, 18, P, 4, 0.4)} tone="lo" />
        <Line d={path3([[-13, 35.7, 50], [11, 35.7, 50]])} tone="faint" free />
        <Line d={path3([[-13, 35.7, 46], [7, 35.7, 46]])} tone="faint" free />
        <Dots points={[at([-15, 35.8, 39]), at([15, 35.8, 39])]} size={1} tone="mid" />
        <Turned origin={[45, 30, 8]} axis={[0, 0, 1]} profile={[[0, 3], [28, 3], [31, 6]]} tone="mid" />
        <Line d={ring(45, 30, 7, 39, P, 30)} tone="hi" />
      </g>
    </g>
  );
}
