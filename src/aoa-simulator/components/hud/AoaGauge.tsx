"use client";

const GAUGE_RADIUS = 54;
const STROKE = 10;
const VIEWBOX = 140;
const CENTER = VIEWBOX / 2;

function polarToCartesian(angleDeg: number, radius: number) {
  const angleRad = ((angleDeg - 180) * Math.PI) / 180;
  return {
    x: CENTER + radius * Math.cos(angleRad),
    y: CENTER + radius * Math.sin(angleRad),
  };
}

function describeArc(startDeg: number, endDeg: number, radius: number) {
  const start = polarToCartesian(startDeg, radius);
  const end = polarToCartesian(endDeg, radius);
  const largeArcFlag = endDeg - startDeg <= 180 ? "0" : "1";

  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

export default function AoaGauge({ aoaDeg }: { aoaDeg: number }) {
  const clampedAoa = Math.max(0, Math.min(18, aoaDeg));
  const needleAngle = (clampedAoa / 18) * 180;
  const needlePoint = polarToCartesian(needleAngle, GAUGE_RADIUS - 8);

  return (
    <svg viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`} className="h-24 w-24">
      <path
        d={describeArc(0, 100, GAUGE_RADIUS)}
        fill="none"
        stroke="#22c55e"
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
      <path
        d={describeArc(100, 150, GAUGE_RADIUS)}
        fill="none"
        stroke="#facc15"
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
      <path
        d={describeArc(150, 180, GAUGE_RADIUS)}
        fill="none"
        stroke="#ef4444"
        strokeWidth={STROKE}
        strokeLinecap="round"
      />

      {[0, 10, 15].map((tick) => {
        const angle = (tick / 18) * 180;
        const outer = polarToCartesian(angle, GAUGE_RADIUS + 6);
        const inner = polarToCartesian(angle, GAUGE_RADIUS - 10);

        return (
          <g key={tick}>
            <line
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="#cbd5e1"
              strokeWidth="2"
            />
            <text
              x={polarToCartesian(angle, GAUGE_RADIUS + 18).x}
              y={polarToCartesian(angle, GAUGE_RADIUS + 18).y + 4}
              fontSize="10"
              textAnchor="middle"
              fill="#cbd5e1"
            >
              {tick}
            </text>
          </g>
        );
      })}

      <line
        x1={CENTER}
        y1={CENTER}
        x2={needlePoint.x}
        y2={needlePoint.y}
        stroke="#f8fafc"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx={CENTER} cy={CENTER} r="6" fill="#f8fafc" />
    </svg>
  );
}
