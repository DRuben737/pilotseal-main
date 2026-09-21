"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { UsDateInput } from "@/components/forms/UsDateInput";
import { formatUsDate } from "@/lib/date-format";
import { useOrganization } from "@/components/organizations/OrganizationProvider";
import { fetchSavedPeople } from "@/lib/saved-people";
import { fetchPersonCertificates } from "@/lib/person-certificates";
import { fetchCurrentProfile } from "@/lib/profile";
import { fetchMyStudentCandidates } from "@/lib/student-candidates";
import { getSupabaseClient } from "@/lib/supabase";
import { useToolState } from "@/stores/toolState";
import {
  fetchActiveOrganizationAircraft,
  fetchMyAircraft,
  fetchSharedAircraft,
  parseAircraftStations,
} from "@/lib/aircraft";
import {
  createAndFinalizeFlightBrief,
  fetchAircraftInspectionAssignments,
  fetchFlightBriefById,
  finalizeFlightBrief,
  updateFlightBriefDraft,
} from "@/lib/preflight";
import WeightBalanceCalculator from "./WeightBalanceCalculator";
import {
  HUMAN_FACTOR_FIELDS,
  humanFactorReportLines,
  humanFactorReviewItems,
  humanFactorSnapshot,
  loadHumanFactorsForDraft,
  normalizeHumanFactors,
  scoreHumanFactors,
} from "@/lib/flight-brief-human-factors.mjs";
import {
  FLIGHT_NATURES,
  FLIGHT_RISK_MODEL_VERSION,
  answersForFlightNature,
  flightRiskSnapshot,
  isFlightNature,
  loadFlightRiskAnswersForDraft,
  normalizeFlightRiskAnswers,
  scoreFlightRisk,
} from "@/lib/flight-brief-risk-model.mjs";
import {
  MANEUVER_FACTOR_IDS,
  PAVE_SECTIONS,
  firstIncompleteRiskQuestion,
  isRiskSectionComplete,
  isRiskQuestionAnswered,
  maneuverScreenAnswer,
  paveSectionForFactor,
  riskScoreBreakdown,
  riskQuestions,
} from "@/lib/flight-brief-risk-flow.mjs";

/** ------------------ constants ------------------ */
const EMPTY_STOPS = Object.freeze([""]);
const EMPTY_ARRAY = Object.freeze([]);
const EMPTY_OBJECT = Object.freeze({});
const AI_RISK_INPUT_KEYS = new Set([
  "flightNature", "flightRules", "flightDate", "etd", "eta", "aircraftId", "fuel", "fuelTime",
  "routeMode", "departure", "arrival", "stops", "lessonPractice", "fieldElevation", "outsideTemp",
  "daResult", "weatherNotes", "metarByIcaoData", "tafByIcao", "airsigmetSummary", "airmets", "sigmets",
  "pireps", "notamByIcao", "grossWeight", "wbCg", "withinLimitsConfirmed", "mxNow", "mxDue",
  "humanFactors", "flightRiskAnswers", "otherRiskLabel", "otherRisks", "riskComments",
]);

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

function getTodayUtcMs(referenceDate) {
  if (referenceDate) {
    const parsed = parseDueDateMs(referenceDate);
    if (parsed !== null) return parsed;
  }
  const today = new Date();
  return Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
}

function formatDaysUntil(dueMs, referenceMs) {
  if (dueMs === null) return "";
  const days = Math.ceil((dueMs - referenceMs) / 86400000);
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
  if (days === 0) return "Due today";
  return `${days} day${days === 1 ? "" : "s"}`;
}

function getOperationalStatusCopy(status) {
  switch (status) {
    case "grounded":
      return "Grounded";
    case "in_maintenance":
      return "In maintenance";
    case "away":
      return "Away or unavailable";
    default:
      return "Unavailable";
  }
}

function getAircraftDueMeta(aircraft, mxNow, referenceDate) {
  if (!aircraft || (!aircraft.is_saved && aircraft.source !== "organization")) {
    return {
      label: "--",
      detail: "Select a saved aircraft",
      ok: null,
      report: "(none saved)",
      items: [],
      dispatchBlocked: false,
      blockingReason: "",
    };
  }

  const todayMs = getTodayUtcMs(referenceDate);
  const items = [];
  let hasExpired = false;
  let needsMxTime = false;
  let dispatchBlocked = false;
  let blockingReason = "";

  if (aircraft.operational_status && aircraft.operational_status !== "available") {
    hasExpired = true;
    dispatchBlocked = true;
    const statusLabel = getOperationalStatusCopy(aircraft.operational_status);
    const statusNote = String(aircraft.operational_status_note ?? "").trim();
    blockingReason = `${statusLabel}${statusNote ? ` — ${statusNote}` : ""}`;
    items.push(blockingReason);
  }

  if (aircraft.hundred_hour_due_hours != null) {
    const currentMx = parseFloat(String(mxNow ?? ""));
    if (Number.isFinite(currentMx)) {
      const remainingHours = Number(aircraft.hundred_hour_due_hours) - currentMx;
      const isCurrent = remainingHours >= 0;
      hasExpired = hasExpired || !isCurrent;
      items.push(
        `100hr · ${Math.abs(remainingHours).toFixed(1)} hr${isCurrent ? "" : " overdue"}`
      );
    } else {
      needsMxTime = true;
      items.push("100hr · Tach required");
    }
  }

  [
    ["Annual", aircraft.annual_due_date],
    ["91.411", aircraft.static_due_date],
    ["91.413", aircraft.transponder_due_date],
    ["ELT", aircraft.elt_due_date],
    ["ADS-B", aircraft.adsb_due_date],
    ["Registration", aircraft.registration_due_date],
  ].forEach(([label, value]) => {
    if (!value) {
      return;
    }

    const dueMs = parseDueDateMs(value);
    const isCurrent = dueMs === null || dueMs >= todayMs;
    hasExpired = hasExpired || !isCurrent;
    const remaining = formatDaysUntil(dueMs, todayMs);
    items.push(`${label}${remaining ? ` · ${remaining}` : ""}`);
  });

  if (items.length === 0) {
    return {
      label: "--",
      detail: "No due info saved",
      ok: null,
      report: "(none saved)",
      items: [],
      dispatchBlocked: false,
      blockingReason: "",
    };
  }

  return {
    label: dispatchBlocked
      ? "Do not fly"
      : hasExpired
        ? "Review required"
        : needsMxTime
          ? "Enter current time"
          : "Ready",
    detail: items.join(" · "),
    ok: hasExpired ? false : needsMxTime ? null : true,
    report: items.join("; "),
    items,
    dispatchBlocked,
    blockingReason,
  };
}

