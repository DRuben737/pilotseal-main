"use client";

import React, { useMemo, useState } from "react";
import { DateTime } from "luxon";

const NightTimeCalculator = () => {
  const [location, setLocation] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);
  const [zone, setZone] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [sunToday, setSunToday] = useState(null);
  const [sunNext, setSunNext] = useState(null);

  const handleCalculate = async () => {
    if (!location || !date) return;

    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) {
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          location,
          date,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Failed to fetch night data.");
      }

      setZone(data?.zone ?? null);
      setDisplayName(data?.displayName ?? location);
      setSunToday(data?.sunToday ?? null);
      setSunNext(data?.sunNext ?? null);
    } catch (err) {
      setSunToday(null);
      setSunNext(null);
      setZone(null);
      setDisplayName("");
      setError(err instanceof Error ? err.message : "Failed to fetch night data.");
    } finally {
      setLoading(false);
    }
  };

  const formatLocalTime = (dt, activeZone) => {
    if (!dt || !activeZone) return "N/A";
    const dtLux = DateTime.fromJSDate(dt, { zone: activeZone });
    if (!dtLux.isValid) return "N/A";
    const utc = dtLux.toUTC();
    const tzAbbr = new Intl.DateTimeFormat("en-US", {
      timeZone: activeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    })
      .format(dtLux.toJSDate())
      .split(" ")
      .pop();
    return `${dtLux.toFormat("hh:mm a")} ${tzAbbr} (${utc.toFormat("HH:mm")}Z)`;
  };

  const nightReference = useMemo(() => {
    if (!sunToday || !zone) return null;

    const localStart = DateTime.fromISO(date, { zone }).startOf("day");
    if (!localStart.isValid) return null;

    const localEnd = localStart.plus({ days: 1 });
    const dayMinutes = localEnd.diff(localStart, "minutes").minutes;
    const toLocal = (iso) => DateTime.fromISO(iso, { zone: "utc" }).setZone(zone);
    const toPercent = (dt) => {
      const minutes = dt.diff(localStart, "minutes").minutes;
      const clamped = Math.min(Math.max(minutes, 0), dayMinutes);
      return (clamped / dayMinutes) * 100;
    };

    const sunrise = toLocal(sunToday.raw.sunrise);
    const sunset = toLocal(sunToday.raw.sunset);
    const civilDawn = toLocal(sunToday.raw.civilDawn);
    const civilDusk = toLocal(sunToday.raw.civilDusk);
    const nightCurrencyEnd = sunrise.minus({ hours: 1 });
    const nightCurrencyBegin = sunset.plus({ hours: 1 });

    const markers = [
      { key: "night-end", label: "Night currency ends", dt: nightCurrencyEnd },
      { key: "civil-dawn", label: "Civil dawn", dt: civilDawn },
      { key: "sunrise", label: "Sunrise", dt: sunrise },
      { key: "sunset", label: "Sunset", dt: sunset },
      { key: "civil-dusk", label: "Civil dusk", dt: civilDusk },
      { key: "night-begin", label: "Night currency begins", dt: nightCurrencyBegin },
    ].map((marker) => ({
      ...marker,
      percent: toPercent(marker.dt),
    }));

    return {
      sunrise,
      sunset,
      civilDawn,
      civilDusk,
      nightCurrencyBegin,
      nightCurrencyEnd,
      markers,
      segments: {
        day: { start: toPercent(sunrise), end: toPercent(sunset) },
        lightsMorning: { start: 0, end: toPercent(sunrise) },
        lightsEvening: { start: toPercent(sunset), end: 100 },
        nightMorning: { start: 0, end: toPercent(civilDawn) },
        nightEvening: { start: toPercent(civilDusk), end: 100 },
        currencyMorning: { start: 0, end: toPercent(nightCurrencyEnd) },
        currencyEvening: { start: toPercent(nightCurrencyBegin), end: 100 },
      },
    };
  }, [date, sunToday, zone]);

  return (
    <div className="night-tool-shell">
      <section className="night-tool-panel">
        <div className="night-tool-head">
          <h2>Night reference inputs</h2>
          <p>Enter an airport, city, or coordinate-based location and pick the date to evaluate.</p>
        </div>

        <div className="night-tool-fields">
          <label className="night-tool-field">
            <span>Location</span>
            <input
              type="text"
              placeholder="Example: KPDX or Portland, OR"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
            />
          </label>

          <label className="night-tool-field">
            <span>Date</span>
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
        </div>

        <button className="primary-button night-tool-button" onClick={handleCalculate} disabled={loading} type="button">
          {loading ? "Calculating..." : "Calculate"}
        </button>
      </section>

      <section className="night-tool-panel night-tool-results">
        <div className="night-tool-head">
          <h2>Night references</h2>
          <p>
            {nightReference && zone
              ? `Times shown for ${displayName || location} on ${DateTime.fromISO(date, { zone }).toFormat("DDD")}`
              : "Run the calculation to see sunset, civil twilight, and passenger-currency boundaries"}
          </p>
        </div>

        {error ? <div className="night-tool-empty">{error}</div> : null}

        {nightReference && zone ? (
          <>
            <div className="night-tool-timeline">
              <div className="night-tool-timelineScale">
                <span>00:00</span>
                <span>06:00</span>
                <span>12:00</span>
                <span>18:00</span>
                <span>24:00</span>
              </div>

              <div className="night-tool-track night-tool-track-lights">
                <div className="night-tool-trackMeta">
                  <strong>Position lights</strong>
                  <span>
                    Ends at {formatLocalTime(nightReference.sunrise.toJSDate(), zone).split(" (")[0]}
                    {" · "}
                    Begins at {formatLocalTime(nightReference.sunset.toJSDate(), zone).split(" (")[0]}
                  </span>
                </div>
                <span
                  className="night-tool-segment is-lights"
                  style={{
                    left: `${nightReference.segments.lightsMorning.start}%`,
                    width: `${nightReference.segments.lightsMorning.end - nightReference.segments.lightsMorning.start}%`,
                  }}
                />
                <span
                  className="night-tool-segment is-lights"
                  style={{
                    left: `${nightReference.segments.lightsEvening.start}%`,
                    width: `${nightReference.segments.lightsEvening.end - nightReference.segments.lightsEvening.start}%`,
                  }}
                />
                <span className="night-tool-trackLabel">Position lights</span>
              </div>

              <div className="night-tool-track night-tool-track-night">
                <div className="night-tool-trackMeta">
                  <strong>Loggable night</strong>
                  <span>
                    Ends at {formatLocalTime(nightReference.civilDawn.toJSDate(), zone).split(" (")[0]}
                    {" · "}
                    Begins at {formatLocalTime(nightReference.civilDusk.toJSDate(), zone).split(" (")[0]}
                  </span>
                </div>
                <span
                  className="night-tool-segment is-night"
                  style={{
                    left: `${nightReference.segments.nightMorning.start}%`,
                    width: `${nightReference.segments.nightMorning.end - nightReference.segments.nightMorning.start}%`,
                  }}
                />
                <span
                  className="night-tool-segment is-night"
                  style={{
                    left: `${nightReference.segments.nightEvening.start}%`,
                    width: `${nightReference.segments.nightEvening.end - nightReference.segments.nightEvening.start}%`,
                  }}
                />
                <span
                  className="night-tool-segment is-day"
                  style={{
                    left: `${nightReference.segments.day.start}%`,
                    width: `${nightReference.segments.day.end - nightReference.segments.day.start}%`,
                  }}
                />
                <span className="night-tool-trackLabel">Day / loggable night</span>
              </div>

              <div className="night-tool-track night-tool-track-currency">
                <div className="night-tool-trackMeta">
                  <strong>61.57(b) night currency</strong>
                  <span>
                    Ends at {formatLocalTime(nightReference.nightCurrencyEnd.toJSDate(), zone).split(" (")[0]}
                    {" · "}
                    Begins at {formatLocalTime(nightReference.nightCurrencyBegin.toJSDate(), zone).split(" (")[0]}
                  </span>
                </div>
                <span
                  className="night-tool-segment is-currency"
                  style={{
                    left: `${nightReference.segments.currencyMorning.start}%`,
                    width: `${nightReference.segments.currencyMorning.end - nightReference.segments.currencyMorning.start}%`,
                  }}
                />
                <span
                  className="night-tool-segment is-currency"
                  style={{
                    left: `${nightReference.segments.currencyEvening.start}%`,
                    width: `${nightReference.segments.currencyEvening.end - nightReference.segments.currencyEvening.start}%`,
                  }}
                />
                <span className="night-tool-trackLabel">61.57(b) night currency</span>
              </div>

              <div className="night-tool-axis">
                {nightReference.markers.map((marker) => (
                  <div
                    key={marker.key}
                    className={`night-tool-marker night-tool-marker-${marker.key}`}
                    style={{ left: `${marker.percent}%` }}
                  >
                    <span className="night-tool-markerLine" />
                    <span className="night-tool-markerDot" />
                  </div>
                ))}
              </div>
            </div>

            <div className="night-tool-card-grid">
              <article className="night-tool-card">
                <span>Sunrise</span>
                <strong>{formatLocalTime(nightReference.sunrise.toJSDate(), zone)}</strong>
              </article>
              <article className="night-tool-card">
                <span>Civil dawn</span>
                <strong>{formatLocalTime(nightReference.civilDawn.toJSDate(), zone)}</strong>
              </article>
              <article className="night-tool-card">
                <span>Sunset</span>
                <strong>{formatLocalTime(nightReference.sunset.toJSDate(), zone)}</strong>
              </article>
              <article className="night-tool-card">
                <span>Civil dusk</span>
                <strong>{formatLocalTime(nightReference.civilDusk.toJSDate(), zone)}</strong>
              </article>
              <article className="night-tool-card">
                <span>Night currency begins</span>
                <strong>{formatLocalTime(nightReference.nightCurrencyBegin.toJSDate(), zone)}</strong>
              </article>
              <article className="night-tool-card">
                <span>Night currency ends</span>
                <strong>{formatLocalTime(nightReference.nightCurrencyEnd.toJSDate(), zone)}</strong>
              </article>
            </div>

            <div className="night-tool-copy">
              <p>
                Position lights: sunset {formatLocalTime(nightReference.sunset.toJSDate(), zone)} to the next sunrise.
              </p>
              <p>
                Loggable night: end of evening civil twilight {formatLocalTime(nightReference.civilDusk.toJSDate(), zone)} to beginning of morning civil twilight {formatLocalTime(nightReference.civilDawn.toJSDate(), zone)}.
              </p>
              <p>
                Passenger-carrying night currency: one hour after sunset {formatLocalTime(nightReference.nightCurrencyBegin.toJSDate(), zone)} to one hour before sunrise {formatLocalTime(nightReference.nightCurrencyEnd.toJSDate(), zone)}.
              </p>
            </div>
          </>
        ) : !error ? (
          <div className="night-tool-empty">
            Enter a location and date in the input panel, then calculate to populate the night references.
          </div>
        ) : null}
      </section>
    </div>
  );
};

export default NightTimeCalculator;
