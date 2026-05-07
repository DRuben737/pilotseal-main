"use client";

import React, { useMemo } from "react";
import { useToolState } from "@/stores/toolState";
import decoderData from "./decoderData";
import { decodeGlossary } from "./weatherDecoder/glossaryLookup";
import { parseMetar } from "./weatherDecoder/metarParser";
import { parseNotam } from "./weatherDecoder/notamParser";
import { parseTaf } from "./weatherDecoder/tafParser";

const modeOptions = [
  { id: "auto", label: "Auto" },
  { id: "metar", label: "METAR" },
  { id: "taf", label: "TAF" },
  { id: "notam", label: "NOTAM" },
  { id: "glossary", label: "Glossary" },
];

function ordinalDay(dayValue) {
  const day = Number(dayValue);
  if (!Number.isFinite(day)) return String(dayValue);
  const mod10 = day % 10;
  const mod100 = day % 100;
  if (mod10 === 1 && mod100 !== 11) return `${day}st`;
  if (mod10 === 2 && mod100 !== 12) return `${day}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${day}rd`;
  return `${day}th`;
}

function detectMode(input, selectedMode) {
  if (selectedMode !== "auto") return selectedMode;
  const normalized = input.trim().toUpperCase();
  if (!normalized) return "glossary";
  if (
    normalized.startsWith("!") ||
    normalized.startsWith("FDC ") ||
    /\b[A-Z]\d{4}\/\d{2}\b/.test(normalized)
  ) {
    return "notam";
  }
  if (normalized.startsWith("TAF ") || normalized.includes(" FM")) return "taf";
  if (
    normalized.startsWith("METAR ") ||
    normalized.startsWith("SPECI ") ||
    /\b\d{6}Z\b/.test(normalized)
  ) {
    return "metar";
  }
  return "glossary";
}

function formatTimeToken(token) {
  if (!token) return "—";
  if (/^\d{6}Z$/.test(token)) {
    return `${ordinalDay(token.slice(0, 2))} ${token.slice(2, 4)}:${token.slice(4, 6)}Z`;
  }
  if (/^\d{4}\/\d{4}$/.test(token)) {
    return `${token.slice(0, 2)}${token.slice(2, 4)}Z to ${token.slice(5, 7)}${token.slice(7, 9)}Z`;
  }
  if (/^\d{6}$/.test(token)) {
    return `${ordinalDay(token.slice(0, 2))} ${token.slice(2, 4)}Z to ${token.slice(4, 6)}Z`;
  }
  if (/^\d{4}$/.test(token)) {
    return `${token.slice(0, 2)}Z to ${token.slice(2, 4)}Z`;
  }
  return token;
}

const REMARK_WEATHER_MAP = {
  TS: "thunderstorm",
  RA: "rain",
  SN: "snow",
  DZ: "drizzle",
  PE: "ice pellets",
  PL: "ice pellets",
  GR: "hail",
  GS: "small hail / snow pellets",
  UP: "unknown precipitation",
};

const CLOUD_TYPE_MAP = {
  0: "none detected",
  1: "cirrus",
  2: "cirrocumulus",
  3: "cirrostratus",
  4: "altocumulus",
  5: "altostratus",
  6: "nimbostratus",
  7: "stratocumulus",
  8: "cumulus",
  9: "cumulonimbus",
  "/": "not reported",
};

const REMARK_DIRECTION_MAP = {
  N: "north",
  NE: "northeast",
  E: "east",
  SE: "southeast",
  S: "south",
  SW: "southwest",
  W: "west",
  NW: "northwest",
};

function formatRemarkMinutes(value) {
  return `:${String(value).padStart(2, "0")}`;
}

function decodeWeatherBeginEndToken(token) {
  const match = token.match(/^([A-Z]{2,})(B|E)(\d{2})$/);
  if (!match) return null;

  const [, weatherCode, phaseCode, minuteToken] = match;
  const weather = REMARK_WEATHER_MAP[weatherCode];
  if (!weather) return null;

  return `${token} (${weather} ${phaseCode === "B" ? "began" : "ended"} at ${formatRemarkMinutes(minuteToken)})`;
}

