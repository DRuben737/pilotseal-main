"use client";

import * as React from "react";

import { translateAlong } from "@/components/iso/iso-kit";
import { IsoFigure, Plate } from "@/components/iso/react/draw";
import { useInView, useReadout, useStillness } from "@/components/iso/react/live";

import {
  ENGINE_SYSTEMS,
  engineFrameAt,
  frameDescription,
  frameReadout,
  type EngineSystem,
  type Stroke,
} from "./model";
import styles from "./PistonEngineDemo.module.css";
import {
  CRANK_CENTER,
  CRANK_RADIUS_WORLD,
  ENGINE_PROJECTION,
  FIGURE_HEIGHT,
  FIGURE_WIDTH,
  PISTON_STROKE_WORLD,
  path3,
} from "./view";

const BASE_RATE = 72;
const MAX_DT = 1 / 30;

interface MovingParts {
  piston: SVGGElement | null;
  rod: SVGPathElement | null;
  crank: SVGGElement | null;
  intakeValve: SVGGElement | null;
  exhaustValve: SVGGElement | null;
  spark: SVGGElement | null;
  combustion: SVGPathElement | null;
}

const EMPTY_PARTS: MovingParts = {
  piston: null,
  rod: null,
  crank: null,
  intakeValve: null,
  exhaustValve: null,
  spark: null,
  combustion: null,
};

