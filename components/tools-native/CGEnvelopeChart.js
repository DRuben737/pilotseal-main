"use client";

import React from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Scatter,
  Tooltip,
} from "recharts";

function toPlotPoints(points = []) {
  return points
    .map((point) => ({
      x: point.x ?? point.cg ?? point.long,
      y: point.y ?? point.weight ?? point.lat,
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

export default function CGEnvelopeChart({
  title = "Envelope",
  xLabel = "CG Location",
  yLabel = "Weight",
  primaryPolygon,
  secondaryPolygon,
  currentPoint,
  referencePoint,
}) {
  const primaryPoly = toPlotPoints(primaryPolygon);
  const secondaryPoly = toPlotPoints(secondaryPolygon);
  const hasPrimary = primaryPoly.length > 0;
  const hasSecondary = secondaryPoly.length > 0;

  if (!hasPrimary && !hasSecondary) return null;

  const primaryLine = hasPrimary ? [...primaryPoly, primaryPoly[0]] : null;
  const secondaryLine = hasSecondary ? [...secondaryPoly, secondaryPoly[0]] : null;

  const current = {
    x: currentPoint?.x,
    y: currentPoint?.y,
  };

  const reference = {
    x: referencePoint?.x,
    y: referencePoint?.y,
  };

  const tracePoints = [reference, current].filter(
    (point) => Number.isFinite(point.x) && Number.isFinite(point.y)
  );

  const allPointsForDomain = [
    ...primaryPoly,
    ...secondaryPoly,
    ...tracePoints,
  ];

  const xs = allPointsForDomain.map((point) => point.x).filter(Number.isFinite);
  const ys = allPointsForDomain.map((point) => point.y).filter(Number.isFinite);

  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) : 10;
  const minY = ys.length ? Math.min(...ys) : 0;
  const maxY = ys.length ? Math.max(...ys) : 10;

  const xPadding = Math.max((maxX - minX) * 0.08, 0.5);
  const yPadding = Math.max((maxY - minY) * 0.08, 0.5);

  return (
    <div className="cg-envelope-chart">
      <h3>{title}</h3>

      <ResponsiveContainer>
        <ComposedChart margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="#cbd5e1" strokeOpacity={0.48} strokeDasharray="2 4" />

          <XAxis
            dataKey="x"
            type="number"
            name={xLabel}
            xAxisId="x"
            domain={[Math.floor(minX - xPadding), Math.ceil(maxX + xPadding)]}
            tick={{ fontSize: 11 }}
            tickMargin={4}
            height={28}
          />

          <YAxis
            dataKey="y"
            type="number"
            name={yLabel}
            yAxisId="y"
            domain={[Math.floor(minY - yPadding), Math.ceil(maxY + yPadding)]}
            tick={{ fontSize: 11 }}
            tickMargin={4}
            width={42}
          />

          <Tooltip cursor={{ strokeDasharray: "3 3" }} />

          {primaryLine ? (
            <Scatter
              data={primaryLine}
              line={{ stroke: "#000", strokeWidth: 2 }}
              shape={() => null}
              xAxisId="x"
              yAxisId="y"
            />
          ) : null}

          {secondaryLine ? (
            <Scatter
              data={secondaryLine}
              line={{ stroke: "#f4b400", strokeWidth: 2, strokeDasharray: "5 5" }}
              shape={() => null}
              xAxisId="x"
              yAxisId="y"
            />
          ) : null}

          {tracePoints.length === 2 ? (
            <Scatter
              data={tracePoints}
              line={{ stroke: "#555", strokeWidth: 2 }}
              shape={() => null}
              xAxisId="x"
              yAxisId="y"
            />
          ) : null}

          {Number.isFinite(reference.x) && Number.isFinite(reference.y) ? (
            <Scatter
              data={[reference]}
              shape="circle"
              fill="#e53935"
              r={6}
              xAxisId="x"
              yAxisId="y"
            />
          ) : null}

          {Number.isFinite(current.x) && Number.isFinite(current.y) ? (
            <Scatter
              data={[current]}
              shape="circle"
              fill="#000000"
              r={6}
              xAxisId="x"
              yAxisId="y"
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