function decodeSingleRemarkToken(token) {
  if (REMARK_WEATHER_MAP[token]) {
    return `${token} (${REMARK_WEATHER_MAP[token]})`;
  }

  if (/^AO[12]$/.test(token)) {
    return `${token} (automated station with ${token === "AO2" ? "precipitation sensor" : "no precipitation sensor"})`;
  }

  const weatherBeginEnd = decodeWeatherBeginEndToken(token);
  if (weatherBeginEnd) {
    return weatherBeginEnd;
  }

  if (/^P\d{4}$/.test(token)) {
    const inches = Number(token.slice(1)) / 100;
    return `${token} (${inches.toFixed(2)} inches precipitation in the last hour)`;
  }

  if (/^6\d{4}$/.test(token)) {
    const inches = Number(token.slice(1)) / 100;
    return `${token} (${inches.toFixed(2)} inches precipitation in the past 3 or 6 hours)`;
  }

  if (/^7\d{4}$/.test(token)) {
    const inches = Number(token.slice(1)) / 100;
    return `${token} (${inches.toFixed(2)} inches precipitation in the past 24 hours)`;
  }

  if (/^4\/\d{3}$/.test(token)) {
    const depth = Number(token.slice(2));
    return `${token} (snow depth ${depth} inches)`;
  }

  if (/^8\/[0-9\/]{3}$/.test(token)) {
    const low = CLOUD_TYPE_MAP[token[2]] ?? "unknown";
    const mid = CLOUD_TYPE_MAP[token[3]] ?? "unknown";
    const high = CLOUD_TYPE_MAP[token[4]] ?? "unknown";
    return `${token} (cloud types low ${low}, middle ${mid}, high ${high})`;
  }

  if (token === "SLPNO") {
    return `${token} (sea level pressure not available)`;
  }

  if (token === "PRESFR") {
    return `${token} (pressure falling rapidly)`;
  }

  if (token === "PRESRR") {
    return `${token} (pressure rising rapidly)`;
  }

  if (token === "RVRNO") {
    return `${token} (runway visual range not available)`;
  }

  const glossaryMatch = decoderData.find(
    (item) => item.contraction.toUpperCase() === token.toUpperCase()
  );
  if (glossaryMatch) {
    return `${token} (${glossaryMatch.definition})`;
  }

  if (/^SLP\d{3}$/.test(token)) {
    const digits = token.slice(3);
    const pressure = Number(`10${digits.slice(0, 2)}.${digits.slice(2)}`);
    return `${token} (sea level pressure ${pressure.toFixed(1)} hPa)`;
  }

  if (/^T[01]\d{3}[01]\d{3}$/.test(token)) {
    const tempSign = token[1] === "1" ? -1 : 1;
    const dewSign = token[5] === "1" ? -1 : 1;
    const temp = (tempSign * Number(token.slice(2, 5))) / 10;
    const dew = (dewSign * Number(token.slice(6, 9))) / 10;
    return `${token} (exact temp ${temp.toFixed(1)}°C, dewpoint ${dew.toFixed(1)}°C)`;
  }

  if (/^5\d{4}$/.test(token)) {
    return `${token} (3-hour pressure tendency group)`;
  }

  return token;
}

