"use client";
import { useRef, useState, type PointerEvent } from "react";
import type { Composition, GeometryElement, Point } from "@/lib/sky-art/types";
import { bounds, pathData } from "@/lib/sky-art/geometry";
import styles from "./SkyArt.module.css";
type Props = {
  composition: Composition;
  geometry: GeometryElement[];
  selection: string[];
  onSelect: (ids: string[]) => void;
  onChange: (c: Composition, commit?: boolean) => void;
  pathView: boolean;
  multiple: boolean;
};
export default function ArtCanvas({
  composition,
  geometry,
  selection,
  onSelect,
  onChange,
  pathView,
  multiple,
}: Props) {
  const svg = useRef<SVGSVGElement>(null),
    gesture = useRef<{
      start: Point;
      original: Composition;
      ids: string[];
      kind: "move" | "scale" | "rotate";
      center: Point;
      radius: number;
      angle: number;
    } | null>(null);
  const [zoom, setZoom] = useState(1),
    [viewCenter, setViewCenter] = useState({ x: 400, y: 300 });
  const selected = composition.elements.filter((e) => selection.includes(e.id));
  const selectedGeometry = geometry.filter((e) => selection.includes(e.id));
  const selectedBounds = bounds(
    selectedGeometry.flatMap((e) => e.strokes.flatMap((s) => s.points)),
  );
  const center = selected.length
    ? {
        x: selected.reduce((v, e) => v + e.x, 0) / selected.length,
        y: selected.reduce((v, e) => v + e.y, 0) / selected.length,
      }
    : { x: 400, y: 300 };
  const point = (event: PointerEvent): Point => {
    const m = svg.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      m.inverse(),
    );
    return { x: p.x, y: p.y };
  };
  const begin = (
    event: PointerEvent,
    id: string,
    kind: "move" | "scale" | "rotate" = "move",
  ) => {
    event.stopPropagation();
    const e = composition.elements.find((e) => e.id === id);
    if (!e) return;
    let ids = selection.includes(id)
      ? selection
      : event.shiftKey || multiple
        ? [...selection, id]
        : composition.elements
            .filter((a) => (e.group ? a.group === e.group : a.id === id))
            .map((e) => e.id);
    if (event.shiftKey && selection.includes(id)) {
      ids = selection.filter((a) => a !== id);
      onSelect(ids);
      return;
    }
    onSelect(ids);
    const items = composition.elements.filter((e) => ids.includes(e.id)),
      c = {
        x: items.reduce((v, e) => v + e.x, 0) / items.length,
        y: items.reduce((v, e) => v + e.y, 0) / items.length,
      },
      p = point(event);
    gesture.current = {
      start: p,
      original: composition,
      ids,
      kind,
      center: c,
      radius: Math.hypot(p.x - c.x, p.y - c.y),
      angle: Math.atan2(p.y - c.y, p.x - c.x),
    };
    svg.current?.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const p = point(event),
      dx = p.x - g.start.x,
      dy = p.y - g.start.y;
    const ratio = Math.max(
        0.1,
        Math.min(
          10,
          Math.hypot(p.x - g.center.x, p.y - g.center.y) /
            Math.max(1, g.radius),
        ),
      ),
      a = Math.atan2(p.y - g.center.y, p.x - g.center.x) - g.angle;
    onChange(
      {
        ...g.original,
        elements: g.original.elements.map((e) => {
          if (!g.ids.includes(e.id)) return e;
          if (g.kind === "move") return { ...e, x: e.x + dx, y: e.y + dy };
          if (g.kind === "scale")
            return {
              ...e,
              x: g.center.x + (e.x - g.center.x) * ratio,
              y: g.center.y + (e.y - g.center.y) * ratio,
              scale: e.scale * ratio,
            };
          const x = e.x - g.center.x,
            y = e.y - g.center.y;
          return {
            ...e,
            x: g.center.x + x * Math.cos(a) - y * Math.sin(a),
            y: g.center.y + x * Math.sin(a) + y * Math.cos(a),
            rotation: e.rotation + (a * 180) / Math.PI,
          };
        }),
      },
      false,
    );
  };
  const end = (event: PointerEvent) => {
    if (gesture.current) {
      onChange(composition, true);
      gesture.current = null;
    }
    if (svg.current?.hasPointerCapture(event.pointerId))
      svg.current.releasePointerCapture(event.pointerId);
  };
  return (
    <div className={styles.canvasWrap}>
      <div className={styles.canvasZoom}>
        <button
          type="button"
          aria-label="Zoom canvas out"
          onClick={() => setZoom((z) => Math.max(0.1, z / 1.2))}
        >
          −
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          aria-label="Zoom canvas in"
          onClick={() => setZoom((z) => Math.min(3, z * 1.2))}
        >
          +
        </button>
        <button
          type="button"
          onClick={() => {
            setZoom(1);
            setViewCenter({ x: 400, y: 300 });
          }}
        >
          Reset view
        </button>
        <button
          type="button"
          onClick={() => {
            const b = bounds(
              geometry.flatMap((e) => e.strokes.flatMap((s) => s.points)),
            );
            setViewCenter({
              x: (b.minX + b.maxX) / 2,
              y: (b.minY + b.maxY) / 2,
            });
            setZoom(
              Math.min(
                2,
                700 / Math.max(1, b.width),
                500 / Math.max(1, b.height),
              ),
            );
          }}
        >
          Fit artwork
        </button>
      </div>
      <svg
        ref={svg}
        className={styles.canvas}
        viewBox={`${viewCenter.x - 400 / zoom} ${viewCenter.y - 300 / zoom} ${800 / zoom} ${600 / zoom}`}
        role="img"
        aria-label="Artwork composition canvas"
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerDown={() => onSelect([])}
      >
        <defs>
          <pattern
            id="sky-grid"
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="0" cy="0" r=".9" fill="#c7d3df" />
          </pattern>
        </defs>
        <rect
          x="-4000"
          y="-4000"
          width="8000"
          height="8000"
          fill="url(#sky-grid)"
        />
        <path
          d="M400 0V600 M0 300H800"
          stroke="#cbd5e1"
          strokeDasharray="4 8"
          strokeWidth=".7"
        />
        {geometry.map((item) => {
          const e = composition.elements.find((e) => e.id === item.id);
          if (!e) return null;
          return (
            <g
              key={item.id}
              onPointerDown={(event) => begin(event, item.id)}
              className={styles.artElement}
            >
              <path
                d={item.strokes
                  .map((s) => pathData(s.points, s.closed))
                  .join(" ")}
                fill={
                  pathView
                    ? "none"
                    : e.kind === "text" && e.font === "outline"
                      ? "#162f49"
                      : "#dce9ee"
                }
                fillRule="evenodd"
                stroke={selection.includes(item.id) ? "#0891b2" : "#25465a"}
                strokeWidth={pathView ? 1.4 : 1.2}
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={item.strokes
                  .map((s) => pathData(s.points, s.closed))
                  .join(" ")}
                fill="none"
                stroke="transparent"
                strokeWidth="14"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}
        {selected.length > 0 && selectedGeometry.length > 0 && (
          <g onPointerDown={(e) => e.stopPropagation()}>
            <rect
              x={selectedBounds.minX - 10}
              y={selectedBounds.minY - 10}
              width={selectedBounds.width + 20}
              height={selectedBounds.height + 20}
              fill="none"
              stroke="#0891b2"
              strokeWidth="1"
              strokeDasharray="5 4"
            />
            <path
              d={`M${center.x},${selectedBounds.minY - 10}V${selectedBounds.minY - 34}`}
              stroke="#0891b2"
            />
            <circle
              cx={center.x}
              cy={selectedBounds.minY - 36}
              r="6"
              fill="white"
              stroke="#0891b2"
              className={styles.rotateHandle}
              onPointerDown={(e) => begin(e, selected[0].id, "rotate")}
            />
            <rect
              x={selectedBounds.maxX + 5}
              y={selectedBounds.maxY + 5}
              width="10"
              height="10"
              fill="white"
              stroke="#0891b2"
              className={styles.scaleHandle}
              onPointerDown={(e) => begin(e, selected[0].id, "scale")}
            />
          </g>
        )}
      </svg>
    </div>
  );
}
