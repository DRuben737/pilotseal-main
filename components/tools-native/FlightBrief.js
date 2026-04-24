"use client";

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { fetchSavedPeople } from "@/lib/saved-people";
import { getSupabaseClient } from "@/lib/supabase";
import { useToolState } from "@/stores/toolState";
import { parseAircraftStations } from "@/lib/aircraft";
import WeightBalanceCalculator from "./WeightBalanceCalculator";

/** ------------------ constants ------------------ */
/** ------------------ utils (pure functions) ------------------ */
function normalizeICAO(s) {
  return (s || "").trim().toUpperCase();
}

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

// ETE (hours in decimal, string with 2 decimals)
function calcETE(etd, eta) {
  if (!etd || !eta) return "";
  const [etdH, etdM] = etd.split(":").map(Number);
  const [etaH, etaM] = eta.split(":").map(Number);
  if ([etdH, etdM, etaH, etaM].some((n) => Number.isNaN(n))) return "";

  let etdMinutes = etdH * 60 + etdM;
  let etaMinutes = etaH * 60 + etaM;
  if (etaMinutes < etdMinutes) etaMinutes += 24 * 60;

  const eteMinutes = etaMinutes - etdMinutes;
  return (eteMinutes / 60).toFixed(2);
}

function calcPressureAltitude(elevationFt, altimeterInHg) {
  // PA = (29.92 - altimeter) * 1000 + field elevation
  return (29.92 - altimeterInHg) * 1000 + elevationFt;
}

