"use client";
import { useEffect, useMemo, useRef, useState, type PointerEvent, type TouchEvent } from "react";
import type { Composition, GeometryElement, Point, RouteGeometry } from "@/lib/sky-art/types";
import { bounds, distance, pathData, transform } from "@/lib/sky-art/geometry";
import { compressSamples, MAX_SKETCH_SAMPLES, MAX_SKETCH_STROKES, recognizeHeldShape, strokeLength, type HeldShape } from "@/lib/sky-art/sketch";
import { skyArtId } from "@/lib/sky-art/id";
import styles from "./SkyArt.module.css";
type Props = {
  composition: Composition;
  geometry: GeometryElement[];
  route: RouteGeometry | null;
  refinePreview: Composition | null;
  selection: string[];
  selectedStroke: { elementId: string; strokeId: string } | null;
  onSelectStroke: (stroke: { elementId: string; strokeId: string } | null) => void;
  onSelect: (ids: string[]) => void;
  onChange: (c: Composition, commit?: boolean) => void;
  pathView: boolean;
  multiple: boolean;
  tool: "select" | "pen" | "erase" | "start";
  onNotice: (message: string) => void;
};
export default function ArtCanvas({
  composition,
  geometry,
  route,
  refinePreview,
  selection,
  selectedStroke,
  onSelectStroke,
  onSelect,
  onChange,
  pathView,
  multiple,
  tool,
  onNotice,
}: Props) {
  const svg = useRef<SVGSVGElement>(null),
    gesture = useRef<{
      start: Point;
      original: Composition;
      ids: string[];
      kind: "move" | "scale" | "rotate" | "stroke-move" | "stroke-scale" | "stroke-rotate";
      strokeId?: string;
      center: Point;
      radius: number;
      angle: number;
    } | null>(null);
  const drawing = useRef<Point[] | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdAnchor = useRef<Point | null>(null);
  const heldShape = useRef<HeldShape | null>(null);
  const touchId = useRef<number | null>(null);
  const pencilPointer = useRef(false);
  const connectorDrag = useRef<{ id: string; original: Composition } | null>(null);
  const [draft, setDraft] = useState<Point[]>([]);
  const [shapePreview, setShapePreview] = useState<HeldShape | null>(null);
  const [zoom, setZoom] = useState(1),
    [viewCenter, setViewCenter] = useState({ x: 400, y: 300 });
  const displayGeometry = useMemo<GeometryElement[]>(() => composition.elements.flatMap((element) => {
    if (element.kind !== "sketch") {
      const item = geometry.find((candidate) => candidate.id === element.id);
      return item ? [item] : [];
    }
    return [{ id: element.id, strokes: (element.strokes ?? []).map((stroke, index) => ({
      id: stroke.id, elementId: element.id, character: element.sketchOrderLocked ? index : 0,
      points: stroke.points.map((p) => transform(p, element)),
      closed: stroke.closed, hole: false,
    })) }];
  }), [composition, geometry]);
  const previousElementCount = useRef(composition.elements.length);
  const pendingAdded = useRef(false);
  useEffect(() => {
    const added = composition.elements.length > previousElementCount.current;
    previousElementCount.current = composition.elements.length;
    if (added) pendingAdded.current = true;
    if (!pendingAdded.current) return;
    const item = displayGeometry.find((element) => selection.includes(element.id));
    if (!item) return;
    pendingAdded.current = false;
    const b = bounds(item.strokes.flatMap((stroke) => stroke.points));
    const visible = {
      minX: viewCenter.x - 400 / zoom,
      maxX: viewCenter.x + 400 / zoom,
      minY: viewCenter.y - 300 / zoom,
      maxY: viewCenter.y + 300 / zoom,
    };
    let frame: number | undefined;
    if (b.maxX < visible.minX || b.minX > visible.maxX ||
        b.maxY < visible.minY || b.minY > visible.maxY) {
      frame = requestAnimationFrame(() =>
        setViewCenter({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }));
    }
    if (window.innerWidth <= 1000) svg.current?.scrollIntoView({ block: "center" });
    return () => { if (frame !== undefined) cancelAnimationFrame(frame); };
  }, [composition.elements.length, displayGeometry, selection, viewCenter, zoom]);
  useEffect(() => {
    if (tool === "pen" && window.innerWidth <= 1000)
      svg.current?.scrollIntoView({ block: "center" });
  }, [tool]);
  const selected = composition.elements.filter((e) => selection.includes(e.id));
  const selectedGeometry = displayGeometry.filter((e) => selection.includes(e.id));
  const selectedStrokeGeometry = selectedStroke && selectedGeometry
    .find((e) => e.id === selectedStroke.elementId)?.strokes
    .find((s) => s.id === selectedStroke.strokeId);
  const selectedBounds = bounds(selectedStrokeGeometry?.points ??
    selectedGeometry.flatMap((e) => e.strokes.flatMap((s) => s.points)));
  const center = selectedStrokeGeometry
    ? { x: (selectedBounds.minX + selectedBounds.maxX) / 2,
        y: (selectedBounds.minY + selectedBounds.maxY) / 2 }
    : selected.length
    ? {
        x: selected.reduce((v, e) => v + e.x, 0) / selected.length,
        y: selected.reduce((v, e) => v + e.y, 0) / selected.length,
      }
    : { x: 400, y: 300 };
  const point = (event: { clientX: number; clientY: number }): Point => {
    const m = svg.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = svg.current!.createSVGPoint();
    p.x = event.clientX;
    p.y = event.clientY;
    const local = p.matrixTransform(m.inverse());
    return { x: local.x, y: local.y };
  };
  const startDrawing = (client: { clientX: number; clientY: number }) => {
    onSelectStroke(null);
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdAnchor.current = null;
    heldShape.current = null;
    setShapePreview(null);
    drawing.current = [point(client)];
    setDraft(drawing.current);
  };
  const scheduleShape = (anchor: Point) => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdAnchor.current = anchor;
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      const shape = drawing.current && recognizeHeldShape(drawing.current);
      if (shape) {
        heldShape.current = shape;
        setShapePreview(shape);
      }
    }, 450);
  };
  const extendDrawing = (client: { clientX: number; clientY: number }) => {
    if (!drawing.current) return;
    if (heldShape.current) return;
    const p = point(client);
    const movement = distance(p, drawing.current.at(-1)!);
    if (movement >= 0.5) {
      drawing.current.push(p);
      if (drawing.current.length > MAX_SKETCH_SAMPLES * 2)
        drawing.current = compressSamples(drawing.current);
      setDraft([...drawing.current]);
      if (!holdTimer.current || !holdAnchor.current ||
          distance(p, holdAnchor.current) >= 6) scheduleShape(p);
    }
  };
  const begin = (
    event: PointerEvent,
    id: string,
    kind: "move" | "scale" | "rotate" = "move",
  ) => {
    if (tool !== "select") return;
    event.stopPropagation();
    onSelectStroke(null);
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
  const beginStroke = (event: PointerEvent, elementId: string, strokeId: string,
    kind: "stroke-move" | "stroke-scale" | "stroke-rotate" = "stroke-move") => {
    if (tool !== "select") return;
    event.stopPropagation();
    onSelect([elementId]);
    onSelectStroke({ elementId, strokeId });
    const p = point(event);
    const stroke = displayGeometry.find((e) => e.id === elementId)?.strokes.find((s) => s.id === strokeId);
    const b = bounds(stroke?.points ?? []);
    const center = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    gesture.current = { start: p, original: composition, ids: [elementId],
      kind, strokeId, center, radius: Math.hypot(p.x - center.x, p.y - center.y),
      angle: Math.atan2(p.y - center.y, p.x - center.x) };
    svg.current?.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent) => {
    if (tool === "pen" && event.pointerType === "touch") return;
    if (connectorDrag.current) {
      const drag = connectorDrag.current;
      onChange({ ...drag.original, connectors: {
        ...drag.original.connectors, [drag.id]: point(event),
      } }, false);
      return;
    }
    if (drawing.current) {
      extendDrawing(event);
      return;
    }
    const g = gesture.current;
    if (!g) return;
    const p = point(event),
      dx = p.x - g.start.x,
      dy = p.y - g.start.y;
    if (g.kind.startsWith("stroke-") && g.strokeId) {
      onChange({ ...g.original, elements: g.original.elements.map((e) => {
        if (e.id !== g.ids[0] || e.kind !== "sketch") return e;
        const theta = -e.rotation * Math.PI / 180;
        const ratio = Math.max(0.1, Math.min(10,
          Math.hypot(p.x - g.center.x, p.y - g.center.y) / Math.max(1, g.radius)));
        const turn = Math.atan2(p.y - g.center.y, p.x - g.center.x) - g.angle;
        const apply = (points: Point[]) => points.map((v) => {
          const world = transform(v, e);
          const x = world.x - g.center.x, y = world.y - g.center.y;
          const moved = g.kind === "stroke-move"
            ? { x: world.x + dx, y: world.y + dy }
            : g.kind === "stroke-scale"
              ? { x: g.center.x + x * ratio, y: g.center.y + y * ratio }
              : { x: g.center.x + x * Math.cos(turn) - y * Math.sin(turn),
                  y: g.center.y + x * Math.sin(turn) + y * Math.cos(turn) };
          const localX = moved.x - e.x, localY = moved.y - e.y;
          return { x: (localX * Math.cos(theta) - localY * Math.sin(theta)) / e.scale,
            y: (localX * Math.sin(theta) + localY * Math.cos(theta)) / e.scale };
        });
        return { ...e, strokes: e.strokes?.map((stroke) => stroke.id === g.strokeId
          ? { ...stroke, raw: apply(stroke.raw), points: apply(stroke.points) }
          : stroke) };
      }) }, false);
      return;
    }
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
  const finishDrawing = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    holdAnchor.current = null;
    if (drawing.current) {
      const raw = compressSamples(drawing.current);
      const shape = heldShape.current;
      heldShape.current = null;
      drawing.current = null;
      setDraft([]);
      setShapePreview(null);
      if (raw.length >= 2 && strokeLength(raw) > 2) {
        const target = composition.elements.find((e) => e.kind === "sketch" && selection.includes(e.id))
          ?? composition.elements.find((e) => e.kind === "sketch");
        if (!target && composition.elements.length >= 8) onNotice("Use up to 8 elements.");
        else if (composition.elements.reduce((n, e) => n + (e.kind === "sketch" ? e.strokes?.length ?? 0 : 0), 0) >= MAX_SKETCH_STROKES)
          onNotice("40 strokes reached. Remove or simplify a stroke before drawing more.");
        else {
          const id = target?.id ?? skyArtId();
          const toLocal = (points: Point[]) => points.map((p) => {
            const e = target ?? { x: 400, y: 300, scale: 1, rotation: 0 };
            const a = -(e.rotation * Math.PI) / 180;
            const x = p.x - e.x, y = p.y - e.y;
            return { x: (x * Math.cos(a) - y * Math.sin(a)) / e.scale,
              y: (x * Math.sin(a) + y * Math.cos(a)) / e.scale };
          });
          const rawPoints = toLocal(raw);
          const strokeId = skyArtId();
          const withStroke = (points: Point[], closed: boolean): Composition => {
            const stroke = { id: strokeId, raw: rawPoints, points, closed };
            const elements = target
              ? composition.elements.map((e) => e.id === id ? { ...e, strokes: [...(e.strokes ?? []), stroke] } : e)
              : [...composition.elements, { id, kind: "sketch" as const, value: "Sketch", x: 400, y: 300,
                  scale: 1, rotation: 0, font: "outline" as const, spacing: 12, lineHeight: 130,
                  strokes: [stroke] }];
            return { ...composition, version: 2, elements };
          };
          if (shape) onChange(withStroke(rawPoints, false));
          onChange(withStroke(shape ? toLocal(shape.points) : rawPoints, shape?.closed ?? false));
          onSelect([id]);
          if (!shape && distance(raw[0], raw.at(-1)!) < 12)
            onNotice("Stroke endpoints are close. Select Close last stroke to make a loop.");
        }
      }
    }
  };
  const end = (event: PointerEvent) => {
    if (tool === "pen" && event.pointerType === "touch") return;
    if (tool === "pen" && drawing.current && !heldShape.current)
      extendDrawing(event);
    if (event.pointerType === "pen") pencilPointer.current = false;
    if (connectorDrag.current) {
      onChange(composition, true);
      connectorDrag.current = null;
    }
    finishDrawing();
    if (gesture.current) {
      onChange(composition, true);
      gesture.current = null;
    }
    if (svg.current?.hasPointerCapture(event.pointerId))
      svg.current.releasePointerCapture(event.pointerId);
  };
  const down = (event: PointerEvent) => {
    if (tool === "pen") {
      if (event.pointerType === "touch") return;
      if (event.pointerType === "pen") {
        pencilPointer.current = true;
        touchId.current = null;
      }
      event.preventDefault();
      startDrawing(event);
      svg.current?.setPointerCapture(event.pointerId);
    } else if (tool === "start") {
      const p = point(event);
      let best: { elementId: string; strokeId: string; pointIndex: number; d: number } | undefined;
      for (const item of displayGeometry) {
        const element = composition.elements.find((e) => e.id === item.id);
        if (element?.kind !== "sketch") continue;
        item.strokes.forEach((stroke, index) => stroke.points.forEach((v, pointIndex) => {
          const d = distance(p, v);
          if (!best || d < best.d) best = { elementId: item.id,
            strokeId: element.strokes![index].id, pointIndex, d };
        }));
      }
      if (best && best.d < 18) {
        onChange({ ...composition, firstElement: best.elementId,
          firstCharacter: undefined,
          sketchStart: { elementId: best.elementId, strokeId: best.strokeId,
            pointIndex: best.pointIndex } });
        onSelect([best.elementId]);
      } else onNotice("Tap a point on a hand-drawn stroke.");
    } else if (tool === "erase") {
      const p = point(event);
      let chosen: { id: string; index: number; pointIndex: number; distance: number } | undefined;
      for (const item of displayGeometry) {
        if (composition.elements.find((e) => e.id === item.id)?.kind !== "sketch") continue;
        item.strokes.forEach((stroke, index) => stroke.points.forEach((v, pointIndex) => {
          const d = distance(p, v);
          if (!chosen || d < chosen.distance) chosen = { id: item.id, index, pointIndex, distance: d };
        }));
      }
      if (chosen && chosen.distance < 14) {
        const hit = chosen;
        onChange({ ...composition,
          sketchStart: composition.sketchStart?.elementId === hit.id &&
            composition.sketchStart.strokeId === composition.elements.find((e) => e.id === hit.id)?.strokes?.[hit.index]?.id
            ? undefined : composition.sketchStart,
          elements: composition.elements.map((e) => {
          if (e.id !== hit.id || e.kind !== "sketch") return e;
          const stroke = e.strokes?.[hit.index];
          if (!stroke) return e;
          const at = Math.max(1, Math.min(stroke.points.length - 2, hit.pointIndex));
          const pieces = [stroke.points.slice(0, at), stroke.points.slice(at + 1)]
            .filter((points) => points.length >= 2)
            .map((points) => ({ id: skyArtId(), raw: points, points, closed: false }));
          return { ...e, strokes: [...(e.strokes ?? []).slice(0, hit.index),
            ...pieces, ...(e.strokes ?? []).slice(hit.index + 1)] };
        }) });
      }
    } else onSelect([]);
  };
  const touchStart = (event: TouchEvent<SVGSVGElement>) => {
    if (tool !== "pen" || pencilPointer.current || touchId.current !== null || event.touches.length !== 1) return;
    const touch = event.changedTouches[0];
    touchId.current = touch.identifier;
    startDrawing(touch);
  };
  const touchMove = (event: TouchEvent<SVGSVGElement>) => {
    if (tool !== "pen" || touchId.current === null) return;
    const touch = Array.from(event.changedTouches).find((t) => t.identifier === touchId.current);
    if (touch) extendDrawing(touch);
  };
  const touchEnd = (event: TouchEvent<SVGSVGElement>) => {
    if (touchId.current === null) return;
    const touch = Array.from(event.changedTouches).find((t) => t.identifier === touchId.current);
    if (!touch) return;
    if (!heldShape.current) extendDrawing(touch);
    touchId.current = null;
    finishDrawing();
  };
  const touchCancel = () => {
    touchId.current = null;
    if (heldShape.current) {
      finishDrawing();
      return;
    }
    drawing.current = null;
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    holdAnchor.current = null;
    setDraft([]);
    setShapePreview(null);
  };
  return (
    <div className={styles.canvasWrap} style={{ touchAction: tool === "pen" ? "none" : undefined }}>
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
          aria-label="Reset canvas view"
          title="Reset canvas view"
          onClick={() => {
            setZoom(1);
            setViewCenter({ x: 400, y: 300 });
          }}
        >
          ⟲
        </button>
        <button
          type="button"
          aria-label="Fit artwork in canvas"
          title="Fit artwork in canvas"
          onClick={() => {
            if (!displayGeometry.length) {
              setZoom(1);
              setViewCenter({ x: 400, y: 300 });
              return;
            }
            const b = bounds(
              displayGeometry.flatMap((e) => e.strokes.flatMap((s) => s.points)),
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
          ⛶
        </button>
      </div>
      <svg
        ref={svg}
        className={styles.canvas}
        viewBox={`${viewCenter.x - 400 / zoom} ${viewCenter.y - 300 / zoom} ${800 / zoom} ${600 / zoom}`}
        role="img"
        aria-label="Artwork composition canvas"
        style={{ touchAction: "none", cursor: tool === "pen" || tool === "start" ? "crosshair" : tool === "erase" ? "cell" : undefined }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerDown={down}
        onContextMenu={(event) => { if (tool === "pen") event.preventDefault(); }}
        onTouchStart={touchStart}
        onTouchMove={touchMove}
        onTouchEnd={touchEnd}
        onTouchCancel={touchCancel}
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
        {displayGeometry.map((item) => {
          const e = composition.elements.find((e) => e.id === item.id);
          if (!e) return null;
          return (
            <g
              key={item.id}
              onPointerDown={(event) => begin(event, item.id)}
              className={styles.artElement}
            >
              {e.kind === "sketch" ? item.strokes.map((stroke, index) => (
                <g key={stroke.id}>
                  <path d={pathData(stroke.points, stroke.closed)}
                    fill={pathView ? "none" : "#dce9ee"}
                    stroke={selectedStroke?.strokeId === stroke.id ? "#0891b2" : "#25465a"}
                    strokeWidth={pathView ? 1.4 : 1.2}
                    vectorEffect="non-scaling-stroke"
                    onPointerDown={(event) => {
                      const strokeId = stroke.id ?? e.strokes?.[index]?.id;
                      if (strokeId) beginStroke(event, item.id, strokeId);
                    }} />
                  <path d={pathData(stroke.points, stroke.closed)} fill="none"
                    stroke="transparent" strokeWidth="14" vectorEffect="non-scaling-stroke"
                    onPointerDown={(event) => {
                      const strokeId = stroke.id ?? e.strokes?.[index]?.id;
                      if (strokeId) beginStroke(event, item.id, strokeId);
                    }} />
                </g>
              )) : <>
                <path
                  d={item.strokes.map((s) => pathData(s.points, s.closed)).join(" ")}
                  fill={pathView ? "none" : e.kind === "text" && e.font === "outline" ? "#162f49" : "#dce9ee"}
                  fillRule="evenodd"
                  stroke={selection.includes(item.id) ? "#0891b2" : "#25465a"}
                  strokeWidth={pathView ? 1.4 : 1.2}
                  vectorEffect="non-scaling-stroke"
                />
                <path d={item.strokes.map((s) => pathData(s.points, s.closed)).join(" ")}
                  fill="none" stroke="transparent" strokeWidth="14" vectorEffect="non-scaling-stroke" />
              </>}
            </g>
          );
        })}
        {pathView && route && <g pointerEvents="none">
          {route.segments.map((segment, i) => <path key={i}
            d={pathData([segment.from, segment.to])}
            fill="none"
            stroke={segment.kind === "art" ? "#087e91" : "#f97316"}
            strokeWidth={segment.kind === "art" ? 2.1 : 2.5}
            strokeDasharray={segment.kind === "art" ? undefined : "5 3"}
            vectorEffect="non-scaling-stroke" />)}
        </g>}
        {pathView && tool === "select" && route && [...new Set(route.segments.map((s) => s.connectorId).filter(Boolean))].map((id) => {
          const segments = route.segments.filter((s) => s.connectorId === id);
          const p = composition.connectors?.[id!] ?? segments[Math.floor(segments.length / 2)].from;
          return <circle key={id} cx={p.x} cy={p.y} r="6" fill="#f97316"
            stroke="white" strokeWidth="2" className={styles.scaleHandle}
            onPointerDown={(event) => {
              event.stopPropagation();
              connectorDrag.current = { id: id!, original: composition };
              svg.current?.setPointerCapture(event.pointerId);
            }} />;
        })}
        {refinePreview && <g pointerEvents="none">
          {refinePreview.elements.filter((e) => e.kind === "sketch").flatMap((e) =>
            (e.strokes ?? []).map((s) => <path key={s.id}
              d={pathData(s.points.map((p) => transform(p, e)), s.closed)}
              fill="none" stroke="#f97316" strokeWidth="2"
              vectorEffect="non-scaling-stroke" />))}
        </g>}
        {draft.length > 1 && <path d={pathData(shapePreview?.points ?? draft, shapePreview?.closed ?? false)} fill="none" stroke={shapePreview ? "#0891b2" : "#f97316"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
        {composition.sketchStart && (() => {
          const element = composition.elements.find((e) => e.id === composition.sketchStart!.elementId);
          const stroke = element?.strokes?.find((s) => s.id === composition.sketchStart!.strokeId);
          const point = stroke?.points[composition.sketchStart!.pointIndex];
          if (!element || !point) return null;
          const p = transform(point, element);
          return <circle cx={p.x} cy={p.y} r="5" fill="#f97316" stroke="white" strokeWidth="2" pointerEvents="none" />;
        })()}
        {selected.length > 0 && selectedGeometry.length > 0 && (
          <g
            pointerEvents={tool === "select" ? undefined : "none"}
            onPointerDown={(e) => {
              if (tool === "select") e.stopPropagation();
            }}
          >
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
              onPointerDown={(e) => selectedStrokeGeometry && selectedStroke
                ? beginStroke(e, selectedStroke.elementId, selectedStroke.strokeId, "stroke-rotate")
                : begin(e, selected[0].id, "rotate")}
            />
            <rect
              x={selectedBounds.maxX + 5}
              y={selectedBounds.maxY + 5}
              width="10"
              height="10"
              fill="white"
              stroke="#0891b2"
              className={styles.scaleHandle}
              onPointerDown={(e) => selectedStrokeGeometry && selectedStroke
                ? beginStroke(e, selectedStroke.elementId, selectedStroke.strokeId, "stroke-scale")
                : begin(e, selected[0].id, "scale")}
            />
          </g>
        )}
      </svg>
    </div>
  );
}
