"use client";

import React from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Scatter,
  Tooltip
} from "recharts";

export default function CGEnvelopeChart({
  normalEnvelope,
  utilityEnvelope,
  currentCG,
  currentWeight,
  zeroFuelCG,
  zeroFuelWeight
}) {
  if (!normalEnvelope || normalEnvelope.length === 0) return null;

  const normalPoly = normalEnvelope.map(p => ({ x: p.cg, y: p.weight }));
  const utilityPoly = utilityEnvelope
    ? utilityEnvelope.map(p => ({ x: p.cg, y: p.weight }))
    : null;

  const normalLine = [...normalPoly, normalPoly[0]];
  const utilityLine = utilityPoly ? [...utilityPoly, utilityPoly[0]] : null;

  const zeroFuelPoint = {
    x: zeroFuelCG,
    y: zeroFuelWeight
  };

  const currentPoint = {
    x: currentCG,
    y: currentWeight
  };

  const cgLinePoints = [zeroFuelPoint, currentPoint].filter(
    p => Number.isFinite(p.x) && Number.isFinite(p.y)
  );

  // Auto domain based on envelope + CG points
  const allPointsForDomain = [
    ...normalPoly,
    ...cgLinePoints
  ];

  const xs = allPointsForDomain.map(p => p.x).filter(Number.isFinite);
  const ys = allPointsForDomain.map(p => p.y).filter(Number.isFinite);

  const minX = xs.length ? Math.min(...xs) : 34;
  const maxX = xs.length ? Math.max(...xs) : 48;
  const minY = ys.length ? Math.min(...ys) : 1400;
  const maxY = ys.length ? Math.max(...ys) : 2400;

  const xDomain = [Math.floor(minX - 0.5), Math.ceil(maxX + 0.5)];
  const yDomain = [Math.floor(minY - 100), Math.ceil(maxY + 100)];

  // 动态生成横轴（CG）和纵轴（Weight）的刻度
  const xTicks = [];
  const xStart = Math.ceil(xDomain[0]);
  const xEnd = Math.floor(xDomain[1]);
  for (let x = xStart; x <= xEnd; x += 1) {
    xTicks.push(x);
  }

  const yTicks = [];
  const yStart = Math.ceil(yDomain[0] / 100) * 100;
  const yEnd = Math.floor(yDomain[1] / 100) * 100;
  for (let y = yStart; y <= yEnd; y += 100) {
    yTicks.push(y);
  }

  return (
    <div style={{ width: "100%", height: 350, marginTop: 20 }}>
      <h3>CG Envelope</h3>

      <ResponsiveContainer>
        <ComposedChart>
          <CartesianGrid strokeDasharray="3 3" />

          <XAxis
            dataKey="x"
            type="number"
            name="CG Location (in)"
            label={{ value: "CG Location (in)", position: "bottom" }}
            xAxisId="x"
            domain={xDomain}
            ticks={xTicks}
          />

          <YAxis
            dataKey="y"
            type="number"
            name="Weight (lbs)"
            label={{ value: "Weight (lbs)", angle: -90, position: "insideLeft" }}
            yAxisId="y"
            domain={yDomain}
            ticks={yTicks}
          />

          <Tooltip cursor={{ strokeDasharray: "3 3" }} />

          {/* Normal envelope outline */}
          <Scatter
            data={normalLine}
            line={{ stroke: "#000", strokeWidth: 2 }}
            shape={() => null}
            xAxisId="x"
            yAxisId="y"
          />

          {/* Utility envelope outline */}
          {utilityLine && (
            <Scatter
              data={utilityLine}
              line={{ stroke: "#f4b400", strokeWidth: 2, strokeDasharray: "5 5" }}
              shape={() => null}
              xAxisId="x"
              yAxisId="y"
            />
          )}

          {/* CG 趋势线（Zero Fuel → With Fuel）*/}
          {cgLinePoints.length === 2 && (
            <Scatter
              data={cgLinePoints}
              line={{ stroke: "#555", strokeWidth: 2 }}
              shape={() => null}
              xAxisId="x"
              yAxisId="y"
            />
          )}

          {/* Zero fuel point - red */}
          {Number.isFinite(zeroFuelPoint.x) && Number.isFinite(zeroFuelPoint.y) && (
            <Scatter
              data={[zeroFuelPoint]}
              shape="circle"
              fill="#e53935"
              r={6}
              xAxisId="x"
              yAxisId="y"
            />
          )}

          {/* With fuel point - black */}
          {Number.isFinite(currentPoint.x) && Number.isFinite(currentPoint.y) && (
            <Scatter
              data={[currentPoint]}
              shape="circle"
              fill="#000000"
              r={6}
              xAxisId="x"
              yAxisId="y"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
