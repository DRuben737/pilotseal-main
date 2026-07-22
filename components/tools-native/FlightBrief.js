"use client";

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { fetchSavedPeople } from "@/lib/saved-people";
import { fetchPersonCertificates } from "@/lib/person-certificates";
import { fetchCurrentProfile } from "@/lib/profile";
import { getSupabaseClient } from "@/lib/supabase";
import { useToolState } from "@/stores/toolState";
import {
  fetchActiveOrganizationAircraft,
  fetchMyAircraft,
  fetchSharedAircraft,
  parseAircraftStations,
} from "@/lib/aircraft";
import WeightBalanceCalculator from "./WeightBalanceCalculator";

/** ------------------ constants ------------------ */
const EMPTY_STOPS = Object.freeze([""]);
const EMPTY_ARRAY = Object.freeze([]);
const EMPTY_OBJECT = Object.freeze({});

/** ------------------ utils (pure functions) ------------------ */
function normalizeICAO(s) {
  return (s || "").trim().toUpperCase();
}

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function matchSavedPersonByName(options, value) {
  const normalizedValue = value.trim().toLowerCase();
  if (!normalizedValue) {
    return null;
  }

  return options.find((person) => person.display_name?.trim().toLowerCase() === normalizedValue) ?? null;
}

function getUniqueSavedPeopleByName(options) {
  const seen = new Set();

  return options.filter((person) => {
    const key = person.display_name?.trim().toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizeTailNumber(value) {
  return String(value ?? "").trim().toUpperCase();
}

function mergeAircraftOptions(sharedAircraft, myAircraft) {
  const myAircraftIds = new Set((myAircraft ?? []).map((aircraft) => aircraft.id));
  const merged = [
    ...(myAircraft ?? []).map((aircraft) => ({
      ...aircraft,
      source: "mine",
      is_saved: true,
    })),
    ...(sharedAircraft ?? [])
      .filter((aircraft) => !myAircraftIds.has(aircraft.id))
      .map((aircraft) => ({
        ...aircraft,
        source: aircraft.source ?? "shared",
        is_saved: false,
      })),
  ];

  return merged.sort((left, right) => {
    if (left.is_saved !== right.is_saved) {
      return left.is_saved ? -1 : 1;
    }

    return String(left.tail_number ?? left.name ?? "").localeCompare(
      String(right.tail_number ?? right.name ?? "")
    );
  });
}

function getUniqueAircraftByTail(options) {
  const seen = new Set();

  return options.filter((aircraft) => {
    const key = normalizeTailNumber(aircraft.tail_number || aircraft.name);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function matchAircraftByTail(options, value) {
  const normalizedValue = normalizeTailNumber(value);
  if (!normalizedValue) {
    return null;
  }

  return (
    options.find((aircraft) => normalizeTailNumber(aircraft.tail_number || aircraft.name) === normalizedValue) ??
    null
  );
}

function formatDueMonth(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }

  const [datePart] = value.split("T");
  const [year, month, day] = datePart.split("-");
  if (!year || !month) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day || "1"))));
}

function parseDueDateMs(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const [datePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  return Date.UTC(year, month - 1, day);
}

function getTodayUtcMs() {
  const today = new Date();
  return Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
}

function getAircraftDueMeta(aircraft, mxNow) {
  if (!aircraft?.is_saved) {
    return {
      label: "--",
      detail: "Select a saved aircraft",
      ok: null,
      report: "(none saved)",
    };
  }

  const todayMs = getTodayUtcMs();
  const items = [];
  let hasExpired = false;
  let needsMxTime = false;

  if (aircraft.hundred_hour_due_hours != null) {
    const currentMx = parseFloat(String(mxNow ?? ""));
    if (Number.isFinite(currentMx)) {
      const isCurrent = currentMx <= Number(aircraft.hundred_hour_due_hours);
      hasExpired = hasExpired || !isCurrent;
      items.push(`100hr ${isCurrent ? "OK" : "overdue"} (${aircraft.hundred_hour_due_hours})`);
    } else {
      needsMxTime = true;
      items.push(`100hr check time (${aircraft.hundred_hour_due_hours})`);
    }
  }

  [
    ["Annual", aircraft.annual_due_date],
    ["91.411", aircraft.static_due_date],
    ["91.413", aircraft.transponder_due_date],
    ["ELT", aircraft.elt_due_date],
  ].forEach(([label, value]) => {
    if (!value) {
      return;
    }

    const dueMs = parseDueDateMs(value);
    const isCurrent = dueMs === null || dueMs >= todayMs;
    hasExpired = hasExpired || !isCurrent;
    items.push(`${label} ${isCurrent ? "OK through" : "expired"} ${formatDueMonth(value)}`);
  });

  if (items.length === 0) {
    return {
      label: "--",
      detail: "No due info saved",
      ok: null,
      report: "(none saved)",
    };
  }

  return {
    label: hasExpired ? "Not available" : needsMxTime ? "Check MX time" : "Available",
    detail: items.join(" · "),
    ok: hasExpired ? false : needsMxTime ? null : true,
    report: items.join("; "),
  };
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

function normalizeAltimeterInHg(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  if (value >= 25 && value <= 35) {
    return value;
  }

  if (value >= 2500 && value <= 3500) {
    return value / 100;
  }

  if (value >= 800 && value <= 1100) {
    return value * 0.0295299830714;
  }

  return null;
}

// Estimated DA (ft)
function calcDensityAltitude({ elevationFt, temperatureC, altimeterInHg }) {
  const pressureAltitude = calcPressureAltitude(elevationFt, altimeterInHg);
  const isaTemp = 15 - 2 * (pressureAltitude / 1000);
  const densityAltitude = pressureAltitude + 120 * (temperatureC - isaTemp);

  return {
    pressureAltitude: Math.round(pressureAltitude),
    isaTemp,
    densityAltitude: Math.round(densityAltitude),
  };
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
      level: "LOW RISK",
      color: "#15803d",
      recommendation: "Risk acceptable after normal mitigation and preflight discussion.",
    };
  }
  if (total <= 15) {
    return {
      level: "MITIGATION REQUIRED",
      color: "#b45309",
      recommendation:
        "List mitigations and discuss with the appropriate instructor or approval level before release.",
    };
  }
  return {
    level: "APPROVAL REQUIRED",
    color: "#b91c1c",
    recommendation:
      "Adjust the plan or seek Chief Pilot / designated approval before the flight is released.",
  };
}

/** ------------------ Risk definitions ------------------ */
const STATIC_RISKS = [
  { id: "static-student-under-50-type", label: "Student < 50 hrs in type (e.g. R44)", value: 1 },
  { id: "static-training-pre-solo", label: "Training with Pre-solo Student", value: 3 },
  { id: "static-cfi-under-100-instruction", label: "CFI < 100 hrs Instruction given", value: 3 },
  { id: "static-last-dual-30", label: "Last DUAL flight > 30 days", value: 1 },
  { id: "static-last-night-30", label: "Last NIGHT flight > 30 days", value: 1 },
  { id: "static-solo-flight", label: "SOLO flight", value: 2 },
  { id: "static-last-solo-30", label: "Last SOLO flight > 30 days (SOLO)", value: 2 },
  { id: "static-prior-mx", label: "Prior MX but released, nothing found / Recurrent MX", value: 1 },
  { id: "static-inspection-under-20", label: "Aircraft < 20 hrs to next required inspection", value: 1 },
  {
    id: "static-secondary-aircraft-type",
    label: "Secondary Aircraft type in same week",
    detail: "(not the aircraft that is primarily flown)",
    value: 1,
  },
  { id: "static-first-different-cfi", label: "First flight with different CFI", value: 1 },
  { id: "static-stage-check", label: "Stage Check / Check Ride", value: 1 },
];

const DYNAMIC_RISKS = [
  { id: "dynamic-dusk-ops", label: "Dusk Ops (Mesopic Vision)", value: 1 },
  { id: "dynamic-svfr-dual", label: "Possibility of SVFR (DUAL)", value: 2 },
  { id: "dynamic-visibility-within-1sm", label: "Visibility w/in 1 SM", detail: "Clouds w/in 200' USATS mins. (SOLO)", value: 1 },
  { id: "dynamic-clouds-within-200", label: "Clouds w/in 200' USATS mins. (SOLO)", value: 1 },
  {
    id: "dynamic-wind-gust-personal-min",
    label: "Wind / Gust spread w/in 2 kts of personal min or USATS mins, whichever is lower.",
    value: 2,
  },
  { id: "dynamic-high-da-gw", label: "High DA / high gross weight per W&B", value: 1 },
  { id: "dynamic-frontal-passage", label: "Frontal Passage to occur within 6 hrs.", value: 1 },
  { id: "dynamic-deteriorating-wx", label: "Deteriorating WX trend", detail: "(FG/BR/VCTS/VCSH)", value: 2 },
  { id: "dynamic-class-bc-solo", label: "Entering Class B or C airspace (SOLO)", value: 1 },
  { id: "dynamic-night-flight", label: "Night Flight", value: 1 },
  { id: "dynamic-fuel-90", label: "90% of usable fuel required", value: 2 },
  { id: "dynamic-other-cfis-cancel-wx", label: "Other CFIs canceling flights due to WX", value: 2 },
  { id: "dynamic-full-down-auto-heli", label: "Full Down Autorotation - Helicopter", value: 2, tone: "heli" },
  { id: "dynamic-stalls-airplane", label: "Stalls - Airplane", value: 2, tone: "airplane" },
  { id: "dynamic-spins-airplane", label: "Spins - Airplane", value: 2, tone: "airplane" },
  { id: "dynamic-single-engine-out-me", label: "Single Engine Out - ME Airplane", value: 2, tone: "airplane" },
];

function sumChecked(riskConfig, checkedMap) {
  return riskConfig.reduce((acc, r) => acc + (checkedMap[r.id] ? r.value : 0), 0);
}

function checkedItemsLines(riskConfig, checkedMap) {
  return riskConfig
    .filter((r) => checkedMap[r.id])
    .map((r) => `- ${r.label} [${r.value}]`);
}

function RiskItemCopy({ risk, className = "risk-item-copy" }) {
  return (
    <span className={className}>
      <span className="risk-item-title">
        <strong>{risk.label}</strong>
        <small className="risk-item-score">{risk.value} pt</small>
      </span>
      {risk.detail && <small className="risk-item-detail">{risk.detail}</small>}
    </span>
  );
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
  const wbCg = brief.wbCg ?? "";

  /** ---- route ---- */
  const routeMode = brief.routeMode ?? "local"; // 'local' | 'cross'
  const setRouteMode = useCallback((value) => setBriefField("routeMode", value), [setBriefField]);
  const departure = brief.departure ?? "";
  const setDeparture = useCallback((value) => setBriefField("departure", value), [setBriefField]);
  const arrival = brief.arrival ?? "";
  const setArrival = useCallback((value) => setBriefField("arrival", value), [setBriefField]);
  const stops = brief.stops ?? EMPTY_STOPS; // at least one input
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
  const metarByIcaoData = brief.metarByIcaoData ?? EMPTY_OBJECT; // { ICAO: { raw, flight_rules } }
  const setMetarByIcaoData = useCallback((value) => setBriefField("metarByIcaoData", value), [setBriefField]);
  const tafByIcao = brief.tafByIcao ?? {}; // { ICAO: "ICAO: raw" }
  const setTafByIcao = useCallback((value) => setBriefField("tafByIcao", value), [setBriefField]);
  const airsigmetSummary = brief.airsigmetSummary ?? "";
  const setAirsigmetSummary = useCallback((value) => setBriefField("airsigmetSummary", value), [setBriefField]);
  const airmets = brief.airmets ?? EMPTY_ARRAY;
  const setAirmets = useCallback((value) => setBriefField("airmets", value), [setBriefField]);
  const sigmets = brief.sigmets ?? EMPTY_ARRAY;
  const setSigmets = useCallback((value) => setBriefField("sigmets", value), [setBriefField]);
  const pireps = brief.pireps ?? EMPTY_ARRAY;
  const setPireps = useCallback((value) => setBriefField("pireps", value), [setBriefField]);
  const weatherResults = brief.weatherResults ?? EMPTY_ARRAY;
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
  const notamByIcao = brief.notamByIcao ?? EMPTY_OBJECT; // { ICAO: {closures, nav, general} }
  const setNotamByIcao = useCallback((value) => setBriefField("notamByIcao", value), [setBriefField]);
  // airport-level collapse: { KPAO: true/false }  true=expanded
  const notamAirportOpen = brief.notamAirportOpen ?? EMPTY_OBJECT;
  const setNotamAirportOpen = useCallback((value) => setBriefField("notamAirportOpen", value), [setBriefField]);

  // category-level collapse per airport: { KPAO: { closures:true, nav:false, general:false } }
  const notamCategoryOpen = brief.notamCategoryOpen ?? EMPTY_OBJECT;
  const setNotamCategoryOpen = useCallback((value) => setBriefField("notamCategoryOpen", value), [setBriefField]);

  const toggleAirport = useCallback((icao) => {
    setNotamAirportOpen((prev) => ({ ...prev, [icao]: !prev[icao] }));

    // First time opening an airport: default expand closures, collapse nav/general
    setNotamCategoryOpen((prev) => {
      if (prev[icao]) return prev; // keep user's previous open/close choices
      return { ...prev, [icao]: { closures: true, nav: false, general: false } };
    });
  }, [setNotamAirportOpen, setNotamCategoryOpen]);

  const toggleCategory = useCallback((icao, key) => {
    setNotamCategoryOpen((prev) => ({
      ...prev,
      [icao]: {
        ...(prev[icao] || { closures: true, nav: false, general: false }),
        [key]: !(prev[icao]?.[key]),
      },
    }));
  }, [setNotamCategoryOpen]);

  /** ---- aircraft conditions ---- */
  const grossWeight = brief.grossWeight ?? "";
  const withinLimitsConfirmed = brief.withinLimitsConfirmed ?? false;

  const mxNow = brief.mxNow ?? "";
  const setMxNow = useCallback((value) => setBriefField("mxNow", value), [setBriefField]);
  const mxDue = brief.mxDue ?? "";
  const setMxDue = useCallback((value) => setBriefField("mxDue", value), [setBriefField]);

  const validateMxTimes = useCallback((nextMxNow, nextMxDue) => {
    if (!String(nextMxNow).trim() || !String(nextMxDue).trim()) {
      return true;
    }

    const now = parseFloat(nextMxNow);
    const due = parseFloat(nextMxDue);
    if (Number.isNaN(now) || Number.isNaN(due)) {
      return true;
    }

    if (now > due) {
      window.alert("Mx Time Now cannot be greater than Next Mx Due.");
      return false;
    }

    return true;
  }, []);

  const handleMxNowChange = useCallback((value) => {
    if (!validateMxTimes(value, mxDue)) {
      return;
    }

    setMxNow(value);
  }, [mxDue, setMxNow, validateMxTimes]);

  const handleMxDueChange = useCallback((value) => {
    if (!validateMxTimes(mxNow, value)) {
      return;
    }

    setMxDue(value);
  }, [mxNow, setMxDue, validateMxTimes]);

  const mxRemaining = useMemo(() => {
    if (!String(mxNow).trim() || !String(mxDue).trim()) {
      return null;
    }

    const now = parseFloat(mxNow);
    const due = parseFloat(mxDue);
    if (Number.isNaN(now) || Number.isNaN(due)) return null;
    return due - now;
  }, [mxNow, mxDue]);

  const mxRemainingMeta = useMemo(() => {
    if (mxRemaining === null) {
      return { label: "--", detail: "Enter MX times", ok: null };
    }

    const eteHours = parseFloat(ete);
    if (Number.isNaN(eteHours)) {
      return {
        label: `${mxRemaining.toFixed(1)} hr`,
        detail: "Enter ETD and ETA",
        ok: null,
      };
    }

    const mxMargin = mxRemaining - eteHours;
    const isSufficient = mxMargin > 1;
    return {
      label: `${mxRemaining.toFixed(1)} hr`,
      detail: isSufficient
        ? "Sufficient for ETE"
        : "Remaining MX time may be insufficient for this flight",
      ok: isSufficient,
    };
  }, [ete, mxRemaining]);

  const avgFuelBurnRate = useMemo(() => {
    const value = briefSelectedAircraft?.model?.avg_fuel_burn_rate;
    const parsed = parseFloat(String(value ?? ""));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [briefSelectedAircraft]);

  const calculatedFuelTime = useMemo(() => {
    const fuelGallons = parseFloat(String(fuel ?? ""));
    if (!Number.isFinite(fuelGallons) || fuelGallons < 0 || !avgFuelBurnRate) {
      return null;
    }

    return fuelGallons / avgFuelBurnRate;
  }, [avgFuelBurnRate, fuel]);

  const fuelTimeMeta = useMemo(() => {
    if (calculatedFuelTime === null) {
      return {
        label: "--",
        detail: avgFuelBurnRate ? "Enter fuel amount" : "No average burn rate saved",
        ok: null,
      };
    }

    const eteHours = parseFloat(ete);
    if (!Number.isFinite(eteHours)) {
      return {
        label: `${calculatedFuelTime.toFixed(2)} hr`,
        detail: "Enter ETD and ETA",
        ok: null,
      };
    }

    const fuelMargin = calculatedFuelTime - eteHours;
    const isSufficient = fuelMargin >= 0;
    return {
      label: `${calculatedFuelTime.toFixed(2)} hr`,
      detail:
        fuelMargin < 0
          ? "Fuel time is less than ETE"
          : fuelMargin < 0.5
            ? "Fuel reserve is under 0.5 hr"
            : "Fuel time covers ETE",
      ok: isSufficient && fuelMargin >= 0.5,
    };
  }, [avgFuelBurnRate, calculatedFuelTime, ete]);

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
  const staticChecked = brief.staticChecked ?? EMPTY_OBJECT;
  const setStaticChecked = useCallback((value) => setBriefField("staticChecked", value), [setBriefField]);
  const dynamicChecked = brief.dynamicChecked ?? EMPTY_OBJECT;
  const setDynamicChecked = useCallback((value) => setBriefField("dynamicChecked", value), [setBriefField]);
  const imsafe = brief.imsafe ?? 0; // 0..6
  const setImsafe = useCallback((value) => setBriefField("imsafe", value), [setBriefField]);
  const cfiStress = brief.cfiStress ?? 0; // 0..6, no flight above 2
  const setCfiStress = useCallback((value) => setBriefField("cfiStress", value), [setBriefField]);
  const otherRisks = brief.otherRisks ?? 0; // 0..5
  const setOtherRisks = useCallback((value) => setBriefField("otherRisks", value), [setBriefField]);
  const otherRiskLabel = brief.otherRiskLabel ?? "";
  const setOtherRiskLabel = useCallback((value) => setBriefField("otherRiskLabel", value), [setBriefField]);
  const riskComments = brief.riskComments ?? "";
  const setRiskComments = useCallback((value) => setBriefField("riskComments", value), [setBriefField]);
  const currentStep = brief.currentStep ?? 0;
  const setCurrentStep = useCallback((value) => setBriefField("currentStep", value), [setBriefField]);
  const topRef = useRef(null);
  const [savedPeopleOptions, setSavedPeopleOptions] = React.useState([]);
  const [aircraftOptions, setAircraftOptions] = React.useState([]);
  const [mobileEditingField, setMobileEditingField] = React.useState(null);

  useEffect(() => {
    setMobileEditingField(null);
  }, [currentStep]);

  const staticScore = useMemo(
    () =>
      sumChecked(STATIC_RISKS, staticChecked) +
      (parseInt(imsafe, 10) || 0) +
      (parseInt(cfiStress, 10) || 0),
    [staticChecked, imsafe, cfiStress]
  );
  const dynamicScore = useMemo(
    () => sumChecked(DYNAMIC_RISKS, dynamicChecked) + (parseInt(otherRisks, 10) || 0),
    [dynamicChecked, otherRisks]
  );
  const totalRisk = staticScore + dynamicScore;
  const riskMeta = useMemo(() => riskCategory(totalRisk), [totalRisk]);

  useEffect(() => {
    if (calculatedFuelTime === null) {
      return;
    }

    const eteHours = parseFloat(ete);
    if (!Number.isFinite(eteHours)) {
      return;
    }

    if (calculatedFuelTime - eteHours < 0.5 && !dynamicChecked["dynamic-fuel-90"]) {
      setDynamicChecked((current) => ({
        ...current,
        "dynamic-fuel-90": true,
      }));
    }
  }, [calculatedFuelTime, dynamicChecked, ete, setDynamicChecked]);

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
            setSavedPeopleOptions([]);
            setAircraftOptions([]);
          }
          return;
        }

        const [people, profile, certificates, sharedAircraft, organizationAircraft, myAircraft] = await Promise.all([
          fetchSavedPeople(session.user.id),
          fetchCurrentProfile(session.user.id),
          fetchPersonCertificates(session.user.id).catch(() => []),
          fetchSharedAircraft().catch(() => []),
          fetchActiveOrganizationAircraft().catch(() => []),
          fetchMyAircraft(session.user.id).catch(() => []),
        ]);
        const peopleById = new Map(people.map((person) => [person.id, person]));
        const selfPersonId = profile?.self_person_id || "";
        const applySelfNickname = (person) => {
          if (!person || person.id !== selfPersonId) {
            return person;
          }

          return {
            ...person,
            display_name: profile?.display_name || person.display_name,
          };
        };
        const savedStudentPeople = people
          .filter((person) => person.role === "student")
          .map(applySelfNickname);
        const savedInstructorPeople = people
          .filter((person) => person.role === "cfi")
          .map(applySelfNickname);
        const certificatePilots = certificates
          .filter((certificate) => certificate.certificate_type === "pilot")
          .map((certificate) => {
            const person = peopleById.get(certificate.person_id);
            return person
              ? {
                  ...applySelfNickname(person),
                  person_id: person.id,
                  cert_number: certificate.certificate_number || person.cert_number,
                }
              : null;
          })
          .filter(Boolean);
        const certificateInstructors = certificates
          .filter((certificate) => (
            certificate.certificate_type === "flight_instructor" ||
            certificate.certificate_type === "ground_instructor"
          ))
          .map((certificate) => {
            const person = peopleById.get(certificate.person_id);
            return person
              ? {
                  ...applySelfNickname(person),
                  person_id: person.id,
                  cert_number: certificate.certificate_number || person.cert_number,
                  cert_exp_date: certificate.last_event_date || person.cert_exp_date,
                }
              : null;
          })
          .filter(Boolean);

        if (!cancelled) {
          const studentOptions = getUniqueSavedPeopleByName([
            ...savedStudentPeople,
            ...certificatePilots,
          ]);
          const instructorOptions = getUniqueSavedPeopleByName([
            ...savedInstructorPeople,
            ...certificateInstructors,
          ]);

          setSavedPeopleOptions(getUniqueSavedPeopleByName([
            ...studentOptions,
            ...instructorOptions,
          ]));
          setAircraftOptions(mergeAircraftOptions([...sharedAircraft, ...organizationAircraft], myAircraft));
        }
      } catch {
        if (!cancelled) {
          setSavedPeopleOptions([]);
          setAircraftOptions([]);
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

    const selectedStudent = savedPeopleOptions.find((person) => person.id === selectedStudentId);
    if (selectedStudent?.display_name) {
      setStudentName(selectedStudent.display_name);
    }
  }, [savedPeopleOptions, selectedStudentId, setStudentName]);

  useEffect(() => {
    if (!selectedInstructorId) {
      return;
    }

    const selectedInstructor = savedPeopleOptions.find((person) => person.id === selectedInstructorId);
    if (selectedInstructor?.display_name) {
      setInstructorName(selectedInstructor.display_name);
    }
  }, [savedPeopleOptions, selectedInstructorId, setInstructorName]);

  const handleStudentNameChange = useCallback((value) => {
    const selected = matchSavedPersonByName(savedPeopleOptions, value);
    setStudentName(value);
    setSelectedStudentId(selected?.id ?? "");
  }, [savedPeopleOptions, setSelectedStudentId, setStudentName]);

  const handleInstructorNameChange = useCallback((value) => {
    const selected = matchSavedPersonByName(savedPeopleOptions, value);
    setInstructorName(value);
    setSelectedInstructorId(selected?.id ?? "");
  }, [savedPeopleOptions, setInstructorName, setSelectedInstructorId]);

  const savedPersonNameOptions = useMemo(() => getUniqueSavedPeopleByName(savedPeopleOptions), [savedPeopleOptions]);
  const aircraftTailOptions = useMemo(() => getUniqueAircraftByTail(aircraftOptions), [aircraftOptions]);
  const selectedSavedAircraft = useMemo(
    () => matchAircraftByTail(aircraftOptions, aircraftId),
    [aircraftId, aircraftOptions]
  );
  const selectedAircraftDueMeta = useMemo(
    () => getAircraftDueMeta(selectedSavedAircraft, mxNow),
    [mxNow, selectedSavedAircraft]
  );

  useEffect(() => {
    if (!selectedSavedAircraft?.is_saved || selectedSavedAircraft.hundred_hour_due_hours == null) {
      return;
    }

    const selectedTail = normalizeTailNumber(selectedSavedAircraft.tail_number || selectedSavedAircraft.name);
    const nextMxDue = String(selectedSavedAircraft.hundred_hour_due_hours);
    setBrief((current) => {
      if (
        current?.aircraftDueSourceTail === selectedTail &&
        String(current?.mxDue ?? "").trim()
      ) {
        return current;
      }

      return {
        ...current,
        mxDue: nextMxDue,
        aircraftDueSourceTail: selectedTail,
      };
    });
  }, [selectedSavedAircraft, setBrief]);

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

    setBrief((current) => ({
      ...current,
      fuel: wbResult ? fuelInputValue || current.fuel || "" : "",
      fuelTime:
        calculatedFuelTime !== null
          ? calculatedFuelTime.toFixed(2)
          : "",
      grossWeight: wbResult?.total_weight
        ? wbResult.total_weight.toFixed(1)
        : "",
      wbCg: wbResult?.cg ? wbResult.cg.toFixed(2) : "",
      withinLimitsConfirmed:
        typeof wbResult?.status === "string"
          ? wbResult.status === "within"
          : false,
    }));
  }, [briefSelectedAircraft, briefWb, calculatedFuelTime, setBrief]);

  const riskGates = useMemo(() => {
  const gates = [];

  const isSolo = staticChecked["static-solo-flight"];
  const isPreSolo = staticChecked["static-training-pre-solo"];
  const isSVFR = dynamicChecked["dynamic-svfr-dual"];
  const isNight = dynamicChecked["dynamic-night-flight"];
  const nightCurrency = staticChecked["static-last-night-30"];

  const isStall = dynamicChecked["dynamic-stalls-airplane"];
  const isSpin = dynamicChecked["dynamic-spins-airplane"];
  const isAutorotation = dynamicChecked["dynamic-full-down-auto-heli"];
  const cfiStressScore = parseInt(cfiStress, 10) || 0;

  if (isSVFR && isSolo) {
    gates.push("SVFR possibility with SOLO flight - Chief Pilot review required.");
  }

  if (isNight && nightCurrency) {
    gates.push("Night flight with last night flight > 30 days - mitigation required.");
  }

  if (cfiStressScore > 2) {
    gates.push("CFI stress factors above 2 - NO FLIGHT until reduced.");
  }

  if (totalRisk > 15) {
    gates.push("Total risk score above 15 - adjust plan or obtain required approval before release.");
  }

  if (flightRules === "IFR" && isPreSolo) {
    gates.push("IFR selected with pre-solo student - confirm training intent and approval level.");
  }

  const anyIFR = Object.values(metarByIcaoData || {}).some(
    (m) => m?.flight_rules === "IFR" || m?.flight_rules === "LIFR"
  );
  if (anyIFR) {
    gates.push("Destination/route reporting IFR/LIFR - evaluate alternate and minima.");
  }

  const closureAirport = Object.entries(notamByIcao || {}).find(
    ([, g]) => g?.closures?.length > 0
  );
  if (closureAirport) {
    gates.push(
      `Airport operational closure NOTAM present (${closureAirport[0]}) - verify runway/taxiway availability.`
    );
  }

  if (isAutorotation) {
    gates.push(
      "Full down autorotation selected - brief recovery altitude, entry/termination criteria, and go-around procedure."
    );
  }

  if (isStall) {
    gates.push(
      "Stalls selected - brief recovery altitude, configuration, and standard recovery procedure."
    );
  }

  if (isSpin) {
    gates.push(
      "Spins selected - brief entry criteria, minimum recovery altitude, and recovery procedure."
    );
  }

  return gates;
}, [
  staticChecked,
  dynamicChecked,
  cfiStress,
  totalRisk,
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
    [routeMode, setArrival, setDeparture]
  );

  const onSelectLocal = useCallback(() => {
    setRouteMode("local");
    setArrival(departure);
    setStops([""]);
  }, [departure, setArrival, setRouteMode, setStops]);

  const onSelectCross = useCallback(() => {
    setRouteMode("cross");
    setArrival("");
    setStops((prev) => (prev.length ? prev : [""]));
  }, [setArrival, setRouteMode, setStops]);

  const addStop = useCallback(() => setStops((prev) => [...prev, ""]), [setStops]);
  const removeStop = useCallback((idx) => {
    setStops((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      return next.length ? next : [""];
    });
  }, [setStops]);
  const updateStop = useCallback((idx, val) => {
    setStops((prev) => prev.map((s, i) => (i === idx ? val : s)));
  }, [setStops]);

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
  }, [
    airportsForWxAndNotams,
    departure,
    setAirmets,
    setAirsigmetSummary,
    setDaResult,
    setMetarByIcaoData,
    setOutsideTemp,
    setPireps,
    setSigmets,
    setTafByIcao,
    setWeatherError,
    setWeatherLoading,
    setWeatherResults,
  ]);

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
  }, [
    airportsForWxAndNotams,
    setNotamAirportOpen,
    setNotamByIcao,
    setNotamCategoryOpen,
    setNotamError,
    setNotamLoading,
  ]);

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
    const normalizedAltimeterInHg = normalizeAltimeterInHg(altimeterInHg);

    if (Number.isNaN(elevationFt)) {
      setDaResult("Please enter field elevation.");
      return;
    }
    if (normalizedAltimeterInHg == null || Number.isNaN(temperatureC)) {
      setDaResult('Weather data is missing or invalid. Please click "Fetch Weather" first.');
      return;
    }

    const { densityAltitude, pressureAltitude, isaTemp } = calcDensityAltitude({
      elevationFt,
      temperatureC,
      altimeterInHg: normalizedAltimeterInHg,
    });
    setDaResult(
      `Estimated Density Altitude: ${densityAltitude.toLocaleString()} ft using ${daSourceResult?.icao || "latest METAR"} (${normalizedAltimeterInHg.toFixed(2)} inHg / ${temperatureC}°C, PA ${pressureAltitude.toLocaleString()} ft, ISA ${isaTemp.toFixed(1)}°C)`
    );
  }, [fieldElevation, outsideTemp, daSourceResult, setDaResult]);

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
      ...(parseInt(imsafe, 10) ? [`- Student stress factors / IMSAFE [${parseInt(imsafe, 10)}]`] : []),
      ...(parseInt(cfiStress, 10) ? [`- CFI stress factors / IMSAFE [${parseInt(cfiStress, 10)}]`] : []),
    ];
    const dynamicLines = [
      ...checkedItemsLines(DYNAMIC_RISKS, dynamicChecked),
      ...(parseInt(otherRisks, 10)
        ? [`- Other: ${otherRiskLabel || "Other Risks"} [${parseInt(otherRisks, 10)}]`]
        : []),
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
Saved Aircraft Due: ${selectedAircraftDueMeta.label} - ${selectedAircraftDueMeta.report}

🪨 Static Risk:
${staticLines.length ? staticLines.join("\n") : "- None"}
Total Static Risk Score: ${staticScore}

🌪️ Dynamic Risk:
${dynamicLines.length ? dynamicLines.join("\n") : "- None"}
Total Dynamic Risk Score: ${dynamicScore}

Total Risk Score: ${totalRisk}
Category: ${riskMeta.level}
Recommendation: ${riskMeta.recommendation}

Risk Mitigation (RM):
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
    wbCg,
    fuelTime,
    mxRemaining,
    selectedAircraftDueMeta,
    staticChecked,
    dynamicChecked,
    imsafe,
    cfiStress,
    otherRiskLabel,
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

  const getMissingStepFields = useCallback((stepIndex) => {
    const missing = [];

    if (stepIndex === 0) {
      if (!studentName.trim()) missing.push("Student name");
      if (!instructorName.trim()) missing.push("Instructor name");
      if (!flightDate) missing.push("Flight date");
      if (!etd) missing.push("ETD");
      if (!eta) missing.push("ETA");
      if (!aircraftId.trim()) missing.push("Aircraft tail number");
    }

    if (stepIndex === 1) {
      if (!String(mxNow).trim()) missing.push("MX time now");
      if (!String(mxDue).trim()) missing.push("Next MX due");
      if (briefSelectedAircraft && !withinLimitsConfirmed) {
        missing.push("Weight and balance within limits");
      }
    }

    if (stepIndex === 2) {
      if (!departure.trim()) missing.push("Departure point");
      if (!arrival.trim()) missing.push("Arrival point");
      if (!lessonPractice.trim()) missing.push("Lesson practice");
      if (routeMode === "cross") {
        stops.forEach((stop, index) => {
          if (!String(stop ?? "").trim()) {
            missing.push(`Intermediate stop ${index + 1}`);
          }
        });
      }
    }

    if (stepIndex === 4) {
      if (!riskComments.trim()) missing.push("Risk discussion / comments");
    }

    return missing;
  }, [
    aircraftId,
    arrival,
    briefSelectedAircraft,
    departure,
    eta,
    etd,
    flightDate,
    instructorName,
    lessonPractice,
    mxDue,
    mxNow,
    riskComments,
    routeMode,
    stops,
    studentName,
    withinLimitsConfirmed,
  ]);

  const confirmMissingStepFields = useCallback((stepIndex) => {
    const missing = getMissingStepFields(stepIndex);
    if (missing.length === 0) {
      return true;
    }

    return window.confirm(
      `The following information has not been entered:\n\n${missing
        .map((field) => `- ${field}`)
        .join("\n")}\n\nContinue anyway?`
    );
  }, [getMissingStepFields]);

  const handleNextStep = () => {
    if (!confirmMissingStepFields(currentStep)) {
      return;
    }

    goToNextStep();
  };

  const handleGenerateReport = () => {
    if (!confirmMissingStepFields(currentStep)) {
      return;
    }

    generateReport();
  };

  return (
    <div className="flightbrief-body" ref={topRef}>
      <div className="flightbrief-header">
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
          {session?.user?.id ? (
            <>
              <datalist id="flightBriefSavedPilots">
                {savedPersonNameOptions.map((person) => (
                  <option key={person.id} value={person.display_name} />
                ))}
              </datalist>
              <datalist id="flightBriefSavedInstructors">
                {savedPersonNameOptions.map((person) => (
                  <option key={person.id} value={person.display_name} />
                ))}
              </datalist>
              <datalist id="flightBriefSavedAircraft">
                {aircraftTailOptions.map((aircraft) => (
                  <option
                    key={aircraft.id}
                    value={aircraft.tail_number || aircraft.name}
                  />
                ))}
              </datalist>
            </>
          ) : null}
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
                        list={session?.user?.id ? "flightBriefSavedPilots" : undefined}
                        value={studentName}
                        onChange={(e) => handleStudentNameChange(e.target.value)}
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
                        list={session?.user?.id ? "flightBriefSavedInstructors" : undefined}
                        value={instructorName}
                        onChange={(e) => handleInstructorNameChange(e.target.value)}
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
                        list={session?.user?.id ? "flightBriefSavedAircraft" : undefined}
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
                </div>
              </div>

              <div className="flightbrief-desktop-form">
              <div className="inline-label-input">
                <label className="label" htmlFor="studentName">Student Name(Pilot Flying):</label>
                <input
                  type="text"
                  id="studentName"
                  className="input-field"
                  list={session?.user?.id ? "flightBriefSavedPilots" : undefined}
                  value={studentName}
                  onChange={(e) => handleStudentNameChange(e.target.value)}
                  required
                />
              </div>

              <div className="inline-label-input">
                <label className="label" htmlFor="instructorName">Instructor Name(Pilot In Command):</label>
                <input
                  type="text"
                  id="instructorName"
                  className="input-field"
                  list={session?.user?.id ? "flightBriefSavedInstructors" : undefined}
                  value={instructorName}
                  onChange={(e) => handleInstructorNameChange(e.target.value)}
                  required
                />
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
                    list={session?.user?.id ? "flightBriefSavedAircraft" : undefined}
                    value={aircraftId}
                    onChange={(e) => setAircraftId(e.target.value)}
                    placeholder="e.g. N6758H"
                  />
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
                <div className="flightbrief-kpi">
                  <span>Fuel Time</span>
                  <strong className={fuelTimeMeta.ok === false ? "is-alert" : fuelTimeMeta.ok === true ? "is-ok" : ""}>
                    {fuelTimeMeta.label}
                  </strong>
                  <small>{fuelTimeMeta.detail}</small>
                </div>
                <div className="inline-label-input inline-label-input-compact flightbrief-aircraft-inlineField">
                  <label className="label" htmlFor="mx-now">Mx Time Now:</label>
                  <input type="number" id="mx-now" className="input-field" value={mxNow} onChange={(e) => handleMxNowChange(e.target.value)} placeholder="Check Aircraft" />
                </div>
                <div className="inline-label-input inline-label-input-compact flightbrief-aircraft-inlineField">
                  <label className="label" htmlFor="mx-due">Next Mx Due:</label>
                  <input type="number" id="mx-due" className="input-field" value={mxDue} onChange={(e) => handleMxDueChange(e.target.value)} placeholder="" />
                </div>
                <div className="flightbrief-kpi">
                  <span>MX Remaining</span>
                  <strong className={mxRemainingMeta.ok === false ? "is-alert" : mxRemainingMeta.ok === true ? "is-ok" : ""}>
                    {mxRemainingMeta.label}
                  </strong>
                  <small>{mxRemainingMeta.detail}</small>
                </div>
                <div className="flightbrief-kpi flightbrief-maintenance-due">
                  <span>Saved due</span>
                  <strong
                    className={
                      selectedAircraftDueMeta.ok === false
                        ? "is-alert"
                        : selectedAircraftDueMeta.ok === true
                          ? "is-ok"
                          : ""
                    }
                  >
                    {selectedAircraftDueMeta.label}
                  </strong>
                  <small>{selectedAircraftDueMeta.detail}</small>
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
              <div className="flightbrief-riskInstructions" aria-label="Flight risk assessment instructions">
                <strong>Flight Risk Assessment Tool</strong>
                <p>
                  Complete before each flight. Any risk shall be mitigated as low as reasonably possible.
                  If unable to mitigate risks at the pilot&apos;s level, adjust plan of action or seek the
                  appropriate approval level for discussion and release.
                </p>
                <p>Cross out any specific risk that is not applicable.</p>
              </div>
              <div className="flightbrief-mobile-settings">
                <div className="settings-card">
                  <h3 className="settings-cardTitle">Static Risk</h3>
                  <div className="settings-checklist">
                    {STATIC_RISKS.map((r) => (
                      <label className="settings-checkRow" key={r.id} htmlFor={`mobile-${r.id}`}>
                        <RiskItemCopy risk={r} className="settings-checkCopy" />
                        <input
                          id={`mobile-${r.id}`}
                          type="checkbox"
                          checked={!!staticChecked[r.id]}
                          onChange={(e) => setStaticChecked((prev) => ({ ...prev, [r.id]: e.target.checked }))}
                        />
                      </label>
                    ))}
                    <EditableInfoRow
                      label="Student Stress Factors (IMSAFE) - 1 for each"
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
                    <EditableInfoRow
                      label="CFI Stress Factors (IMSAFE) - 1 for each / NO FLIGHT if above 2"
                      value={formatDisplayValue(cfiStress, "0")}
                      rowKey="cfiStress"
                      editingKey={mobileEditingField}
                      setEditingKey={setMobileEditingField}
                      renderEditor={(close) => (
                        <input
                          autoFocus
                          type="number"
                          min="0"
                          max="6"
                          value={cfiStress}
                          onChange={(e) => setCfiStress(e.target.value)}
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
                        <RiskItemCopy risk={r} className="settings-checkCopy" />
                        <input
                          id={`mobile-${r.id}`}
                          type="checkbox"
                          checked={!!dynamicChecked[r.id]}
                          onChange={(e) => setDynamicChecked((prev) => ({ ...prev, [r.id]: e.target.checked }))}
                        />
                      </label>
                    ))}
                    <EditableInfoRow
                      label="Other:"
                      value={formatDisplayValue(otherRiskLabel, "Not set")}
                      rowKey="otherRiskLabel"
                      editingKey={mobileEditingField}
                      setEditingKey={setMobileEditingField}
                      renderEditor={(close) => (
                        <input
                          autoFocus
                          value={otherRiskLabel}
                          onChange={(e) => setOtherRiskLabel(e.target.value)}
                          onBlur={close}
                        />
                      )}
                    />
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
                  <div className="settings-summaryCopy">
                    Static {staticScore} + Dynamic {dynamicScore}
                  </div>
                  <div className="settings-summaryValue">{totalRisk}</div>
                  <div className="settings-summaryMeta" style={{ color: riskMeta.color }}>
                    {riskMeta.level}
                  </div>
                  <p className="settings-summaryCopy">{riskMeta.recommendation}</p>
                </div>

                <div className="settings-card">
                  <h3 className="settings-cardTitle">Risk Mitigation (RM)</h3>
                  <textarea
                    rows="4"
                    className="input-field"
                    value={riskComments}
                    onChange={(e) => setRiskComments(e.target.value)}
                    placeholder="List RM in place - required for approval"
                  />
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
                        <RiskItemCopy risk={r} />
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
                    <label htmlFor="imsafe-risk">Student Stress Factors (IMSAFE) - 1 for each</label>
                    <input type="number" id="imsafe-risk" min="0" max="6" value={imsafe} onChange={(e) => setImsafe(e.target.value)} />
                  </div>
                  <div className="risk-item risk-item-number">
                    <label htmlFor="cfi-stress-risk">CFI Stress Factors (IMSAFE) - 1 for each / NO FLIGHT if above 2</label>
                    <input type="number" id="cfi-stress-risk" min="0" max="6" value={cfiStress} onChange={(e) => setCfiStress(e.target.value)} />
                  </div>
                  <div className="flightbrief-riskSubtotal">
                    <span>Subtotal Static Risks</span>
                    <strong>{staticScore}</strong>
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
                      <label className={`risk-item${r.tone ? ` risk-item-${r.tone}` : ""}`} key={r.id} htmlFor={r.id}>
                        <RiskItemCopy risk={r} />
                        <input
                          type="checkbox"
                          id={r.id}
                          checked={!!dynamicChecked[r.id]}
                          onChange={(e) => setDynamicChecked((prev) => ({ ...prev, [r.id]: e.target.checked }))}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="risk-item risk-item-other">
                    <label htmlFor="other-risk-label">Other:</label>
                    <input
                      id="other-risk-label"
                      value={otherRiskLabel}
                      onChange={(e) => setOtherRiskLabel(e.target.value)}
                      placeholder="Specific risk"
                    />
                  </div>
                  <div className="risk-item risk-item-number">
                    <label htmlFor="other-risk">Other Risks</label>
                    <input id="other-risk" type="number" min="0" max="5" value={otherRisks} onChange={(e) => setOtherRisks(e.target.value)} />
                  </div>
                  <div className="flightbrief-riskSubtotal">
                    <span>Subtotal Dynamic Risks</span>
                    <strong>{dynamicScore}</strong>
                  </div>
                </div>
              </div>

              <div className="section inline-label-input">
                <label className="label" htmlFor="riskComments"><strong>Risk Mitigation (RM)</strong></label>
                <textarea id="riskComments" rows="4" className="input-field" value={riskComments} onChange={(e) => setRiskComments(e.target.value)} placeholder="List RM in place - required for approval" />
              </div>

              <div className="flightbrief-riskSummary">
                <div className="flightbrief-riskBadge">
                  <span>Total Risk</span>
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
          <button type="button" className="flightbrief-navButton primary" onClick={handleGenerateReport}>
            <span className="flightbrief-navButtonDesktop">Generate Flight Brief Report</span>
            <span className="flightbrief-navButtonMobile" aria-hidden="true">✓</span>
          </button>
        ) : (
          <button type="button" className="flightbrief-navButton primary" onClick={handleNextStep}>
            <span className="flightbrief-navButtonDesktop">Next</span>
            <span className="flightbrief-navButtonMobile" aria-hidden="true">›</span>
          </button>
        )}
      </div>
    </div>
  );
}
