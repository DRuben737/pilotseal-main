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
  return token;
}

function decodeSingleRemarkToken(token) {
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
  return remarks
    .split(/\s+/)
    .filter(Boolean)
    .map(decodeSingleRemarkToken)
    .join(" ");
}

function formatClouds(clouds) {
  if (!clouds?.length) return "—";
  return clouds
    .map((layer) => `${layer.amount || layer.code} ${layer.heightFt.toLocaleString()} ft`)
    .join(", ");
}

function joinSentences(parts) {
  return parts.filter(Boolean).join(" ");
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
    ? `Reported weather: ${report.weather.map((item) => item.text).join(", ")}.`
    : "No significant weather reported.";

  return joinSentences([
    report.station ? `${report.station}` : "This station",
    report.time ? `observation taken on the ${formatTimeToken(report.time)}.` : "observation available.",
    report.flightCategory ? `Flight category is ${report.flightCategory}.` : null,
    report.wind
      ? `Wind ${report.wind.direction} at ${report.wind.speedKt} knots${report.wind.gustKt ? `, gusting ${report.wind.gustKt}` : ""}.`
      : null,
    report.visibility?.text ? `Visibility ${report.visibility.text}.` : null,
    report.ceilingFt
      ? `Ceiling ${report.ceilingFt.toLocaleString()} feet.`
      : "No ceiling reported.",
    report.clouds.length ? `Clouds ${formatClouds(report.clouds)}.` : null,
    report.temperature != null && report.dewpoint != null
      ? `Temperature ${report.temperature}°C, dewpoint ${report.dewpoint}°C.`
      : null,
    report.altimeter ? `Altimeter ${report.altimeter}.` : null,
    weatherText,
    decodedRemarks ? `Remarks: ${decodedRemarks}.` : null,
  ]);
}

function buildTafReadout(report) {
  return joinSentences([
    report.station ? `TAF for ${report.station}.` : "TAF forecast.",
    report.issueTime ? `Issued ${formatTimeToken(report.issueTime)}.` : null,
    report.validPeriod ? `Valid ${formatTimeToken(report.validPeriod)}.` : null,
    report.worstCategory ? `Worst expected category ${report.worstCategory}.` : null,
    ...report.segments.map((segment) =>
      joinSentences([
        `${segment.label} ${segment.timeLabel || segment.type}.`,
        segment.flightCategory ? `${segment.flightCategory} conditions.` : null,
        segment.wind ? `Wind ${segment.wind.raw}.` : null,
        segment.visibility?.text ? `Visibility ${segment.visibility.text}.` : null,
        segment.clouds.length ? `Clouds ${formatClouds(segment.clouds)}.` : null,
        segment.weather.length ? `Weather ${segment.weather.join(", ")}.` : "No explicit weather.",
      ])
    ),
  ]);
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
      <div className="decoder-result-copy">{glossary.naturalLanguageResult}</div>
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
      <div className="decoder-result-copy">{report.decodedBody}</div>

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
      <div className="decoder-result-copy">{readout || "No decoded readout available."}</div>

      <details className="decoder-details">
        <summary className="decoder-detailsSummary">View details</summary>
        <div className="decoder-detailsBody">
          <section className="decoder-block">
            <div className="decoder-section-head">
              <h2>Decoded Fields</h2>
              <p>Structured breakdown of the observation.</p>
            </div>
            <div className="decoder-field-grid">
              <FieldRow label="Station" value={report.station} />
              <FieldRow label="Observed" value={formatTimeToken(report.time)} />
              <FieldRow label="Category" value={report.flightCategory} />
              <FieldRow label="Wind" value={report.wind ? report.wind.raw : "—"} />
              <FieldRow label="Visibility" value={report.visibility?.text || "—"} />
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
      <div className="decoder-result-copy">{readout || "No forecast readout available."}</div>

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
                      value={segment.weather.length ? segment.weather.join(", ") : "None explicit"}
                    />
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