function decodeRemarks(remarks) {
  if (!remarks) return "";
  const tokens = remarks.split(/\s+/).filter(Boolean);
  const decoded = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1];
    const nextTwo = tokens[index + 2];
    const nextThree = tokens[index + 3];

    if ((token === "TWR" || token === "SFC") && next === "VIS" && nextTwo) {
      decoded.push(
        `${token} VIS ${nextTwo} (${token === "TWR" ? "tower" : "surface"} visibility ${nextTwo})`
      );
      index += 2;
      continue;
    }

    if (token === "VIS" && next && nextTwo && /^[0-9]/.test(next) && nextTwo.includes("V")) {
      decoded.push(`VIS ${next} ${nextTwo} (variable prevailing visibility ${next} to ${nextTwo.split("V")[1]})`);
      index += 2;
      continue;
    }

    if (
      REMARK_WEATHER_MAP[token] &&
      next === "OHD" &&
      nextTwo === "MOV" &&
      REMARK_DIRECTION_MAP[nextThree]
    ) {
      decoded.push(
        `${token} OHD MOV ${nextThree} (${REMARK_WEATHER_MAP[token]} overhead moving ${REMARK_DIRECTION_MAP[nextThree]})`
      );
      index += 3;
      continue;
    }

    if (REMARK_WEATHER_MAP[token] && next === "OHD") {
      decoded.push(`${token} OHD (${REMARK_WEATHER_MAP[token]} overhead)`);
      index += 1;
      continue;
    }

    if (
      REMARK_WEATHER_MAP[token] &&
      next === "MOV" &&
      REMARK_DIRECTION_MAP[nextTwo]
    ) {
      decoded.push(
        `${token} MOV ${nextTwo} (${REMARK_WEATHER_MAP[token]} moving ${REMARK_DIRECTION_MAP[nextTwo]})`
      );
      index += 2;
      continue;
    }

    if (token === "PK" && next === "WND" && tokens[index + 2]) {
      const match = tokens[index + 2].match(/^(\d{3})(\d{2,3})\/(\d{2})$/);
      if (match) {
        const [, direction, speed, minute] = match;
        decoded.push(
          `PK WND ${tokens[index + 2]} (peak wind ${direction}° at ${speed} kt at ${formatRemarkMinutes(minute)})`
        );
        index += 2;
        continue;
      }
    }

    if (token === "WSHFT") {
      if (next && /^\d{2,4}$/.test(next)) {
        const minute = next.length === 2 ? next : next.slice(-2);
        const froPa = tokens[index + 2] === "FROPA" ? " due to frontal passage" : "";
        decoded.push(
          `WSHFT ${next}${tokens[index + 2] === "FROPA" ? " FROPA" : ""} (wind shift at ${formatRemarkMinutes(minute)}${froPa})`
        );
        index += tokens[index + 2] === "FROPA" ? 2 : 1;
        continue;
      }
      decoded.push("WSHFT (wind shift)");
      continue;
    }

    if (token === "VIS" && next && /^\d/.test(next)) {
      if (nextTwo && /^(RWY|N|NE|E|SE|S|SW|W|NW)\d*/.test(nextTwo)) {
        decoded.push(`VIS ${next} ${nextTwo} (visibility ${next} at ${nextTwo})`);
        index += 2;
      } else {
        decoded.push(`VIS ${next} (remark visibility ${next})`);
        index += 1;
      }
      continue;
    }

    if (token === "CIG" && next && /^\d{3}V\d{3}$/.test(next)) {
      const [low, high] = next.split("V").map((value) => Number(value) * 100);
      decoded.push(`CIG ${next} (ceiling variable between ${low.toLocaleString()} and ${high.toLocaleString()} ft)`);
      index += 1;
      continue;
    }

    if (token === "CIG" && next && /^\d{3}$/.test(next) && nextTwo) {
      decoded.push(`CIG ${next} ${nextTwo} (ceiling ${Number(next) * 100} ft at ${nextTwo})`);
      index += 2;
      continue;
    }

    decoded.push(decodeSingleRemarkToken(token));
  }

  return decoded.join(" ");
}

function formatClouds(clouds) {
  if (!clouds?.length) return "—";
  return clouds
    .map((layer) => {
      const qualifier =
        layer.qualifier === "CB"
          ? " cumulonimbus"
          : layer.qualifier === "TCU"
            ? " towering cumulus"
            : "";
      return `${layer.amount || layer.code} ${layer.heightFt.toLocaleString()} ft${qualifier}`;
    })
    .join(", ");
}

function joinSentences(parts) {
  return parts.filter(Boolean).join(" ");
}

function joinLines(parts) {
  return parts.filter(Boolean);
}

function categoryTone(category) {
  if (category === "VFR") return "decoder-badge-vfr";
  if (category === "MVFR") return "decoder-badge-mvfr";
  if (category === "IFR") return "decoder-badge-ifr";
  if (category === "LIFR") return "decoder-badge-lifr";
  return "";
}

function SummaryCard({ label, value, tone = "" }) {
  return (
    <article className={`decoder-summary-card ${tone}`.trim()}>
      <span>{label}</span>
      <strong>{value || "—"}</strong>
    </article>
  );
}

