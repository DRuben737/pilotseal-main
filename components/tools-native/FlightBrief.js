"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";

/** ------------------ constants ------------------ */
const API_BASE = "https://brief.r1978244759.workers.dev";

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
      advice: "Risk acceptable after discussion. Flight may proceed.",
    };
  }
  if (total <= 15) {
    return {
      level: "🟡 MODERATE RISK",
      color: "orange",
      advice:
        "Consult with senior or chief instructor to discuss risk mitigation. May proceed after reduction.",
    };
  }
  return {
    level: "🔴 HIGH RISK",
    color: "red",
    advice:
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

/** ------------------ Fetch helpers ------------------ */
async function fetchJson(url, signal) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

function avwxMetarUrl(icao) {
  return `${API_BASE}/?url=${encodeURIComponent(`https://avwx.rest/api/metar/${icao}?format=json`)}`;
}

function avwxTafUrl(icao) {
  return `${API_BASE}/?url=${encodeURIComponent(`https://avwx.rest/api/taf/${icao}?format=json`)}`;
}

function avwxAirsigmetUrl() {
  return `${API_BASE}/?url=${encodeURIComponent(`https://avwx.rest/api/airsigmet?format=json`)}`;
}

function nmsNotamsUrl(airports) {
  const qs = encodeURIComponent(airports.join(","));
  return `${API_BASE}/notams?airports=${qs}`;
}

/** ------------------ Component ------------------ */
export default function FlightBrief() {
  /** ---- core form ---- */
  const [studentName, setStudentName] = useState("");
  const [instructorName, setInstructorName] = useState("");
  const [flightRules, setFlightRules] = useState("VFR");
  const [flightDate, setFlightDate] = useState("");
  const [etd, setEtd] = useState("");
  const [eta, setEta] = useState("");
  const ete = useMemo(() => calcETE(etd, eta), [etd, eta]);


  const [aircraftId, setAircraftId] = useState("");
  const [fuel, setFuel] = useState("");
  const [fuelTime, setFuelTime] = useState("");

  /** ---- route ---- */
  const [routeMode, setRouteMode] = useState("local"); // 'local' | 'cross'
  const [departure, setDeparture] = useState("");
  const [arrival, setArrival] = useState("");
  const [stops, setStops] = useState([""]); // at least one input

  /** ---- lesson ---- */
  const [lessonPractice, setLessonPractice] = useState("");

  /** ---- weather / DA ---- */
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");

  // store richer metar for category visualization
  const [metarByIcaoData, setMetarByIcaoData] = useState({}); // { ICAO: { raw, flight_rules } }
  const [tafByIcao, setTafByIcao] = useState({}); // { ICAO: "ICAO: raw" }
  const [airsigmetSummary, setAirsigmetSummary] = useState("");

  const latestAltimeterRef = useRef(null); // inHg number
  const latestTemperatureCRef = useRef(null); // C number

  const [fieldElevation, setFieldElevation] = useState("");
  const [outsideTemp, setOutsideTemp] = useState(""); // read-only but stored
  const [daResult, setDaResult] = useState("");

  /** ---- notes ---- */
  const [weatherNotes, setWeatherNotes] = useState("");

  /** ---- NOTAMs (NMS) ---- */
  const [notamLoading, setNotamLoading] = useState(false);
  const [notamError, setNotamError] = useState("");
  const [notamByIcao, setNotamByIcao] = useState({}); // { ICAO: {closures, nav, general} }
  // airport-level collapse: { KPAO: true/false }  true=expanded
  const [notamAirportOpen, setNotamAirportOpen] = useState({});

  // category-level collapse per airport: { KPAO: { closures:true, nav:false, general:false } }
  const [notamCategoryOpen, setNotamCategoryOpen] = useState({});

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
  const [grossWeight, setGrossWeight] = useState("");
  const [withinLimitsConfirmed, setWithinLimitsConfirmed] = useState(false);

  const [mxNow, setMxNow] = useState("");
  const [mxDue, setMxDue] = useState("");

  const mxRemaining = useMemo(() => {
    const now = parseFloat(mxNow || 0);
    const due = parseFloat(mxDue || 0);
    if (Number.isNaN(now) || Number.isNaN(due)) return "0.0";
    return (due - now).toFixed(1);
  }, [mxNow, mxDue]);

  /** ---- risk ---- */
  const [staticChecked, setStaticChecked] = useState(() => {
    const init = {};
    STATIC_RISKS.forEach((r) => (init[r.id] = false));
    return init;
  });
  const [dynamicChecked, setDynamicChecked] = useState(() => {
    const init = {};
    DYNAMIC_RISKS.forEach((r) => (init[r.id] = false));
    return init;
  });
  const [imsafe, setImsafe] = useState(0); // 0..6
  const [otherRisks, setOtherRisks] = useState(0); // 0..5
  const [riskComments, setRiskComments] = useState("");
  const [currentStep, setCurrentStep] = useState(0);
  const topRef = useRef(null);

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

      latestAltimeterRef.current = null;
      latestTemperatureCRef.current = null;
      setOutsideTemp("");
      setDaResult("");

      // fetch METAR+TAF per airport in parallel
      const results = await Promise.all(
        icaos.map(async (icao) => {
          const [metar, taf] = await Promise.allSettled([
            fetchJson(avwxMetarUrl(icao), controller.signal),
            fetchJson(avwxTafUrl(icao), controller.signal),
          ]);

          const metarData = metar.status === "fulfilled" ? metar.value : null;
          const tafData = taf.status === "fulfilled" ? taf.value : null;

          return {
            icao,
            metarRaw: metarData?.raw || "Unavailable",
            flight_rules: metarData?.flight_rules || "",
            alt: metarData?.altimeter?.value,
            temp: metarData?.temperature?.value,
            tafRaw: tafData?.raw || "Unavailable",
          };
        })
      );

      // prefer dep for alt/temp if possible
      const depICAO = normalizeICAO(departure);
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
        metarMap[r.icao] = { raw: r.metarRaw, flight_rules: r.flight_rules };
        tafMap[r.icao] = `${r.icao}: ${r.tafRaw}`;
      }
      setMetarByIcaoData(metarMap);
      setTafByIcao(tafMap);

      // AIRMET/SIGMET once
      try {
        const airsigmetData = await fetchJson(avwxAirsigmetUrl(), controller.signal);
        const summary =
          Array.isArray(airsigmetData) && airsigmetData.length
            ? `${airsigmetData.length} active AIRMET/SIGMETs in U.S. FIRs`
            : "No active AIRMET/SIGMETs";
        setAirsigmetSummary(summary);
      } catch {
        setAirsigmetSummary("AIRMET/SIGMET unavailable");
      }
    } catch (e) {
      if (e?.name !== "AbortError") setWeatherError("Weather fetch failed. Please try again.");
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

      const res = await fetch(nmsNotamsUrl(icaos));
      const data = await res.json();

      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

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
    const temperatureC = parseFloat(outsideTemp);
    const altimeterInHg = latestAltimeterRef.current;

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
      `Estimated Density Altitude: ${da.toLocaleString()} ft (using Altimeter ${altimeterInHg} inHg)`
    );
  }, [fieldElevation, outsideTemp]);

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
Advice: ${riskMeta.advice}

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
    riskMeta.advice,
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
    { id: "route", title: "Route" },
    { id: "weather", title: "Weather" },
    { id: "aircraft", title: "Aircraft" },
    { id: "risk", title: "Risk" },
  ];

  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;

  const scrollToTop = useCallback(() => {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

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
      <div className="flight-section">
        <div className="flightbrief-header">
          <div>
            <h1 className="text-3xl font-bold text-center mb-6">Flight Brief</h1>
          </div>
          <div className="flightbrief-stepBadge">
            Step {currentStep + 1} of {steps.length}
          </div>
        </div>

        <div className="flightbrief-stepper" role="tablist" aria-label="Flight brief steps">
          {steps.map((step, index) => (
            <button
              key={step.id}
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

        <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
          {currentStep === 0 && (
            <section className="flightbrief-panel">
              <h2 className="text-xl font-bold mb-4">Flight Information</h2>

              <div className="inline-label-input">
                <label className="label" htmlFor="studentName">Student Name(Pilot Flying):</label>
                <input type="text" id="studentName" className="input-field" value={studentName} onChange={(e) => setStudentName(e.target.value)} required />
              </div>

              <div className="inline-label-input">
                <label className="label" htmlFor="instructorName">Instructor Name(Pilot In Command):</label>
                <input type="text" id="instructorName" className="input-field" value={instructorName} onChange={(e) => setInstructorName(e.target.value)} required />
              </div>

              <div className="inline-label-input">
                <label className="label" htmlFor="flight-rules">Flight Rules:</label>
                <select id="flight-rules" className="input-field" value={flightRules} onChange={(e) => setFlightRules(e.target.value)} title="Select flight rules">
                  <option value="VFR">VFR</option>
                  <option value="IFR">IFR</option>
                </select>
              </div>

              <div className="inline-label-input">
                <label className="label" htmlFor="flightDate">Select Date</label>
                <input type="date" id="flightDate" className="input-field" value={flightDate} onChange={(e) => setFlightDate(e.target.value)} required title="Select date" lang="en" />
              </div>

              <div className="inline-label-input">
                <label className="label" htmlFor="etd">Estimated Time of Departure (ETD)</label>
                <input type="time" id="etd" className="input-field" value={etd} onChange={(e) => setEtd(e.target.value)} required />
              </div>

              <div className="inline-label-input">
                <label className="label" htmlFor="eta">Estimated Time of Arrival (ETA)</label>
                <input type="time" id="eta" className="input-field" value={eta} onChange={(e) => setEta(e.target.value)} required />
              </div>

              <div className="inline-label-input">
                <label className="label" htmlFor="ete">Estimated Time Enroute (ETE)</label>
                <input type="text" id="ete" className="input-field" readOnly value={ete} placeholder="Auto-calculated" />
              </div>

              <div className="inline-label-input">
                <label className="label" htmlFor="aircraftId">Aircraft Tail Number:</label>
                <input type="text" id="aircraftId" className="input-field" value={aircraftId} onChange={(e) => setAircraftId(e.target.value)} required />
              </div>

              <div className="inline-label-input">
                <label className="label" htmlFor="fuel">Fuel Onboard (Gallons):</label>
                <input type="number" id="fuel" className="input-field" value={fuel} onChange={(e) => setFuel(e.target.value)} required />
              </div>

              <div className="inline-label-input">
                <label className="label" htmlFor="fuelTime">Fuel Time (hrs):</label>
                <input type="number" id="fuelTime" className="input-field" value={fuelTime} onChange={(e) => setFuelTime(e.target.value)} placeholder="e.g. 2.5" />
              </div>
            </section>
          )}

          {currentStep === 1 && (
            <section className="flightbrief-panel">
              <h2 className="text-xl font-bold mb-4">Route & Lesson</h2>

              <div className="inline-label-input">
                <label className="label" htmlFor="departure">Departure Point:</label>
                <input type="text" id="departure" className="input-field" value={departure} onChange={(e) => onSetDeparture(e.target.value)} required />
              </div>

              <div className="flightbrief-toggleRow">
                <button type="button" className={`btn-toggle ${routeMode === "cross" ? "active" : ""}`} onClick={onSelectCross}>
                  Cross Country
                </button>
                <button type="button" className={`btn-toggle ${routeMode === "local" ? "active" : ""}`} onClick={onSelectLocal}>
                  Local Practice
                </button>
              </div>

              {routeMode === "cross" && (
                <div className="space-y-3 mt-4">
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

              <div className="inline-label-input mt-4">
                <label className="label" htmlFor="arrival">Arrival Point:</label>
                <input type="text" id="arrival" className="input-field" value={arrival} onChange={(e) => setArrival(e.target.value)} required readOnly={routeMode === "local"} />
              </div>

              <div className="section inline-label-input">
                <label className="label" htmlFor="lessonPractice"><strong>Lesson Practice:</strong></label>
                <input type="text" id="lessonPractice" className="input-field" value={lessonPractice} onChange={(e) => setLessonPractice(e.target.value)} placeholder="e.g., Steep Turns, Slow Flight, Short Field Landing" />
              </div>
            </section>
          )}

          {currentStep === 2 && (
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
              className="bg-indigo-600 text-white px-6 py-2 rounded hover:bg-indigo-700"
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

          <div>
            <h3>🟢 METAR</h3>
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
                        <strong className="text-lg">{icao}</strong>
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
          </div>

          <div>
            <h3>🟡 TAF</h3>
            <div className="space-y-2">
              {Object.keys(tafByIcao).length === 0 ? (
                <div className="text-sm text-gray-500">No TAF yet.</div>
              ) : (
                Object.entries(tafByIcao).map(([icao, text]) => (
                  <div key={icao} className="bg-gray-100 p-3 rounded border mb-2" style={{ whiteSpace: "pre-wrap" }}>
                    {text}
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <h3>🔴 AIRMET/SIGMET</h3>
            <div className="space-y-2">
              <div className="bg-gray-100 p-3 rounded border">
                {airsigmetSummary || "No active AIRMET/SIGMETs (or not fetched)."}
              </div>
            </div>
          </div>

          <div>
            <h3 className="section-subtitle">📏 Density Altitude (DA)</h3>
            <div className="inline-label-input">
              <label className="label" htmlFor="fieldElevation">Field Elevation (ft)</label>
              <input type="number" id="fieldElevation" className="input-field" value={fieldElevation} onChange={(e) => setFieldElevation(e.target.value)} placeholder="e.g. 2500" />
            </div>

            <div className="inline-label-input">
              <label className="label" htmlFor="outsideTemp">Outside Air Temperature (°C)</label>
              <input type="number" id="outsideTemp" className="input-field" readOnly value={outsideTemp} placeholder="(auto from METAR)" />
            </div>

            <button type="button" className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 mb-2" onClick={calculateDA}>
              Calculate DA
            </button>

            <div className="text-sm text-gray-700 font-medium mt-2">{daResult}</div>
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

          {currentStep === 3 && (
            <section className="flightbrief-panel">
              <h2 className="text-xl font-bold mb-4">Aircraft Conditions</h2>
              <div className="space-y-4">
          <div className="inline-label-input">
            <label className="label" htmlFor="grossWeight">Total Gross Weight (lbs):</label>
            <input type="number" id="grossWeight" className="input-field" value={grossWeight} onChange={(e) => setGrossWeight(e.target.value)} placeholder="e.g. 2400" />
          </div>

          <div className="inline-label-input">
            <label className="label" htmlFor="withinLimitsConfirmed">
              Confirm weight & CG <strong>within limits</strong>:
            </label>
            <input
              id="withinLimitsConfirmed"
              type="checkbox"
              checked={withinLimitsConfirmed}
              onChange={(e) => setWithinLimitsConfirmed(e.target.checked)}
              style={{ transform: "scale(1.2)" }}
            />
            <span className={`text-sm ml-2 ${withinLimitsConfirmed ? "text-green-600" : "text-red-600"}`}>
              {withinLimitsConfirmed ? "✅ Confirmed" : "❌ Not Confirmed"}
            </span>
          </div>

          <div className="inline-label-input">
            <label className="label" htmlFor="mx-now">Mx Time Now:</label>
            <input type="number" id="mx-now" className="input-field" value={mxNow} onChange={(e) => setMxNow(e.target.value)} placeholder="Check Aircraft" />
          </div>

          <div className="inline-label-input">
            <label className="label" htmlFor="mx-due">Next Mx Due:</label>
            <input type="number" id="mx-due" className="input-field" value={mxDue} onChange={(e) => setMxDue(e.target.value)} placeholder="Next 100 hr/annual eg." />
          </div>
              </div>
            </section>
          )}

          {currentStep === 4 && (
            <section className="flightbrief-panel">
              <h2>Risk Assessment</h2>
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
                  <p>{riskMeta.advice}</p>
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
    </div>
  );
}
