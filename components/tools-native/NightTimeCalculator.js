"use client";

import React, { useEffect, useMemo, useState } from "react";
import { DateTime } from "luxon";
import { UsDateInput } from "@/components/forms/UsDateInput";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const NightTimeCalculator = () => {
  const [location, setLocation] = useState("");
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [zone, setZone] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [sunPrevious, setSunPrevious] = useState(null);
  const [sunToday, setSunToday] = useState(null);
  const [sunNext, setSunNext] = useState(null);
  const [cursorPosition, setCursorPosition] = useState(null);

  useEffect(() => {
    setDate(DateTime.local().toFormat("yyyy-MM-dd"));
  }, []);

  const handleCalculate = async () => {
    if (!location || !date) return;

    const parsedDate = DateTime.fromISO(date);
    if (!parsedDate.isValid) {
      setSunPrevious(null);
      setSunToday(null);
      setSunNext(null);
      setZone(null);
      setDisplayName("");
      setError("Invalid date.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/night", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location, date }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Failed to fetch night data.");
      }

      setZone(data?.zone ?? null);
      setDisplayName(data?.displayName ?? location);
      setSunPrevious(data?.sunPrevious ?? null);
      setSunToday(data?.sunToday ?? null);
      setSunNext(data?.sunNext ?? null);
      setCursorPosition(null);
    } catch (err) {
      setSunPrevious(null);
      setSunToday(null);
      setSunNext(null);
      setZone(null);
      setDisplayName("");
      setCursorPosition(null);
      setError(err instanceof Error ? err.message : "Failed to fetch night data.");
    } finally {
      setLoading(false);
    }
  };

  const nightReference = useMemo(() => {
    if (!sunPrevious || !sunToday || !sunNext || !zone) return null;

    const toLocal = (iso) => DateTime.fromISO(iso, { zone: "utc" }).setZone(zone);
    const selectedStart = DateTime.fromISO(date, { zone }).startOf("day");
    const selectedEnd = selectedStart.plus({ days: 1 });
    const selectedNoon = selectedStart.set({ hour: 12 });

    const previousSunset = toLocal(sunPrevious.raw.sunset);
    const previousCivilDusk = toLocal(sunPrevious.raw.civilDusk);
    const sunrise = toLocal(sunToday.raw.sunrise);
    const civilDawn = toLocal(sunToday.raw.civilDawn);
    const sunset = toLocal(sunToday.raw.sunset);
    const civilDusk = toLocal(sunToday.raw.civilDusk);
    const nextSunrise = toLocal(sunNext.raw.sunrise);
    const nextCivilDawn = toLocal(sunNext.raw.civilDawn);

    const rangeStart = previousSunset;
    const rangeEnd = nextSunrise;
    const startMs = rangeStart.toMillis();
    const endMs = rangeEnd.toMillis();
    const durationMs = endMs - startMs;
    const percentAt = (dt) => clamp(((dt.toMillis() - startMs) / durationMs) * 100, 0, 100);
    const svgX = (dt) => percentAt(dt) * 10;
    const interval = (start, end) => ({ start, end, left: percentAt(start), width: percentAt(end) - percentAt(start) });

    const previousCurrencyBegin = previousSunset.plus({ hours: 1 });
    const morningCurrencyEnd = sunrise.minus({ hours: 1 });
    const currencyBegin = sunset.plus({ hours: 1 });
    const nextCurrencyEnd = nextSunrise.minus({ hours: 1 });

    const tracks = [
      {
        key: "lights",
        label: "Position lights",
        regulation: "14 CFR 91.209",
        intervals: [interval(previousSunset, sunrise), interval(sunset, nextSunrise)],
      },
      {
        key: "night",
        label: "Loggable night",
        regulation: "14 CFR 1.1",
        intervals: [interval(previousCivilDusk, civilDawn), interval(civilDusk, nextCivilDawn)],
      },
      {
        key: "currency",
        label: "Night currency",
        regulation: "14 CFR 61.57(b)",
        intervals: [interval(previousCurrencyBegin, morningCurrencyEnd), interval(currencyBegin, nextCurrencyEnd)],
      },
    ];

    const eventMarkers = [
      { key: "previous-sunset", label: "Previous sunset", dt: previousSunset, tone: "sun" },
      { key: "previous-dusk", label: "Previous civil dusk", dt: previousCivilDusk, tone: "twilight" },
      { key: "civil-dawn", label: "Civil dawn", dt: civilDawn, tone: "twilight" },
      { key: "sunrise", label: "Sunrise", dt: sunrise, tone: "sun" },
      { key: "sunset", label: "Sunset", dt: sunset, tone: "sun" },
      { key: "civil-dusk", label: "Civil dusk", dt: civilDusk, tone: "twilight" },
      { key: "next-dawn", label: "Next civil dawn", dt: nextCivilDawn, tone: "twilight" },
      { key: "next-sunrise", label: "Next sunrise", dt: nextSunrise, tone: "sun" },
    ].map((event) => ({ ...event, percent: percentAt(event.dt) }));

    const eventGroups = [
      {
        key: "previous-evening",
        label: `${previousSunset.toFormat("MMM d")} · evening`,
        anchor: previousCivilDusk,
        edge: "start",
        events: [
          ["Sunset", previousSunset],
          ["Civil dusk", previousCivilDusk],
          ["Currency", previousCurrencyBegin],
        ],
      },
      {
        key: "selected-morning",
        label: `${sunrise.toFormat("MMM d")} · morning`,
        anchor: civilDawn,
        events: [
          ["Currency ends", morningCurrencyEnd],
          ["Civil dawn", civilDawn],
          ["Sunrise", sunrise],
        ],
      },
      {
        key: "selected-evening",
        label: `${sunset.toFormat("MMM d")} · evening`,
        anchor: civilDusk,
        events: [
          ["Sunset", sunset],
          ["Civil dusk", civilDusk],
          ["Currency", currencyBegin],
        ],
      },
      {
        key: "next-morning",
        label: `${nextSunrise.toFormat("MMM d")} · morning`,
        anchor: nextCivilDawn,
        edge: "end",
        events: [
          ["Currency ends", nextCurrencyEnd],
          ["Civil dawn", nextCivilDawn],
          ["Sunrise", nextSunrise],
        ],
      },
    ].map((group) => ({
      ...group,
      percent: percentAt(group.anchor),
      events: group.events.map(([label, dt]) => ({ label, dt })),
    }));

    const firstNightMid = DateTime.fromMillis((previousSunset.toMillis() + sunrise.toMillis()) / 2, { zone });
    const dayMid = DateTime.fromMillis((sunrise.toMillis() + sunset.toMillis()) / 2, { zone });
    const secondNightMid = DateTime.fromMillis((sunset.toMillis() + nextSunrise.toMillis()) / 2, { zone });
    const celestialPaths = {
      firstNight: [
        `M ${svgX(previousSunset)} 150`,
        `C ${svgX(firstNightMid.minus({ hours: 2 }))} 224, ${svgX(firstNightMid.plus({ hours: 2 }))} 224, ${svgX(sunrise)} 150`,
      ].join(" "),
      day: [
      `M ${svgX(sunrise)} 150`,
        `C ${svgX(dayMid.minus({ hours: 3 }))} 42, ${svgX(dayMid.plus({ hours: 3 }))} 42, ${svgX(sunset)} 150`,
      ].join(" "),
      secondNight: [
        `M ${svgX(sunset)} 150`,
        `C ${svgX(secondNightMid.minus({ hours: 2 }))} 224, ${svgX(secondNightMid.plus({ hours: 2 }))} 224, ${svgX(nextSunrise)} 150`,
      ].join(" "),
    };

    const timeTicks = [0, 6, 12, 18, 24]
      .map((hours) => selectedStart.plus({ hours }))
      .filter((dt) => dt >= rangeStart && dt <= rangeEnd)
      .map((dt) => ({
        dt,
        percent: percentAt(dt),
        label: dt.toFormat("HH"),
        date: dt.hour === 0 ? dt.toFormat("MMM d") : null,
      }));

    const gradientStops = [
      [previousSunset, "#263454"],
      [previousCivilDusk, "#172039"],
      [selectedStart, "#11182c"],
      [civilDawn, "#263b5c"],
      [sunrise, "#28577f"],
      [selectedNoon, "#1f5b8d"],
      [sunset, "#2b4a69"],
      [civilDusk, "#1a2742"],
      [selectedEnd, "#11182c"],
      [nextCivilDawn, "#263b5c"],
      [nextSunrise, "#28577f"],
    ].map(([dt, color]) => ({ offset: percentAt(dt), color }));

    return {
      startMs,
      endMs,
      rangeStart,
      rangeEnd,
      selectedStart,
      selectedEnd,
      selectedStartPercent: percentAt(selectedStart),
      selectedEndPercent: percentAt(selectedEnd),
      previousSunset,
      previousCivilDusk,
      sunrise,
      civilDawn,
      sunset,
      civilDusk,
      nextSunrise,
      nextCivilDawn,
      tracks,
      eventMarkers,
      eventGroups,
      celestialPaths,
      timeTicks,
      gradientStops,
      durationMs,
      percentAtMillis: (millis) => clamp(((millis - startMs) / durationMs) * 100, 0, 100),
    };
  }, [date, sunNext, sunPrevious, sunToday, zone]);

  useEffect(() => {
    if (!nightReference) return;

    const target = nightReference.percentAtMillis(nightReference.sunset.toMillis()) * 10;
    setCursorPosition(target);
  }, [nightReference]);

  const activeCursorPosition = nightReference ? clamp(cursorPosition ?? 0, 0, 1000) : null;
  const activeCursorMs = nightReference && activeCursorPosition !== null
    ? nightReference.startMs + (activeCursorPosition / 1000) * nightReference.durationMs
    : null;

  const cursorState = useMemo(() => {
    if (!nightReference || activeCursorMs === null || !zone) return null;

    const isWithin = (interval) => activeCursorMs >= interval.start.toMillis() && activeCursorMs <= interval.end.toMillis();
    const statuses = Object.fromEntries(
      nightReference.tracks.map((track) => [track.key, track.intervals.some(isWithin)])
    );
    const cursorDate = DateTime.fromMillis(activeCursorMs, { zone });
    const firstNight = activeCursorMs <= nightReference.sunrise.toMillis();
    const isDay = activeCursorMs >= nightReference.sunrise.toMillis() && activeCursorMs <= nightReference.sunset.toMillis();
    const nightStart = firstNight ? nightReference.previousSunset : nightReference.sunset;
    const nightEnd = firstNight ? nightReference.sunrise : nightReference.nextSunrise;
    const phaseProgress = clamp((activeCursorMs - nightStart.toMillis()) / (nightEnd.toMillis() - nightStart.toMillis()), 0, 1);
    const dayProgress = clamp(
      (activeCursorMs - nightReference.sunrise.toMillis()) /
        (nightReference.sunset.toMillis() - nightReference.sunrise.toMillis()),
      0,
      1
    );
    const y = isDay
      ? 150 - Math.sin(Math.PI * dayProgress) * 108
      : 150 + Math.sin(Math.PI * phaseProgress) * 74;
    const isTwilight = nightReference.eventMarkers.some((event) =>
      Math.abs(activeCursorMs - event.dt.toMillis()) <= 35 * 60 * 1000
    );

    return {
      date: cursorDate,
      percent: nightReference.percentAtMillis(activeCursorMs),
      x: nightReference.percentAtMillis(activeCursorMs) * 10,
      y,
      phase: isTwilight ? "twilight" : isDay ? "sun" : "moon",
      statuses,
    };
  }, [activeCursorMs, nightReference, zone]);

  return (
    <div className="night-tool-shell">
      <section className="night-tool-inputSection" aria-labelledby="night-input-title">
        <div className="night-tool-head">
          <p className="night-tool-eyebrow">Night operations</p>
          <h2 id="night-input-title">Night reference calculator</h2>
          <p>Enter an airport, city, or coordinates to map the full overnight regulatory window.</p>
        </div>

        <div className="night-tool-inputRow">
          <div className="night-tool-fields">
            <label className="night-tool-field">
              <span>Location</span>
              <input
                type="text"
                placeholder="Example: KTIX or Titusville, FL"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
              />
            </label>
            <div className="night-tool-field">
              <span id="night-date-label">Date</span>
              <div className="night-tool-dateControl">
                <UsDateInput value={date} onChange={setDate} aria-labelledby="night-date-label" />
                <input
                  className="night-tool-datePicker"
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  aria-label="Choose date from calendar"
                />
                <svg className="night-tool-calendarIcon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 3v3M17 3v3M4.5 9h15M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
                </svg>
              </div>
            </div>
          </div>
          <button className="primary-button night-tool-button" onClick={handleCalculate} disabled={loading} type="button">
            {loading ? "Loading…" : "Show timeline"}
          </button>
        </div>
      </section>

      {error ? <div className="night-tool-empty" role="alert">{error}</div> : null}

      {nightReference && cursorState && zone ? (
        <section className="night-tool-results" aria-live="polite" aria-labelledby="night-results-title">
          <div className="night-tool-resultsHead">
            <div>
              <p className="night-tool-eyebrow">Previous sunset to next sunrise</p>
              <h2 id="night-results-title">Twilight timeline</h2>
            </div>
            <p>
              {displayName || location} · {DateTime.fromISO(date, { zone }).toFormat("MMM d, yyyy")} · {zone}
            </p>
          </div>

          <div className="night-tool-visual">
            <div className="night-tool-sky">
              <div className="night-tool-scene">
                <svg viewBox="0 0 1000 320" preserveAspectRatio="none" role="img" aria-label="Celestial path with exact overnight event times">
                  <defs>
                    <linearGradient id="night-sky-gradient" x1="0" x2="1" y1="0" y2="0">
                      {nightReference.gradientStops.map((stop, index) => (
                        <stop key={`${stop.offset}-${index}`} offset={`${stop.offset}%`} stopColor={stop.color} />
                      ))}
                    </linearGradient>
                  </defs>
                  <rect width="1000" height="150" fill="url(#night-sky-gradient)" />
                  <rect width="1000" height="170" y="150" fill="#17191f" />
                  <rect
                    x={nightReference.selectedStartPercent * 10}
                    width={(nightReference.selectedEndPercent - nightReference.selectedStartPercent) * 10}
                    height="320"
                    className="night-tool-selectedDay"
                  />
                  <g className="night-tool-chartGrid" aria-hidden="true">
                    {[74, 112, 188, 244, 282].map((y) => (
                      <line key={y} x1="0" x2="1000" y1={y} y2={y} />
                    ))}
                    {nightReference.timeTicks.map((tick) => (
                      <line key={tick.dt.toISO()} x1={tick.percent * 10} x2={tick.percent * 10} y1="0" y2="320" />
                    ))}
                  </g>
                  <line x1="0" x2="1000" y1="150" y2="150" className="night-tool-horizon" />
                  <path d={nightReference.celestialPaths.firstNight} className="night-tool-celestialPath is-night" pathLength="1" />
                  <path d={nightReference.celestialPaths.day} className="night-tool-celestialPath is-day" pathLength="1" />
                  <path d={nightReference.celestialPaths.secondNight} className="night-tool-celestialPath is-night" pathLength="1" />
                  {nightReference.eventMarkers.map((event) => (
                    <g key={event.key} transform={`translate(${event.percent * 10} 150)`} className={`night-tool-eventPoint is-${event.tone}`}>
                      <line y1="-8" y2="8" />
                      <circle r="3.4" />
                    </g>
                  ))}
                </svg>

                <div className="night-tool-timeTicks" aria-hidden="true">
                  {nightReference.timeTicks.map((tick) => (
                    <span key={tick.dt.toISO()} style={{ left: `${tick.percent}%` }}>
                      <b>{tick.label}</b>
                      {tick.date ? <small>{tick.date}</small> : null}
                    </span>
                  ))}
                </div>

                <div className="night-tool-eventScale" aria-label="Timeline boundary times">
                  {nightReference.eventGroups.map((group) => (
                    <div
                      key={group.key}
                      className={`night-tool-eventGroup ${group.edge ? `is-${group.edge}` : ""}`.trim()}
                      style={{ left: `${group.percent}%` }}
                    >
                      <span className="night-tool-eventStem" aria-hidden="true" />
                      <strong className="night-tool-eventDate">{group.label}</strong>
                      {group.events.map((event) => (
                        <span className="night-tool-eventTime" key={`${group.key}-${event.label}`}>
                          <i>{event.label}</i>
                          <b>
                            <span>{event.dt.toFormat("h:mm a")}</span>
                            <small>{event.dt.toUTC().toFormat("HH:mm'Z'")}</small>
                          </b>
                        </span>
                      ))}
                    </div>
                  ))}
                </div>

              <span
                className="night-tool-cursorLine"
                style={{ left: `${cursorState.percent}%` }}
                aria-hidden="true"
              />
              <span
                className={`night-tool-celestialCursor is-${cursorState.phase}`}
                style={{ left: `${cursorState.percent}%`, top: `${(cursorState.y / 320) * 100}%` }}
                aria-hidden="true"
              >
                {cursorState.phase === "moon" ? (
                  <svg viewBox="0 0 24 24">
                    <path d="M16.9 3.2a8.8 8.8 0 1 0 3.9 14.9A9.3 9.3 0 0 1 16.9 3.2Z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="5.6" />
                    <path d="M12 1.8v2.3M12 19.9v2.3M1.8 12h2.3M19.9 12h2.3M4.8 4.8l1.6 1.6M17.6 17.6l1.6 1.6M19.2 4.8l-1.6 1.6M6.4 17.6l-1.6 1.6" />
                  </svg>
                )}
              </span>

              <div
                className={`night-tool-cursorReadout is-${cursorState.phase} ${cursorState.percent < 12 ? "is-left" : ""} ${cursorState.percent > 88 ? "is-right" : ""}`.trim()}
                style={{ left: `${cursorState.percent}%` }}
              >
                <span>{cursorState.date.toFormat("ccc, MMM d")}</span>
                <strong>{cursorState.date.toFormat("hh:mm a ZZZZ")}</strong>
                <small>{cursorState.date.toUTC().toFormat("HH:mm'Z'")}</small>
              </div>

              <input
                className="night-tool-range"
                type="range"
                min="0"
                max="1000"
                step="1"
                value={activeCursorPosition}
                onChange={(event) => setCursorPosition(Number(event.target.value))}
                onKeyDown={(event) => {
                  const increments = {
                    ArrowRight: 1,
                    ArrowUp: 1,
                    ArrowLeft: -1,
                    ArrowDown: -1,
                  };
                  if (event.key in increments) {
                    event.preventDefault();
                    setCursorPosition((current) => clamp((current ?? 0) + increments[event.key], 0, 1000));
                  } else if (event.key === "Home" || event.key === "End") {
                    event.preventDefault();
                    setCursorPosition(event.key === "Home" ? 0 : 1000);
                  }
                }}
                aria-label="Explore time from the previous sunset to the next sunrise"
                aria-valuetext={cursorState.date.toFormat("MMM d, yyyy, hh:mm a ZZZZ")}
              />
              </div>
            </div>

            <p className="night-tool-visualNote">Drag anywhere on the sky to inspect a time · all horizontal positions use exact elapsed time</p>

            <div className="night-tool-bands">
              {nightReference.tracks.map((track) => (
                <div className={`night-tool-band is-${track.key}`} key={track.key}>
                  <div className="night-tool-bandLabel">
                    <strong>{track.label}</strong>
                    <span>· {track.regulation}</span>
                  </div>
                  <div className="night-tool-bandRail" aria-hidden="true">
                    {track.intervals.map((range, index) => (
                      <span
                        className="night-tool-bandSegment"
                        key={`${track.key}-${index}`}
                        style={{ left: `${range.left}%`, width: `${range.width}%` }}
                      />
                    ))}
                    <span className="night-tool-bandCursor" style={{ left: `${cursorState.percent}%` }} />
                  </div>
                  <span className={`night-tool-status ${cursorState.statuses[track.key] ? "is-active" : ""}`}>
                    {cursorState.statuses[track.key] ? "Active" : "Inactive"}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </section>
      ) : !error ? (
        <div className="night-tool-empty">
          <strong>Your overnight timeline will appear here.</strong>
          <span>Choose a location and date, then show the timeline.</span>
        </div>
      ) : null}
    </div>
  );
};

export default NightTimeCalculator;