function formatCustomInspection(item, mxNow, referenceDate) {
  const definition = item?.definition ?? {};
  const name = definition.name || "Custom inspection";
  const basis = definition.basis || "calendar";
  const details = [];
  let ok = true;

  if (item?.due_date) {
    const dueMs = parseDueDateMs(item.due_date);
    const referenceMs = getTodayUtcMs(referenceDate);
    const dateOk = dueMs === null || dueMs >= referenceMs;
    ok = ok && dateOk;
    details.push(`${dateOk ? "due" : "expired"} ${item.due_date}`);
  }

  if (item?.due_meter != null) {
    const current = parseFloat(String(mxNow ?? ""));
    if (Number.isFinite(current)) {
      const remaining = Number(item.due_meter) - current;
      const meterOk = remaining >= 0;
      ok = ok && meterOk;
      details.push(`${remaining.toFixed(1)} hr remaining`);
    } else {
      details.push(`due at ${item.due_meter}`);
    }
  }

  return {
    id: item.id,
    label: name,
    detail: `${String(basis).replaceAll("_", " ")} · ${details.join(" / ") || "No due limit"}`,
    ok,
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
  defaultOpen = false,
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

function RiskQuestionCard({ question, answer, onAnswer, roleLabel }) {
  const prompt = question.type === "human" ? question.field.prompt
    : question.type === "screen" ? "Special maneuvers planned?"
    : question.factor.prompt ?? question.factor.label;
  const choices = question.type === "human" ? question.field.choices
    : question.type === "screen"
      ? ["None planned", "Yes, some planned"]
      : question.factor.choices;
  return (
    <fieldset className="flightbrief-question" id="risk-active-question">
      <legend tabIndex={-1} id="risk-question-title">
        {question.type === "human" ? <span className="flightbrief-questionEyebrow">{roleLabel} · IMSAFE · {question.field.label}</span> : null}
        {prompt}
      </legend>
      <div className="flightbrief-choiceList">
        {choices.map((choice, index) => {
          const value = question.type === "screen" ? index === 0 ? "none" : "planned" : index;
          return (
            <label key={value} className="flightbrief-choice">
              <input type="radio" name={question.key} value={value} checked={answer === value} onChange={() => onAnswer(value)} />
              <span>{choice}</span>
            </label>
          );
        })}
        {question.type === "factor" && question.factor.id === "static-inspection-under-20" ? (
          <label className="flightbrief-choice">
            <input type="radio" name={question.key} value="na" checked={answer === "na"} onChange={() => onAnswer("na")} />
            <span>No hour-based inspection applies</span>
          </label>
        ) : null}
      </div>
    </fieldset>
  );
}

function RiskAnsweredSummary({ question, answer, onEdit, roleLabel }) {
  const title = question.type === "human" ? `${roleLabel} · ${question.field.label}`
    : question.type === "screen" ? "Special training maneuvers" : question.factor.label;
  const value = question.type === "human" ? question.field.choices[answer]
    : question.type === "screen" ? answer === "none" ? "None planned" : "Some maneuvers planned"
    : answer === "na" ? "No hour-based inspection applies" : question.factor.choices[answer];
  return <button type="button" className="flightbrief-answerSummary" onClick={onEdit} aria-label={`Edit ${title}: ${value}`}><span>{title}</span><strong>{value}</strong></button>;
}

function FinalRiskScore({ assessment, breakdown, remaining }) {
  if (!assessment.complete) {
    return <section className="flightbrief-finalScore is-incomplete" aria-live="polite">
      <span>INCOMPLETE</span>
      <strong>{remaining} {remaining === 1 ? "answer" : "answers"} remaining</strong>
      <p>Finish the assessment before relying on a score or AI discussion.</p>
    </section>;
  }
  return (
    <section className="flightbrief-finalScore" aria-labelledby="final-risk-score-title" aria-live="polite">
      <div className="flightbrief-finalScoreMain">
        <div><span>Total score</span><strong id="final-risk-score-title">{assessment.totalRisk}</strong></div>
        <div><span>Risk level</span><strong style={{ color: assessment.category.color }}>{assessment.category.level}</strong></div>
      </div>
      <div className="flightbrief-scoreBands" aria-label="Risk score ranges"><span>0–12 Low risk</span><span>13–24 Mitigation required</span><span>25+ Further review</span></div>
      <dl className="flightbrief-paveScores">
        {PAVE_SECTIONS.map((section) => <div key={section.id}><dt>{section.letter} · {section.title}</dt><dd>{breakdown.sections[section.id]}</dd></div>)}
        <div><dt>Additional risk</dt><dd>{breakdown.additional}</dd></div>
      </dl>
      <div className="flightbrief-scoreContributions">
        <h4>Score details</h4>
        {breakdown.contributions.length ? <ul>{breakdown.contributions.map((item) => <li key={item.id} className={item.severity === 2 ? "is-significant" : ""}>
          <div><strong>{item.label}</strong><span>{item.answer}</span></div><b>+{item.score}</b>
        </li>)}</ul> : <p>No scored concerns.</p>}
      </div>
    </section>
  );
}

function AiRiskDiscussion({ result, savedText }) {
  if (!result) return savedText ? <pre className="flightbrief-aiSaved">{savedText}</pre> : null;
  const evidence = new Map(result.evidence.map((item) => [item.id, item]));
  return <section className="flightbrief-aiResult" aria-labelledby="ai-risk-title">
    <span>AI-generated decision support</span>
    <h3 id="ai-risk-title">Risk discussion</h3>
    <p>{result.discussion.overview}</p>
    {result.discussion.priorities.map((item, index) => <article key={`${item.title}-${index}`}>
      <h4>{index + 1}. {item.title}</h4>
      <dl>
        <div><dt>Evidence</dt><dd>{item.evidenceIds.map((id) => evidence.get(id)).filter(Boolean).map((entry) => <span key={entry.id}><strong>{entry.label}:</strong> {entry.value}</span>)}</dd></div>
        <div><dt>Possible consequences</dt><dd>{item.possibleConsequences}</dd></div>
        <div><dt>Compounding risk</dt><dd>{item.compoundingEffect}</dd></div>
        <div><dt>Priority actions</dt><dd>{item.mitigations.join(" · ")}</dd></div>
        <div><dt>Reassess when</dt><dd>{item.recheckTriggers.join(" · ")}</dd></div>
      </dl>
    </article>)}
    <p><strong>Residual risk:</strong> {result.discussion.residualRisk}</p>
    <small>Decision aid only — not a determination of regulatory compliance, weather safety, airworthiness, or go/no-go.</small>
  </section>;
}

function PaveRiskBoard({ letter, title, detail, complete, active, onOpen, children }) {
  return (
    <section className="flightbrief-paveBoard" aria-label={`${letter} — ${title}`}>
      <button type="button" className="flightbrief-paveBoardHead" aria-expanded={active} onClick={onOpen}>
        <span className="flightbrief-paveLetter" aria-hidden="true">{letter}</span>
        <div>
          <span className="flightbrief-paveTitle">{title}</span>
          <p>{detail}</p>
        </div>
        <span className="flightbrief-paveStatus">{complete ? "Done" : active ? "In progress" : "Open"}</span>
      </button>
      {active ? children : null}
    </section>
  );
}

function formatDisplayDate(value) {
  return formatUsDate(value, "Not set");
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
  const { activeOrganization } = useOrganization();
  const { brief, setBrief, briefWb, briefSelectedAircraft } = useToolState();
  const [aiRiskResult, setAiRiskResult] = useState(null);
  const [aiRiskLoading, setAiRiskLoading] = useState(false);
  const [aiRiskError, setAiRiskError] = useState("");
  const stepperRef = useRef(null);
  const stepButtonRefs = useRef([]);
  const setBriefField = useCallback(
    (key, valueOrUpdater) => {
      if (AI_RISK_INPUT_KEYS.has(key)) {
        setAiRiskResult(null);
        setAiRiskError("");
      }
      setBrief((current) => {
        const previousValue = current?.[key];
        const nextValue =
          typeof valueOrUpdater === "function" ? valueOrUpdater(previousValue) : valueOrUpdater;
        return {
          ...current,
          [key]: nextValue,
          ...(AI_RISK_INPUT_KEYS.has(key) ? { aiRiskDiscussion: "" } : {}),
          ...(key !== "currentStep" &&
          key !== "flightBriefDraftId" &&
          key !== "finalizedFlightBriefId" &&
          current?.finalizedFlightBriefId
            ? { flightBriefDraftId: "", finalizedFlightBriefId: "" }
            : {}),
        };
      });
    },
    [setBrief]
  );

  /** ---- core form ---- */
  const studentName = brief.studentName ?? "";
  const setStudentName = useCallback((value) => setBriefField("studentName", value), [setBriefField]);
  const instructorName = brief.instructorName ?? "";
  const setInstructorName = useCallback((value) => setBriefField("instructorName", value), [setBriefField]);
  const flightNature = isFlightNature(brief.flightNature) ? brief.flightNature : "";
  const flightNatureLabel = FLIGHT_NATURES.find((nature) => nature.id === flightNature)?.label ?? "Not set";
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
  const tafByIcao = brief.tafByIcao ?? EMPTY_OBJECT; // { ICAO: "ICAO: raw" }
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
  const meterType = "tach";
  const [recordSaving, setRecordSaving] = useState(false);
  const [recordStatus, setRecordStatus] = useState("");
  const [customInspections, setCustomInspections] = useState([]);
  const loadedDraftIdRef = useRef("");

  useEffect(() => {
    if (!session?.user?.id || loadedDraftIdRef.current || typeof window === "undefined") return;
    const draftId = new URLSearchParams(window.location.search).get("briefId") ?? "";
    if (!draftId) return;
    loadedDraftIdRef.current = draftId;
    let cancelled = false;
    async function loadDraft() {
      try {
        const record = await fetchFlightBriefById(draftId);
        if (record.created_by !== session.user.id || record.status !== "draft") {
          throw new Error("Only your own draft can be opened for editing.");
        }
        if (!cancelled) {
          const savedAssessment = loadHumanFactorsForDraft(record.brief_data);
          const savedFlightAssessment = loadFlightRiskAnswersForDraft(record.brief_data);
          const draftFlightAnswers = savedFlightAssessment.answers;
          setBrief((current) => ({
            ...current,
            ...record.brief_data,
            humanFactors: savedAssessment.answers,
            flightRiskAnswers: draftFlightAnswers,
            otherRisks: record.brief_data?.riskModelVersion >= 3 ? record.brief_data.otherRisks ?? 0 : 0,
            flightBriefDraftId: record.id,
            finalizedFlightBriefId: "",
          }));
          setPlannedManeuvers(maneuverScreenAnswer(draftFlightAnswers, record.brief_data?.flightNature) === "planned");
          setActiveRiskQuestion(firstIncompleteRiskQuestion(draftFlightAnswers, savedAssessment.answers, record.brief_data?.flightNature ?? ""));
          setLegacyHumanFactorsNotice(savedAssessment.requiresReassessment || savedFlightAssessment.requiresReassessment);
          setRecordStatus(`Editing revision ${record.revision_number}.`);
        }
      } catch (error) {
        if (!cancelled) {
          setRecordStatus(error instanceof Error ? error.message : "Unable to open this draft.");
        }
      }
    }
    void loadDraft();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, setBrief]);

  const handleMxNowChange = useCallback((value) => {
    setMxNow(value);
  }, [setMxNow]);

  const handleMxDueChange = useCallback((value) => {
    setMxDue(value);
  }, [setMxDue]);

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
      return { label: "--", detail: "Enter the current and next-due readings", ok: null };
    }

    return {
      label: `${mxRemaining.toFixed(1)} hr`,
      detail: mxRemaining >= 0 ? "Remaining at the current Tach reading" : "Maintenance limit exceeded",
      ok: mxRemaining >= 0,
    };
  }, [mxRemaining]);

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
  const humanFactors = useMemo(() => normalizeHumanFactors(brief.humanFactors), [brief.humanFactors]);
  const flightRiskAnswers = useMemo(() => normalizeFlightRiskAnswers(brief.flightRiskAnswers), [brief.flightRiskAnswers]);
  const [plannedManeuvers, setPlannedManeuvers] = useState(false);
  const [editingRiskNature, setEditingRiskNature] = useState(false);
  const [activeRiskQuestion, setActiveRiskQuestion] = useState(() => firstIncompleteRiskQuestion(
    normalizeFlightRiskAnswers(brief.flightRiskAnswers),
    normalizeHumanFactors(brief.humanFactors),
    isFlightNature(brief.flightNature) ? brief.flightNature : ""
  ));
  const [legacyHumanFactorsNotice, setLegacyHumanFactorsNotice] = useState(false);
  const [humanFactorContext, setHumanFactorContext] = useState(() => ({
    student: { sleepHours: "", awakeHours: "", timePressure: "" },
    cfi: { sleepHours: "", awakeHours: "", timePressure: "" },
  }));
  const setFlightNature = useCallback((value) => {
    const nextNature = isFlightNature(value) ? value : "";
    const updatedFlightAnswers = answersForFlightNature(flightRiskAnswers, nextNature);
    const updatedHumanAnswers = normalizeHumanFactors(humanFactors);
    if (nextNature !== "dual_training") {
      for (const field of HUMAN_FACTOR_FIELDS) updatedHumanAnswers.cfi[field.id] = null;
    }
    setBrief((current) => ({
      ...current,
      flightNature: nextNature,
      flightRiskAnswers: updatedFlightAnswers,
      humanFactors: updatedHumanAnswers,
      aiRiskDiscussion: "",
      ...(nextNature === "dual_training" ? {} : { instructorName: "", selectedInstructorId: "", lessonPractice: "" }),
      ...(current.finalizedFlightBriefId ? { flightBriefDraftId: "", finalizedFlightBriefId: "" } : {}),
    }));
    setPlannedManeuvers(false);
    setAiRiskResult(null);
    setAiRiskError("");
    setActiveRiskQuestion(firstIncompleteRiskQuestion(updatedFlightAnswers, updatedHumanAnswers, nextNature));
  }, [flightRiskAnswers, humanFactors, setBrief]);
  const setHumanFactorAnswer = useCallback((role, field, severity) => {
    const updated = { ...humanFactors, [role]: { ...humanFactors[role], [field]: severity } };
    setBriefField("humanFactors", updated);
    setActiveRiskQuestion(firstIncompleteRiskQuestion(flightRiskAnswers, updated, flightNature, plannedManeuvers));
  }, [flightRiskAnswers, flightNature, humanFactors, plannedManeuvers, setBriefField]);
  const setHumanFactorContextField = useCallback((role, field, value) => {
    setHumanFactorContext((previous) => ({
      ...previous,
      [role]: { ...previous[role], [field]: value },
    }));
  }, []);
  const otherRisks = brief.otherRisks ?? 0; // 0..2 severity
  const setOtherRisks = useCallback((value) => setBriefField("otherRisks", value), [setBriefField]);
  const otherRiskLabel = brief.otherRiskLabel ?? "";
  const setOtherRiskLabel = useCallback((value) => setBriefField("otherRiskLabel", value), [setBriefField]);
  const riskComments = brief.riskComments ?? "";
  const setRiskComments = useCallback((value) => setBriefField("riskComments", value), [setBriefField]);
  const aiRiskDiscussion = brief.aiRiskDiscussion ?? "";
  const currentStep = brief.currentStep ?? 0;
  const setCurrentStep = useCallback((value) => setBriefField("currentStep", value), [setBriefField]);
  const topRef = useRef(null);
  const [savedPilotOptions, setSavedPilotOptions] = React.useState([]);
  const [savedInstructorOptions, setSavedInstructorOptions] = React.useState([]);
  const [aircraftOptions, setAircraftOptions] = React.useState([]);
  const [mobileEditingField, setMobileEditingField] = React.useState(null);

  useEffect(() => {
    setMobileEditingField(null);
  }, [currentStep]);

  const setFlightRiskAnswer = useCallback((id, severity) => {
    const updated = { ...flightRiskAnswers, [id]: severity };
    if (id === "dynamic-night-flight") {
      updated["static-last-night-30"] = severity === 0 ? 0 : null;
    }
    setBriefField("flightRiskAnswers", updated);
    setActiveRiskQuestion(firstIncompleteRiskQuestion(updated, humanFactors, flightNature, plannedManeuvers));
  }, [flightRiskAnswers, flightNature, humanFactors, plannedManeuvers, setBriefField]);
  const setManeuverScreen = useCallback((value) => {
    const updated = { ...flightRiskAnswers };
    for (const id of MANEUVER_FACTOR_IDS) updated[id] = value === "none" ? 0 : null;
    setBriefField("flightRiskAnswers", updated);
    setPlannedManeuvers(value === "planned");
    setActiveRiskQuestion(firstIncompleteRiskQuestion(updated, humanFactors, flightNature, value === "planned"));
  }, [flightRiskAnswers, flightNature, humanFactors, setBriefField]);
  useEffect(() => {
    if (currentStep !== 4 || !activeRiskQuestion || activeRiskQuestion === "nature") return undefined;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(activeRiskQuestion === "review" ? "risk-section-review" : "risk-question-title");
      if (!target) return;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const bounds = target.getBoundingClientRect();
      if (bounds.top < 80 || bounds.bottom > window.innerHeight - 80) {
        target.scrollIntoView({ behavior: reducedMotion ? "instant" : "smooth", block: "center" });
      }
      if (activeRiskQuestion !== "review") target.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeRiskQuestion, currentStep]);
  const humanAssessment = useMemo(() => scoreHumanFactors(humanFactors, 0, 0, {
    activeRoles: flightNature === "dual_training" ? ["student", "cfi"] : ["student"],
    roleLabels: { student: flightNature === "dual_training" ? "Student / Pilot" : "Pilot" },
  }), [humanFactors, flightNature]);
  const flightAssessment = useMemo(() => scoreFlightRisk(flightRiskAnswers, humanAssessment, { label: otherRiskLabel, severity: Number(otherRisks) }, flightNature), [flightRiskAnswers, humanAssessment, otherRiskLabel, otherRisks, flightNature]);
  const staticScore = flightAssessment.staticScore;
  const dynamicScore = flightAssessment.dynamicScore;
  const totalRisk = flightAssessment.totalRisk;
  const riskMeta = flightAssessment.category;
  const hasSignificantConcern = flightAssessment.significant.length > 0 ||
    flightAssessment.otherSeverity === 2 ||
    humanAssessment.drivers.some((driver) => driver.severity === 2);
  const guidedQuestions = useMemo(() => riskQuestions(flightNature, flightRiskAnswers, plannedManeuvers), [flightNature, flightRiskAnswers, plannedManeuvers]);
  const activeGuidedQuestion = guidedQuestions.find((question) => question.key === activeRiskQuestion);
  const activePaveSection = activeGuidedQuestion?.section ?? (activeRiskQuestion === "review" ? "review" : null);
  const answeredGuidedCount = guidedQuestions.filter((question) =>
    isRiskQuestionAnswered(question, flightRiskAnswers, humanFactors, flightNature, plannedManeuvers)
  ).length;
  const remainingRiskAnswers = Math.max(0, guidedQuestions.length - answeredGuidedCount);
  const scoreBreakdown = useMemo(
    () => riskScoreBreakdown(flightAssessment, humanAssessment, otherRiskLabel),
    [flightAssessment, humanAssessment, otherRiskLabel]
  );
  const selectedRisk = useCallback((id) => flightAssessment.answers[id] === 1 || flightAssessment.answers[id] === 2, [flightAssessment.answers]);

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabaseClient();

    async function loadSavedPeopleOptions() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user?.id) {
          const sharedAircraft = await fetchSharedAircraft().catch(() => []);
          if (!cancelled) {
            setSavedPilotOptions([]);
            setSavedInstructorOptions([]);
            setAircraftOptions(mergeAircraftOptions(sharedAircraft, []));
          }
          return;
        }

        const [people, profile, certificates, studentCandidates, sharedAircraft, organizationAircraft, myAircraft] = await Promise.all([
          fetchSavedPeople(session.user.id),
          fetchCurrentProfile(session.user.id),
          fetchPersonCertificates(session.user.id).catch(() => []),
          fetchMyStudentCandidates().catch(() => []),
          fetchSharedAircraft().catch(() => []),
          fetchActiveOrganizationAircraft().catch(() => []),
          fetchMyAircraft(session.user.id).catch(() => []),
        ]);
        const peopleById = new Map(people.map((person) => [person.id, person]));
        const selfPersonId = profile?.self_person_id || "";
        const savedInstructorPeople = people
          .filter((person) => person.role === "cfi" || person.id === selfPersonId);
        const certificateInstructors = certificates
          .filter((certificate) => (
            certificate.certificate_type === "flight_instructor" ||
            certificate.certificate_type === "ground_instructor"
          ))
          .map((certificate) => {
            const person = peopleById.get(certificate.person_id);
            return person
              ? {
                  ...person,
                  person_id: person.id,
                  cert_number: certificate.certificate_number || person.cert_number,
                  cert_exp_date: certificate.last_event_date || person.cert_exp_date,
                }
              : null;
          })
          .filter(Boolean);

        if (!cancelled) {
          const studentOptions = studentCandidates
            .filter((candidate) => candidate.endorsement_ready && candidate.formal_name)
            .map((candidate) => ({
              id: candidate.identity_key,
              identity_key: candidate.identity_key,
              person_id: candidate.record_person_id,
              saved_person_id: candidate.saved_person_id,
              student_user_id: candidate.student_user_id,
              canonical_person_id: candidate.canonical_person_id,
              display_name: candidate.formal_name,
              cert_number: candidate.effective_certificate_number || "",
              organizations: candidate.organizations,
              identity_status: candidate.identity_status,
              source: "student_candidate",
            }));
          const instructorOptions = getUniqueSavedPeopleByName([
            ...savedInstructorPeople,
            ...certificateInstructors,
          ]);

          setSavedPilotOptions(studentOptions);
          setSavedInstructorOptions(instructorOptions);
          setAircraftOptions(mergeAircraftOptions([...sharedAircraft, ...organizationAircraft], myAircraft));
        }
      } catch {
        const sharedAircraft = await fetchSharedAircraft().catch(() => []);
        if (!cancelled) {
          setSavedPilotOptions([]);
          setSavedInstructorOptions([]);
          setAircraftOptions(mergeAircraftOptions(sharedAircraft, []));
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

    const selectedStudent = savedPilotOptions.find((person) => person.id === selectedStudentId);
    if (selectedStudent?.display_name) {
      setStudentName(selectedStudent.display_name);
    }
  }, [savedPilotOptions, selectedStudentId, setStudentName]);

  useEffect(() => {
    if (!selectedInstructorId) {
      return;
    }

    const selectedInstructor = savedInstructorOptions.find((person) => person.id === selectedInstructorId);
    if (selectedInstructor?.display_name) {
      setInstructorName(selectedInstructor.display_name);
    }
  }, [savedInstructorOptions, selectedInstructorId, setInstructorName]);

  const handleStudentNameChange = useCallback((value) => {
    const selected = matchSavedPersonByName(savedPilotOptions, value);
    setStudentName(value);
    setSelectedStudentId(selected?.id ?? "");
  }, [savedPilotOptions, setSelectedStudentId, setStudentName]);

  const handleInstructorNameChange = useCallback((value) => {
    const selected = matchSavedPersonByName(savedInstructorOptions, value);
    setInstructorName(value);
    setSelectedInstructorId(selected?.id ?? "");
  }, [savedInstructorOptions, setInstructorName, setSelectedInstructorId]);

  const savedPilotNameOptions = useMemo(() => getUniqueSavedPeopleByName(savedPilotOptions), [savedPilotOptions]);
  const savedInstructorNameOptions = useMemo(
    () => getUniqueSavedPeopleByName(savedInstructorOptions),
    [savedInstructorOptions]
  );
  const aircraftTailOptions = useMemo(() => getUniqueAircraftByTail(aircraftOptions), [aircraftOptions]);
  const selectedSavedAircraft = useMemo(
    () => matchAircraftByTail(aircraftOptions, aircraftId),
    [aircraftId, aircraftOptions]
  );
  const selectedSavedStudent = useMemo(
    () => savedPilotOptions.find((person) => person.id === selectedStudentId) ?? null,
    [savedPilotOptions, selectedStudentId]
  );
  const selectedSavedInstructor = useMemo(
    () => savedInstructorOptions.find((person) => person.id === selectedInstructorId) ?? null,
    [savedInstructorOptions, selectedInstructorId]
  );
  const selectedAircraftDueMeta = useMemo(
    () => getAircraftDueMeta(selectedSavedAircraft, mxNow, flightDate),
    [flightDate, mxNow, selectedSavedAircraft]
  );

  useEffect(() => {
    let cancelled = false;
    if (selectedSavedAircraft?.source !== "organization" || !selectedSavedAircraft.id) {
      setCustomInspections([]);
      return undefined;
    }
    fetchAircraftInspectionAssignments(selectedSavedAircraft.id)
      .then((items) => {
        if (!cancelled) setCustomInspections(items.filter((item) => item.is_active));
      })
      .catch(() => {
        if (!cancelled) setCustomInspections([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSavedAircraft?.id, selectedSavedAircraft?.source]);

  const customInspectionSummary = useMemo(
    () => customInspections.map((item) => formatCustomInspection(item, mxNow, flightDate)),
    [customInspections, flightDate, mxNow]
  );

  useEffect(() => {
    if (!selectedSavedAircraft || selectedSavedAircraft.hundred_hour_due_hours == null) {
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
        meterType: "tach",
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
      aiRiskDiscussion: "",
    }));
    setAiRiskResult(null);
    setAiRiskError("");
  }, [briefSelectedAircraft, briefWb, calculatedFuelTime, setBrief]);

  const riskGates = useMemo(() => {
  const gates = [];

  const isSolo = flightNature === "solo";
  const isPreSolo = selectedRisk("static-training-pre-solo");
  const isSVFR = selectedRisk("dynamic-svfr-dual");
  const isNight = selectedRisk("dynamic-night-flight");
  const nightCurrency = selectedRisk("static-last-night-30");

  const isStall = selectedRisk("dynamic-stalls-airplane");
  const isSpin = selectedRisk("dynamic-spins-airplane");
  const isAutorotation = selectedRisk("dynamic-full-down-auto-heli");

  if (isSVFR && isSolo) {
    gates.push("SVFR possibility with SOLO flight - Chief Pilot review required.");
  }

  if (isNight && nightCurrency) {
    gates.push("Night flight with last night flight > 30 days - mitigation required.");
  }

  if (totalRisk !== null && totalRisk > 24) {
    gates.push("Trial risk level requires further review - adjust the plan or seek appropriate approval before release.");
  }
  for (const factor of flightAssessment.significant) {
    gates.push(`${factor.label}: significant concern - ${factor.choices[2]}. Review independently of the overall risk level.`);
  }
  if (flightAssessment.otherSeverity === 2 && otherRiskLabel.trim()) {
    gates.push(`Additional risk (${otherRiskLabel.trim()}): significant concern - review independently of the overall risk level.`);
  }
  if (calculatedFuelTime !== null && Number.isFinite(Number(ete)) && calculatedFuelTime - Number(ete) < 0.5) {
    gates.push("Calculated fuel endurance leaves less than 30 minutes beyond ETE - verify legal reserve and fuel plan independently.");
  }
  gates.push(...humanFactorReviewItems(humanAssessment));

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
  selectedRisk,
  flightNature,
  flightAssessment,
  otherRiskLabel,
  calculatedFuelTime,
  ete,
  humanAssessment,
  totalRisk,
  flightRules,
  metarByIcaoData,
  notamByIcao,
]);

  const generateAiRiskDiscussion = useCallback(async () => {
    if (!flightAssessment.complete || !session?.access_token || aiRiskLoading) return;
    setAiRiskLoading(true);
    setAiRiskError("");
    try {
      const aircraftModel = [
        briefSelectedAircraft?.model?.manufacturer,
        briefSelectedAircraft?.model?.name ?? briefSelectedAircraft?.model?.model,
      ].filter(Boolean).join(" ");
      const response = await fetch("/api/brief/risk-discussion", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
        body: JSON.stringify({
          flightNature, humanFactors, flightRiskAnswers, otherRiskLabel, otherRisks,
          context: {
            flightRules, flightDate, etd, eta, routeMode, departure, arrival, stops, lessonPractice,
            aircraftModel, fuel, fuelTime, grossWeight, wbCg, withinLimitsConfirmed, daResult,
            mxRemaining: mxRemaining === null ? "" : `${mxRemaining.toFixed(1)} hours`,
            maintenanceSummary: selectedAircraftDueMeta.report,
            metarByIcaoData, tafByIcao, airsigmetSummary, airmets, sigmets, pireps, notamByIcao,
            weatherNotes, riskComments,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to generate the AI discussion.");
      if (data.score !== flightAssessment.totalRisk || data.level !== flightAssessment.category.level) {
        throw new Error("The server score no longer matches this assessment. Review the latest answers and retry.");
      }
      setAiRiskResult({ discussion: data.discussion, evidence: data.evidence });
      setBriefField("aiRiskDiscussion", data.renderedText);
    } catch (error) {
      setAiRiskError(error instanceof Error ? error.message : "Unable to generate the AI discussion.");
    } finally {
      setAiRiskLoading(false);
    }
  }, [
    aiRiskLoading, airmets, airsigmetSummary, arrival, briefSelectedAircraft, daResult, departure, eta, etd,
    flightAssessment, flightDate, flightNature, flightRiskAnswers, flightRules, fuel, fuelTime, grossWeight,
    humanFactors, lessonPractice, metarByIcaoData, mxRemaining, notamByIcao, otherRiskLabel, otherRisks,
    pireps, riskComments, routeMode, selectedAircraftDueMeta.report, session?.access_token, setBriefField,
    sigmets, stops, tafByIcao, wbCg, weatherNotes, withinLimitsConfirmed,
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
    const humanLines = humanFactorReportLines(humanAssessment);

    const riskLinesForSection = (section) => flightAssessment.drivers
      .filter((factor) => paveSectionForFactor(factor) === section)
      .map((factor) => `- ${factor.label}: ${factor.choices[factor.severity]}`);
    const pilotRiskLines = [...riskLinesForSection("pilot"), ...humanLines.slice(2)];
    const aircraftRiskLines = riskLinesForSection("aircraft");
    const environmentRiskLines = riskLinesForSection("environment");
    const pressureRiskLines = riskLinesForSection("pressure");
    const additionalRiskLines = flightAssessment.otherSeverity > 0
      ? [`- ${otherRiskLabel}: ${flightAssessment.otherSeverity === 2 ? "significant" : "some"} concern`]
      : [];

    // Optional: include NOTAM summary counts
    const notamSummaryLines = Object.entries(notamByIcao)
      .filter(([icao]) => airportsForWxAndNotams.includes(icao))
      .map(([icao, g]) => {
        const total = (g?.closures?.length || 0) + (g?.nav?.length || 0) + (g?.general?.length || 0);
        return `${icao}: ${total} (Closures ${g?.closures?.length || 0}, Nav ${g?.nav?.length || 0}, General ${g?.general?.length || 0})`;
      });

    const reportText = `=== PilotSeal Flight Brief Report ===

Pilot: ${studentName}
Flight type: ${flightNatureLabel}
${flightNature === "dual_training" ? `Instructor: ${instructorName}` : ""}
Date: ${flightDate}
Aircraft: ${aircraftId}
Fuel: ${fuel}

Flight Rules: ${flightRules}

ETD: ${etd}
ETA: ${eta}
ETE: ${ete ? ete + " hours" : ""}

Departure: ${dep}
Arrival: ${arr}
${flightNature === "dual_training" ? `Lesson Practice: ${lessonPractice}` : ""}

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
Custom Inspections: ${customInspectionSummary.length ? customInspectionSummary.map((item) => `${item.label}: ${item.detail}`).join("; ") : "(none)"}

PAVE — P / Pilot:
${pilotRiskLines.length ? pilotRiskLines.join("\n") : "- No concerns identified"}
${humanLines.slice(0, 2).join("\n")}

PAVE — A / Aircraft:
${aircraftRiskLines.length ? aircraftRiskLines.join("\n") : "- No concerns identified"}

PAVE — V / enVironment:
${environmentRiskLines.length ? environmentRiskLines.join("\n") : "- No concerns identified"}

PAVE — E / External pressures:
${pressureRiskLines.length ? pressureRiskLines.join("\n") : "- No concerns identified"}

Additional risk:
${additionalRiskLines.length ? additionalRiskLines.join("\n") : "- None"}

Risk assessment: ${flightAssessment.complete ? `${totalRisk} points — ${riskMeta.level}` : "INCOMPLETE — some questions were not answered"}
${flightAssessment.complete ? `PAVE scores: Pilot ${scoreBreakdown.sections.pilot}; Aircraft ${scoreBreakdown.sections.aircraft}; enVironment ${scoreBreakdown.sections.environment}; External pressures ${scoreBreakdown.sections.pressure}; Additional risk ${scoreBreakdown.additional}
Score details:
${scoreBreakdown.contributions.length ? scoreBreakdown.contributions.map((item) => `- +${item.score} ${item.label}: ${item.answer}`).join("\n") : "- No scored concerns"}` : ""}
Recommendation: ${riskMeta.recommendation}
Scoring model: Pilot trial v${FLIGHT_RISK_MODEL_VERSION} - decision aid only, not a go/no-go determination. Significant concerns always require separate review.
Mandatory Review Items:
${riskGates.length ? riskGates.map((item) => `- ${item}`).join("\n") : "- None"}

Risk Mitigation (RM):
${riskComments}

AI Risk Discussion:
${aiRiskDiscussion || "AI discussion not generated"}
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
    flightNature,
    flightNatureLabel,
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
    customInspectionSummary,
    flightAssessment,
    humanAssessment,
    otherRiskLabel,
    scoreBreakdown,
    totalRisk,
    riskMeta.level,
    riskMeta.recommendation,
    riskGates,
    riskComments,
    aiRiskDiscussion,
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
      if (!flightNature) missing.push("Flight type");
      if (!studentName.trim()) missing.push("Pilot name");
      if (flightNature === "dual_training" && !instructorName.trim()) missing.push("Instructor name");
      if (!flightDate) missing.push("Flight date");
      if (!etd) missing.push("ETD");
      if (!eta) missing.push("ETA");
      if (!aircraftId.trim()) missing.push("Aircraft tail number");
    }

    if (stepIndex === 1) {
      if (!String(mxNow).trim()) missing.push("Current Tach reading");
      if (
        !String(mxDue).trim() &&
        !(selectedSavedAircraft?.source === "organization" && selectedSavedAircraft.hundred_hour_due_hours == null)
      ) missing.push("Reading when the next maintenance is due");
      if (briefSelectedAircraft && !withinLimitsConfirmed) {
        missing.push("Weight and balance within limits");
      }
    }

    if (stepIndex === 2) {
      if (!departure.trim()) missing.push("Departure point");
      if (!arrival.trim()) missing.push("Arrival point");
      if (flightNature === "dual_training" && !lessonPractice.trim()) missing.push("Lesson practice");
      if (routeMode === "cross") {
        stops.forEach((stop, index) => {
          if (!String(stop ?? "").trim()) {
            missing.push(`Intermediate stop ${index + 1}`);
          }
        });
      }
    }

    if (stepIndex === 4) {
      if (!flightNature) missing.push("Flight type (risk assessment will be incomplete)");
      if (!humanAssessment.complete) missing.push("Pilot IMSAFE assessment (risk assessment will be incomplete)");
      if (!flightAssessment.complete) missing.push("Flight condition assessment (risk assessment will be incomplete)");
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
    flightNature,
    instructorName,
    humanAssessment.complete,
    flightAssessment.complete,
    lessonPractice,
    mxDue,
    mxNow,
    riskComments,
    routeMode,
    stops,
    studentName,
    selectedSavedAircraft,
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

  const handleGenerateReport = async () => {
    if (!confirmMissingStepFields(currentStep)) {
      return;
    }

    if (!session?.user?.id) {
      generateReport();
      return;
    }

    const organizationAircraft = selectedSavedAircraft?.source === "organization";
    const aircraftOrganizationId = organizationAircraft
      ? selectedSavedAircraft?.organization_id || activeOrganization?.id || ""
      : "";
    const meterValue = parseFloat(String(mxNow));
    const meterObservedAt = new Date().toISOString();

    if (organizationAircraft) {
      if (!selectedSavedAircraft?.organization_id) {
        setRecordStatus("The organization aircraft is missing its organization assignment.");
        return;
      }
      if (
        !selectedSavedStudent?.student_user_id ||
        !selectedSavedStudent.organizations?.some(
          (organization) => organization.id === selectedSavedAircraft.organization_id
        )
      ) {
        setRecordStatus(
          "Select a registered pilot who is currently a student in this aircraft's organization."
        );
        setCurrentStep(0);
        scrollToTop();
        return;
      }
      if (selectedAircraftDueMeta.dispatchBlocked) {
        setRecordStatus(
          `This aircraft cannot be dispatched: ${selectedAircraftDueMeta.blockingReason}. Choose another aircraft or ask an organization admin to return it to service.`
        );
        setCurrentStep(1);
        scrollToTop();
        return;
      }
      if (!Number.isFinite(meterValue) || meterValue < 0) {
        setRecordStatus("Enter the current Tach reading.");
        return;
      }
      if (
        selectedSavedAircraft.current_meter_type === "tach" &&
        selectedSavedAircraft.current_meter_value != null &&
        meterValue < Number(selectedSavedAircraft.current_meter_value)
      ) {
        setRecordStatus(
          `The entered reading is lower than the saved aircraft reading (${selectedSavedAircraft.current_meter_value}). Correct it before finalizing.`
        );
        return;
      }
    }
    setRecordSaving(true);
    setRecordStatus("");
    try {
      const routeText = [departure, ...stops, arrival]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
        .join(" → ");
      const recordInput = {
        // Organization ID identifies the selected organization aircraft/MX
        // context only. Record visibility is derived by the server.
        organization_id: aircraftOrganizationId || null,
        student_saved_person_id: selectedSavedStudent?.saved_person_id || null,
        student_user_id: selectedSavedStudent?.student_user_id || null,
        aircraft_id: selectedSavedAircraft?.id || null,
        aircraft_tail_number: aircraftId,
        student_name: studentName,
        instructor_name: instructorName,
        flight_date: flightDate || null,
        etd: etd || null,
        eta: eta || null,
        ete: Number.isFinite(Number(ete)) ? Number(ete) : null,
        flight_rules: flightRules,
        route: routeText,
        brief_data: {
          studentName,
          instructorName,
          flightNature,
          selectedStudentId,
          selectedInstructorId,
          flightRules,
          flightDate,
          etd,
          eta,
          ete,
          aircraftId,
          fuel,
          fuelTime,
          routeMode,
          departure,
          arrival,
          stops,
          lessonPractice,
          fieldElevation,
          outsideTemp,
          daResult,
          weatherNotes,
          grossWeight,
          wbCg,
          withinLimitsConfirmed,
          mxNow,
          mxDue,
          meterType,
          meterObservedAt,
          ...humanFactorSnapshot(humanAssessment, riskGates),
          ...flightRiskSnapshot(flightAssessment),
          otherRiskLabel,
          otherRisks,
          riskComments,
          staticScore,
          dynamicScore,
          totalRisk,
          riskLevel: riskMeta.level,
          riskRecommendation: riskMeta.recommendation,
          aiRiskDiscussion,
        },
        weather_snapshot: {
          fetched_at: new Date().toISOString(),
          metarByIcaoData,
          tafByIcao,
          airsigmetSummary,
          airmets,
          sigmets,
          pireps,
          weatherResults,
        },
        notam_snapshot: {
          fetched_at: new Date().toISOString(),
          notamByIcao,
        },
        wb_snapshot: {
          inputs: briefWb?.inputs ?? {},
          result: briefWb?.result ?? null,
        },
      };

      const existingDraftId = String(brief.flightBriefDraftId ?? "");
      const finalizeInput = {
        meterType: organizationAircraft ? meterType : null,
        meterValue: organizationAircraft ? meterValue : null,
        observedAt: organizationAircraft ? meterObservedAt : null,
        plannedMeterIncrease: null,
      };
      const finalized = existingDraftId
        ? await updateFlightBriefDraft(existingDraftId, recordInput)
            .then((draft) => finalizeFlightBrief(draft.id, finalizeInput))
        : await createAndFinalizeFlightBrief(recordInput, finalizeInput);
      setBrief((current) => ({
        ...current,
        flightBriefDraftId: finalized.id,
        finalizedFlightBriefId: finalized.id,
      }));
      setRecordStatus("Preflight record finalized and saved.");
      generateReport();
    } catch (error) {
      setRecordStatus(
        error instanceof Error ? error.message : "Unable to finalize this preflight record."
      );
    } finally {
      setRecordSaving(false);
    }
  };

  return (
    <div className="flightbrief-body" ref={topRef}>
      <div className="flightbrief-header">
        <div className="flightbrief-currentStep">
          <h1>{steps[currentStep].title}</h1>
        </div>
        <div className="flightbrief-progressMeta">
          <span>{currentStep + 1} of {steps.length}</span>
          <span className="flightbrief-progressTrack" aria-hidden="true">
            <span style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }} />
          </span>
        </div>
      </div>
      {recordStatus ? (
        <div className="mx-3 mb-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700" role="status" aria-live="polite">
          {recordStatus}
        </div>
      ) : null}
      {selectedSavedAircraft?.source === "organization" && selectedAircraftDueMeta.dispatchBlocked ? (
        <div
          id="aircraft-dispatch-block"
          className="mx-3 mb-3 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900"
          role="alert"
        >
          <p className="font-semibold">This aircraft cannot be dispatched.</p>
          <p className="mt-1">
            {selectedAircraftDueMeta.blockingReason}. Choose another aircraft or ask an organization admin to return it to service.
          </p>
        </div>
      ) : null}

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
                {savedPilotNameOptions.map((person) => (
                  <option key={person.id} value={person.display_name} />
                ))}
              </datalist>
              <datalist id="flightBriefSavedInstructors">
                {savedInstructorNameOptions.map((person) => (
                  <option key={person.id} value={person.display_name} />
                ))}
              </datalist>
            </>
          ) : null}
          <datalist id="flightBriefSavedAircraft">
            {aircraftTailOptions.map((aircraft) => (
              <option
                key={aircraft.id}
                value={aircraft.tail_number || aircraft.name}
              />
            ))}
          </datalist>
          {currentStep === 0 && (
            <section className="flightbrief-panel">
              <div className="flightbrief-mobile-settings">
                <div className="settings-card">
                  <h3 className="settings-cardTitle">People</h3>
                  <EditableInfoRow
                    label="Pilot"
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
                  {flightNature === "dual_training" ? <EditableInfoRow
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
                  /> : null}
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
                        list="flightBriefSavedAircraft"
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
                    label="What kind of flight?"
                    value={flightNatureLabel}
                    rowKey="flightNature"
                    editingKey={mobileEditingField}
                    setEditingKey={setMobileEditingField}
                    renderEditor={(close) => (
                      <select autoFocus value={flightNature} onChange={(e) => { setFlightNature(e.target.value); close(); }}>
                        <option value="">Select one</option>
                        {FLIGHT_NATURES.map((nature) => <option key={nature.id} value={nature.id}>{nature.label}</option>)}
                      </select>
                    )}
                  />
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
                      <UsDateInput
                        autoFocus
                        value={flightDate}
                        onChange={setFlightDate}
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
                <label className="label" htmlFor="flightNature">What kind of flight is this?</label>
                <select id="flightNature" className="input-field" value={flightNature} onChange={(e) => setFlightNature(e.target.value)} required>
                  <option value="">Select one</option>
                  {FLIGHT_NATURES.map((nature) => <option key={nature.id} value={nature.id}>{nature.label}</option>)}
                </select>
              </div>
              <div className="inline-label-input">
                <label className="label" htmlFor="studentName">Pilot:</label>
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

              {flightNature === "dual_training" ? <div className="inline-label-input">
                <label className="label" htmlFor="instructorName">Instructor:</label>
                <input
                  type="text"
                  id="instructorName"
                  className="input-field"
                  list={session?.user?.id ? "flightBriefSavedInstructors" : undefined}
                  value={instructorName}
                  onChange={(e) => handleInstructorNameChange(e.target.value)}
                  required
                />
              </div> : null}

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
                  <UsDateInput id="flightDate" className="input-field" value={flightDate} onChange={setFlightDate} required title="Select date (MM/DD/YYYY)" />
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
                    list="flightBriefSavedAircraft"
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
                  <label className="label" htmlFor="mx-now">Current Tach Reading:</label>
                  <input type="number" min="0" step="any" id="mx-now" className="input-field" value={mxNow} onChange={(e) => handleMxNowChange(e.target.value)} placeholder={selectedSavedAircraft?.current_meter_type === "tach" && selectedSavedAircraft?.current_meter_value != null ? `Saved Tach ${selectedSavedAircraft.current_meter_value}` : "Check the aircraft Tach"} />
                </div>
                <div className="inline-label-input inline-label-input-compact flightbrief-aircraft-inlineField">
                  <label className="label" htmlFor="mx-due">Next Maintenance Due At:</label>
                  <input type="number" id="mx-due" className="input-field" readOnly={selectedSavedAircraft?.source === "organization"} value={mxDue} onChange={(e) => handleMxDueChange(e.target.value)} placeholder={selectedSavedAircraft?.source === "organization" ? "Managed by organization" : ""} />
                </div>
                <div className="flightbrief-kpi">
                  <span>Time Until Maintenance</span>
                  <strong className={mxRemainingMeta.ok === false ? "is-alert" : mxRemainingMeta.ok === true ? "is-ok" : ""}>
                    {mxRemainingMeta.label}
                  </strong>
                  <small>{mxRemainingMeta.detail}</small>
                </div>
                <div className="flightbrief-kpi flightbrief-maintenance-due">
                  <span>Saved Maintenance Status</span>
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
                  <ul className="flightbrief-maintenance-list">
                    {selectedAircraftDueMeta.items.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              </div>

              {selectedSavedAircraft?.source === "organization" ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-white/80 p-3">
                  <strong className="text-sm text-slate-900">Organization custom inspections</strong>
                  {customInspectionSummary.length ? (
                    <div className="mt-2 grid gap-2">
                      {customInspectionSummary.map((item) => (
                        <div key={item.id} className={`rounded-lg px-3 py-2 text-sm ${item.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
                          <strong>{item.label}</strong> · {item.detail}
                        </div>
                      ))}
                    </div>
                  ) : <p className="mt-2 text-sm text-slate-500">No custom inspections assigned.</p>}
                </div>
              ) : null}

              <WeightBalanceCalculator
                stateKey="briefWb"
                embedded
                sourceAircraft={selectedSavedAircraft}
                sourceStudent={selectedSavedStudent}
                sourceInstructor={selectedSavedInstructor}
              />
            </section>
          )}

          {currentStep === 2 && (
            <section className="flightbrief-panel">
              <div className="flightbrief-toggleRow">
                <button type="button" className={`btn-toggle ${routeMode === "cross" ? "active" : ""}`} onClick={onSelectCross}>
                  Cross Country
                </button>
                <button type="button" className={`btn-toggle ${routeMode === "local" ? "active" : ""}`} onClick={onSelectLocal}>
                  {flightNature === "dual_training" ? "Local Practice" : "Local Flight"}
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

                {flightNature === "dual_training" ? <div className="section inline-label-input inline-label-input-compact">
                  <label className="label" htmlFor="lessonPractice"><strong>Lesson Practice:</strong></label>
                  <input type="text" id="lessonPractice" className="input-field" value={lessonPractice} onChange={(e) => setLessonPractice(e.target.value)} placeholder="e.g., Steep Turns, Slow Flight, Short Field Landing" />
                </div> : null}
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
            <section className="flightbrief-panel flightbrief-panel-risk">
              <div className="flightbrief-riskFlow">
                <header className="flightbrief-riskHeader">
                  <div>
                    <h2>Risk assessment</h2>
                    {flightNature ? <p>{answeredGuidedCount} of {guidedQuestions.length} answered</p> : null}
                  </div>
                </header>
                <div id="risk-section-nature" className="flightbrief-riskNature">
                  <span>Flight type</span>
                  {editingRiskNature || !flightNature ? (
                    <select id="risk-flight-nature" aria-label="Flight type" value={flightNature} onChange={(event) => { setFlightNature(event.target.value); setEditingRiskNature(false); }}>
                      <option value="">Select one</option>
                      {FLIGHT_NATURES.map((nature) => <option key={nature.id} value={nature.id}>{nature.label}</option>)}
                    </select>
                  ) : <button type="button" className="flightbrief-riskNatureEdit" onClick={() => setEditingRiskNature(true)}>{flightNatureLabel} <span>Change</span></button>}
                </div>
                {legacyHumanFactorsNotice && !flightAssessment.complete ? <p className="flightbrief-riskNotice" role="status">Reassess the applicable PAVE factors and pilots aboard for this draft.</p> : null}

                {flightNature ? <>
                {PAVE_SECTIONS.map((section) => {
                  const sectionQuestions = guidedQuestions.filter((question) => question.section === section.id);
                  const sectionComplete = isRiskSectionComplete(section.id, flightRiskAnswers, humanFactors, flightNature, plannedManeuvers);
                  return <PaveRiskBoard key={section.id} {...section} complete={sectionComplete} active={activePaveSection === section.id} onOpen={() => {
                    const firstUnanswered = sectionQuestions.find((question) => !isRiskQuestionAnswered(question, flightRiskAnswers, humanFactors, flightNature, plannedManeuvers));
                    setActiveRiskQuestion((firstUnanswered ?? sectionQuestions[0])?.key ?? "review");
                  }}>
                    <div className="flightbrief-guidedQuestions">
                      {sectionQuestions.filter((question) => isRiskQuestionAnswered(question, flightRiskAnswers, humanFactors, flightNature, plannedManeuvers) && question.key !== activeRiskQuestion).map((question) => {
                        const answer = question.type === "human" ? humanFactors[question.role]?.[question.field.id]
                          : question.type === "screen" ? maneuverScreenAnswer(flightRiskAnswers, flightNature, plannedManeuvers)
                          : flightRiskAnswers[question.factor.id];
                        const roleLabel = question.role === "cfi" ? "CFI" : flightNature === "dual_training" ? "Student" : "Pilot";
                        return <RiskAnsweredSummary key={question.key} question={question} answer={answer} roleLabel={roleLabel} onEdit={() => setActiveRiskQuestion(question.key)} />;
                      })}
                      {activeGuidedQuestion?.section === section.id ? <RiskQuestionCard
                        key={activeGuidedQuestion.key}
                        question={activeGuidedQuestion}
                        roleLabel={activeGuidedQuestion.role === "cfi" ? "CFI" : flightNature === "dual_training" ? "Student" : "Pilot"}
                        answer={activeGuidedQuestion.type === "human" ? humanFactors[activeGuidedQuestion.role]?.[activeGuidedQuestion.field.id]
                          : activeGuidedQuestion.type === "screen" ? maneuverScreenAnswer(flightRiskAnswers, flightNature, plannedManeuvers)
                          : flightRiskAnswers[activeGuidedQuestion.factor.id]}
                        onAnswer={(value) => {
                          if (activeGuidedQuestion.type === "human") setHumanFactorAnswer(activeGuidedQuestion.role, activeGuidedQuestion.field.id, value);
                          else if (activeGuidedQuestion.type === "screen") setManeuverScreen(value);
                          else setFlightRiskAnswer(activeGuidedQuestion.factor.id, value);
                        }}
                      /> : null}
                      {section.id === "pilot" && humanAssessment.complete ? <details className="flightbrief-riskOptional">
                        <summary>Sleep and time pressure <span>optional · not saved</span></summary>
                        {flightNature === "dual_training" ? <p>Student</p> : null}
                        <div className="flightbrief-riskContext">
                          <label>Hours slept <input type="number" min="0" max="24" inputMode="decimal" value={humanFactorContext.student.sleepHours} onChange={(event) => setHumanFactorContextField("student", "sleepHours", event.target.value)} /></label>
                          <label>Hours awake <input type="number" min="0" max="48" inputMode="decimal" value={humanFactorContext.student.awakeHours} onChange={(event) => setHumanFactorContextField("student", "awakeHours", event.target.value)} /></label>
                          <label>Time pressure <select value={humanFactorContext.student.timePressure} onChange={(event) => setHumanFactorContextField("student", "timePressure", event.target.value)}><option value="">Select one</option><option value="none">None</option><option value="some">Some</option><option value="high">High</option></select></label>
                        </div>
                        {flightNature === "dual_training" ? <>
                          <p>CFI</p>
                          <div className="flightbrief-riskContext">
                            <label>Hours slept <input type="number" min="0" max="24" inputMode="decimal" value={humanFactorContext.cfi.sleepHours} onChange={(event) => setHumanFactorContextField("cfi", "sleepHours", event.target.value)} /></label>
                            <label>Hours awake <input type="number" min="0" max="48" inputMode="decimal" value={humanFactorContext.cfi.awakeHours} onChange={(event) => setHumanFactorContextField("cfi", "awakeHours", event.target.value)} /></label>
                            <label>Time pressure <select value={humanFactorContext.cfi.timePressure} onChange={(event) => setHumanFactorContextField("cfi", "timePressure", event.target.value)}><option value="">Select one</option><option value="none">None</option><option value="some">Some</option><option value="high">High</option></select></label>
                          </div>
                        </> : null}
                      </details> : null}
                    </div>
                  </PaveRiskBoard>;
                })}

                <section id="risk-section-review" className="flightbrief-riskBlock flightbrief-riskGroup" aria-label="Review and mitigation">
                  <button type="button" className="flightbrief-riskGroupToggle" aria-expanded={activeRiskQuestion === "review"} onClick={() => setActiveRiskQuestion("review")}>
                    <span>Review & mitigation</span><span className="flightbrief-riskGroupCount" aria-hidden="true">{activeRiskQuestion === "review" ? "−" : "+"}</span>
                  </button>
                  {activeRiskQuestion === "review" ? <div>
                    <div className="flightbrief-riskBlockHead"><h3>Additional risk</h3><span>optional</span></div>
                    <div className="flightbrief-riskRow">
                      <label htmlFor="other-risk-label">Other factor</label>
                      <input id="other-risk-label" value={otherRiskLabel} onChange={(event) => setOtherRiskLabel(event.target.value)} placeholder="Name a risk not listed above" />
                    </div>
                    {otherRiskLabel.trim() ? <div className="flightbrief-riskRow">
                      <label htmlFor="other-risk">Concern level</label>
                      <select id="other-risk" value={otherRisks} onChange={(event) => setOtherRisks(event.target.value)}><option value="0">No concern</option><option value="1">Some concern</option><option value="2">Significant concern</option></select>
                    </div> : null}

                    <FinalRiskScore assessment={flightAssessment} breakdown={scoreBreakdown} remaining={remainingRiskAnswers} />

                    {flightAssessment.complete && hasSignificantConcern ? <p className="flightbrief-riskSignificant" role="alert">Significant concern recorded — review it independently of the total score.</p> : null}
                    {flightAssessment.complete && humanAssessment.roles.cfi.affectedCount > 2 ? <p className="flightbrief-riskSignificant" role="alert">CFI IMSAFE concerns in more than two areas — NO FLIGHT until reviewed and reduced.</p> : null}

                    {riskGates.length ? <div className="flightbrief-riskReview" aria-label="Review items">
                      <h3>Review before flight</h3>
                      <ul>{riskGates.map((gate) => <li key={gate}>{gate}</li>)}</ul>
                    </div> : null}

                    <div className="flightbrief-riskMitigation">
                      <label htmlFor="riskComments">Risk mitigation</label>
                      <textarea id="riskComments" rows="4" value={riskComments} onChange={(event) => setRiskComments(event.target.value)} placeholder="Record the discussion and mitigations" />
                    </div>

                    <div className="flightbrief-aiActions">
                      <button type="button" onClick={generateAiRiskDiscussion} disabled={!flightAssessment.complete || !session?.access_token || aiRiskLoading}>
                        {aiRiskLoading ? "Generating discussion…" : aiRiskDiscussion ? "Regenerate AI risk discussion" : "Generate AI risk discussion"}
                      </button>
                      <p>Sends route, weather, NOTAMs and notes to DeepSeek. Names, account IDs, aircraft tail number and health details are excluded. DeepSeek may process and store data in China.</p>
                      {!session?.access_token ? <small>Sign in to generate an AI discussion.</small> : null}
                      {aiRiskError ? <p className="flightbrief-aiError" role="alert">{aiRiskError}</p> : null}
                    </div>
                    <AiRiskDiscussion result={aiRiskResult} savedText={aiRiskDiscussion} />
                  </div> : null}
                </section>
                </> : null}
                <p className="flightbrief-riskFootnote">Trial assessment · decision aid, not a go/no-go determination. Significant concerns need separate review.</p>
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
          <button
            type="button"
            className="flightbrief-navButton primary"
            onClick={handleGenerateReport}
            disabled={recordSaving}
            aria-describedby={selectedAircraftDueMeta.dispatchBlocked ? "aircraft-dispatch-block" : undefined}
          >
            <span className="flightbrief-navButtonDesktop">{recordSaving ? "Finalizing..." : "Finalize & Generate Report"}</span>
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
