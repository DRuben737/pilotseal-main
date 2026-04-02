"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { getAirportOpsConfig, normalizeAirportConfig, type AirportOpsConfig } from "@/lib/fids/traffic";

type FlightRecord = {
  id: string;
  callsign: string | null;
  type: "arrival" | "departure" | "ground";
  status: string | null;
  altitude: number | null;
  velocity: number | null;
  updated_at: string | null;
};

const REFRESH_INTERVAL_MS = 30_000;
const fallbackAirport = getAirportOpsConfig();

function formatAltitude(value: number | null) {
  return typeof value === "number" ? `${Math.round(value).toLocaleString()} ft` : "—";
}

function formatVelocity(value: number | null) {
  return typeof value === "number" ? `${Math.round(value).toLocaleString()} kt` : "—";
}

function formatUpdated(value: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function getStatusClasses(status: string | null) {
  const normalized = String(status ?? "").trim().toLowerCase();

  switch (normalized) {
    case "landed":
      return "bg-emerald-400/12 text-emerald-400";
    case "final":
      return "bg-yellow-400/12 text-yellow-400";
    case "departed":
      return "bg-blue-400/12 text-blue-400";
    case "ground":
      return "bg-neutral-500/12 text-neutral-400";
    case "enroute":
      return "bg-neutral-300/10 text-neutral-300";
    default:
      return "bg-neutral-500/10 text-neutral-300";
  }
}

function getSectionClasses(section: "arrival" | "departure" | "ground") {
  if (section === "arrival") {
    return {
      panel: "border-emerald-900/40 bg-emerald-950/20",
      header: "border-emerald-900/40 bg-emerald-950/35",
      title: "text-emerald-100",
      eyebrow: "text-emerald-400",
      rowHover: "hover:bg-emerald-950/20",
    };
  }

  if (section === "departure") {
    return {
      panel: "border-sky-900/40 bg-sky-950/20",
      header: "border-sky-900/40 bg-sky-950/35",
      title: "text-sky-100",
      eyebrow: "text-sky-400",
      rowHover: "hover:bg-sky-950/20",
    };
  }

  return {
    panel: "border-neutral-800 bg-neutral-900/72",
    header: "border-neutral-800 bg-neutral-900/95",
    title: "text-neutral-100",
    eyebrow: "text-neutral-400",
    rowHover: "hover:bg-neutral-900",
  };
}

function TableSkeleton() {
  return (
    <tbody>
      {Array.from({ length: 6 }).map((_, index) => (
        <tr key={index} className="border-t border-neutral-800">
          <td className="px-4 py-3 sm:px-5">
            <div className="h-3.5 w-20 animate-pulse rounded bg-neutral-800" />
          </td>
          <td className="px-4 py-3 sm:px-5">
            <div className="h-5 w-16 animate-pulse rounded-full bg-neutral-800" />
          </td>
          <td className="px-4 py-3 sm:px-5">
            <div className="h-3.5 w-14 animate-pulse rounded bg-neutral-800" />
          </td>
          <td className="hidden px-4 py-3 sm:table-cell sm:px-5">
            <div className="h-3.5 w-14 animate-pulse rounded bg-neutral-800" />
          </td>
          <td className="px-4 py-3 sm:px-5">
            <div className="h-3.5 w-12 animate-pulse rounded bg-neutral-800" />
          </td>
        </tr>
      ))}
    </tbody>
  );
}

function FidsTable({
  title,
  flights,
  loading,
  emptyMessage,
  section,
}: {
  title: string;
  flights: FlightRecord[];
  loading: boolean;
  emptyMessage: string;
  section: "arrival" | "departure" | "ground";
}) {
  const tone = getSectionClasses(section);

  return (
    <section className={`overflow-hidden rounded-2xl border shadow-sm ${tone.panel}`}>
      <div className={`border-b px-4 py-4 sm:px-5 ${tone.header}`}>
        <p className={`text-[11px] uppercase tracking-[0.18em] ${tone.eyebrow}`}>Traffic</p>
        <h2 className={`mt-1 text-lg font-semibold ${tone.title}`}>{title}</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead className={`sticky top-0 z-10 backdrop-blur ${tone.header}`}>
            <tr className="text-left text-[11px] uppercase tracking-[0.18em] text-neutral-400">
              <th className="px-4 py-3 font-medium sm:px-5">Flight</th>
              <th className="px-4 py-3 font-medium sm:px-5">Status</th>
              <th className="px-4 py-3 font-medium sm:px-5">Altitude</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell sm:px-5">Speed</th>
              <th className="px-4 py-3 font-medium sm:px-5">Updated</th>
            </tr>
          </thead>

          {loading && flights.length === 0 ? <TableSkeleton /> : null}

          {!loading && flights.length === 0 ? (
            <tbody>
              <tr className="border-t border-neutral-800">
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-neutral-500 sm:px-5">
                  {emptyMessage}
                </td>
              </tr>
            </tbody>
          ) : null}

          {flights.length > 0 ? (
            <tbody>
              {flights.map((flight) => (
                <tr
                  key={flight.id}
                  className={`border-t border-neutral-800 text-sm text-neutral-200 transition-colors ${tone.rowHover}`}
                >
                  <td className="px-4 py-3 font-mono font-medium uppercase tracking-[0.08em] text-neutral-100 sm:px-5">
                    {flight.callsign?.toUpperCase() || "—"}
                  </td>
                  <td className="px-4 py-3 sm:px-5">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${getStatusClasses(
                        flight.status
                      )}`}
                    >
                      {flight.status || "unknown"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-neutral-300 sm:px-5">
                    {formatAltitude(flight.altitude)}
                  </td>
                  <td className="hidden px-4 py-3 text-neutral-300 sm:table-cell sm:px-5">
                    {formatVelocity(flight.velocity)}
                  </td>
                  <td className="px-4 py-3 text-neutral-400 sm:px-5">
                    {formatUpdated(flight.updated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          ) : null}
        </table>
      </div>
    </section>
  );
}

export default function FlightInformationDisplaySystem() {
  const [airports, setAirports] = useState<AirportOpsConfig[]>([]);
  const [selectedAirportId, setSelectedAirportId] = useState("");
  const [flights, setFlights] = useState<FlightRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [groundOpen, setGroundOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const boardRef = useRef<HTMLDivElement | null>(null);

  const currentAirport = useMemo(
    () =>
      airports.find((airport) => airport.id === selectedAirportId) ??
      airports[0] ??
      fallbackAirport,
    [airports, selectedAirportId]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadAirports() {
      try {
        const supabase = getSupabaseClient();
        const { data, error: nextError } = await supabase.from("airport_config").select("*");

        if (nextError) {
          throw nextError;
        }

        const nextAirports = Array.isArray(data)
          ? data.map((record) => normalizeAirportConfig(record))
          : [];

        if (!cancelled && nextAirports.length) {
          setAirports(nextAirports);
          setSelectedAirportId(
            nextAirports.find((airport) => airport.isDefault)?.id ??
              nextAirports[0]?.id ??
              ""
          );
        }
      } catch {
        if (!cancelled) {
          setAirports([fallbackAirport]);
          setSelectedAirportId(fallbackAirport.id ?? fallbackAirport.airportName);
        }
      }
    }

    void loadAirports();

    return () => {
      cancelled = true;
    };
  }, []);

  const fetchFlights = useCallback(async () => {
    const query = currentAirport.id ? `?airportId=${encodeURIComponent(currentAirport.id)}` : "";
    const response = await fetch(`/api/fids${query}`, {
      cache: "no-store",
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error || "Unable to fetch flights.");
    }

    const nextFlights = Array.isArray(data?.flights) ? (data.flights as FlightRecord[]) : [];
    setFlights(nextFlights);
  }, [currentAirport.id]);

  useEffect(() => {
    const syncFullscreen = () => {
      setIsFullscreen(document.fullscreenElement === boardRef.current);
    };

    syncFullscreen();
    document.addEventListener("fullscreenchange", syncFullscreen);

    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (document.fullscreenElement === boardRef.current) {
      await document.exitFullscreen();
      return;
    }

    await boardRef.current?.requestFullscreen();
  }, []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        if (active) {
          setLoading(true);
        }

        await fetchFlights();

        if (active) {
          setError("");
        }
      } catch {
        if (active) {
          setError("Data link unavailable — retrying");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    const intervalId = window.setInterval(() => {
      void load();
    }, REFRESH_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [fetchFlights]);

  const arrivals = useMemo(
    () =>
      flights
        .filter((flight) => flight.type === "arrival")
        .sort(
          (left, right) =>
            (left.altitude ?? Number.MAX_SAFE_INTEGER) -
            (right.altitude ?? Number.MAX_SAFE_INTEGER)
        ),
    [flights]
  );

  const departures = useMemo(
    () =>
      flights
        .filter((flight) => flight.type === "departure")
        .sort(
          (left, right) =>
            new Date(right.updated_at ?? 0).getTime() -
            new Date(left.updated_at ?? 0).getTime()
        ),
    [flights]
  );

  const ground = useMemo(
    () =>
      flights
        .filter((flight) => flight.type === "ground")
        .sort(
          (left, right) =>
            new Date(right.updated_at ?? 0).getTime() -
            new Date(left.updated_at ?? 0).getTime()
        ),
    [flights]
  );

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#0f1720_0%,#16212d_100%)] text-neutral-100">
      <div
        ref={boardRef}
        className="mx-auto max-w-7xl bg-[radial-gradient(circle_at_top,rgba(148,163,184,0.08),transparent_38%),linear-gradient(180deg,#101820_0%,#172430_100%)] px-4 py-8 sm:px-6 lg:px-8"
      >
        <header className="mb-8">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-neutral-500">
            Operations Display
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-neutral-100">
                {currentAirport.airportName}
              </h1>
              <p className="mt-2 text-sm text-neutral-400">
                Live traffic view for arrivals, departures, and ground activity.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900/80 px-3 py-2 text-xs uppercase tracking-[0.18em] text-neutral-400">
                <span>Airport</span>
                <select
                  value={selectedAirportId}
                  onChange={(event) => setSelectedAirportId(event.target.value)}
                  className="bg-transparent font-mono text-neutral-100 outline-none"
                >
                  {airports.map((airport) => (
                    <option
                      key={airport.id ?? airport.label}
                      value={airport.id}
                      className="bg-neutral-950 text-neutral-100"
                    >
                      {airport.label ?? airport.airportName}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={toggleFullscreen}
                className="rounded-full border border-neutral-800 bg-neutral-900/80 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-neutral-200 transition hover:bg-neutral-900"
              >
                {isFullscreen ? "Exit Full Screen" : "Full Screen"}
              </button>
              <div className="text-sm text-neutral-400">
                {error ? error : loading ? "Refreshing traffic" : "Auto refresh every 30 seconds"}
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-2">
          <FidsTable
            title="Arrivals"
            flights={arrivals}
            loading={loading}
            emptyMessage="Standby — no inbound traffic"
            section="arrival"
          />
          <FidsTable
            title="Departures"
            flights={departures}
            loading={loading}
            emptyMessage="No active departures"
            section="departure"
          />
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/72 shadow-sm">
          <button
            type="button"
            onClick={() => setGroundOpen((current) => !current)}
            className="flex w-full items-center justify-between px-4 py-4 text-left transition-colors hover:bg-neutral-900 sm:px-5"
          >
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-neutral-100">Ground</h2>
              <span className="rounded-full bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-300">
                {ground.length}
              </span>
            </div>
            <span
              className={`text-neutral-400 transition-transform duration-200 ${
                groundOpen ? "rotate-180" : ""
              }`}
              aria-hidden="true"
            >
              ˅
            </span>
          </button>

          <div
            className={`overflow-hidden transition-all duration-200 ${
              groundOpen ? "max-h-[1200px] opacity-100" : "max-h-0 opacity-0"
            }`}
          >
            <div className="border-t border-neutral-800">
              <FidsTable
                title="Ground"
                flights={ground}
                loading={loading}
                emptyMessage="No ground traffic"
                section="ground"
              />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
