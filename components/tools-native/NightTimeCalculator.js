"use client";

import React, { useState } from "react";
import { DateTime } from "luxon";

const NightTimeCalculator = () => {
  const [location, setLocation] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);
  const [zone, setZone] = useState(null);
  const [sunToday, setSunToday] = useState(null);
  const [sunNext, setSunNext] = useState(null);

  const handleCalculate = async () => {
    if (!location || !date) return;

    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) {
      setSunToday(null);
      setSunNext(null);
      setZone(null);
      return;
    }

    setLoading(true);
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
      setSunToday(data?.sunToday ?? null);
      setSunNext(data?.sunNext ?? null);
    } catch {
      setSunToday(null);
      setSunNext(null);
      setZone(null);
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

  const addHours = (value, hours) => new Date(value.getTime() + hours * 3600 * 1000);

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
          <h2>Night window</h2>
          <p>
            {sunToday && sunNext && zone
              ? `Times shown for ${location.toUpperCase()}`
              : "Run the calculation to see sunset, civil twilight, and night currency references"}
          </p>
        </div>

        {sunToday && sunNext && zone ? (
          <>
            <div className="night-tool-card-grid">
              <article className="night-tool-card">
                <span>Sunset</span>
                <strong>{formatLocalTime(new Date(sunToday.raw.sunset), zone)}</strong>
              </article>
              <article className="night-tool-card">
                <span>Civil dusk</span>
                <strong>{formatLocalTime(new Date(sunToday.raw.civilDusk), zone)}</strong>
              </article>
              <article className="night-tool-card">
                <span>Night currency starts</span>
                <strong>{formatLocalTime(addHours(new Date(sunToday.raw.sunset), 1), zone)}</strong>
              </article>
              <article className="night-tool-card">
                <span>Night currency ends</span>
                <strong>{formatLocalTime(addHours(new Date(sunNext.raw.sunrise), -1), zone)}</strong>
              </article>
            </div>

            <div className="night-tool-copy">
              <p>
                Under 14 CFR 91.209, position lights are required from sunset{" "}
                {formatLocalTime(new Date(sunToday.raw.sunset), zone)} to sunrise{" "}
                {formatLocalTime(new Date(sunNext.raw.sunrise), zone)}.
              </p>
              <p>
                Under 14 CFR 1.1, night begins after evening civil twilight{" "}
                {formatLocalTime(new Date(sunToday.raw.civilDusk), zone)} and ends before morning civil twilight{" "}
                {formatLocalTime(new Date(sunNext.raw.civilDawn), zone)}.
              </p>
              <p>
                For 14 CFR 61.57(b) passenger currency, use the window between one hour after sunset{" "}
                {formatLocalTime(addHours(new Date(sunToday.raw.sunset), 1), zone)} and one hour before sunrise{" "}
                {formatLocalTime(addHours(new Date(sunNext.raw.sunrise), -1), zone)}.
              </p>
            </div>
          </>
        ) : (
          <div className="night-tool-empty">
            Enter a location and date in the input panel, then calculate to populate the night references.
          </div>
        )}
      </section>
    </div>
  );
};

export default NightTimeCalculator;
