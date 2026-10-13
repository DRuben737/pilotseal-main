"use client";
import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import ArtCanvas from "./sky-art/ArtCanvas";
import styles from "./sky-art/SkyArt.module.css";
import { PRESETS } from "@/lib/sky-art/presets";
import { bounds, pathData } from "@/lib/sky-art/geometry";
import {
  DEFAULT_COMPOSITION,
  DEFAULT_PLACEMENT,
  type Composition,
  type Element,
  type GeometryElement,
  type Placement,
  type RouteGeometry,
  type SavedProject,
  type Variant,
} from "@/lib/sky-art/types";
import { projectRoute } from "@/lib/sky-art/projection";
import {
  download,
  foreflightRoute,
  foreflightUrl,
  routeGpx,
  navlogCsv,
  navlogPdf,
  serialize,
  splitRoute,
  trackKml,
  waypointKml,
} from "@/lib/sky-art/exports";
import {
  loadProject,
  saveProject,
  validateProject,
} from "@/lib/sky-art/storage";
const RouteMap = dynamic(() => import("./sky-art/RouteMap"), { ssr: false });
type Airport = [string, string, string, number, number, string];
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const label = (e: Element) =>
  e.kind === "text"
    ? e.value
    : (PRESETS.find((p) => p.id === e.value)?.name ?? e.value);