function FieldRow({ label, value }) {
  return (
    <div className="decoder-field-row">
      <span>{label}</span>
      <strong>{value || "—"}</strong>
    </div>
  );
}

function buildMetarReadout(report, decodedRemarks) {
  const weatherText = report.weather.length
    ? `Weather ${report.weather.map((item) => item.text).join(", ")}.`
    : null;

  const visibilityText = report.visibility?.text
    ? `Visibility ${report.visibility.text}${report.runwayVisualRanges?.length ? `, runway visual range ${report.runwayVisualRanges.join(", ")}` : ""}.`
    : report.runwayVisualRanges?.length
      ? `Runway visual range ${report.runwayVisualRanges.join(", ")}.`
      : null;

  const cloudText = report.clouds.length ? `Clouds ${formatClouds(report.clouds)}.` : null;

  const ceilingText = report.ceilingFt
    ? `Ceiling ${report.ceilingFt.toLocaleString()} feet.`
    : null;

  return joinLines([
    report.reportType && report.station
      ? `${report.reportType} ${report.station}`
      : report.station
        ? `${report.station}`
        : report.reportType || "This station",
    report.time ? `observation taken on the ${formatTimeToken(report.time)}.` : "observation available.",
    report.automation === "AUTO" ? "This is an automated report." : null,
    report.automation === "COR" ? "This is a corrected report." : null,
    report.wind
      ? `Wind ${report.wind.direction} at ${report.wind.speedKt} knots${report.wind.gustKt ? `, gusting ${report.wind.gustKt}` : ""}.`
      : null,
    report.variableWind
      ? `Wind direction variable between ${report.variableWind.from}° and ${report.variableWind.to}°.`
      : null,
    visibilityText,
    weatherText,
    cloudText,
    ceilingText,
    report.temperature != null && report.dewpoint != null
      ? `Temperature ${report.temperature}°C, dewpoint ${report.dewpoint}°C.`
      : null,
    report.altimeter ? `Altimeter ${report.altimeter}.` : null,
    decodedRemarks ? `Remarks: ${decodedRemarks}.` : null,
  ]);
}

function buildTafReadout(report) {
  const intro = joinSentences([
    report.station ? `TAF ${report.station}.` : "TAF forecast.",
    report.issueTime ? `Issued ${formatTimeToken(report.issueTime)}.` : null,
    report.validPeriod ? `Valid ${formatTimeToken(report.validPeriod)}.` : null,
  ]);

  const segmentReadouts = report.segments.map((segment) =>
    joinSentences([
      `${segment.label} ${segment.timeLabel || segment.type}.`,
      segment.wind ? `Wind ${segment.wind.raw}.` : null,
      segment.visibility?.text ? `Visibility ${segment.visibility.text}.` : null,
      segment.weather.length ? `Weather ${segment.weather.map((item) => item.text).join(", ")}.` : null,
      segment.clouds.length ? `Clouds ${formatClouds(segment.clouds)}.` : null,
      segment.windShear ? `Wind shear ${segment.windShear.replace(/^WS/, "")}.` : null,
    ])
  );

  return [intro, ...segmentReadouts].filter(Boolean);
}

function DecodedCopy({ lines }) {
  const normalized = Array.isArray(lines) ? lines : [lines];
  return (
    <div className="decoder-result-copy">
      {normalized.filter(Boolean).map((line, index) => (
        <p key={`${index}-${line.slice(0, 24)}`}>{line}</p>
      ))}
    </div>
  );
}

function GlossaryPanel({ input }) {
  const glossary = useMemo(() => decodeGlossary(input, "All", decoderData), [input]);

  if (!glossary.words.length) {
    return <div className="decoder-empty">Start with METAR, TAF, or an abbreviation list.</div>;
  }

  if (!glossary.matches.length) {
    return <div className="decoder-empty">No matching terms found in the selected category.</div>;
  }

  return (
    <>
      <DecodedCopy lines={glossary.naturalLanguageResult} />
      <div className="decoder-definition-list">
        {glossary.matches.map((item) => (
          <article key={`${item.contraction}-${item.usage}`} className="decoder-definition-card">
            <div>
              <p className="muted-kicker">{item.usage}</p>
              <h3>{item.contraction}</h3>
            </div>
            <p>{item.definition}</p>
          </article>
        ))}
      </div>
    </>
  );
}