// Estimated DA (ft)
function calcDensityAltitudeFt({ elevationFt, temperatureC, altimeterInHg }) {
  const pressureAltitude = calcPressureAltitude(elevationFt, altimeterInHg);
  const isaTemp = 15 - 2 * (elevationFt / 1000);
  return Math.round(pressureAltitude + 120 * (temperatureC - isaTemp));
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// 获取飞行类别的样式和描述（按你给的方案）
function getFlightCategoryMeta(rule) {
  const meta = {
    VFR: { color: "#2ecc71", bg: "#eafaf1", label: "VFR", desc: "Visual Flight Rules" },
    MVFR: { color: "#3498db", bg: "#ebf5fb", label: "MVFR", desc: "Marginal VFR" },
    IFR: { color: "#e74c3c", bg: "#fdedec", label: "IFR", desc: "Instrument Flight Rules" },
    LIFR: { color: "#9b59b6", bg: "#f5eef8", label: "LIFR", desc: "Low IFR" },
  };
  return meta[rule] || { color: "#7f8c8d", bg: "#f4f6f7", label: rule || "UNK", desc: "Unknown" };
}

function parseMetarVisibility(raw) {
  const text = String(raw || "").toUpperCase();
  const fractionMatch = text.match(/\b(\d+)\s+(\d+)\/(\d+)SM\b/);
  if (fractionMatch) {
    return Number(fractionMatch[1]) + Number(fractionMatch[2]) / Number(fractionMatch[3]);
  }

  const simpleFractionMatch = text.match(/\b(\d+)\/(\d+)SM\b/);
  if (simpleFractionMatch) {
    return Number(simpleFractionMatch[1]) / Number(simpleFractionMatch[2]);
  }

  const integerMatch = text.match(/\b(P?\d+)SM\b/);
  if (integerMatch) {
    return Number(String(integerMatch[1]).replace("P", ""));
  }

  return null;
}

function parseMetarCeiling(raw) {
  const text = String(raw || "").toUpperCase();
  const layers = [...text.matchAll(/\b(BKN|OVC|VV)(\d{3})\b/g)]
    .map((match) => Number(match[2]) * 100)
    .filter(Number.isFinite);

  if (!layers.length) {
    return null;
  }

  return Math.min(...layers);
}

function getFlightRulesFromMetar(raw) {
  const visibility = parseMetarVisibility(raw);
  const ceiling = parseMetarCeiling(raw);

  const safeVisibility = visibility ?? 99;
  const safeCeiling = ceiling ?? 9999;

  if (safeVisibility >= 5 && safeCeiling >= 3000) return "VFR";
  if (safeVisibility >= 3 && safeCeiling >= 1000) return "MVFR";
  if (safeVisibility >= 1 && safeCeiling >= 500) return "IFR";
  return "LIFR";
}

const AIRMET_REGION_LABELS = {
  BOS: "Boston",
  MIA: "Miami",
  DFW: "Dallas-Fort Worth",
  CHI: "Chicago",
  SLC: "Salt Lake City",
  SFO: "San Francisco",
  JNU: "Juneau",
  ANC: "Anchorage",
  FAI: "Fairbanks",
  HNL: "Honolulu",
  WA: "Western U.S.",
  WC: "West Coast",
  SIERRA: "Sierra",
  TANGO: "Tango",
  ZULU: "Zulu",
};

function decodeAirmetRegion(value) {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();

  if (!normalized) {
    return "";
  }

  return AIRMET_REGION_LABELS[normalized] ?? normalized;
}

function formatWeatherHazardLabel(value) {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();

  const labels = {
    IFR: "IFR",
    "MT-OBSC": "Mountain obscuration",
    TURB: "Turbulence",
    ICE: "Icing",
    "SFC-WIND": "Surface wind",
    LLWS: "Low-level wind shear",
    CONVECTIVE: "Convective",
  };

  return labels[normalized] ?? (normalized.replaceAll("_", " ") || "Unknown");
}

function toTitleCase(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getHazardExplanation(value, kind = "advisory") {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase();

  const explanations = {
    IFR: "Widespread instrument conditions are expected in this area.",
    "MT-OBSC": "Terrain may be obscured by clouds, precipitation, or haze.",
    TURB: "Moderate turbulence may affect this route segment.",
    ICE: "Icing conditions are possible in the advisory area.",
    "SFC-WIND": "Strong surface wind may affect takeoff and landing.",
    LLWS: "Low-level wind shear may be present near the surface.",
    CONVECTIVE: "Thunderstorm activity may affect the route and nearby airspace.",
    "CONVECTIVE SIGMET": "Thunderstorm activity may affect the route and nearby airspace.",
  };

  return (
    explanations[normalized] ??
    (kind === "sigmet"
      ? "Significant en route weather advisory."
      : "Active weather advisory for part of the route.")
  );
}

function getAdvisoryDisplay(item, kind = "airmet") {
  const hazardSource =
    item?.hazard ??
    item?.severity ??
    item?.text?.replace(/\s+SIGMET$/i, "") ??
    item?.text;
  const normalized = String(hazardSource ?? "")
    .trim()
    .toUpperCase();

  const title =
    normalized === "CONVECTIVE" || normalized === "CONVECTIVE SIGMET"
      ? "Convective SIGMET"
      : kind === "sigmet" && normalized
        ? `${formatWeatherHazardLabel(normalized)} SIGMET`
        : formatWeatherHazardLabel(normalized);

  return {
    title: title || (kind === "sigmet" ? "SIGMET" : "AIRMET"),
    detail: getHazardExplanation(normalized, kind),
    raw: String(item?.text ?? "").trim(),
    region: String(item?.region ?? "").trim(),
    severity: String(item?.severity ?? item?.qualifier ?? "").trim(),
    base: item?.base ?? null,
    top: item?.top ?? null,
    validFrom: String(item?.validFrom ?? "").trim(),
    validTo: String(item?.validTo ?? "").trim(),
    issuedAt: String(item?.issued ?? item?.issuedAt ?? item?.issueTime ?? "").trim(),
    dueTo: String(item?.dueTo ?? item?.cause ?? item?.hazard ?? "").trim(),
  };
}

function WeatherSection({
  title,
  count,
  accent,
  children,
  defaultOpen = true,
}) {
  return (
    <details className="flightbrief-weatherCard" open={defaultOpen}>
      <summary
        className="flightbrief-weatherHeader"
        style={{
          borderColor: accent.border,
          background: accent.background,
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontWeight: 800, color: "#1f2937" }}>{title}</span>
          {count != null ? (
            <span
              style={{
                fontSize: 12,
                fontWeight: 800,
                background: accent.badgeBg,
                color: accent.badgeText,
                padding: "2px 8px",
                borderRadius: 999,
              }}
            >
              {count}
            </span>
          ) : null}
        </div>
        <span className="flightbrief-weatherChevron">▼</span>
      </summary>
      <div className="flightbrief-weatherBody">{children}</div>
    </details>
  );
}

function groupAdvisories(items, keyResolver) {
  const counts = new Map();

  for (const item of Array.isArray(items) ? items : []) {
    const label = keyResolver(item);
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function formatAltitudeBand(base, top) {
  const start = base == null || base === "" ? null : String(base);
  const end = top == null || top === "" ? null : String(top);
  if (!start && !end) return "";
  if (start && end) return `${start} to ${end}`;
  return start ? `Base ${start}` : `Top ${end}`;
}

function formatAdvisoryAltitude(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/surface/i.test(text)) return "surface";
  if (/^\d[\d,]*$/.test(text)) return `${text}`;
  return text;
}

// NOTAM 智能过滤与分类（按你给的方案，稍微改成返回 notam 对象，方便显示 start/end）
function categorizeNotams(notams) {
  if (!Array.isArray(notams)) return { closures: [], nav: [], general: [] };

  const closuresKeys = /RWY|TWY|CLOSED|APRON|TAXIWAY|RUNWAY/i;
  const navKeys = /NAV|COM|VHF|UHF|GPS|ILS|VOR|FREQ|RADIO/i;

  const result = { closures: [], nav: [], general: [] };

  notams.forEach((n) => {
    const text = n?.raw || n?.text || "";
    if (closuresKeys.test(text)) {
      result.closures.push(n);
    } else if (navKeys.test(text)) {
      result.nav.push(n);
    } else {
      result.general.push(n);
    }
  });
  return result;
}

function riskCategory(total) {
  if (total <= 10) {
    return {
      level: "🟢 LOW RISK",
      color: "green",
      recommendation: "Risk acceptable after discussion. Flight may proceed.",
    };
  }
  if (total <= 15) {
    return {
      level: "🟡 MODERATE RISK",
      color: "orange",
      recommendation:
        "Consult with senior or chief instructor to discuss risk mitigation. May proceed after reduction.",
    };
  }
  return {
    level: "🔴 HIGH RISK",
    color: "red",
    recommendation:
      "Flight requires Chief Pilot approval. Discuss flight plan in detail.",
  };
}

/** ------------------ Risk definitions ------------------ */
const STATIC_RISKS = [
  { id: "static-dual-flight", label: "Dual flight", value: 1 },
  { id: "static-training-pre-solo", label: "Training Pre-solo student", value: 3 },
  { id: "static-solo-student", label: "SOLO student", value: 3 },
  { id: "static-dpe-check", label: "DPE or Check flight", value: 2 },
  { id: "static-first-fly-fi", label: "First fly with FI", value: 1 },
  { id: "static-different-model", label: "Different model", value: 1 },
  { id: "static-last-flight-30", label: "Last flight >30 days", value: 1 },
  { id: "static-acft-time-40", label: "Aircraft time < 40 hours (Rated)", value: 1 },
  { id: "static-fi-dual-200", label: "FI < 200 hours Dual given", value: 1 },
];

const DYNAMIC_RISKS = [
  { id: "dynamic-night-ops", label: "Night ops", value: 1 },
  { id: "dynamic-last-night-30", label: "Last night >30 days", value: 1 },
  { id: "dynamic-svfr", label: "SVFR", value: 1 },
  { id: "dynamic-gust-spread", label: "Gust spread > 13 kt", value: 1 },
  { id: "dynamic-other-fi-cancel", label: "Other FI cancellation due to WX", value: 1 },
  { id: "dynamic-max-fuel-flight", label: "Max fuel flight", value: 1 },
  { id: "full-down-auto", label: "Full down auto", value: 1 },
  { id: "dynamic-stall-training", label: "STALL Training", value: 1 },
  { id: "dynamic-spin-training", label: "SPIN Training", value: 2 },
];

function sumChecked(riskConfig, checkedMap) {
  return riskConfig.reduce((acc, r) => acc + (checkedMap[r.id] ? r.value : 0), 0);
}

function checkedItemsLines(riskConfig, checkedMap) {
  return riskConfig
    .filter((r) => checkedMap[r.id])
    .map((r) => `- ${r.label} [${r.value}]`);
}

function formatDisplayDate(value) {
  if (!value) return "Not set";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDisplayTime(value) {
  if (!value) return "Not set";
  const [hours, minutes] = String(value).split(":");
  if (hours === undefined || minutes === undefined) return value;
  const date = new Date();
  date.setHours(Number(hours), Number(minutes), 0, 0);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDisplayValue(value, empty = "Not set") {
  const text = String(value ?? "").trim();
  return text ? text : empty;
}

function EditableInfoRow({ label, value, rowKey, editingKey, setEditingKey, renderEditor }) {
  const isEditing = editingKey === rowKey;

  if (isEditing) {
    return (
      <div className="settings-row settings-row-editing">
        <div className="settings-rowMeta">
          <span className="settings-rowLabel">{label}</span>
        </div>
        <div className="settings-rowEditor">{renderEditor(() => setEditingKey(null))}</div>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="settings-row"
      onClick={() => setEditingKey(rowKey)}
    >
      <div className="settings-rowMeta">
        <span className="settings-rowLabel">{label}</span>
        <strong className="settings-rowValue">{value}</strong>
      </div>
      <span className="settings-rowChevron" aria-hidden="true">
        ›
      </span>
    </button>
  );
}

/** ------------------ Fetch helpers ------------------ */
async function fetchJson(url, signal) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

async function postJson(url, body, signal) {
  const response = await fetch(url, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }

  return data;
}

/** ------------------ Component ------------------ */
export default function FlightBrief() {
  const { session } = useAuthSession();
  const { brief, setBrief, briefWb, briefSelectedAircraft } = useToolState();
  const stepperRef = useRef(null);
  const stepButtonRefs = useRef([]);
  const setBriefField = useCallback(
    (key, valueOrUpdater) => {
      setBrief((current) => {
        const previousValue = current?.[key];
        const nextValue =
          typeof valueOrUpdater === "function" ? valueOrUpdater(previousValue) : valueOrUpdater;
        return { ...current, [key]: nextValue };
      });
    },
    [setBrief]
  );

  /** ---- core form ---- */
  const studentName = brief.studentName ?? "";
  const setStudentName = useCallback((value) => setBriefField("studentName", value), [setBriefField]);
  const instructorName = brief.instructorName ?? "";
  const setInstructorName = useCallback((value) => setBriefField("instructorName", value), [setBriefField]);
  const selectedStudentId = brief.selectedStudentId ?? "";
  const setSelectedStudentId = useCallback((value) => setBriefField("selectedStudentId", value), [setBriefField]);
  const selectedInstructorId = brief.selectedInstructorId ?? "";
  const setSelectedInstructorId = useCallback((value) => setBriefField("selectedInstructorId", value), [setBriefField]);
  const flightRules = brief.flightRules ?? "VFR";
  const setFlightRules = useCallback((value) => setBriefField("flightRules", value), [setBriefField]);
  const flightDate = brief.flightDate ?? "";
  const setFlightDate = useCallback((value) => setBriefField("flightDate", value), [setBriefField]);
  const etd = brief.etd ?? "";
  const setEtd = useCallback((value) => setBriefField("etd", value), [setBriefField]);
  const eta = brief.eta ?? "";
  const setEta = useCallback((value) => setBriefField("eta", value), [setBriefField]);
  const ete = useMemo(() => calcETE(etd, eta), [etd, eta]);


  const aircraftId = brief.aircraftId ?? "";
  const setAircraftId = useCallback((value) => setBriefField("aircraftId", value), [setBriefField]);
  const fuel = brief.fuel ?? "";
  const fuelTime = brief.fuelTime ?? "";
  const setFuelTime = useCallback((value) => setBriefField("fuelTime", value), [setBriefField]);
  const wbCg = brief.wbCg ?? "";

  /** ---- route ---- */
  const routeMode = brief.routeMode ?? "local"; // 'local' | 'cross'
  const setRouteMode = useCallback((value) => setBriefField("routeMode", value), [setBriefField]);
  const departure = brief.departure ?? "";
  const setDeparture = useCallback((value) => setBriefField("departure", value), [setBriefField]);
  const arrival = brief.arrival ?? "";
  const setArrival = useCallback((value) => setBriefField("arrival", value), [setBriefField]);
  const stops = brief.stops ?? [""]; // at least one input
  const setStops = useCallback((value) => setBriefField("stops", value), [setBriefField]);

  /** ---- lesson ---- */
  const lessonPractice = brief.lessonPractice ?? "";
  const setLessonPractice = useCallback((value) => setBriefField("lessonPractice", value), [setBriefField]);

  /** ---- weather / DA ---- */
  const weatherLoading = brief.weatherLoading ?? false;
  const setWeatherLoading = useCallback((value) => setBriefField("weatherLoading", value), [setBriefField]);
  const weatherError = brief.weatherError ?? "";
  const setWeatherError = useCallback((value) => setBriefField("weatherError", value), [setBriefField]);

  // store richer metar for category visualization
  const metarByIcaoData = brief.metarByIcaoData ?? {}; // { ICAO: { raw, flight_rules } }
  const setMetarByIcaoData = useCallback((value) => setBriefField("metarByIcaoData", value), [setBriefField]);
  const tafByIcao = brief.tafByIcao ?? {}; // { ICAO: "ICAO: raw" }
  const setTafByIcao = useCallback((value) => setBriefField("tafByIcao", value), [setBriefField]);
  const airsigmetSummary = brief.airsigmetSummary ?? "";
  const setAirsigmetSummary = useCallback((value) => setBriefField("airsigmetSummary", value), [setBriefField]);
  const airmets = brief.airmets ?? [];
  const setAirmets = useCallback((value) => setBriefField("airmets", value), [setBriefField]);
  const sigmets = brief.sigmets ?? [];
  const setSigmets = useCallback((value) => setBriefField("sigmets", value), [setBriefField]);
  const pireps = brief.pireps ?? [];
  const setPireps = useCallback((value) => setBriefField("pireps", value), [setBriefField]);
  const weatherResults = brief.weatherResults ?? [];
  const setWeatherResults = useCallback((value) => setBriefField("weatherResults", value), [setBriefField]);

  const latestAltimeterRef = useRef(null); // inHg number
  const latestTemperatureCRef = useRef(null); // C number

  const fieldElevation = brief.fieldElevation ?? "";
  const setFieldElevation = useCallback((value) => setBriefField("fieldElevation", value), [setBriefField]);
  const outsideTemp = brief.outsideTemp ?? ""; // read-only but stored
  const setOutsideTemp = useCallback((value) => setBriefField("outsideTemp", value), [setBriefField]);
  const daResult = brief.daResult ?? "";
  const setDaResult = useCallback((value) => setBriefField("daResult", value), [setBriefField]);

  /** ---- notes ---- */
  const weatherNotes = brief.weatherNotes ?? "";
  const setWeatherNotes = useCallback((value) => setBriefField("weatherNotes", value), [setBriefField]);

  /** ---- NOTAMs (NMS) ---- */
  const notamLoading = brief.notamLoading ?? false;
  const setNotamLoading = useCallback((value) => setBriefField("notamLoading", value), [setBriefField]);
  const notamError = brief.notamError ?? "";
  const setNotamError = useCallback((value) => setBriefField("notamError", value), [setBriefField]);
  const notamByIcao = brief.notamByIcao ?? {}; // { ICAO: {closures, nav, general} }
  const setNotamByIcao = useCallback((value) => setBriefField("notamByIcao", value), [setBriefField]);
  // airport-level collapse: { KPAO: true/false }  true=expanded
  const notamAirportOpen = brief.notamAirportOpen ?? {};
  const setNotamAirportOpen = useCallback((value) => setBriefField("notamAirportOpen", value), [setBriefField]);

  // category-level collapse per airport: { KPAO: { closures:true, nav:false, general:false } }
  const notamCategoryOpen = brief.notamCategoryOpen ?? {};
  const setNotamCategoryOpen = useCallback((value) => setBriefField("notamCategoryOpen", value), [setBriefField]);

  const toggleAirport = useCallback((icao) => {
    setNotamAirportOpen((prev) => ({ ...prev, [icao]: !prev[icao] }));

    // First time opening an airport: default expand closures, collapse nav/general
    setNotamCategoryOpen((prev) => {
      if (prev[icao]) return prev; // keep user's previous open/close choices
      return { ...prev, [icao]: { closures: true, nav: false, general: false } };
    });
  }, []);

  const toggleCategory = useCallback((icao, key) => {
    setNotamCategoryOpen((prev) => ({
      ...prev,
      [icao]: {
        ...(prev[icao] || { closures: true, nav: false, general: false }),
        [key]: !(prev[icao]?.[key]),
      },
    }));
  }, []);

  /** ---- aircraft conditions ---- */
  const grossWeight = brief.grossWeight ?? "";
  const withinLimitsConfirmed = brief.withinLimitsConfirmed ?? false;

  const mxNow = brief.mxNow ?? "";
  const setMxNow = useCallback((value) => setBriefField("mxNow", value), [setBriefField]);
  const mxDue = brief.mxDue ?? "";
  const setMxDue = useCallback((value) => setBriefField("mxDue", value), [setBriefField]);

  const mxRemaining = useMemo(() => {
    const now = parseFloat(mxNow || 0);
    const due = parseFloat(mxDue || 0);
    if (Number.isNaN(now) || Number.isNaN(due)) return "0.0";
    return (due - now).toFixed(1);
  }, [mxNow, mxDue]);

  const airmetGroups = useMemo(
    () => groupAdvisories(airmets, (item) => formatWeatherHazardLabel(item?.hazard ?? item?.text)),
    [airmets]
  );
  const sigmetGroups = useMemo(
    () => groupAdvisories(
      sigmets,
      (item) =>
        formatWeatherHazardLabel(
          item?.hazard ?? item?.severity ?? item?.text?.replace(/\s+SIGMET$/i, "")
        )
    ),
    [sigmets]
  );
  const dedupedPireps = useMemo(() => {
    const seen = new Set();
    return (Array.isArray(pireps) ? pireps : []).filter((item) => {
      const text = String(item?.text ?? "").trim();
      if (!text || seen.has(text)) return false;
      seen.add(text);
      return true;
    });
  }, [pireps]);

  const daSourceResult = useMemo(() => {
    if (!Array.isArray(weatherResults) || !weatherResults.length) {
      return null;
    }

    const depICAO = normalizeICAO(departure);
    const pick = (pred) => weatherResults.find(pred) || null;

    return (
      (depICAO &&
        pick(
          (result) =>
            result?.icao === depICAO &&
            typeof result?.alt === "number" &&
            typeof result?.temp === "number"
        )) ||
      pick(
        (result) =>
          typeof result?.alt === "number" && typeof result?.temp === "number"
      ) ||
      null
    );
  }, [weatherResults, departure]);

  /** ---- risk ---- */
  const staticChecked = brief.staticChecked ?? {};
  const setStaticChecked = useCallback((value) => setBriefField("staticChecked", value), [setBriefField]);
  const dynamicChecked = brief.dynamicChecked ?? {};
  const setDynamicChecked = useCallback((value) => setBriefField("dynamicChecked", value), [setBriefField]);
  const imsafe = brief.imsafe ?? 0; // 0..6
  const setImsafe = useCallback((value) => setBriefField("imsafe", value), [setBriefField]);
  const otherRisks = brief.otherRisks ?? 0; // 0..5
  const setOtherRisks = useCallback((value) => setBriefField("otherRisks", value), [setBriefField]);
  const riskComments = brief.riskComments ?? "";
  const setRiskComments = useCallback((value) => setBriefField("riskComments", value), [setBriefField]);
  const currentStep = brief.currentStep ?? 0;
  const setCurrentStep = useCallback((value) => setBriefField("currentStep", value), [setBriefField]);
  const topRef = useRef(null);
  const [savedStudents, setSavedStudents] = React.useState([]);
  const [savedCfis, setSavedCfis] = React.useState([]);
  const [mobileEditingField, setMobileEditingField] = React.useState(null);

  useEffect(() => {
    setMobileEditingField(null);
  }, [currentStep]);

  const staticScore = useMemo(
    () => sumChecked(STATIC_RISKS, staticChecked) + (parseInt(imsafe, 10) || 0),
    [staticChecked, imsafe]
  );
  const dynamicScore = useMemo(
    () => sumChecked(DYNAMIC_RISKS, dynamicChecked) + (parseInt(otherRisks, 10) || 0),
    [dynamicChecked, otherRisks]
  );
  const totalRisk = staticScore + dynamicScore;
  const riskMeta = useMemo(() => riskCategory(totalRisk), [totalRisk]);

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabaseClient();

    async function loadSavedPeopleOptions() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user?.id) {
          if (!cancelled) {
            setSavedStudents([]);
            setSavedCfis([]);
          }
          return;
        }

        const [students, cfis] = await Promise.all([
          fetchSavedPeople(session.user.id, "student"),
          fetchSavedPeople(session.user.id, "cfi"),
        ]);

        if (!cancelled) {
          setSavedStudents(students);
          setSavedCfis(cfis);
        }
      } catch {
        if (!cancelled) {
          setSavedStudents([]);
          setSavedCfis([]);
        }
      }
    }

    void loadSavedPeopleOptions();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedStudentId) {
      return;
    }

    const selectedStudent = savedStudents.find((person) => person.id === selectedStudentId);
    if (selectedStudent?.display_name) {
      setStudentName(selectedStudent.display_name);
    }
  }, [savedStudents, selectedStudentId, setStudentName]);

  useEffect(() => {
    if (!selectedInstructorId) {
      return;
    }

    const selectedInstructor = savedCfis.find((person) => person.id === selectedInstructorId);
    if (selectedInstructor?.display_name) {
      setInstructorName(selectedInstructor.display_name);
    }
  }, [savedCfis, selectedInstructorId, setInstructorName]);

  useEffect(() => {
    const wbResult = briefWb?.result;
    const wbInputs = briefWb?.inputs ?? {};
    const fuelStation =
      wbResult?.stationBreakdown?.find?.((station) => station.isFuelStation) ??
      parseAircraftStations(briefSelectedAircraft?.model?.stations).find(
        (station) =>
          typeof station.weightPerGallon === "number" && station.weightPerGallon > 0
      );
    const fuelInputValue =
      fuelStation && wbInputs[fuelStation.id] !== undefined && wbInputs[fuelStation.id] !== null
        ? String(wbInputs[fuelStation.id])
        : "";

    if (!wbResult && !briefSelectedAircraft) {
      return;
    }

    setBrief((current) => ({
      ...current,
      aircraftId: briefSelectedAircraft?.name ?? current.aircraftId ?? "",
      fuel: fuelInputValue || current.fuel || "",
      grossWeight: wbResult?.total_weight
        ? wbResult.total_weight.toFixed(1)
        : current.grossWeight ?? "",
      wbCg: wbResult?.cg ? wbResult.cg.toFixed(2) : current.wbCg ?? "",
      withinLimitsConfirmed:
        typeof wbResult?.status === "string"
          ? wbResult.status === "within"
          : current.withinLimitsConfirmed ?? false,
    }));
  }, [briefSelectedAircraft, briefWb, setBrief]);

  const riskGates = useMemo(() => {
  const gates = [];

  const isSolo = staticChecked["static-solo-student"];
  const isPreSolo = staticChecked["static-training-pre-solo"];
  const isSVFR = dynamicChecked["dynamic-svfr"];
  const isNight = dynamicChecked["dynamic-night-ops"];
  const nightCurrency = dynamicChecked["dynamic-last-night-30"];

  const isStall = dynamicChecked["dynamic-stall-training"]; // STALL Training
  const isSpin = dynamicChecked["dynamic-spin-training"]; // SPIN Training
  const isAutorotation = dynamicChecked["full-down-auto"]; // Full down auto (autorotation)

  // 1️⃣ SVFR + Solo
  if (isSVFR && isSolo) {
    gates.push("SVFR with SOLO student – Chief Pilot review required.");
  }

  // 2️⃣ Night + no recent night
  if (isNight && nightCurrency) {
    gates.push("Night operation with no recent night currency – mitigation required.");
  }

  // 3️⃣ IFR + Pre-solo
  if (flightRules === "IFR" && isPreSolo) {
    gates.push("IFR selected with Pre-solo student – confirm training intent.");
  }

  // 4️⃣ METAR IFR/LIFR
  const anyIFR = Object.values(metarByIcaoData || {}).some(
    (m) => m?.flight_rules === "IFR" || m?.flight_rules === "LIFR"
  );
  if (anyIFR) {
    gates.push("Destination/route reporting IFR/LIFR – evaluate alternate and minima.");
  }

  // 5️⃣ Airport closures
  const closureAirport = Object.entries(notamByIcao || {}).find(
    ([, g]) => g?.closures?.length > 0
  );
  if (closureAirport) {
    gates.push(
      `Airport operational closure NOTAM present (${closureAirport[0]}) – verify runway/taxiway availability.`
    );
  }

  // 6️⃣ Maneuver training: discuss recovery altitude and procedure
  if (isAutorotation) {
    gates.push(
      "Autorotation (Full down auto) selected – brief recovery altitude (AGL/MSL), entry/termination criteria, and go-around procedure."
    );
  }

  if (isStall) {
    gates.push(
      "STALL training selected – brief recovery altitude, configuration (power/flaps), and standard recovery procedure (reduce AoA, add power, minimize altitude loss)."
    );
  }

  if (isSpin) {
    gates.push(
      "SPIN training selected – brief entry criteria, minimum recovery altitude, and recovery procedure (PARE or school SOP)."
    );
  }

  return gates;
}, [
  staticChecked,
  dynamicChecked,
  flightRules,
  metarByIcaoData,
  notamByIcao,
]);

  /** ---- route behavior (sync arrival in local mode) ---- */
  const onSetDeparture = useCallback(
    (val) => {
      setDeparture(val);
      if (routeMode === "local") setArrival(val);
    },
    [routeMode]
  );

  const onSelectLocal = useCallback(() => {
    setRouteMode("local");
    setArrival(departure);
    setStops([""]);
  }, [departure]);

  const onSelectCross = useCallback(() => {
    setRouteMode("cross");
    setArrival("");
    setStops((prev) => (prev.length ? prev : [""]));
  }, []);

  const addStop = useCallback(() => setStops((prev) => [...prev, ""]), []);
  const removeStop = useCallback((idx) => {
    setStops((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      return next.length ? next : [""];
    });
  }, []);
  const updateStop = useCallback((idx, val) => {
    setStops((prev) => prev.map((s, i) => (i === idx ? val : s)));
  }, []);

  /** ---- airports list for weather / notams ---- */
  const airportsForWxAndNotams = useMemo(() => {
    const dep = normalizeICAO(departure);
    const arr = normalizeICAO(arrival);
    const stopList = stops.map(normalizeICAO).filter(Boolean);

    const list = [];
    if (dep) list.push(dep);
    list.push(...stopList);
    if (arr && arr !== dep) list.push(arr);

    return uniq(list);
  }, [departure, arrival, stops]);

  /** ---- fetch weather ---- */
  const abortRef = useRef(null);

  const fetchWeather = useCallback(async () => {
    setWeatherError("");
    setWeatherLoading(true);

    // abort previous
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const icaos = airportsForWxAndNotams;
      if (!icaos.length) {
        setWeatherError("Please enter at least a departure (and optionally stops/arrival).");
        setWeatherLoading(false);
        return;
      }

      // Reset display
      setMetarByIcaoData({});
      setTafByIcao({});
      setAirsigmetSummary("");
      setAirmets([]);
      setSigmets([]);
      setPireps([]);
      setWeatherResults([]);

      latestAltimeterRef.current = null;
      latestTemperatureCRef.current = null;
      setOutsideTemp("");
      setDaResult("");

      const depICAO = normalizeICAO(departure);
      const weatherPayload = await postJson(
        "/api/brief/weather",
        {
          route: icaos,
        },
        controller.signal
      );
      const results = Array.isArray(weatherPayload?.results) ? weatherPayload.results : [];
      setWeatherResults(results);

      // prefer dep for alt/temp if possible
      const pick = (pred) => results.find(pred) || null;

      const altPick =
        (depICAO && pick((r) => r.icao === depICAO && typeof r.alt === "number")) ||
        pick((r) => typeof r.alt === "number");
      const tempPick =
        (depICAO && pick((r) => r.icao === depICAO && typeof r.temp === "number")) ||
        pick((r) => typeof r.temp === "number");

      if (altPick) latestAltimeterRef.current = altPick.alt;
      if (tempPick) {
        latestTemperatureCRef.current = tempPick.temp;
        setOutsideTemp(String(tempPick.temp));
      }

      const metarMap = {};
      const tafMap = {};
      for (const r of results) {
        metarMap[r.icao] = {
          raw: r.metarRaw,
          flight_rules: getFlightRulesFromMetar(r.metarRaw),
        };
        tafMap[r.icao] = `${r.icao}: ${r.tafRaw}`;
      }
      setMetarByIcaoData(metarMap);
      setTafByIcao(tafMap);

      // AIRMET/SIGMET once
      setAirsigmetSummary(weatherPayload?.airsigmetSummary || "AIRMET/SIGMET unavailable");
      setAirmets(Array.isArray(weatherPayload?.airmets) ? weatherPayload.airmets : []);
      setSigmets(Array.isArray(weatherPayload?.sigmets) ? weatherPayload.sigmets : []);
      setPireps(Array.isArray(weatherPayload?.pireps) ? weatherPayload.pireps : []);
    } catch (e) {
      if (e?.name !== "AbortError") {
        const routeText = airportsForWxAndNotams.join(", ");
        setWeatherError(
          `${e?.message || "Weather fetch failed. Please try again."}${
            routeText ? ` Route: ${routeText}` : ""
          }`
        );
      }
    } finally {
      setWeatherLoading(false);
    }
  }, [airportsForWxAndNotams, departure]);

  /** ---- fetch NOTAMs (NMS) ---- */
  const fetchNotams = useCallback(async () => {
    setNotamError("");
    setNotamLoading(true);

    try {
      const icaos = airportsForWxAndNotams;
      if (!icaos.length) {
        setNotamError("Please enter at least a departure (and optionally stops/arrival).");
        return;
      }

      const data = await postJson(
        "/api/brief/notams",
        {
          airports: icaos,
        }
      );

      const list = Array.isArray(data?.notams) ? data.notams : [];
      const grouped = {};
      for (const icao of icaos) grouped[icao] = { closures: [], nav: [], general: [] };

      // group by ICAO then categorize
      const byIcao = {};
      for (const n of list) {
        const icao = normalizeICAO(n?.icao);
        if (!icao) continue;
        if (!byIcao[icao]) byIcao[icao] = [];
        byIcao[icao].push(n);
      }
      for (const [icao, arr] of Object.entries(byIcao)) {
        grouped[icao] = categorizeNotams(arr);
      }

      setNotamByIcao(grouped);
      // init collapsed state for new airports (default collapsed)
      setNotamAirportOpen((prev) => {
        const next = { ...prev };
        for (const icao of Object.keys(grouped)) {
          if (next[icao] === undefined) next[icao] = false;
        }
        return next;
      });
      setNotamCategoryOpen((prev) => {
        const next = { ...prev };
        for (const icao of Object.keys(grouped)) {
          if (next[icao] === undefined) {
            next[icao] = { closures: true, nav: false, general: false };
          }
        }
        return next;
      });
    } catch (e) {
      setNotamError(`NOTAM fetch failed: ${e?.message || "unknown error"}`);
    } finally {
      setNotamLoading(false);
    }
  }, [airportsForWxAndNotams]);

  /** ---- calculate DA ---- */
  const calculateDA = useCallback(() => {
    const elevationFt = parseFloat(fieldElevation);
    const temperatureC =
      typeof daSourceResult?.temp === "number"
        ? daSourceResult.temp
        : parseFloat(outsideTemp);
    const altimeterInHg =
      typeof daSourceResult?.alt === "number"
        ? daSourceResult.alt
        : latestAltimeterRef.current;

    if (Number.isNaN(elevationFt)) {
      setDaResult("Please enter field elevation.");
      return;
    }
    if (altimeterInHg == null || Number.isNaN(temperatureC)) {
      setDaResult('Weather data is missing or invalid. Please click "Fetch Weather" first.');
      return;
    }

    const da = calcDensityAltitudeFt({ elevationFt, temperatureC, altimeterInHg });
    setDaResult(
      `Estimated Density Altitude: ${da.toLocaleString()} ft using ${daSourceResult?.icao || "latest METAR"} (${altimeterInHg} inHg / ${temperatureC}°C)`
    );
  }, [fieldElevation, outsideTemp, daSourceResult]);

  /** ---- report ---- */
  const generateReport = useCallback(() => {
    if (!withinLimitsConfirmed) {
      alert('Please confirm "within limits" (Weight & CG).');
      return;
    }

    const dep = normalizeICAO(departure);
    const arr = normalizeICAO(arrival);

    const staticLines = [
      ...checkedItemsLines(STATIC_RISKS, staticChecked),
      ...(parseInt(imsafe, 10) ? [`- IMSAFE [${parseInt(imsafe, 10)}]`] : []),
    ];
    const dynamicLines = [
      ...checkedItemsLines(DYNAMIC_RISKS, dynamicChecked),
      ...(parseInt(otherRisks, 10) ? [`- Other Risks [${parseInt(otherRisks, 10)}]`] : []),
    ];

    // Optional: include NOTAM summary counts
    const notamSummaryLines = Object.entries(notamByIcao)
      .filter(([icao]) => airportsForWxAndNotams.includes(icao))
      .map(([icao, g]) => {
        const total = (g?.closures?.length || 0) + (g?.nav?.length || 0) + (g?.general?.length || 0);
        return `${icao}: ${total} (Closures ${g?.closures?.length || 0}, Nav ${g?.nav?.length || 0}, General ${g?.general?.length || 0})`;
      });

    const reportText = `=== PilotSeal Flight Brief Report ===

PF: ${studentName}
PIC: ${instructorName}
Date: ${flightDate}
Aircraft: ${aircraftId}
Fuel: ${fuel}

Flight Rules: ${flightRules}

ETD: ${etd}
ETA: ${eta}
ETE: ${ete ? ete + " hours" : ""}

Departure: ${dep}
Arrival: ${arr}
Lesson Practice: ${lessonPractice}

📝 Notes / NOTAMs:
${weatherNotes}

NOTAM Summary:
${notamSummaryLines.length ? notamSummaryLines.join("\n") : "(not fetched)"}

Density Altitude: ${daResult}
Gross Weight: ${grossWeight}
CG: ${wbCg}
Fuel Time: ${fuelTime}
Mx Remaining: ${mxRemaining}

🪨 Static Risk:
${staticLines.length ? staticLines.join("\n") : "- None"}
Total Static Risk Score: ${staticScore}

🌪️ Dynamic Risk:
${dynamicLines.length ? dynamicLines.join("\n") : "- None"}
Total Dynamic Risk Score: ${dynamicScore}

Total Risk Score: ${totalRisk}
Category: ${riskMeta.level}
Recommendation: ${riskMeta.recommendation}

🗒️ Risk Discussion / Comments:
${riskComments}
`;

    const reportWindow = window.open("", "_blank");
    if (!reportWindow) {
      alert("Popup blocked. Please allow popups to generate the report.");
      return;
    }
    reportWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>PilotSeal Flight Brief Report</title>
  <style>
    body { font-family: Consolas, Menlo, Monaco, monospace; white-space: pre-wrap; margin: 2em; }
  </style>
</head>
<body>
<pre>${escapeHtml(reportText)}</pre>
</body>
</html>`);
    reportWindow.document.close();
  }, [
    withinLimitsConfirmed,
    studentName,
    instructorName,
    flightDate,
    aircraftId,
    fuel,
    flightRules,
    etd,
    eta,
    ete,
    departure,
    arrival,
    lessonPractice,
    weatherNotes,
    notamByIcao,
    airportsForWxAndNotams,
    daResult,
    grossWeight,
    fuelTime,
    mxRemaining,
    staticChecked,
    dynamicChecked,
    imsafe,
    otherRisks,
    staticScore,
    dynamicScore,
    totalRisk,
    riskMeta.level,
    riskMeta.recommendation,
    riskComments,
  ]);

  /** ------------------ render helpers ------------------ */
  const renderedNotamAirports = useMemo(() => {
    const keys = Object.keys(notamByIcao || {});
    // keep ordering like airports list
    const ordered = airportsForWxAndNotams.filter((a) => keys.includes(a));
    // plus any extras
    const extras = keys.filter((k) => !ordered.includes(k));
    return [...ordered, ...extras];
  }, [notamByIcao, airportsForWxAndNotams]);

  const steps = [
    { id: "overview", title: "Flight Info" },
    { id: "aircraft", title: "Aircraft" },
    { id: "route", title: "Route" },
    { id: "weather", title: "Weather" },
    { id: "risk", title: "Risk" },
  ];

  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;

  const scrollToTop = useCallback(() => {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    const stepButton = stepButtonRefs.current[currentStep];
    const stepper = stepperRef.current;
    if (!stepButton || !stepper) return;

    stepButton.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [currentStep]);

  const goToNextStep = () => {
    setCurrentStep((step) => Math.min(step + 1, steps.length - 1));
    scrollToTop();
  };

  const goToPreviousStep = () => {
    setCurrentStep((step) => Math.max(step - 1, 0));
    scrollToTop();
  };

  return (
    <div className="flightbrief-body" ref={topRef}>
      <div className="flightbrief-header">
        <div>
          <h1 className="text-3xl font-bold text-center mb-6">Flight Brief</h1>
        </div>
        <div className="flightbrief-stepBadge">
          Step {currentStep + 1} of {steps.length}
        </div>
      </div>

      <div
        ref={stepperRef}
        className="flightbrief-stepper"
        role="tablist"
        aria-label="Flight brief steps"
      >
        {steps.map((step, index) => (
          <button
            key={step.id}
            ref={(element) => {
              stepButtonRefs.current[index] = element;
            }}
            type="button"
            className={`flightbrief-step ${index === currentStep ? "active" : ""} ${index < currentStep ? "completed" : ""}`}
            onClick={() => {
              setCurrentStep(index);
              scrollToTop();
            }}
          >
            <span className="flightbrief-stepIndex">{index + 1}</span>
            <strong>{step.title}</strong>
          </button>
        ))}
      </div>

      <form className="space-y-4 flightbrief-form" onSubmit={(e) => e.preventDefault()}>
          {currentStep === 0 && (
            <section className="flightbrief-panel">
              <h2 className="text-xl font-bold mb-4">Flight Information</h2>

              <div className="flightbrief-mobile-settings">
                <div className="settings-card">
                  <h3 className="settings-cardTitle">People</h3>
                  <EditableInfoRow
                    label="Student"
                    value={formatDisplayValue(studentName)}
                    rowKey="studentName"
                    editingKey={mobileEditingField}
                    setEditingKey={setMobileEditingField}
                    renderEditor={(close) => (
                      <input
                        autoFocus
                        type="text"
                        value={studentName}
                        onChange={(e) => setStudentName(e.target.value)}
                        onBlur={close}
                      />
                    )}
                  />
                  <EditableInfoRow
                    label="Instructor"
                    value={formatDisplayValue(instructorName)}
                    rowKey="instructorName"
                    editingKey={mobileEditingField}
                    setEditingKey={setMobileEditingField}
                    renderEditor={(close) => (
                      <input
                        autoFocus
                        type="text"
                        value={instructorName}
                        onChange={(e) => setInstructorName(e.target.value)}
                        onBlur={close}
                      />
                    )}
                  />
                </div>

                <div className="settings-card">
                  <h3 className="settings-cardTitle">Aircraft</h3>
                  <EditableInfoRow
                    label="Tail Number"
                    value={formatDisplayValue(aircraftId)}
                    rowKey="aircraftId"
                    editingKey={mobileEditingField}
                    setEditingKey={setMobileEditingField}
                    renderEditor={(close) => (
                      <input
                        autoFocus
                        type="text"
                        value={aircraftId}
                        onChange={(e) => setAircraftId(e.target.value)}
                        onBlur={close}
                      />
                    )}
                  />
                </div>

                <div className="settings-card">
                  <h3 className="settings-cardTitle">Flight</h3>
                  <EditableInfoRow
                    label="Flight Rules"
                    value={formatDisplayValue(flightRules)}
                    rowKey="flightRules"
                    editingKey={mobileEditingField}
                    setEditingKey={setMobileEditingField}
                    renderEditor={(close) => (
                      <select
                        autoFocus
                        value={flightRules}
                        onChange={(e) => setFlightRules(e.target.value)}
                        onBlur={close}
                      >
                        <option value="VFR">VFR</option>
                        <option value="IFR">IFR</option>
                      </select>
                    )}
                  />
                  <EditableInfoRow
                    label="Date"
                    value={formatDisplayDate(flightDate)}
                    rowKey="flightDate"
                    editingKey={mobileEditingField}
                    setEditingKey={setMobileEditingField}
                    renderEditor={(close) => (
                      <input
                        autoFocus
                        type="date"
                        value={flightDate}
                        onChange={(e) => setFlightDate(e.target.value)}
                        onBlur={close}
                      />
                    )}
                  />
                </div>

                <div className="settings-card">
                  <h3 className="settings-cardTitle">Timing</h3>
                  <EditableInfoRow
                    label="ETD"
                    value={formatDisplayTime(etd)}
                    rowKey="etd"
                    editingKey={mobileEditingField}
                    setEditingKey={setMobileEditingField}
                    renderEditor={(close) => (
                      <input
                        autoFocus
                        type="time"
                        value={etd}
                        onChange={(e) => setEtd(e.target.value)}
                        onBlur={close}
                      />
                    )}
                  />
                  <EditableInfoRow
                    label="ETA"
                    value={formatDisplayTime(eta)}
                    rowKey="eta"
                    editingKey={mobileEditingField}
                    setEditingKey={setMobileEditingField}
                    renderEditor={(close) => (
                      <input
                        autoFocus
                        type="time"
                        value={eta}
                        onChange={(e) => setEta(e.target.value)}
                        onBlur={close}
                      />
                    )}
                  />
                  <EditableInfoRow
                    label="Fuel Time"
                    value={formatDisplayValue(fuelTime, "Not set")}
                    rowKey="fuelTime"
                    editingKey={mobileEditingField}
                    setEditingKey={setMobileEditingField}
                    renderEditor={(close) => (
                      <input
                        autoFocus
                        type="number"
                        value={fuelTime}
                        onChange={(e) => setFuelTime(e.target.value)}
                        onBlur={close}
                      />
                    )}
                  />
                </div>
              </div>

              <div className="flightbrief-desktop-form">
              {session?.user?.id ? (
                <div className="inline-label-input">
                  <label className="label" htmlFor="savedStudent">Saved Student:</label>
                  <select
                    id="savedStudent"
                    className="input-field"
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    title="Select a saved student"
                  >
                    <option value="">Select saved student</option>
                    {savedStudents.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.display_name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div className="inline-label-input">
                <label className="label" htmlFor="studentName">Student Name(Pilot Flying):</label>
                <input type="text" id="studentName" className="input-field" value={studentName} onChange={(e) => setStudentName(e.target.value)} required />
              </div>

              {session?.user?.id ? (
                <div className="inline-label-input">
                  <label className="label" htmlFor="savedInstructor">Saved Instructor:</label>
                  <select
                    id="savedInstructor"
                    className="input-field"
                    value={selectedInstructorId}
                    onChange={(e) => setSelectedInstructorId(e.target.value)}
                    title="Select a saved instructor"
                  >
                    <option value="">Select saved instructor</option>
                    {savedCfis.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.display_name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div className="inline-label-input">
                <label className="label" htmlFor="instructorName">Instructor Name(Pilot In Command):</label>
                <input type="text" id="instructorName" className="input-field" value={instructorName} onChange={(e) => setInstructorName(e.target.value)} required />
              </div>

              <div className="flightbrief-compact-grid">
                <div className="inline-label-input inline-label-input-compact">
                  <label className="label" htmlFor="flight-rules">Flight Rules:</label>
                  <select id="flight-rules" className="input-field" value={flightRules} onChange={(e) => setFlightRules(e.target.value)} title="Select flight rules">
                    <option value="VFR">VFR</option>
                    <option value="IFR">IFR</option>
                  </select>
                </div>

                <div className="inline-label-input inline-label-input-compact">
                  <label className="label" htmlFor="flightDate">Select Date</label>
                  <input type="date" id="flightDate" className="input-field" value={flightDate} onChange={(e) => setFlightDate(e.target.value)} required title="Select date" lang="en" />
                </div>

                <div className="inline-label-input inline-label-input-compact">
                  <label className="label" htmlFor="etd">Estimated Time of Departure (ETD)</label>
                  <input type="time" id="etd" className="input-field" value={etd} onChange={(e) => setEtd(e.target.value)} required />
                </div>

                <div className="inline-label-input inline-label-input-compact">
                  <label className="label" htmlFor="eta">Estimated Time of Arrival (ETA)</label>
                  <input type="time" id="eta" className="input-field" value={eta} onChange={(e) => setEta(e.target.value)} required />
                </div>

                <div className="inline-label-input inline-label-input-compact">
                  <label className="label" htmlFor="ete">Estimated Time Enroute (ETE)</label>
                  <input type="text" id="ete" className="input-field" readOnly value={ete} placeholder="Auto-calculated" />
                </div>

                <div className="inline-label-input inline-label-input-compact">
                  <label className="label" htmlFor="aircraftId">Aircraft Tail Number:</label>
                  <input
                    type="text"
                    id="aircraftId"
                    className="input-field"
                    value={aircraftId}
                    onChange={(e) => setAircraftId(e.target.value)}
                    placeholder="e.g. N6758H"
                  />
                </div>

                <div className="inline-label-input inline-label-input-compact">
                  <label className="label" htmlFor="fuelTime">Fuel Time (hrs):</label>
                  <input type="number" id="fuelTime" className="input-field" value={fuelTime} onChange={(e) => setFuelTime(e.target.value)} placeholder="e.g. 2.5" />
                </div>
              </div>
              </div>
            </section>
          )}

          {currentStep === 1 && (
            <section className="flightbrief-panel">
              <h2 className="text-xl font-bold mb-4">Aircraft</h2>

              {!aircraftId && !grossWeight ? (
                <div className="copy-muted mb-3">
                  No aircraft loading data yet. Complete the aircraft section.
                </div>
              ) : null}

              <div className="flightbrief-aircraft-summaryBar">
                <div className="flightbrief-kpi">
                  <span>Total Gross Weight (lbs)</span>
                  <strong>{grossWeight || "--"}</strong>
                </div>
                <div className="flightbrief-kpi">
                  <span>Center of Gravity (in)</span>
                  <strong>{wbCg || "--"}</strong>
                </div>
                <div className="flightbrief-kpi">
                  <span>Weight & CG within limits</span>
                  <strong className={withinLimitsConfirmed ? "is-ok" : "is-alert"}>
                    {withinLimitsConfirmed ? "Confirmed" : "Not Confirmed"}
                  </strong>
                </div>
                <div className="inline-label-input inline-label-input-compact flightbrief-aircraft-inlineField">
                  <label className="label" htmlFor="mx-now">Mx Time Now:</label>
                  <input type="number" id="mx-now" className="input-field" value={mxNow} onChange={(e) => setMxNow(e.target.value)} placeholder="Check Aircraft" />
                </div>
                <div className="inline-label-input inline-label-input-compact flightbrief-aircraft-inlineField">
                  <label className="label" htmlFor="mx-due">Next Mx Due:</label>
                  <input type="number" id="mx-due" className="input-field" value={mxDue} onChange={(e) => setMxDue(e.target.value)} placeholder="" />
                </div>
              </div>

              <WeightBalanceCalculator stateKey="briefWb" embedded />
            </section>
          )}

          {currentStep === 2 && (
            <section className="flightbrief-panel">
              <h2 className="text-xl font-bold mb-4">Route & Lesson</h2>

              <div className="flightbrief-toggleRow">
                <button type="button" className={`btn-toggle ${routeMode === "cross" ? "active" : ""}`} onClick={onSelectCross}>
                  Cross Country
                </button>
                <button type="button" className={`btn-toggle ${routeMode === "local" ? "active" : ""}`} onClick={onSelectLocal}>
                  Local Practice
                </button>
              </div>

              <div className="flightbrief-compact-grid">
                <div className="inline-label-input inline-label-input-compact">
                  <label className="label" htmlFor="departure">Departure Point:</label>
                  <input type="text" id="departure" className="input-field" value={departure} onChange={(e) => onSetDeparture(e.target.value)} required />
                </div>

                <div className="inline-label-input inline-label-input-compact">
                  <label className="label" htmlFor="arrival">Arrival Point:</label>
                  <input type="text" id="arrival" className="input-field" value={arrival} onChange={(e) => setArrival(e.target.value)} required readOnly={routeMode === "local"} />
                </div>

                <div className="section inline-label-input inline-label-input-compact">
                  <label className="label" htmlFor="lessonPractice"><strong>Lesson Practice:</strong></label>
                  <input type="text" id="lessonPractice" className="input-field" value={lessonPractice} onChange={(e) => setLessonPractice(e.target.value)} placeholder="e.g., Steep Turns, Slow Flight, Short Field Landing" />
                </div>
              </div>

              {routeMode === "cross" && (
                <div className="space-y-3 mt-4 flightbrief-compact-span-full">
                  <label className="label">Intermediate Stop</label>

                  {stops.map((s, idx) => (
                    <div key={idx} className="flightbrief-stopRow">
                      <input type="text" className="stop-input input-field" value={s} onChange={(e) => updateStop(idx, e.target.value)} placeholder="e.g. KSQL" />
                      <button type="button" className="remove-stop text-red-500 font-bold" onClick={() => removeStop(idx)} aria-label="Remove stop" title="Remove stop">Remove</button>
                    </div>
                  ))}

                  <button type="button" id="addStop" className="flightbrief-inlineAction" onClick={addStop}>+ Add Another Stop</button>
                </div>
              )}
            </section>
          )}

          {currentStep === 3 && (
            <section className="flightbrief-panel">
              <h2 className="text-xl font-bold mb-4">Weather & NOTAMs</h2>

              <div className="space-y-6">
          <div className="text-center" style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
              onClick={fetchWeather}
              disabled={weatherLoading}
            >
              {weatherLoading ? "Fetching..." : "Fetch Weather"}
            </button>

            <button
              type="button"
              className="bg-sky-500 text-white px-6 py-2 rounded hover:bg-[#123a75]"
              onClick={fetchNotams}
              disabled={notamLoading}
              title="Fetch NOTAMs from FAA NMS via your Worker"
            >
              {notamLoading ? "Fetching NOTAMs..." : "Fetch NOTAMs"}
            </button>

            <span style={{ fontSize: 12, color: "#666", alignSelf: "center" }}>
              Airports: {airportsForWxAndNotams.join(", ") || "(none)"}
            </span>
          </div>

          {weatherError && (
            <div className="bg-red-50 border border-red-200 p-3 rounded text-red-700">{weatherError}</div>
          )}
          {notamError && (
            <div className="bg-red-50 border border-red-200 p-3 rounded text-red-700">{notamError}</div>
          )}

          <WeatherSection
            title="METAR"
            count={Object.keys(metarByIcaoData).length}
            accent={{
              border: "#d1fae5",
              background: "#f0fdf4",
              badgeBg: "#dcfce7",
              badgeText: "#166534",
            }}
          >
            <div className="space-y-2">
              {Object.keys(metarByIcaoData).length === 0 ? (
                <div className="text-sm text-gray-500">No METAR yet.</div>
              ) : (
                Object.entries(metarByIcaoData).map(([icao, data]) => {
                  const meta = getFlightCategoryMeta(data?.flight_rules);
                  return (
                    <div
                      key={icao}
                      className="p-3 rounded border mb-3"
                      style={{ borderLeft: `6px solid ${meta.color}`, backgroundColor: meta.bg }}
                      title={meta.desc}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <strong className="text-base">{icao}</strong>
                        <span
                          style={{
                            backgroundColor: meta.color,
                            color: "white",
                            padding: "2px 8px",
                            borderRadius: "4px",
                            fontSize: "12px",
                            fontWeight: "bold",
                          }}
                        >
                          {meta.label}
                        </span>
                      </div>
                      <code className="text-sm block" style={{ whiteSpace: "pre-wrap" }}>
                        {data?.raw || "Unavailable"}
                      </code>
                    </div>
                  );
                })
              )}
            </div>
          </WeatherSection>

          <WeatherSection
            title="TAF"
            count={Object.keys(tafByIcao).length}
            accent={{
              border: "#fde68a",
              background: "#fffbeb",
              badgeBg: "#fef3c7",
              badgeText: "#92400e",
            }}
          >
            <div className="space-y-2">
              {Object.keys(tafByIcao).length === 0 ? (
                <div className="text-sm text-gray-500">No TAF yet.</div>
              ) : (
                Object.entries(tafByIcao).map(([icao, text]) => (
                  <div
                    key={icao}
                    className="p-3 rounded border mb-3"
                    style={{ borderLeft: "6px solid #f59e0b", backgroundColor: "#fffbeb" }}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <strong className="text-base">{icao}</strong>
                      <span
                        style={{
                          backgroundColor: "#f59e0b",
                          color: "white",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          fontWeight: "bold",
                        }}
                      >
                        TAF
                      </span>
                    </div>
                    <code className="text-sm block" style={{ whiteSpace: "pre-wrap" }}>
                      {String(text).replace(new RegExp(`^${icao}:\\s*`), "")}
                    </code>
                  </div>
                ))
              )}
            </div>
          </WeatherSection>

          <WeatherSection
            title="AIRMET / SIGMET / PIREP"
            count={airmets.length + sigmets.length + dedupedPireps.length}
            accent={{
              border: "#fecaca",
              background: "#fef2f2",
              badgeBg: "#fee2e2",
              badgeText: "#991b1b",
            }}
            defaultOpen={false}
          >
            <div className="space-y-2">
              <div className="bg-gray-100 p-3 rounded border">
                {airsigmetSummary || "No active AIRMET/SIGMETs (or not fetched)."}
              </div>
              <div className="flightbrief-compact-grid">
                <div className="bg-white border rounded p-3">
                  <div className="text-xs uppercase tracking-wide text-gray-500">AIRMET</div>
                  <div className="text-lg font-semibold text-gray-900">{airmets.length}</div>
                </div>
                <div className="bg-white border rounded p-3">
                  <div className="text-xs uppercase tracking-wide text-gray-500">SIGMET</div>
                  <div className="text-lg font-semibold text-gray-900">{sigmets.length}</div>
                </div>
                <div className="bg-white border rounded p-3">
                  <div className="text-xs uppercase tracking-wide text-gray-500">PIREP</div>
                  <div className="text-lg font-semibold text-gray-900">{dedupedPireps.length}</div>
                </div>
              </div>

              {airmetGroups.length > 0 ? (
                <div className="bg-white border rounded p-3">
                  <h4 className="font-semibold mb-2">AIRMET summary</h4>
                  <div className="flex flex-wrap gap-2">
                    {airmetGroups.map((group) => (
                      <span
                        key={`airmet-group-${group.label}`}
                        className="inline-flex items-center gap-2 rounded-full border bg-amber-50 px-3 py-1 text-sm text-amber-900"
                      >
                        <strong>{group.label}</strong>
                        <span>{group.count}</span>
                      </span>
                    ))}
                  </div>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-medium text-gray-700">
                      View AIRMET details
                    </summary>
                    <div className="mt-2 space-y-2">
                      {airmets.map((item, index) => {
                        const advisory = getAdvisoryDisplay(item, "airmet");
                        const titleText =
                          advisory.title?.startsWith("G-AIRMET:")
                            ? advisory.title
                            : `G-AIRMET: ${formatWeatherHazardLabel(item?.hazard ?? advisory.title)}`;
                        const decodedRegion = decodeAirmetRegion(advisory.region);
                        return (
                          <div key={`airmet-${index}`} className="flightbrief-weatherDetailCard">
                            <div className="font-medium text-gray-900">{titleText}</div>
                            <div className="mt-2 space-y-1 text-sm text-gray-700">
                              {advisory.validTo ? <div><strong>Valid:</strong> {advisory.validTo}</div> : null}
                              {advisory.issuedAt ? <div><strong>Issued:</strong> {advisory.issuedAt}</div> : null}
                              {advisory.severity ? <div><strong>Severity:</strong> {advisory.severity}</div> : null}
                              {advisory.top != null && advisory.top !== "" ? (
                                <div><strong>Top:</strong> {formatAdvisoryAltitude(advisory.top)}</div>
                              ) : null}
                              {advisory.base != null && advisory.base !== "" ? (
                                <div><strong>Base:</strong> {formatAdvisoryAltitude(advisory.base)}</div>
                              ) : null}
                              {advisory.dueTo ? <div><strong>Due to:</strong> {advisory.dueTo}</div> : null}
                              {decodedRegion ? <div><strong>Region:</strong> {decodedRegion}</div> : null}
                            </div>
                            {advisory.raw ? <div className="mt-2 text-xs text-gray-500">{advisory.raw}</div> : null}
                          </div>
                        );
                      })}
                    </div>
                  </details>
                </div>
              ) : null}

              {sigmetGroups.length > 0 ? (
                <div className="bg-white border rounded p-3">
                  <h4 className="font-semibold mb-2">SIGMET summary</h4>
                  <div className="flex flex-wrap gap-2">
                    {sigmetGroups.map((group) => (
                      <span
                        key={`sigmet-group-${group.label}`}
                        className="inline-flex items-center gap-2 rounded-full border bg-red-50 px-3 py-1 text-sm text-red-900"
                      >
                        <strong>{group.label}</strong>
                        <span>{group.count}</span>
                      </span>
                    ))}
                  </div>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-medium text-gray-700">
                      View SIGMET details
                    </summary>
                    <div className="mt-2 space-y-2">
                      {sigmets.map((item, index) => {
                        const advisory = getAdvisoryDisplay(item, "sigmet");
                        return (
                          <div key={`sigmet-${index}`} className="flightbrief-weatherDetailCard">
                            <div className="font-medium text-gray-900">{advisory.title}</div>
                            <div className="mt-2 space-y-1 text-sm text-gray-700">
                              {advisory.validTo ? <div><strong>Valid:</strong> {advisory.validTo}</div> : null}
                              {advisory.issuedAt ? <div><strong>Issued:</strong> {advisory.issuedAt}</div> : null}
                              {advisory.severity ? <div><strong>Severity:</strong> {advisory.severity}</div> : null}
                              {advisory.dueTo ? <div><strong>Due to:</strong> {advisory.dueTo}</div> : null}
                            </div>
                            {advisory.raw ? <div className="mt-2 text-xs text-gray-500">{advisory.raw}</div> : null}
                          </div>
                        );
                      })}
                    </div>
                  </details>
                </div>
              ) : null}

              <div className="bg-white border rounded p-3">
                <h4 className="font-semibold mb-2">PIREP</h4>
                {dedupedPireps.length > 0 ? (
                  <details>
                    <summary className="cursor-pointer text-sm font-medium text-gray-700">
                      View {dedupedPireps.length} pilot report{dedupedPireps.length === 1 ? "" : "s"}
                    </summary>
                    <div className="mt-2 space-y-2">
                      {dedupedPireps.slice(0, 12).map((item, index) => (
                        <div key={`pirep-${index}`} className="flightbrief-weatherDetailCard" style={{ whiteSpace: "pre-wrap" }}>
                          {item?.text || "Unavailable"}
                        </div>
                      ))}
                      {dedupedPireps.length > 12 ? (
                        <div className="text-xs text-gray-500">
                          Showing first 12 reports to keep this readable.
                        </div>
                      ) : null}
                    </div>
                  </details>
                ) : (
                  <div className="text-sm text-gray-500">No pilot reports returned.</div>
                )}
              </div>
            </div>
          </WeatherSection>

          <div>
            <h3 className="section-subtitle">📏 Density Altitude (DA)</h3>
            <div className="flightbrief-compact-grid">
              <div className="inline-label-input inline-label-input-compact">
                <label className="label" htmlFor="fieldElevation">Field Elevation (ft)</label>
                <input type="number" id="fieldElevation" className="input-field" value={fieldElevation} onChange={(e) => setFieldElevation(e.target.value)} placeholder="e.g. 2500" />
              </div>

              <div className="inline-label-input inline-label-input-compact">
                <label className="label" htmlFor="outsideTemp">Outside Air Temperature (°C)</label>
                <input type="number" id="outsideTemp" className="input-field" readOnly value={outsideTemp} placeholder="(auto from METAR)" />
              </div>

              <div className="flightbrief-compact-span-full">
                <button type="button" className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 mb-2" onClick={calculateDA}>
                  Calculate DA
                </button>

                <div className="text-sm text-gray-700 font-medium mt-2">{daResult}</div>
              </div>
            </div>
          </div>

          {/* Smart NOTAMs */}
{/* Smart NOTAMs */}
<div className="mt-6">
  <h3 className="text-xl font-bold mb-3">📢 Smart NOTAMs</h3>

{renderedNotamAirports.length === 0 ? (
    <div className="text-sm text-gray-500">No NOTAMs fetched yet. Click &quot;Fetch NOTAMs&quot;.</div>
  ) : (
    renderedNotamAirports.map((icao) => {
      const groups = notamByIcao?.[icao] || { closures: [], nav: [], general: [] };
      const closures = groups.closures || [];
      const nav = groups.nav || [];
      const general = groups.general || [];

      const total = closures.length + nav.length + general.length;
      const airportOpen = !!notamAirportOpen?.[icao];

      const catState = notamCategoryOpen?.[icao] || { closures: true, nav: false, general: false };

      const Category = ({ k, title, badgeStyle, items }) => {
        const open = !!catState[k];
        return (
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              onClick={() => toggleCategory(icao, k)}
              className="w-full"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 10px",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                background: "#fff",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={badgeStyle}>{title}</span>
                <span style={{ fontSize: 12, color: "#666" }}>{items.length}</span>
              </div>
              <span style={{ fontSize: 12, color: "#666" }}>{open ? "▲" : "▼"}</span>
            </button>

            {open && items.length > 0 && (
              <ul className="list-disc ml-5 mt-2 text-sm" style={{ color: "#111827" }}>
                {items.map((n, idx) => (
                  <li key={`${n.id || idx}`} style={{ whiteSpace: "pre-wrap", marginBottom: 6 }}>
                    {n.text || n.raw || ""}
                  </li>
                ))}
              </ul>
            )}

            {open && items.length === 0 && (
              <div className="text-xs text-gray-500 mt-2">None.</div>
            )}
          </div>
        );
      };

      return (
        <div key={icao} className="mb-4">
          {/* Airport header (collapsed by default) */}
          <button
            type="button"
            onClick={() => toggleAirport(icao)}
            className="w-full"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: airportOpen ? "#f9fafb" : "#fff",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontWeight: 800, color: "#1f2937" }}>{icao}</span>

              {/* quick risk cue: closures count */}
              {closures.length > 0 && (
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    background: "#fee2e2",
                    color: "#b91c1c",
                    padding: "2px 8px",
                    borderRadius: 999,
                  }}
                >
                  Closures {closures.length}
                </span>
              )}

              <span style={{ fontSize: 12, color: "#6b7280" }}>Total {total}</span>
            </div>

            <span style={{ fontSize: 12, color: "#6b7280" }}>{airportOpen ? "▲" : "▼"}</span>
          </button>

          {/* Airport body */}
          {airportOpen && (
            <div style={{ padding: "10px 4px 0 4px" }}>
              <Category
                k="closures"
                title="⚠️ CLOSURES & SAFETY"
                badgeStyle={{
                  fontSize: 12,
                  fontWeight: 800,
                  background: "#fee2e2",
                  color: "#b91c1c",
                  padding: "2px 8px",
                  borderRadius: 6,
                }}
                items={closures}
              />
              <Category
                k="nav"
                title="📡 NAV & COMM"
                badgeStyle={{
                  fontSize: 12,
                  fontWeight: 800,
                  background: "#dbeafe",
                  color: "#1d4ed8",
                  padding: "2px 8px",
                  borderRadius: 6,
                }}
                items={nav}
              />
              <Category
                k="general"
                title="📄 GENERAL"
                badgeStyle={{
                  fontSize: 12,
                  fontWeight: 800,
                  background: "#f3f4f6",
                  color: "#374151",
                  padding: "2px 8px",
                  borderRadius: 6,
                }}
                items={general}
              />
            </div>
          )}
        </div>
      );
    })
  )}
</div>
                {/* Notes / NOTAMs free text */}
                <div className="section inline-label-input">
                  <label className="label" htmlFor="weatherNotes"><strong>Notes / NOTAMs</strong></label>
                  <textarea
                    id="weatherNotes"
                    rows="3"
                    className="input-field"
                    value={weatherNotes}
                    onChange={(e) => setWeatherNotes(e.target.value)}
                    placeholder="Enter ATIS, personal notes, mitigation actions, etc..."
                  />
                </div>
              </div>
            </section>
          )}

          {currentStep === 4 && (
            <section className="flightbrief-panel">
              <h2>Risk Assessment</h2>
              <div className="flightbrief-mobile-settings">
                <div className="settings-card">
                  <h3 className="settings-cardTitle">Static Risk</h3>
                  <div className="settings-checklist">
                    {STATIC_RISKS.map((r) => (
                      <label className="settings-checkRow" key={r.id} htmlFor={`mobile-${r.id}`}>
                        <span className="settings-checkCopy">
                          <strong>{r.label}</strong>
                          <small>{r.value} pt</small>
                        </span>
                        <input
                          id={`mobile-${r.id}`}
                          type="checkbox"
                          checked={!!staticChecked[r.id]}
                          onChange={(e) => setStaticChecked((prev) => ({ ...prev, [r.id]: e.target.checked }))}
                        />
                      </label>
                    ))}
                    <EditableInfoRow
                      label="IMSAFE"
                      value={formatDisplayValue(imsafe, "0")}
                      rowKey="imsafe"
                      editingKey={mobileEditingField}
                      setEditingKey={setMobileEditingField}
                      renderEditor={(close) => (
                        <input
                          autoFocus
                          type="number"
                          min="0"
                          max="6"
                          value={imsafe}
                          onChange={(e) => setImsafe(e.target.value)}
                          onBlur={close}
                        />
                      )}
                    />
                  </div>
                </div>

                <div className="settings-card">
                  <h3 className="settings-cardTitle">Dynamic Risk</h3>
                  <div className="settings-checklist">
                    {DYNAMIC_RISKS.map((r) => (
                      <label className="settings-checkRow" key={r.id} htmlFor={`mobile-${r.id}`}>
                        <span className="settings-checkCopy">
                          <strong>{r.label}</strong>
                          <small>{r.value} pt</small>
                        </span>
                        <input
                          id={`mobile-${r.id}`}
                          type="checkbox"
                          checked={!!dynamicChecked[r.id]}
                          onChange={(e) => setDynamicChecked((prev) => ({ ...prev, [r.id]: e.target.checked }))}
                        />
                      </label>
                    ))}
                    <EditableInfoRow
                      label="Other Risks"
                      value={formatDisplayValue(otherRisks, "0")}
                      rowKey="otherRisks"
                      editingKey={mobileEditingField}
                      setEditingKey={setMobileEditingField}
                      renderEditor={(close) => (
                        <input
                          autoFocus
                          type="number"
                          min="0"
                          max="5"
                          value={otherRisks}
                          onChange={(e) => setOtherRisks(e.target.value)}
                          onBlur={close}
                        />
                      )}
                    />
                  </div>
                </div>

                <div className="settings-card">
                  <h3 className="settings-cardTitle">Summary</h3>
                  <div className="settings-summaryValue">{totalRisk}</div>
                  <div className="settings-summaryMeta" style={{ color: riskMeta.color }}>
                    {riskMeta.level}
                  </div>
                  <p className="settings-summaryCopy">{riskMeta.recommendation}</p>
                </div>
              </div>

              <div className="flightbrief-desktop-form">
              <div className="risk-columns">
                <div className="static-risk-column">
                  <div className="flightbrief-riskColumnHead">
                    <div>
                      <h3>Static Risk</h3>
                      <p>Pilot, instructor, recency.</p>
                    </div>
                    <strong>{staticScore}</strong>
                  </div>
                  <div className="flightbrief-riskList">
                    {STATIC_RISKS.map((r) => (
                      <label className="risk-item" key={r.id} htmlFor={r.id}>
                        <span className="risk-item-copy">
                          <strong>{r.label}</strong>
                          <small>{r.value} pt</small>
                        </span>
                        <input
                          type="checkbox"
                          id={r.id}
                          checked={!!staticChecked[r.id]}
                          onChange={(e) => setStaticChecked((prev) => ({ ...prev, [r.id]: e.target.checked }))}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="risk-item risk-item-number">
                    <label htmlFor="imsafe-risk">IMSAFE</label>
                    <input type="number" id="imsafe-risk" min="0" max="6" value={imsafe} onChange={(e) => setImsafe(e.target.value)} />
                  </div>
                </div>

                <div className="dynamic-risk-column">
                  <div className="flightbrief-riskColumnHead">
                    <div>
                      <h3>Dynamic Risk</h3>
                      <p>Weather, mission, conditions.</p>
                    </div>
                    <strong>{dynamicScore}</strong>
                  </div>
                  <div className="flightbrief-riskList">
                    {DYNAMIC_RISKS.map((r) => (
                      <label className="risk-item" key={r.id} htmlFor={r.id}>
                        <span className="risk-item-copy">
                          <strong>{r.label}</strong>
                          <small>{r.value} pt</small>
                        </span>
                        <input
                          type="checkbox"
                          id={r.id}
                          checked={!!dynamicChecked[r.id]}
                          onChange={(e) => setDynamicChecked((prev) => ({ ...prev, [r.id]: e.target.checked }))}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="risk-item risk-item-number">
                    <label htmlFor="other-risk">Other Risks</label>
                    <input id="other-risk" type="number" min="0" max="5" value={otherRisks} onChange={(e) => setOtherRisks(e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="section inline-label-input">
                <label className="label" htmlFor="riskComments"><strong>Risk Discussion / Comments</strong></label>
                <textarea id="riskComments" rows="3" className="input-field" value={riskComments} onChange={(e) => setRiskComments(e.target.value)} placeholder="Notes from discussion with senior/chief pilot..." />
              </div>

              <div className="flightbrief-riskSummary">
                <div className="flightbrief-riskBadge">
                  <span>Total</span>
                  <strong>{totalRisk}</strong>
                </div>
                <div className="flightbrief-riskMeta">
                  <strong style={{ color: riskMeta.color }}>{riskMeta.level}</strong>
                  <p>{riskMeta.recommendation}</p>
                </div>
              </div>

              {riskGates.length > 0 && (
                <div className="flightbrief-gatesCard">
                  <div className="flightbrief-gatesTitle">Mandatory Review Items</div>
                  <ul className="flightbrief-gatesList">
                    {riskGates.map((g, idx) => (
                      <li key={idx}>{g}</li>
                    ))}
                  </ul>
                </div>
              )}
              </div>
            </section>
          )}
      </form>

      <div className="flightbrief-nav">
        <button type="button" className="flightbrief-navButton secondary" onClick={goToPreviousStep} disabled={isFirstStep}>
          <span className="flightbrief-navButtonDesktop">Previous</span>
          <span className="flightbrief-navButtonMobile" aria-hidden="true">‹</span>
        </button>
        <div className="flightbrief-navMeta">
          <strong>{steps[currentStep].title}</strong>
        </div>
        {isLastStep ? (
          <button type="button" className="flightbrief-navButton primary" onClick={generateReport}>
            <span className="flightbrief-navButtonDesktop">Generate Flight Brief Report</span>
            <span className="flightbrief-navButtonMobile" aria-hidden="true">✓</span>
          </button>
        ) : (
          <button type="button" className="flightbrief-navButton primary" onClick={goToNextStep}>
            <span className="flightbrief-navButtonDesktop">Next</span>
            <span className="flightbrief-navButtonMobile" aria-hidden="true">›</span>
          </button>
        )}
      </div>
    </div>
  );
}