function Field({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) {
  return (
    <label className={styles.field}>
      <span>{name}</span>
      {children}
    </label>
  );
}
function NumberField({
  name,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  name: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <Field name={name}>
      <input
        type="number"
        value={Number(value.toFixed(3))}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          if (e.target.value !== "") {
            const v = Number(e.target.value);
            if (
              Number.isFinite(v) &&
              (min === undefined || v >= min) &&
              (max === undefined || v <= max)
            )
              onChange(v);
          }
        }}
      />
    </Field>
  );
}
export default function SkyArt() {
  const [composition, setComposition] = useState<Composition>(() =>
      clone(DEFAULT_COMPOSITION),
    ),
    [placement, setPlacement] = useState<Placement>(() =>
      clone(DEFAULT_PLACEMENT),
    ),
    [variant, setVariant] = useState<Variant>("balanced");
  const [stage, setStage] = useState<"canvas" | "map" | "details">("canvas"),
    [selection, setSelection] = useState<string[]>(["year"]),
    [pathView, setPathView] = useState(false),
    [multiple, setMultiple] = useState(false),
    [category, setCategory] = useState("All");
  const [geometry, setGeometry] = useState<GeometryElement[]>([]),
    [route, setRoute] = useState<RouteGeometry | null>(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [query, setQuery] = useState(""),
    [airports, setAirports] = useState<Airport[]>([]),
    [pickPoint, setPickPoint] = useState(false),
    [fitKey, setFitKey] = useState(0),
    [selectedLeg, setSelectedLeg] = useState(1),
    [playing, setPlaying] = useState(false),
    [playPosition, setPlayPosition] = useState(0),
    [speed, setSpeed] = useState(0),
    [splitSize, setSplitSize] = useState(100),
    [loaded, setLoaded] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0),
    [clipboard, setClipboard] = useState(false),
    [generatedKey, setGeneratedKey] = useState(""),
    [workerEpoch, setWorkerEpoch] = useState(0),
    [retry, setRetry] = useState(0);
  const undo = useRef<Composition[]>([]),
    redo = useRef<Composition[]>([]),
    committed = useRef(composition),
    worker = useRef<Worker | null>(null),
    request = useRef(0),
    mapPng = useRef<(() => Promise<string>) | null>(null),
    file = useRef<HTMLInputElement>(null),
    mapUndo = useRef<Placement[]>([]),
    mapRedo = useRef<Placement[]>([]);
  const selected = composition.elements.filter((e) => selection.includes(e.id)),
    active = selected.length === 1 ? selected[0] : undefined;
  const update = useCallback((next: Composition, commit = true) => {
    if (commit && JSON.stringify(next) !== JSON.stringify(committed.current)) {
      undo.current.push(clone(committed.current));
      if (undo.current.length > 80) undo.current.shift();
      redo.current = [];
      committed.current = clone(next);
      setHistoryVersion((v) => v + 1);
    }
    setComposition(next);
  }, []);
  const changeElement = (patch: Partial<Element>) =>
    update({
      ...composition,
      elements: composition.elements.map((e) =>
        selection.includes(e.id) ? { ...e, ...patch } : e,
      ),
    });
  const undoCanvas = useCallback(() => {
    const prev = undo.current.pop();
    if (!prev) return;
    redo.current.push(clone(committed.current));
    committed.current = clone(prev);
    setComposition(prev);
    setHistoryVersion((v) => v + 1);
  }, []);
  const redoCanvas = useCallback(() => {
    const next = redo.current.pop();
    if (!next) return;
    undo.current.push(clone(committed.current));
    committed.current = clone(next);
    setComposition(next);
    setHistoryVersion((v) => v + 1);
  }, []);
  const updatePlacement = (next: Placement) => {
    mapUndo.current.push(clone(placement));
    mapRedo.current = [];
    setPlacement(next);
    setPlaying(false);
    setPlayPosition(0);
    setHistoryVersion((v) => v + 1);
  };
  const undoMap = () => {
    const p = mapUndo.current.pop();
    if (p) {
      mapRedo.current.push(clone(placement));
      setPlacement(p);
      setHistoryVersion((v) => v + 1);
    }
  };
  const redoMap = () => {
    const p = mapRedo.current.pop();
    if (p) {
      mapUndo.current.push(clone(placement));
      setPlacement(p);
      setHistoryVersion((v) => v + 1);
    }
  };
  const remove = useCallback(() => {
    update({
      ...composition,
      elements: composition.elements.filter((e) => !selection.includes(e.id)),
      firstElement: selection.includes(composition.firstElement ?? "")
        ? undefined
        : composition.firstElement,
    });
    setSelection([]);
  }, [composition, selection, update]);
  const routingPlacement = useMemo(
    () => ({
      mode: placement.mode,
      metersPerUnit: placement.metersPerUnit,
      rotation: placement.rotation,
      offsetX: placement.offsetX,
      offsetY: placement.offsetY,
      airport: placement.airport,
      roundTrip: placement.roundTrip,
    }),
    [
      placement.mode,
      placement.metersPerUnit,
      placement.rotation,
      placement.offsetX,
      placement.offsetY,
      placement.airport,
      placement.roundTrip,
    ],
  );
  const routingKey = JSON.stringify(routingPlacement);
  useEffect(() => {
    loadProject()
      .then((p) => {
        if (p) {
          setComposition(p.composition);
          committed.current = clone(p.composition);
          setPlacement(p.placement);
          setVariant(p.variant);
          setSelection([]);
          setNotice("Local project restored.");
        }
      })
      .catch(() =>
        setNotice(
          "Local storage is unavailable. Download a project to save it.",
        ),
      )
      .finally(() => setLoaded(true));
  }, []);
  useEffect(() => {
    const w = new Worker(
      new URL("./sky-art/planner.worker.ts", import.meta.url),
    );
    worker.current = w;
    w.onmessage = (event) => {
      if (event.data.id !== request.current) return;
      setBusy(false);
      if (event.data.error) {
        setError(event.data.error);
        return;
      }
      setError("");
      setGeometry(event.data.geometry);
      setRoute(event.data.route);
      setGeneratedKey(event.data.key);
    };
    w.onerror = () => {
      if (worker.current !== w) return;
      setBusy(false);
      setError("Route generation failed. Reload to retry.");
    };
    return () => {
      w.terminate();
      worker.current = null;
    };
  }, [workerEpoch]);
  useEffect(() => {
    const id = ++request.current;
    const timer = setTimeout(() => {
      setBusy(true);
      setError("");
      worker.current?.postMessage({
        id,
        composition,
        variant,
        placement: routingPlacement,
        key: JSON.stringify({ composition, variant, routingKey }),
      });
    }, 120);
    return () => clearTimeout(timer);
  }, [composition, variant, retry, routingKey, routingPlacement]);
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => {
      saveProject({
        schema: "pilotseal-sky-art",
        version: 1,
        composition,
        placement,
        variant,
        savedAt: new Date().toISOString(),
      }).catch(() =>
        setNotice("Could not save locally. Download a project instead."),
      );
    }, 500);
    return () => clearTimeout(timer);
  }, [composition, placement, variant, loaded]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        target.isContentEditable
      )
        return;
      if (stage !== "canvas") return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redoCanvas();
        else undoCanvas();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        remove();
      }
      const movement: Record<string, [number, number]> = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
      };
      if (movement[event.key] && selection.length) {
        event.preventDefault();
        const [x, y] = movement[event.key],
          step = event.shiftKey ? 10 : 1;
        update({
          ...composition,
          elements: composition.elements.map((e) =>
            selection.includes(e.id)
              ? { ...e, x: e.x + x * step, y: e.y + y * step }
              : e,
          ),
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [stage, selection, composition, remove, update, undoCanvas, redoCanvas]);
  const projected = useMemo(() => {
    if (!route) return { plan: null, error: "" };
    try {
      return { plan: projectRoute(route, placement), error: "" };
    } catch (e) {
      return {
        plan: null,
        error: e instanceof Error ? e.message : "Invalid placement.",
      };
    }
  }, [route, placement]);
  const plan = projected.plan;
  useEffect(() => {
    if (!playing || !plan) return;
    let last = performance.now(),
      value = playPosition;
    const timer = setInterval(() => {
      const now = performance.now();
      value += ((now - last) / 1000) * Math.max(2, plan.legs.length / 45);
      last = now;
      setPlayPosition(Math.min(value, plan.legs.length));
      setSelectedLeg(Math.min(Math.floor(value) + 1, plan.legs.length));
      if (value >= plan.legs.length) {
        setPlaying(false);
        clearInterval(timer);
      }
    }, 60);
    return () => clearInterval(timer);
  }, [playing, plan]); // eslint-disable-line react-hooks/exhaustive-deps
  const stale =
    busy ||
    !!error ||
    !route ||
    generatedKey !== JSON.stringify({ composition, variant, routingKey });
  const save = (): SavedProject => ({
    schema: "pilotseal-sky-art",
    version: 1,
    composition,
    placement,
    variant,
    route: !stale && plan ? plan : undefined,
    savedAt: new Date().toISOString(),
  });
  const add = (kind: "preset" | "text", value: string) => {
    if (composition.elements.length >= 8) {
      setNotice("Use up to 8 elements.");
      return;
    }
    const id = crypto.randomUUID();
    update({
      ...composition,
      elements: [
        ...composition.elements,
        {
          id,
          kind,
          value,
          x: 400,
          y: 300,
          scale: 1,
          rotation: 0,
          font: "outline",
          spacing: 12,
          lineHeight: 130,
        },
      ],
    });
    setSelection([id]);
  };
  const duplicate = () => {
    if (composition.elements.length + selected.length > 8) {
      setNotice("Use up to 8 elements.");
      return;
    }
    const copies = selected.map((e) => ({
      ...e,
      id: crypto.randomUUID(),
      x: e.x + 25,
      y: e.y + 25,
      group: undefined,
    }));
    update({ ...composition, elements: [...composition.elements, ...copies] });
    setSelection(copies.map((e) => e.id));
  };
  const group = () => {
    const id = crypto.randomUUID();
    changeElement({ group: id });
  };
  const align = (axis: "x" | "y" | "distribute") => {
    if (selected.length < 2) return;
    const cx = selected.reduce((v, e) => v + e.x, 0) / selected.length,
      cy = selected.reduce((v, e) => v + e.y, 0) / selected.length;
    const ordered = [...selected].sort((a, b) => a.x - b.x);
    update({
      ...composition,
      elements: composition.elements.map((e) => {
        if (!selection.includes(e.id)) return e;
        if (axis === "x") return { ...e, x: cx };
        if (axis === "y") return { ...e, y: cy };
        return {
          ...e,
          x:
            ordered[0].x +
            ((ordered[ordered.length - 1].x - ordered[0].x) *
              ordered.findIndex((o) => o.id === e.id)) /
              (ordered.length - 1),
        };
      }),
    });
  };
  const loadAirports = async () => {
    if (airports.length) return;
    try {
      const r = await fetch("/sky-art/airports.json");
      if (!r.ok) throw new Error();
      setAirports(await r.json());
    } catch {
      setNotice(
        "Airport search unavailable. Enter coordinates or select a map point.",
      );
    }
  };
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return airports
      .map((a) => ({
        a,
        rank:
          a[0].toLowerCase() === q || a[1].toLowerCase() === q
            ? 0
            : [a[0], a[1], a[2], a[5]].some((s) => s.toLowerCase().includes(q))
              ? 1
              : 2,
      }))
      .filter((a) => a.rank < 2)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 6)
      .map((v) => v.a);
  }, [airports, query]);
  const chooseAirport = (a: Airport) => {
    updatePlacement({
      ...placement,
      anchor: { lat: a[3], lon: a[4] },
      offsetX: 0,
      offsetY: 0,
      airport: true,
      anchorName: `${a[0]} · ${a[2]}`,
    });
    setQuery("");
    setFitKey((v) => v + 1);
  };
  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    try {
      const f = event.target.files?.[0];
      if (!f) return;
      if (f.size > 8000000) throw new Error("Project file is too large.");
      const p = validateProject(JSON.parse(await f.text()));
      update(p.composition);
      setPlacement(p.placement);
      setVariant(p.variant);
      setSelection([]);
      setStage("canvas");
      setNotice("Project opened.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not open project.");
    } finally {
      event.target.value = "";
    }
  };
  const png = async () => {
    if (!plan || stale) return;
    try {
      if (stage === "map" && mapPng.current) {
        const url = await mapPng.current();
        const a = document.createElement("a");
        a.download = "sky-art-map.png";
        a.href = url;
        a.click();
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = 1600;
      canvas.height = 1100;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#eef3f6";
      ctx.fillRect(0, 0, 1600, 1100);
      const lat = plan.waypoints[0].lat;
      let last = plan.waypoints[0].lon;
      const pts = plan.waypoints.map((p) => {
        let lon = p.lon;
        while (lon - last > 180) lon -= 360;
        while (lon - last < -180) lon += 360;
        last = lon;
        return { x: lon * Math.cos((lat * Math.PI) / 180), y: -p.lat };
      });
      const b = bounds(pts),
        s = Math.min(
          1400 / Math.max(b.width, 1e-9),
          850 / Math.max(b.height, 1e-9),
        );
      const p = (a: { x: number; y: number }) => ({
        x: 100 + (a.x - b.minX) * s,
        y: 110 + (a.y - b.minY) * s,
      });
      ctx.strokeStyle = "#087e91";
      ctx.lineWidth = 3;
      ctx.beginPath();
      pts.forEach((v, i) => {
        const q = p(v);
        if (i) ctx.lineTo(q.x, q.y);
        else ctx.moveTo(q.x, q.y);
      });
      ctx.stroke();
      ctx.fillStyle = "#17334a";
      ctx.font = "24px sans-serif";
      ctx.fillText(
        `${composition.name} · Planned track · ${plan.distanceNm.toFixed(1)} NM`,
        100,
        1040,
      );
      ctx.font = "bold 22px sans-serif";
      ctx.fillText("S", p(pts[0]).x, p(pts[0]).y - 10);
      ctx.fillText(
        "E",
        p(pts[pts.length - 1]).x,
        p(pts[pts.length - 1]).y + 24,
      );
      canvas.toBlob((b) => {
        if (b) download(b, "sky-art-track.png", "image/png");
      });
    } catch {
      setNotice(
        "Map image could not be exported. Use the track PNG in details.",
      );
    }
  };
  const leg = plan?.legs[selectedLeg - 1];
  const shift = (x: number, y: number) => {
    if (!route) return;
    const step =
      Math.max(route.bounds.width, route.bounds.height) *
      placement.metersPerUnit *
      0.05;
    updatePlacement({
      ...placement,
      offsetX: placement.offsetX + x * step,
      offsetY: placement.offsetY + y * step,
    });
  };
  const toMap = () => {
    if (stale) return;
    setStage("map");
    setFitKey((v) => v + 1);
    setPlaying(false);
    setPlayPosition(0);
  };
  const exporting = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Export failed.");
    }
  };
  return (
    <div className={styles.root} data-history-version={historyVersion}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>PILOTSEAL / FLIGHT TOOLS</span>
          <h1>Sky Art</h1>
        </div>
        <div className={styles.headerActions}>
          <button onClick={() => file.current?.click()}>Open</button>
          <button
            onClick={() =>
              download(
                serialize(save()),
                "sky-art-project.json",
                "application/json",
              )
            }
          >
            Save project
          </button>
          <input
            ref={file}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={importFile}
          />
        </div>
      </header>
      <nav className={styles.steps} aria-label="Sky Art steps">
        <button
          aria-current={stage === "canvas" ? "step" : undefined}
          onClick={() => {
            setStage("canvas");
            setPlaying(false);
          }}
        >
          <span>Design</span>
        </button>
        <button
          disabled={stale}
          aria-current={stage === "map" ? "step" : undefined}
          onClick={toMap}
        >
          <span>Map</span>
        </button>
        <span className={styles.status} aria-live="polite">
          {busy
            ? "Generating…"
            : error
              ? "Needs attention"
              : "Saved on this device"}
        </span>
        {busy && (
          <button
            onClick={() => {
              request.current++;
              worker.current?.terminate();
              setBusy(false);
              setError("Generation cancelled. Edit the artwork or retry.");
              setWorkerEpoch((v) => v + 1);
            }}
          >
            Cancel
          </button>
        )}
      </nav>
      {(error || projected.error) && (
        <div role="alert" className={styles.error}>
          {error || projected.error}
          {error && (
            <button onClick={() => setRetry((v) => v + 1)}>Retry</button>
          )}
        </div>
      )}
      {notice && (
        <div role="status" className={styles.notice}>
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            ×
          </button>
        </div>
      )}
      {stage === "canvas" && (
        <>
          <div className={styles.toolbar}>
            <button
              aria-pressed={multiple}
              onClick={() => setMultiple((v) => !v)}
            >
              Select multiple
            </button>
            <button disabled={!undo.current.length} onClick={undoCanvas}>
              ↶ Undo
            </button>
            <button disabled={!redo.current.length} onClick={redoCanvas}>
              ↷ Redo
            </button>
            <span />
            <button disabled={!selected.length} onClick={duplicate}>
              Duplicate
            </button>
            <button disabled={selected.length < 2} onClick={group}>
              Group
            </button>
            <button
              disabled={!selected.some((e) => e.group)}
              onClick={() => changeElement({ group: undefined })}
            >
              Ungroup
            </button>
            <button disabled={selected.length < 2} onClick={() => align("x")}>
              Align X
            </button>
            <button disabled={selected.length < 2} onClick={() => align("y")}>
              Align Y
            </button>
            <button
              disabled={selected.length < 3}
              onClick={() => align("distribute")}
            >
              Distribute
            </button>
            <button disabled={!selected.length} onClick={remove}>
              Delete
            </button>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={pathView}
                onChange={(e) => setPathView(e.target.checked)}
              />{" "}
              Paths
            </label>
          </div>
          <div className={styles.workspace}>
            <aside className={styles.library}>
              <h2>Patterns</h2>
              <select
                aria-label="Pattern category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {["All", ...new Set(PRESETS.map((p) => p.category))].map(
                  (c) => (
                    <option key={c}>{c}</option>
                  ),
                )}
              </select>
              <div className={styles.presets}>
                {PRESETS.filter(
                  (p) => category === "All" || p.category === category,
                ).map((p) => (
                  <button
                    key={p.id}
                    title={p.name}
                    onClick={() => add("preset", p.id)}
                  >
                    <svg viewBox="-110 -110 220 220" aria-hidden="true">
                      {p.shapes.map((s, i) => (
                        <path
                          key={i}
                          d={pathData(s.points, s.closed)}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="5"
                          strokeLinejoin="round"
                        />
                      ))}
                    </svg>
                    <span>{p.name}</span>
                  </button>
                ))}
              </div>
              <button
                className={styles.addText}
                onClick={() => add("text", "LOVE")}
              >
                ＋ Add text
              </button>
            </aside>
            <ArtCanvas
              composition={composition}
              geometry={geometry}
              selection={selection}
              onSelect={setSelection}
              onChange={update}
              pathView={pathView}
              multiple={multiple}
            />
            <aside className={styles.properties}>
              <h2>
                {selected.length > 1
                  ? `${selected.length} elements`
                  : "Properties"}
              </h2>
              {active && (
                <>
                  {active.kind === "text" ? (
                    <>
                      <Field name="Text">
                        <textarea
                          aria-label="Text content"
                          rows={3}
                          value={active.value}
                          onChange={(e) =>
                            changeElement({ value: e.target.value })
                          }
                        />
                      </Field>
                      <Field name="Letter style">
                        <select
                          aria-label="Letter style"
                          value={active.font}
                          onChange={(e) =>
                            changeElement({
                              font: e.target.value as Element["font"],
                            })
                          }
                        >
                          <option value="outline">Block outline</option>
                          <option value="single">Single line</option>
                          <option value="script">Connected script · EN</option>
                        </select>
                      </Field>
                      <div className={styles.twoColumns}>
                        <NumberField
                          name="Letter spacing"
                          value={active.spacing}
                          onChange={(spacing) => changeElement({ spacing })}
                          min={0}
                          max={100}
                        />
                        <NumberField
                          name="Line spacing"
                          value={active.lineHeight}
                          onChange={(lineHeight) =>
                            changeElement({ lineHeight })
                          }
                          min={20}
                          max={400}
                        />
                      </div>
                    </>
                  ) : (
                    <strong>{label(active)}</strong>
                  )}
                  <div className={styles.twoColumns}>
                    <NumberField
                      name="X"
                      value={active.x}
                      onChange={(x) => changeElement({ x })}
                    />
                    <NumberField
                      name="Y"
                      value={active.y}
                      onChange={(y) => changeElement({ y })}
                    />
                    <NumberField
                      name="Size"
                      value={active.scale}
                      onChange={(scale) => changeElement({ scale })}
                      min={0.05}
                      max={100}
                      step={0.1}
                    />
                    <NumberField
                      name="Rotation °"
                      value={active.rotation}
                      onChange={(rotation) => changeElement({ rotation })}
                    />
                  </div>
                </>
              )}
              <h2 className={styles.sectionTitle}>Elements</h2>
              <div className={styles.elementList}>
                {composition.elements.map((e) => (
                  <button
                    key={e.id}
                    aria-pressed={selection.includes(e.id)}
                    onClick={(event) =>
                      setSelection(
                        event.shiftKey || multiple
                          ? selection.includes(e.id)
                            ? selection.filter((id) => id !== e.id)
                            : [...selection, e.id]
                          : composition.elements
                              .filter((a) =>
                                e.group ? a.group === e.group : a.id === e.id,
                              )
                              .map((a) => a.id),
                      )
                    }
                  >
                    <span>{e.kind === "text" ? "T" : "◇"}</span>
                    <strong>{label(e)}</strong>
                    {e.group && <small>Grouped</small>}
                  </button>
                ))}
              </div>
              <Field name="First element">
                <select
                  aria-label="First element"
                  value={composition.firstElement ?? ""}
                  onChange={(e) =>
                    update({
                      ...composition,
                      firstElement: e.target.value || undefined,
                    })
                  }
                >
                  <option value="">Automatic</option>
                  {composition.elements.map((e) => (
                    <option value={e.id} key={e.id}>
                      {label(e)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field name="Project name">
                <input
                  value={composition.name}
                  maxLength={200}
                  onChange={(e) =>
                    update({ ...composition, name: e.target.value })
                  }
                />
              </Field>
            </aside>
          </div>
          <footer className={styles.footer}>
            <span>
              {composition.elements.length}/8 elements{" "}
              <span className={styles.muted}>
                ·{" "}
                {composition.elements
                  .filter((e) => e.kind === "text")
                  .reduce(
                    (n, e) => n + [...e.value.replace(/\s/g, "")].length,
                    0,
                  )}{" "}
                characters
              </span>
            </span>
            <button className={styles.primary} disabled={stale} onClick={toMap}>
              View on map →
            </button>
          </footer>
        </>
      )}
      {stage === "map" && plan && (
        <>
          <div className={styles.mapWorkspace}>
            <aside className={styles.mapPanel}>
              <h2>Position</h2>
              <Field name="Airport">
                <input
                  placeholder="ICAO, IATA or airport name"
                  value={query}
                  onFocus={loadAirports}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    void loadAirports();
                  }}
                />
              </Field>
              {matches.length > 0 && (
                <div className={styles.airports}>
                  {matches.map((a) => (
                    <button key={a[0]} onClick={() => chooseAirport(a)}>
                      <strong>
                        {a[0]} {a[1]}
                      </strong>
                      <span>{a[2]}</span>
                    </button>
                  ))}
                </div>
              )}
              {placement.anchorName && placement.airport && (
                <p className={styles.airportSelected}>{placement.anchorName}</p>
              )}
              <details>
                <summary>Coordinates</summary>
                <div className={styles.twoColumns}>
                  <NumberField
                    name="Latitude"
                    value={placement.anchor.lat}
                    onChange={(lat) => {
                      updatePlacement({
                        ...placement,
                        anchor: { ...placement.anchor, lat },
                        airport: false,
                        roundTrip: false,
                      });
                    }}
                    min={-85}
                    max={85}
                    step={0.001}
                  />
                  <NumberField
                    name="Longitude"
                    value={placement.anchor.lon}
                    onChange={(lon) =>
                      updatePlacement({
                        ...placement,
                        anchor: { ...placement.anchor, lon },
                        airport: false,
                        roundTrip: false,
                      })
                    }
                    min={-180}
                    max={180}
                    step={0.001}
                  />
                </div>
              </details>
              <button
                className={pickPoint ? styles.primary : ""}
                onClick={() => setPickPoint((v) => !v)}
              >
                {pickPoint ? "Cancel point selection" : "Select point on map"}
              </button>
              <details>
                <summary>Placement</summary>
                <Field name="Anchor">
                  <select
                    aria-label="Anchor"
                    value={placement.mode}
                    onChange={(e) => {
                      updatePlacement({
                        ...placement,
                        mode: e.target.value as Placement["mode"],
                      });
                      setFitKey((v) => v + 1);
                    }}
                  >
                    <option value="center">Artwork center</option>
                    <option value="start">Route start</option>
                  </select>
                </Field>
              </details>
              {placement.airport && (
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={placement.roundTrip}
                    onChange={(e) =>
                      updatePlacement({
                        ...placement,
                        roundTrip: e.target.checked,
                      })
                    }
                  />{" "}
                  Include airport return
                </label>
              )}
              <h2 className={styles.sectionTitle}>Move artwork</h2>
              <div className={styles.directionPad}>
                <button
                  aria-label="Move artwork north"
                  onClick={() => shift(0, 1)}
                >
                  ↑
                </button>
                <button
                  aria-label="Move artwork west"
                  onClick={() => shift(-1, 0)}
                >
                  ←
                </button>
                <button
                  onClick={() => {
                    updatePlacement({ ...placement, offsetX: 0, offsetY: 0 });
                    setFitKey((v) => v + 1);
                  }}
                >
                  Center
                </button>
                <button
                  aria-label="Move artwork east"
                  onClick={() => shift(1, 0)}
                >
                  →
                </button>
                <button
                  aria-label="Move artwork south"
                  onClick={() => shift(0, -1)}
                >
                  ↓
                </button>
              </div>
              <div className={styles.twoColumns}>
                <button
                  aria-label="Shrink artwork"
                  onClick={() =>
                    updatePlacement({
                      ...placement,
                      metersPerUnit: placement.metersPerUnit / 1.1,
                    })
                  }
                >
                  − Smaller
                </button>
                <button
                  aria-label="Enlarge artwork"
                  onClick={() =>
                    updatePlacement({
                      ...placement,
                      metersPerUnit: placement.metersPerUnit * 1.1,
                    })
                  }
                >
                  ＋ Larger
                </button>
                <button
                  aria-label="Rotate artwork left"
                  onClick={() =>
                    updatePlacement({
                      ...placement,
                      rotation: placement.rotation - 5,
                    })
                  }
                >
                  ↶ 5°
                </button>
                <button
                  aria-label="Rotate artwork right"
                  onClick={() =>
                    updatePlacement({
                      ...placement,
                      rotation: placement.rotation + 5,
                    })
                  }
                >
                  ↷ 5°
                </button>
                <button disabled={!mapUndo.current.length} onClick={undoMap}>
                  Undo
                </button>
                <button disabled={!mapRedo.current.length} onClick={redoMap}>
                  Redo
                </button>
              </div>
              <details>
                <summary>Advanced</summary>
                <Field name="Contours">
                  <select
                    aria-label="Contours"
                    value={composition.connectionMode ?? "complete"}
                    onChange={(e) =>
                      update({
                        ...composition,
                        connectionMode: e.target.value as "complete" | "open",
                      })
                    }
                  >
                    <option value="open">Small connection openings</option>
                    <option value="complete">Complete contours</option>
                  </select>
                </Field>
                <Field name="Connections">
                  <select
                    aria-label="Connections"
                    value={variant}
                    onChange={(e) => {
                      setVariant(e.target.value as Variant);
                      setPlaying(false);
                      setPlayPosition(0);
                    }}
                  >
                    <option value="balanced">Shortest clear route</option>
                    <option value="shortest">Shortest route</option>
                    <option value="cleanest">Less interference</option>
                  </select>
                </Field>
                <Field name="Navigation detail">
                  <select
                    aria-label="Navigation detail"
                    value={placement.waypointToleranceNm ?? 0.05}
                    onChange={(e) =>
                      updatePlacement({
                        ...placement,
                        waypointToleranceNm: Number(e.target.value),
                      })
                    }
                  >
                    <option value={0.025}>Fine · 0.025 NM</option>
                    <option value={0.05}>Balanced · 0.05 NM</option>
                    <option value={0.1}>Fewer points · 0.10 NM</option>
                    <option value={0}>All original points</option>
                  </select>
                </Field>
                <details>
                  <summary>Turn smoothing</summary>
                  <NumberField
                    name="Radius NM · 0 = off"
                    value={placement.radiusNm}
                    onChange={(radiusNm) =>
                      updatePlacement({ ...placement, radiusNm })
                    }
                    min={0}
                    max={20}
                    step={0.1}
                  />
                </details>
              </details>
            </aside>
            <div className={styles.mapStage}>
              <RouteMap
                plan={plan}
                selectedLeg={selectedLeg}
                playPosition={playPosition}
                onSelect={setSelectedLeg}
                pickPoint={pickPoint}
                onAnchor={(anchor) => {
                  updatePlacement({
                    ...placement,
                    anchor,
                    airport: false,
                    roundTrip: false,
                    offsetX: 0,
                    offsetY: 0,
                  });
                  setPickPoint(false);
                }}
                fitKey={fitKey}
                onPng={mapPng}
              />
              <div className={styles.mapOverlay}>
                <button onClick={() => setFitKey((v) => v + 1)}>
                  Fit track
                </button>
                <button disabled={stale} onClick={png}>
                  Export PNG
                </button>
              </div>
              {leg && (
                <div className={styles.legCard}>
                  <small>
                    LEG {leg.index} / {plan.legs.length}
                  </small>
                  <strong>
                    {leg.track.toFixed(0).padStart(3, "0")}°T{" "}
                    <span>{leg.distanceNm.toFixed(2)} NM</span>
                  </strong>
                  <span>
                    {leg.from.id} → {leg.to.id} ·{" "}
                    {leg.kind === "art"
                      ? "Artwork"
                      : leg.kind === "connection"
                        ? "Connection"
                        : "Airport transit"}
                  </span>
                  <div>
                    <button
                      disabled={selectedLeg <= 1}
                      onClick={() => setSelectedLeg((v) => v - 1)}
                    >
                      ← Previous
                    </button>
                    <button
                      disabled={selectedLeg >= plan.legs.length}
                      onClick={() => setSelectedLeg((v) => v + 1)}
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className={styles.playbar}>
            <button
              disabled={stale}
              onClick={() => {
                if (playPosition >= plan.legs.length) setPlayPosition(0);
                setPlaying((v) => !v);
              }}
            >
              {playing ? "Ⅱ Pause" : "▶ Fly track"}
            </button>
            <button
              onClick={() => {
                setPlaying(false);
                setPlayPosition(0);
                setSelectedLeg(1);
              }}
            >
              Reset
            </button>
            <input
              aria-label="Flight track playback position"
              type="range"
              min={0}
              max={plan.legs.length}
              step={0.01}
              value={playPosition}
              onChange={(e) => {
                setPlaying(false);
                setPlayPosition(Number(e.target.value));
                setSelectedLeg(
                  Math.min(
                    plan.legs.length,
                    Math.floor(Number(e.target.value)) + 1,
                  ),
                );
              }}
            />
            <span>{Math.round((playPosition / plan.legs.length) * 100)}%</span>
          </div>
          {plan.warnings.map((w) => (
            <div className={styles.warning} key={w}>
              {w}
            </div>
          ))}
          <footer className={styles.footer}>
            <div className={styles.metrics}>
              <strong>
                {plan.distanceNm.toFixed(1)} <small>NM</small>
              </strong>
              <span>{plan.legs.length} legs</span>
              <span>{plan.waypoints.length} waypoints</span>
            </div>
            <div className={styles.headerActions}>
              <button
                disabled={stale}
                onClick={() => {
                  setStage("details");
                  setPlaying(false);
                }}
              >
                Details
              </button>
              <a
                className={styles.foreflightButton}
                aria-label="Open in ForeFlight"
                aria-disabled={stale}
                href={stale ? undefined : foreflightUrl(plan)}
              >
                Open in ForeFlight ↗
              </a>
              <details className={styles.exportMenu}>
                <summary>More</summary>
                <button
                  disabled={stale}
                  onClick={() =>
                    download(
                      routeGpx(plan, composition.name),
                      "sky-art-route.gpx",
                      "application/gpx+xml",
                    )
                  }
                >
                  Download GPX
                </button>
                <button
                  disabled={stale}
                  onClick={() =>
                    navigator.clipboard
                      .writeText(foreflightRoute(plan))
                      .then(() => setNotice("Route copied."))
                  }
                >
                  Copy route
                </button>
              </details>
            </div>
          </footer>
        </>
      )}
      {stage === "details" && plan && (
        <div className={styles.details}>
          <div className={styles.detailsHeading}>
            <div>
              <h2>{composition.name}</h2>
              <span>
                {plan.distanceNm.toFixed(1)} NM · {plan.legs.length} legs · True
                tracks
              </span>
            </div>
            <NumberField
              name="Groundspeed kt · optional"
              value={speed}
              onChange={setSpeed}
              min={0}
              max={1000}
            />
          </div>
          <div className={styles.exportBar}>
            <button
              disabled={stale}
              onClick={() =>
                download(
                  navlogCsv(plan, speed),
                  "sky-art-navlog.csv",
                  "text/csv",
                )
              }
            >
              Nav log CSV
            </button>
            <button
              disabled={stale}
              onClick={() =>
                exporting(async () =>
                  download(
                    new Uint8Array(await navlogPdf(plan, speed)),
                    "sky-art-navlog.pdf",
                    "application/pdf",
                  ),
                )
              }
            >
              Nav log PDF
            </button>
            <button disabled={stale} onClick={png}>
              Track PNG
            </button>
            <button
              disabled={stale}
              onClick={() =>
                download(
                  waypointKml(plan, composition.name),
                  "sky-art-waypoints.kml",
                  "application/vnd.google-earth.kml+xml",
                )
              }
            >
              Waypoints KML
            </button>
            <button
              disabled={stale}
              onClick={() =>
                download(
                  trackKml(plan, composition.name),
                  "sky-art-track.kml",
                  "application/vnd.google-earth.kml+xml",
                )
              }
            >
              Track layer KML
            </button>
          </div>
          <details className={styles.foreflight} open>
            <summary>ForeFlight route</summary>
            <p>
              Open the GPX route with ForeFlight 18.4 or later. For older
              versions, paste the ordered coordinates into the route editor.
            </p>
            <button
              className={styles.primary}
              disabled={stale}
              onClick={() =>
                download(
                  routeGpx(plan, composition.name),
                  "sky-art-route.gpx",
                  "application/gpx+xml",
                )
              }
            >
              ForeFlight GPX route
            </button>
            <textarea
              aria-label="ForeFlight ordered route"
              readOnly
              value={foreflightRoute(plan)}
            />
            <div className={styles.exportBar}>
              <button
                disabled={stale}
                onClick={() =>
                  exporting(async () => {
                    await navigator.clipboard.writeText(foreflightRoute(plan));
                    setClipboard(true);
                    setTimeout(() => setClipboard(false), 1500);
                  })
                }
              >
                {clipboard ? "Copied" : "Copy route"}
              </button>
              <button
                disabled={stale}
                onClick={() =>
                  download(
                    foreflightRoute(plan),
                    "sky-art-foreflight-route.txt",
                    "text/plain",
                  )
                }
              >
                Download route
              </button>
              <NumberField
                name="Waypoints per part"
                value={splitSize}
                onChange={setSplitSize}
                min={2}
                max={1000}
              />
              <button
                disabled={stale}
                onClick={() => {
                  const parts = splitRoute(plan, splitSize);
                  download(
                    parts
                      .map((p, i) => `PART ${i + 1}/${parts.length}\n${p}`)
                      .join("\n\n"),
                    "sky-art-route-parts.txt",
                    "text/plain",
                  );
                }}
              >
                Download numbered parts
              </button>
            </div>
            <small>
              Device compatibility and route capacity require verification in
              ForeFlight. Adjacent parts share their boundary waypoint.
            </small>
          </details>
          {plan.warnings.map((w) => (
            <div className={styles.warning} key={w}>
              {w}
            </div>
          ))}
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Leg</th>
                  <th>From → To</th>
                  <th>Track °T</th>
                  <th>NM</th>
                  <th>Total NM</th>
                  <th>Destination coordinates</th>
                  <th>Type</th>
                  {speed > 0 && (
                    <>
                      <th>Min</th>
                      <th>Total min</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {plan.legs.map((l) => (
                  <tr
                    key={l.index}
                    className={
                      selectedLeg === l.index ? styles.selectedRow : undefined
                    }
                    onClick={() => {
                      setSelectedLeg(l.index);
                      setStage("map");
                    }}
                  >
                    <td>
                      <button aria-label={`View leg ${l.index} on map`}>
                        {l.index}
                      </button>
                    </td>
                    <td>
                      {l.from.id} → {l.to.id}
                    </td>
                    <td>{l.track.toFixed(1)}</td>
                    <td>{l.distanceNm.toFixed(2)}</td>
                    <td>{l.cumulativeNm.toFixed(2)}</td>
                    <td>
                      {l.to.lat.toFixed(6)}, {l.to.lon.toFixed(6)}
                    </td>
                    <td>{l.kind}</td>
                    {speed > 0 && (
                      <>
                        <td>{((l.distanceNm / speed) * 60).toFixed(1)}</td>
                        <td>{((l.cumulativeNm / speed) * 60).toFixed(1)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className={styles.footer}>
            <button onClick={toMap}>← Flight track</button>
            <span>Planned track · {plan.algorithmVersion}</span>
          </footer>
        </div>
      )}
    </div>
  );
}