function NotamPanel({ report }) {
  return (
    <div className="decoder-output-stack">
      <DecodedCopy lines={report.decodedBody} />

      <details className="decoder-details">
        <summary className="decoder-detailsSummary">View details</summary>
        <div className="decoder-detailsBody">
          <section className="decoder-block">
            <div className="decoder-section-head">
              <h2>Decoded Fields</h2>
              <p>Structured breakdown of the notice.</p>
            </div>
            <div className="decoder-field-grid">
              <FieldRow label="Source" value={report.source} />
              <FieldRow label="Accountability" value={report.accountability} />
              <FieldRow label="Location" value={report.location} />
              <FieldRow label="Identifier" value={report.notamNumber} />
              <FieldRow label="Subject" value={report.subject} />
              <FieldRow label="Condition" value={report.condition} />
              <FieldRow label="Effective" value={report.effectiveWindow || report.timeWindowToken || "—"} />
            </div>
          </section>
        </div>
      </details>
    </div>
  );
}

function MetarPanel({ report }) {
  const decodedRemarks = decodeRemarks(report.remarks);
  const readout = buildMetarReadout(report, decodedRemarks);

  return (
    <div className="decoder-output-stack">
      <DecodedCopy lines={readout?.length ? readout : "No decoded readout available."} />

      <details className="decoder-details">
        <summary className="decoder-detailsSummary">View details</summary>
        <div className="decoder-detailsBody">
          <section className="decoder-block">
            <div className="decoder-section-head">
              <h2>Decoded Fields</h2>
              <p>Structured breakdown of the observation.</p>
            </div>
            <div className="decoder-field-grid">
              <FieldRow label="Type" value={report.reportType || "METAR"} />
              <FieldRow label="Station" value={report.station} />
              <FieldRow label="Observed" value={formatTimeToken(report.time)} />
              <FieldRow label="Modifier" value={report.automation || "—"} />
              <FieldRow label="Wind" value={report.wind ? report.wind.raw : "—"} />
              <FieldRow label="Variable wind" value={report.variableWind?.raw || "—"} />
              <FieldRow label="Visibility" value={report.visibility?.text || "—"} />
              <FieldRow
                label="Runway visual range"
                value={report.runwayVisualRanges?.length ? report.runwayVisualRanges.join(", ") : "—"}
              />
              {report.weather.length ? (
                <FieldRow
                  label="Weather"
                  value={report.weather.map((item) => item.text).join(", ")}
                />
              ) : null}
              <FieldRow label="Clouds" value={formatClouds(report.clouds)} />
              <FieldRow
                label="Temp / Dewpoint"
                value={
                  report.temperature != null && report.dewpoint != null
                    ? `${report.temperature}°C / ${report.dewpoint}°C`
                    : "—"
                }
              />
              <FieldRow label="Altimeter" value={report.altimeter} />
              <FieldRow label="Category" value={report.flightCategory} />
              <FieldRow label="Remarks" value={decodedRemarks || report.remarks || "None"} />
            </div>
          </section>
        </div>
      </details>
    </div>
  );
}

