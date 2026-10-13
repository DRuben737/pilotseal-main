"use client";
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Coordinate, RoutePlan } from "@/lib/sky-art/types";
import styles from "./SkyArt.module.css";
type Props = {
  plan: RoutePlan;
  selectedLeg: number;
  playPosition: number;
  onSelect: (index: number) => void;
  pickPoint: boolean;
  onAnchor: (c: Coordinate) => void;
  fitKey: number;
  onPng: React.RefObject<(() => Promise<string>) | null>;
};
function unwrap(plan: RoutePlan): number[][] {
  const coords: number[][] = [];
  let last = plan.placement.anchor.lon;
  for (const p of plan.waypoints) {
    let lon = p.lon;
    while (lon - last > 180) lon -= 360;
    while (lon - last < -180) lon += 360;
    coords.push([lon, p.lat]);
    last = lon;
  }
  return coords;
}
export default function RouteMap(props: Props) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<maplibregl.Map | null>(null),
    latest = useRef(props),
    markers = useRef<maplibregl.Marker[]>([]);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [chart, setChart] = useState(false),
    [chartError, setChartError] = useState("");
  useEffect(() => {
    latest.current = props;
  });
  useEffect(() => {
    if (!container.current) return;
    const tileUrl = process.env.NEXT_PUBLIC_SKY_ART_TILE_URL;
    // Local previews use bundled geography rather than contacting a remote tile service.
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(
      window.location.hostname,
    );
    const tiles =
      tileUrl ??
      (local ? undefined : "https://tile.openstreetmap.org/{z}/{x}/{y}.png");
    maplibregl.setWorkerUrl("/sky-art/maplibre-worker.mjs");
    const m = new maplibregl.Map({
      container: container.current,
      center: [
        props.plan.placement.anchor.lon,
        props.plan.placement.anchor.lat,
      ],
      zoom: 8,
      attributionControl: { compact: false },
      canvasContextAttributes: { preserveDrawingBuffer: true },
      style: {
        version: 8,
        sources: tiles
          ? {
              base: {
                type: "raster",
                tiles: [tiles],
                tileSize: 256,
                attribution:
                  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
              },
            }
          : {
              land: {
                type: "geojson",
                data: "/sky-art/map/land.geojson",
                attribution:
                  '<a href="https://www.naturalearthdata.com">Natural Earth</a>',
              },
              lakes: { type: "geojson", data: "/sky-art/map/lakes.geojson" },
              boundaries: {
                type: "geojson",
                data: "/sky-art/map/boundaries.geojson",
              },
            },
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#edf2f5" },
          },
          ...(tiles
            ? [{ id: "base", type: "raster" as const, source: "base" }]
            : [
                {
                  id: "land",
                  type: "fill" as const,
                  source: "land",
                  paint: { "fill-color": "#e3e9e4" },
                },
                {
                  id: "coast",
                  type: "line" as const,
                  source: "land",
                  paint: { "line-color": "#b4c5c9", "line-width": 1 },
                },
                {
                  id: "lakes",
                  type: "fill" as const,
                  source: "lakes",
                  paint: { "fill-color": "#d7e8ef" },
                },
                {
                  id: "lake-shore",
                  type: "line" as const,
                  source: "lakes",
                  paint: { "line-color": "#b4c5c9", "line-width": 1 },
                },
                {
                  id: "boundaries",
                  type: "line" as const,
                  source: "boundaries",
                  paint: {
                    "line-color": "#bdc9c4",
                    "line-width": 1,
                    "line-dasharray": [3, 3],
                  },
                },
              ]),
        ],
      },
    });
    map.current = m;
    m.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    m.addControl(
      new maplibregl.ScaleControl({ unit: "nautical" }),
      "bottom-left",
    );
    m.on("load", () => {
      for (const id of ["route", "active", "flown"])
        m.addSource(id, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      m.addLayer({
        id: "route-halo",
        type: "line",
        source: "route",
        paint: {
          "line-color": "#ffffff",
          "line-width": 7,
          "line-opacity": 0.95,
        },
      });
      m.addLayer({
        id: "route",
        type: "line",
        source: "route",
        paint: { "line-color": "#d500f9", "line-width": 3.5 },
      });
      m.addLayer({
        id: "flown",
        type: "line",
        source: "flown",
        paint: { "line-color": "#ea9a29", "line-width": 3 },
      });
      m.addLayer({
        id: "active",
        type: "line",
        source: "active",
        paint: { "line-color": "#ff3d00", "line-width": 5 },
      });
      m.on("click", "route", (event) => {
        if (latest.current.pickPoint) return;
        const feature = event.features?.[0];
        if (feature) latest.current.onSelect(Number(feature.properties?.index));
      });
      m.on("click", (event) => {
        if (latest.current.pickPoint)
          latest.current.onAnchor({
            lat: event.lngLat.lat,
            lon: ((((event.lngLat.lng + 180) % 360) + 360) % 360) - 180,
          });
      });
      setReady(true);
    });
    m.on("error", (event) => {
      if ((event as { sourceId?: string }).sourceId === "vfr-sectional")
        setChartError("VFR chart unavailable. Try again or use the base map.");
      else setError(event.error.message);
    });
    props.onPng.current = async () => {
      m.triggerRepaint();
      await new Promise<void>((resolve) => m.once("render", () => resolve()));
      return m.getCanvas().toDataURL("image/png");
    };
    return () => {
      markers.current.forEach((m) => m.remove());
      props.onPng.current = null;
      m.remove();
      map.current = null;
    };
    // Map lifetime is independent of the current artwork and placement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    setChartError("");
    if (chart && m.getZoom() < 8) m.setZoom(8);
    if (chart && !m.getSource("vfr-sectional")) {
      m.addSource("vfr-sectional", {
        type: "raster",
        tiles: [
          "https://tiles.arcgis.com/tiles/ssFJjBXIUyZDrSYZ/arcgis/rest/services/VFR_Sectional/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        minzoom: 8,
        maxzoom: 12,
        attribution:
          'Federal Aviation Administration · <a href="https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/vfr/">VFR Sectional</a>',
      });
      m.addLayer(
        {
          id: "vfr-sectional",
          type: "raster",
          source: "vfr-sectional",
          minzoom: 8,
          paint: { "raster-fade-duration": 0 },
        },
        "route-halo",
      );
    }
    if (m.getLayer("vfr-sectional"))
      m.setLayoutProperty(
        "vfr-sectional",
        "visibility",
        chart ? "visible" : "none",
      );
  }, [chart, ready]);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const coords = unwrap(props.plan);
    const features = props.plan.legs.map((l, i) => ({
      type: "Feature" as const,
      properties: { index: l.index },
      geometry: {
        type: "LineString" as const,
        coordinates: [coords[i], coords[i + 1]],
      },
    }));
    (m.getSource("route") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features,
    });
    markers.current.forEach((marker) => marker.remove());
    markers.current = [];
    const add = (coordinate: number[], text: string, color: string) => {
      const el = document.createElement("div");
      el.className = styles.mapMarker;
      el.style.background = color;
      el.textContent = text;
      markers.current.push(
        new maplibregl.Marker({ element: el })
          .setLngLat(coordinate as [number, number])
          .addTo(m),
      );
    };
    const start = coords[0],
      end = coords[coords.length - 1];
    if (Math.hypot(start[0] - end[0], start[1] - end[1]) < 1e-8)
      add(start, "S/E", "#14334b");
    else {
      add(start, "S", "#14334b");
      add(end, "E", "#cf593c");
    }
    const drawing = props.plan.legs.find((leg) => leg.kind === "art")?.from;
    if (
      drawing &&
      Math.hypot(drawing.lon - start[0], drawing.lat - start[1]) > 0.00001
    )
      add([drawing.lon, drawing.lat], "1", "#087e91");
    const step = Math.max(1, Math.ceil(props.plan.legs.length / 25));
    for (let i = 0; i < props.plan.legs.length; i += step) {
      const a = coords[i],
        b = coords[i + 1],
        el = document.createElement("button");
      el.type = "button";
      el.className = styles.direction;
      const arrow = document.createElement("span");
      arrow.textContent = "➤";
      arrow.style.display = "block";
      arrow.style.transform = `rotate(${props.plan.legs[i].track - 90}deg)`;
      el.appendChild(arrow);
      el.setAttribute("aria-label", `Select leg ${i + 1}`);
      el.onclick = () => latest.current.onSelect(i + 1);
      markers.current.push(
        new maplibregl.Marker({ element: el })
          .setLngLat([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])
          .addTo(m),
      );
    }
  }, [props.plan, ready]);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const coords = unwrap(props.plan);
    const b = new maplibregl.LngLatBounds();
    coords.forEach((c) => b.extend(c as [number, number]));
    m.fitBounds(b, { padding: 65, duration: 300, maxZoom: 14 });
  }, [props.fitKey, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const coords = unwrap(props.plan),
      index = Math.min(
        props.plan.legs.length - 1,
        Math.floor(props.playPosition),
      ),
      fraction = props.playPosition - index;
    const active = props.plan.legs[props.selectedLeg - 1];
    (m.getSource("active") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: active
        ? [
            {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                coordinates: [
                  coords[props.selectedLeg - 1],
                  coords[props.selectedLeg],
                ],
              },
            },
          ]
        : [],
    });
    const flown =
      props.playPosition > 0
        ? [
            ...coords.slice(0, index + 1),
            [
              coords[index][0] +
                (coords[index + 1][0] - coords[index][0]) *
                  Math.min(1, fraction),
              coords[index][1] +
                (coords[index + 1][1] - coords[index][1]) *
                  Math.min(1, fraction),
            ],
          ]
        : [];
    (m.getSource("flown") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features:
        flown.length > 1
          ? [
              {
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates: flown },
              },
            ]
          : [],
    });
  }, [props.plan, props.selectedLeg, props.playPosition, ready]);
  return (
    <div className={styles.mapWrap}>
      <select
        className={styles.mapLayer}
        aria-label="Map layer"
        value={chart ? "vfr" : "base"}
        onChange={(e) => setChart(e.target.value === "vfr")}
      >
        <option value="base">Base map</option>
        <option value="vfr">FAA VFR Sectional · US</option>
      </select>
      {chart && chartError && (
        <span className={styles.mapNotice}>{chartError}</span>
      )}
      <div
        ref={container}
        className={styles.map}
        aria-label="Projected flight track map"
      />
      {props.pickPoint && (
        <span className={styles.mapNotice}>Select a point on the map</span>
      )}
      {error && (
        <span className={styles.mapNotice}>
          Map unavailable. The route remains available in details.
        </span>
      )}
    </div>
  );
}