export default function PistonEngineLive({ art }: { art: React.ReactNode }) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const rangeRef = React.useRef<HTMLInputElement>(null);
  const movingRef = React.useRef<MovingParts>(EMPTY_PARTS);
  const angleRef = React.useRef(28);
  const frameRef = React.useRef(0);
  const lastRef = React.useRef(0);
  const playingRef = React.useRef(true);
  const speedRef = React.useRef(1);
  const strokeRef = React.useRef<Stroke>("intake");
  const [playing, setPlaying] = React.useState(true);
  const [speed, setSpeed] = React.useState(1);
  const [system, setSystem] = React.useState<EngineSystem>("overview");
  const [announcement, setAnnouncement] = React.useState("");
  const inView = useInView(rootRef);
  const calm = useStillness();
  const { anchor: readoutAnchor, say } = useReadout<HTMLDivElement>();

  React.useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  React.useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  const draw = React.useCallback((angle: number, announce = false) => {
    const frame = engineFrameAt(angle);
    const focus = frame.cylinders[0]!;
    const parts = movingRef.current;
    const theta = (focus.crankAngle * Math.PI) / 180;
    const pistonY = 89 - focus.piston * PISTON_STROKE_WORLD;
    const crankY = CRANK_CENTER[1] + Math.cos(theta) * CRANK_RADIUS_WORLD;
    const crankZ = CRANK_CENTER[2] + Math.sin(theta) * CRANK_RADIUS_WORLD;

    parts.piston?.setAttribute(
      "transform",
      translateAlong(ENGINE_PROJECTION, [0, -focus.piston * PISTON_STROKE_WORLD, 0]),
    );
    parts.rod?.setAttribute(
      "d",
      path3([
        [28, pistonY, 62],
        [28, crankY, crankZ],
      ]),
    );
    parts.crank?.setAttribute(
      "transform",
      `rotate(${(-focus.crankAngle).toFixed(2)} ${parts.crank.dataset.cx} ${parts.crank.dataset.cy})`,
    );
    parts.intakeValve?.setAttribute(
      "transform",
      translateAlong(ENGINE_PROJECTION, [0, -focus.intakeLift * 6, -focus.intakeLift * 1.5]),
    );
    parts.exhaustValve?.setAttribute(
      "transform",
      translateAlong(ENGINE_PROJECTION, [0, -focus.exhaustLift * 6, -focus.exhaustLift * 1.5]),
    );
    if (parts.spark) parts.spark.style.opacity = `${Math.min(1, focus.spark * 1.8)}`;
    if (parts.combustion) {
      parts.combustion.style.opacity = `${Math.min(0.94, focus.combustion)}`;
    }

    const displayed = angle === 720 ? 720 : frame.angle;
    if (rangeRef.current) {
      rangeRef.current.value = `${displayed}`;
      rangeRef.current.setAttribute("aria-valuetext", frameDescription(frame));
    }
    say(frameReadout(frame));
    rootRef.current?.setAttribute("data-stroke", focus.stroke);

    if (announce && strokeRef.current !== focus.stroke) {
      strokeRef.current = focus.stroke;
      setAnnouncement(`Cylinder 1: ${focus.stroke} stroke.`);
    }
  }, [say]);

  const stopLoop = React.useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    lastRef.current = 0;
  }, []);

  const runLoop = React.useCallback(() => {
    if (frameRef.current || !inView || !playingRef.current || calm) return;
    const tick = (now: number) => {
      const dt = lastRef.current
        ? Math.min((now - lastRef.current) / 1000, MAX_DT)
        : 1 / 60;
      lastRef.current = now;
      angleRef.current = (angleRef.current + dt * BASE_RATE * speedRef.current) % 720;
      draw(angleRef.current, true);
      frameRef.current = playingRef.current ? requestAnimationFrame(tick) : 0;
    };
    frameRef.current = requestAnimationFrame(tick);
  }, [calm, draw, inView]);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const artRoot = root.querySelector("[data-engine-art]");
    const crank = artRoot?.querySelector<SVGGElement>("[data-motion='crank']") ?? null;
    const center = path3([CRANK_CENTER]).replace(/^M/, "").split(" ");
    if (crank) {
      crank.dataset.cx = center[0] ?? "0";
      crank.dataset.cy = center[1] ?? "0";
    }
    movingRef.current = {
      piston: artRoot?.querySelector<SVGGElement>("[data-motion='piston']") ?? null,
      rod: artRoot?.querySelector<SVGPathElement>("[data-motion='rod']") ?? null,
      crank,
      intakeValve: artRoot?.querySelector<SVGGElement>("[data-motion='intake-valve']") ?? null,
      exhaustValve: artRoot?.querySelector<SVGGElement>("[data-motion='exhaust-valve']") ?? null,
      spark: artRoot?.querySelector<SVGGElement>("[data-motion='spark']") ?? null,
      combustion: artRoot?.querySelector<SVGPathElement>("[data-motion='combustion']") ?? null,
    };
    draw(angleRef.current);
  }, [draw]);

  React.useEffect(() => {
    if (calm && playing) setPlaying(false);
  }, [calm, playing]);

  React.useEffect(() => {
    if (playing && inView && !calm) runLoop();
    else stopLoop();
    return stopLoop;
  }, [calm, inView, playing, runLoop, stopLoop]);

  const setAngle = (value: number) => {
    angleRef.current = value;
    draw(value, true);
  };

  const togglePlaying = () => setPlaying((value) => !value);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      togglePlaying();
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      setPlaying(false);
      const step = event.shiftKey ? 30 : 10;
      setAngle(Math.min(720, Math.max(0, angleRef.current + (event.key === "ArrowRight" ? step : -step))));
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setPlaying(false);
      setAngle(event.key === "Home" ? 0 : 720);
    }
  };

  const currentSystem = ENGINE_SYSTEMS.find((item) => item.id === system)!;

  return (
    <section className={`${styles.demo} iso`} data-theme="light" data-engine-demo data-mode={system}>
      <div ref={readoutAnchor}>
        <Plate
          fig="Fig 1"
          title="O-360-style opposed four"
          hint="Space · play/pause   ← → · step"
          readout={frameReadout(engineFrameAt(28))}
        >
          <div
            ref={rootRef}
            className={styles.stageFocus}
            tabIndex={0}
            role="group"
            aria-label="Interactive cutaway of a four-cylinder horizontally opposed aircraft engine. Space plays or pauses; arrow keys step through the cycle."
            onKeyDown={handleKeyDown}
          >
            <IsoFigure
              width={FIGURE_WIDTH}
              height={FIGURE_HEIGHT}
              label="Three-quarter maintenance cutaway of a four-cylinder horizontally opposed aircraft engine showing one open cylinder, the crankshaft, piston, connecting rod, valves, dual ignition, induction, wet-sump lubrication, cooling fins, and exhaust."
              className={styles.engineFigure}
            >
              {art}
            </IsoFigure>
          </div>
          <span className="sr-only" aria-live="polite">{announcement}</span>
        </Plate>
      </div>

      <div className={styles.controls} aria-label="Engine animation controls">
        <button
          type="button"
          className={styles.playButton}
          data-engine-play
          onClick={togglePlaying}
          aria-label={playing ? "Pause engine animation" : "Play engine animation"}
        >
          <span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>
          {playing ? "Pause" : "Play"}
        </button>

        <div className={styles.timeline}>
          <label className={styles.scrubber}>
            <span className="sr-only">Crankshaft cycle angle</span>
            <input
              ref={rangeRef}
              data-engine-angle
              type="range"
              min="0"
              max="720"
              step="1"
              defaultValue="28"
              aria-valuetext={frameDescription(engineFrameAt(28))}
              onPointerDown={() => setPlaying(false)}
              onChange={(event) => setAngle(Number(event.currentTarget.value))}
            />
          </label>
          <div className={styles.cycleScale} aria-hidden="true">
            <span>Intake</span><span>Compression</span><span>Power</span><span>Exhaust</span><span>720°</span>
          </div>
        </div>

        <div className={styles.speedGroup} aria-label="Animation speed">
          {[0.5, 1, 2].map((value) => (
            <button
              key={value}
              type="button"
              data-engine-speed={value}
              className={speed === value ? styles.activeSpeed : undefined}
              aria-pressed={speed === value}
              onClick={() => setSpeed(value)}
            >
              {value}×
            </button>
          ))}
        </div>
      </div>

      <div className={styles.systemPicker} aria-label="Engine systems">
        {ENGINE_SYSTEMS.map((item) => (
          <button
            type="button"
            key={item.id}
            data-engine-system={item.id}
            className={system === item.id ? styles.activeSystem : undefined}
            aria-pressed={system === item.id}
            onClick={() => setSystem(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <p className={styles.systemNote} aria-live="polite">{currentSystem.note}</p>
    </section>
  );
}