function TafPanel({ report }) {
  const readout = buildTafReadout(report);

  return (
    <div className="decoder-output-stack">
      <DecodedCopy lines={readout?.length ? readout : "No forecast readout available."} />

      <details className="decoder-details">
        <summary className="decoder-detailsSummary">View details</summary>
        <div className="decoder-detailsBody">
          <section className="decoder-block">
            <div className="decoder-section-head">
              <h2>Forecast Segments</h2>
              <p>Each segment is shown as a separate operational block.</p>
            </div>
            <div className="decoder-summary-grid">
              <SummaryCard label="Station" value={report.station} />
              <SummaryCard label="Issued" value={formatTimeToken(report.issueTime)} />
              <SummaryCard label="Valid" value={formatTimeToken(report.validPeriod)} />
              <SummaryCard label="Worst" value={report.worstCategory} tone={categoryTone(report.worstCategory)} />
            </div>
            <div className="decoder-timeline">
              {report.segments.map((segment, index) => (
                <article key={`${segment.type}-${segment.timeLabel}-${index}`} className="decoder-timeline-card">
                  <div className="decoder-timeline-head">
                    <div>
                      <p className="muted-kicker">{segment.label}</p>
                      <h3>{segment.timeLabel || segment.type}</h3>
                    </div>
                    <span className={`decoder-badge ${categoryTone(segment.flightCategory)}`.trim()}>
                      {segment.flightCategory || "—"}
                    </span>
                  </div>
                  <div className="decoder-field-grid decoder-field-grid-tight">
                    <FieldRow label="Wind" value={segment.wind ? segment.wind.raw : "—"} />
                    <FieldRow label="Visibility" value={segment.visibility?.text || "—"} />
                    <FieldRow label="Clouds" value={formatClouds(segment.clouds)} />
                    <FieldRow
                      label="Weather"
                      value={segment.weather.length ? segment.weather.map((item) => item.text).join(", ") : "None explicit"}
                    />
                    <FieldRow label="Wind shear" value={segment.windShear || "—"} />
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </details>
    </div>
  );
}

const Decoder = () => {
  const { decoder, setDecoder } = useToolState();
  const input = decoder.input ?? "";
  const selectedMode = decoder.mode ?? "auto";
  const resolvedMode = detectMode(input, selectedMode);

  const metarReport = useMemo(
    () => (resolvedMode === "metar" ? parseMetar(input) : null),
    [input, resolvedMode]
  );

  const tafReport = useMemo(
    () => (resolvedMode === "taf" ? parseTaf(input) : null),
    [input, resolvedMode]
  );

  const notamReport = useMemo(
    () => (resolvedMode === "notam" ? parseNotam(input) : null),
    [input, resolvedMode]
  );

  return (
    <div className="decoder-shell">
      <section className="decoder-pane">
        <div className="decoder-section-head">
          <h2>Enter aviation text</h2>
          <p>Paste a METAR, TAF, NOTAM, or shorthand string and decode it in-place.</p>
        </div>

        <div className="decoder-chip-group">
          {modeOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`decoder-chip ${selectedMode === option.id ? "decoder-chip-active" : ""}`}
              onClick={() =>
                setDecoder((current) => ({ ...current, mode: option.id }))
              }
            >
              {option.label}
            </button>
          ))}
        </div>

        <textarea
          className="decoder-input"
          placeholder="Example: KPDX 121953Z 28012KT 10SM BKN045 16/09 A2992 RMK AO2"
          value={input}
          onChange={(event) =>
            setDecoder((current) => ({ ...current, input: event.target.value }))
          }
        />
      </section>

      <section className="decoder-pane decoder-results">
        <div className="decoder-section-head">
          <h2>Decoded output</h2>
          <p>
            {input.trim()
              ? `Mode: ${resolvedMode.toUpperCase()}`
              : "Enter weather text to start decoding"}
          </p>
        </div>

        {!input.trim() ? (
          <div className="decoder-empty">
            Start with a METAR, TAF, or abbreviation list in the input panel.
          </div>
        ) : null}

        {input.trim() && resolvedMode === "metar" ? (
          metarReport ? (
            <MetarPanel report={metarReport} />
          ) : (
            <div className="decoder-empty">Unable to parse this METAR format yet.</div>
          )
        ) : null}

        {input.trim() && resolvedMode === "taf" ? (
          tafReport ? (
            <TafPanel report={tafReport} />
          ) : (
            <div className="decoder-empty">Unable to parse this TAF format yet.</div>
          )
        ) : null}

        {input.trim() && resolvedMode === "notam" ? (
          notamReport ? (
            <NotamPanel report={notamReport} />
          ) : (
            <div className="decoder-empty">Unable to parse this NOTAM format yet.</div>
          )
        ) : null}

        {input.trim() && resolvedMode === "glossary" ? (
          <GlossaryPanel input={input} />
        ) : null}
      </section>
    </div>
  );
};

export default Decoder;
