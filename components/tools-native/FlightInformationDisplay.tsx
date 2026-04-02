"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildTrafficBoard,
  getAirportOpsConfig,
  normalizeAirportConfig,
  type EnrichedFlightRecord,
  type AirportOpsConfig,
  type RawFlightRecord,
  type FlightHistory,
  updateFlightHistories,
} from "@/lib/fids/traffic";
import { getSupabaseClient } from "@/lib/supabase";

const REFRESH_INTERVAL_MS = 60_000;

function formatAltitude(value: number | null) {
  return typeof value === "number" ? `${Math.round(value).toLocaleString()} ft` : "—";
}

function formatVelocity(value: number | null) {
  return typeof value === "number" ? `${Math.round(value).toLocaleString()} kt` : "—";
}

function formatHeading(value: number | null | undefined) {
  return typeof value === "number" ? `${Math.round(value)}°` : "—";
}

function formatUpdatedAt(value: string | null) {
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

function formatUpdatedAtWithSeconds(value: Date | null) {
  if (!value) {
    return "--:--:--";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(value);
}

function getStatusClasses(status: string | null) {
  const normalized = String(status ?? "").trim().toLowerCase();

  switch (normalized) {
    case "landed":
      return "border-emerald-400/35 bg-emerald-400/12 text-emerald-300";
    case "final":
      return "border-amber-300/35 bg-amber-300/12 text-amber-200";
    case "departed":
      return "border-sky-400/35 bg-sky-400/12 text-sky-300";
    case "enroute":
      return "border-slate-300/55 bg-slate-100 text-slate-700";
    case "taxi":
      return "border-violet-400/35 bg-violet-400/12 text-violet-300";
    case "climb":
      return "border-cyan-400/35 bg-cyan-400/12 text-cyan-300";
    default:
      return "border-slate-300/70 bg-slate-100 text-slate-600";
  }
}

function getPhaseClasses(flight: EnrichedFlightRecord) {
  if (flight.isTouchAndGo) {
    return "border-violet-400/35 bg-violet-400/12 text-violet-200";
  }

  if (flight.isFinalPhase) {
    return "border-amber-300/35 bg-amber-300/12 text-amber-200";
  }

  if (flight.phase === "base") {
    return "border-orange-300/30 bg-orange-300/10 text-orange-200";
  }

  if (flight.phase === "downwind") {
    return "border-slate-300/18 bg-slate-300/10 text-slate-200";
  }

  if (flight.phase === "initial_climb") {
    return "border-cyan-400/35 bg-cyan-400/12 text-cyan-200";
  }

  if (flight.phase === "takeoff_roll") {
    return "border-sky-400/35 bg-sky-400/12 text-sky-200";
  }

  return "border-white/12 bg-white/8 text-slate-200";
}

function getSurfaceClasses() {
  return "rounded-[22px] border border-slate-200 bg-white/90 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur";
}

function getRowClasses(
  flight: EnrichedFlightRecord,
  changedFlightIds: Set<string>,
  newFlightIds: Set<string>
) {
  const classes = ["border-t", "border-white/8", "text-[12px]", "text-slate-100", "transition-colors"];

  if (flight.isPriority) {
    classes.push("bg-cyan-400/[0.05]");
  }

  if (flight.isFinalPhase) {
    classes.push("fids-final-row");
  }

  if (flight.isTouchAndGo) {
    classes.push("bg-violet-400/[0.06]");
  }

  if (newFlightIds.has(flight.id)) {
    classes.push("fids-new-row");
  } else if (changedFlightIds.has(flight.id)) {
    classes.push("fids-updated-row");
  }

  return classes.join(" ");
}

function formatPhaseLabel(value: string) {
  return value.replace(/_/g, " ");
}

function EmptyState({ message }: { message: string }) {
  return (
    <tbody>
      <tr className="border-t border-white/8">
        <td colSpan={8} className="px-4 py-8 text-center font-mono text-sm tracking-[0.08em] text-slate-500">
          {message}
        </td>
      </tr>
    </tbody>
  );
}

function SkeletonRows() {
  return (
    <tbody>
      {Array.from({ length: 7 }).map((_, index) => (
        <tr key={index} className="border-t border-white/8">
          <td className="px-3 py-2"><div className="h-3.5 w-16 animate-pulse rounded bg-white/10" /></td>
          <td className="px-3 py-2"><div className="h-3.5 w-10 animate-pulse rounded bg-white/10" /></td>
          <td className="px-3 py-2"><div className="h-5 w-14 animate-pulse rounded-full bg-white/10" /></td>
          <td className="px-3 py-2"><div className="h-5 w-20 animate-pulse rounded-full bg-white/10" /></td>
          <td className="px-3 py-2"><div className="h-3.5 w-16 animate-pulse rounded bg-white/10" /></td>
          <td className="px-3 py-2"><div className="h-3.5 w-14 animate-pulse rounded bg-white/10" /></td>
          <td className="px-3 py-2"><div className="h-3.5 w-12 animate-pulse rounded bg-white/10" /></td>
          <td className="px-3 py-2"><div className="h-3.5 w-12 animate-pulse rounded bg-white/10" /></td>
        </tr>
      ))}
    </tbody>
  );
}

function FidsTable({
  title,
  flights,
  loading,
  error,
  changedFlightIds,
  newFlightIds,
  emptyMessage,
}: {
  title: string;
  flights: EnrichedFlightRecord[];
  loading: boolean;
  error: string;
  changedFlightIds: Set<string>;
  newFlightIds: Set<string>;
  emptyMessage: string;
}) {
  return (
    <section className={getSurfaceClasses()}>
      <div className="flex items-end justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400">
            Traffic Board
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-[0.08em] text-slate-900">
            {title}
          </h2>
        </div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
          {loading ? "Syncing" : `${flights.length} active`}
        </p>
      </div>

      {error ? (
        <div className="border-b border-slate-200 px-4 py-2 text-xs uppercase tracking-[0.18em] text-amber-700">
          Data link unavailable — retrying
        </div>
      ) : null}

      <div className="overflow-hidden rounded-b-[22px]">
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed border-collapse">
            <thead className="bg-slate-50">
              <tr className="text-left text-[10px] uppercase tracking-[0.22em] text-slate-500">
                <th className="px-3 py-2 font-medium">Flight</th>
                <th className="px-3 py-2 font-medium">Seq</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Phase</th>
                <th className="px-3 py-2 font-medium">Altitude</th>
                <th className="px-3 py-2 font-medium">Speed</th>
                <th className="px-3 py-2 font-medium">Heading</th>
                <th className="px-3 py-2 font-medium">Updated</th>
              </tr>
            </thead>
            {loading && flights.length === 0 ? <SkeletonRows /> : null}
            {!loading && flights.length === 0 ? <EmptyState message={emptyMessage} /> : null}
            {flights.length > 0 ? (
              <tbody>
                {flights.map((flight) => (
                  <tr key={flight.id} className={getRowClasses(flight, changedFlightIds, newFlightIds)}>
                    <td className="whitespace-nowrap px-3 py-2 font-mono font-semibold uppercase tracking-[0.12em] text-slate-900">
                      {flight.callsign?.toUpperCase() || "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {flight.sequence ? (
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                            flight.isPriority
                              ? "border-cyan-300/35 bg-cyan-300/14 text-cyan-200"
                              : "border-white/12 bg-white/8 text-slate-200"
                          }`}
                        >
                          SEQ {flight.sequence}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${getStatusClasses(
                          flight.status
                        )}`}
                      >
                        {flight.status || "unknown"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${getPhaseClasses(
                          flight
                        )}`}
                      >
                        {flight.trendSymbol} {formatPhaseLabel(flight.phase)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                      {formatAltitude(flight.altitude)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                      {formatVelocity(flight.velocity)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-slate-700">
                      {formatHeading(flight.heading)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-slate-500">
                      {formatUpdatedAt(flight.lastSeenAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            ) : null}
          </table>
        </div>
      </div>
    </section>
  );
}

export default function FlightInformationDisplaySystem() {
  const [airports, setAirports] = useState<AirportOpsConfig[]>([]);
  const [selectedAirportId, setSelectedAirportId] = useState("");
  const [arrivals, setArrivals] = useState<EnrichedFlightRecord[]>([]);
  const [departures, setDepartures] = useState<EnrichedFlightRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [changedFlightIds, setChangedFlightIds] = useState<Set<string>>(new Set());
  const [newFlightIds, setNewFlightIds] = useState<Set<string>>(new Set());
  const boardRef = useRef<HTMLDivElement | null>(null);
  const historiesRef = useRef<Record<string, FlightHistory>>({});
  const signaturesRef = useRef<Record<string, string>>({});
  const clearHighlightTimeoutRef = useRef<number | null>(null);
  const syncInFlightRef = useRef(false);
  const fallbackAirport = useMemo(() => getAirportOpsConfig(), []);
  const currentAirport = useMemo(
    () => airports.find((airport) => airport.id === selectedAirportId) ?? airports[0] ?? fallbackAirport,
    [airports, fallbackAirport, selectedAirportId]
  );

  const applyFlights = useCallback(async (nextFlights: RawFlightRecord[], airport: AirportOpsConfig) => {
    const nextBoard = buildTrafficBoard(nextFlights, airport, historiesRef.current);
    const nextSignatures: Record<string, string> = {};
    const changed = new Set<string>();
    const added = new Set<string>();

    nextBoard.allFlights.forEach((flight) => {
      const signature = [
        flight.status ?? "",
        flight.phase,
        flight.sequence ?? "",
        flight.altitude ?? "",
        flight.velocity ?? "",
        flight.lastSeenAt ?? "",
      ].join("|");

      nextSignatures[flight.id] = signature;

      if (!signaturesRef.current[flight.id]) {
        added.add(flight.id);
      } else if (signaturesRef.current[flight.id] !== signature) {
        changed.add(flight.id);
      }
    });

    historiesRef.current = updateFlightHistories(historiesRef.current, nextFlights);
    signaturesRef.current = nextSignatures;
    setArrivals(nextBoard.arrivals);
    setDepartures(nextBoard.departures);
    setLastUpdated(new Date());
    setChangedFlightIds(changed);
    setNewFlightIds(added);

    if (clearHighlightTimeoutRef.current) {
      window.clearTimeout(clearHighlightTimeoutRef.current);
    }

    clearHighlightTimeoutRef.current = window.setTimeout(() => {
      setChangedFlightIds(new Set());
      setNewFlightIds(new Set());
    }, 1400);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAirportConfigs() {
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
            nextAirports.find((airport) => airport.isDefault)?.id ?? nextAirports[0]?.id ?? ""
          );
        }
      } catch {
        if (!cancelled) {
          setAirports([fallbackAirport]);
          setSelectedAirportId(fallbackAirport.id ?? fallbackAirport.airportName);
        }
      }
    }

    void loadAirportConfigs();

    return () => {
      cancelled = true;
    };
  }, [fallbackAirport]);

  const refreshBoard = useCallback(
    async () => {
      if (syncInFlightRef.current) {
        return;
      }

      syncInFlightRef.current = true;

      try {
        setIsSyncing(true);
        setError("");

        const supabase = getSupabaseClient();
        let query = supabase.from("flights").select("*");

        if (currentAirport.id) {
          query = query.eq("airport_id", currentAirport.id);
        }

        const { data, error: nextError } = await query;

        if (nextError) {
          throw nextError;
        }

        await applyFlights(Array.isArray(data) ? (data as RawFlightRecord[]) : [], currentAirport);
      } catch {
        setError("Data sync failed — retrying");
      } finally {
        syncInFlightRef.current = false;
        setIsSyncing(false);
        setLoading(false);
      }
    },
    [applyFlights, currentAirport]
  );

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (active) {
        setLoading(true);
      }

      await refreshBoard();
    };

    void load();

    const intervalId = window.setInterval(() => {
      void load();
    }, REFRESH_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [refreshBoard]);

  useEffect(() => {
    const supabase = getSupabaseClient();

    void (async () => {
      try {
        let query = supabase.from("flights").select("*");

        if (currentAirport.id) {
          query = query.eq("airport_id", currentAirport.id);
        }

        const { data } = await query;
        if (Array.isArray(data)) {
          await applyFlights(data as RawFlightRecord[], currentAirport);
        }
      } catch {}
    })();
  }, [applyFlights, currentAirport]);

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

  useEffect(() => {
    return () => {
      if (clearHighlightTimeoutRef.current) {
        window.clearTimeout(clearHighlightTimeoutRef.current);
      }
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (typeof document === "undefined") {
      return;
    }

    if (document.fullscreenElement === boardRef.current) {
      await document.exitFullscreen();
      return;
    }

    await boardRef.current?.requestFullscreen();
  }, []);

  const changedFlightSet = useMemo(() => changedFlightIds, [changedFlightIds]);
  const newFlightSet = useMemo(() => newFlightIds, [newFlightIds]);

  return (
    <main className="min-h-screen bg-[#eef3f8] text-slate-900">
      <style jsx>{`
        .fids-final-row {
          animation: finalPulse 1.8s ease-in-out infinite;
        }

        .fids-updated-row {
          animation: rowFlash 0.9s ease-out;
        }

        .fids-new-row {
          animation: newRowFlash 1.2s ease-out;
        }

        .live-dot {
          animation: livePulse 1.6s ease-in-out infinite;
        }

        @keyframes rowFlash {
          0% {
            background: rgba(245, 158, 11, 0.24);
          }
          100% {
            background: transparent;
          }
        }

        @keyframes newRowFlash {
          0% {
            background: rgba(34, 211, 238, 0.28);
          }
          100% {
            background: transparent;
          }
        }

        @keyframes finalPulse {
          0%,
          100% {
            box-shadow: inset 0 0 0 0 rgba(251, 191, 36, 0);
          }
          50% {
            box-shadow: inset 0 0 0 999px rgba(251, 191, 36, 0.04);
          }
        }

        @keyframes livePulse {
          0%,
          100% {
            opacity: 1;
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.4);
          }
          50% {
            opacity: 0.72;
            transform: scale(0.96);
            box-shadow: 0 0 0 8px rgba(74, 222, 128, 0);
          }
        }
      `}</style>

      <div
        ref={boardRef}
        className="mx-auto min-h-screen max-w-[1680px] bg-[radial-gradient(circle_at_top,rgba(148,163,184,0.18),transparent_34%),linear-gradient(180deg,#f4f7fb_0%,#edf2f7_100%)] px-3 py-3 sm:px-5 sm:py-5 lg:px-6"
      >
        <header className="mb-4 rounded-[24px] border border-slate-200 bg-white/88 px-4 py-4 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur md:px-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-slate-400">
                Operations Display
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[0.08em] text-slate-900 md:text-4xl">
                {currentAirport.airportName}
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
              <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                <span>Airport</span>
                <select
                  value={selectedAirportId}
                  onChange={(event) => setSelectedAirportId(event.target.value)}
                  className="bg-transparent font-mono text-slate-800 outline-none"
                >
                  {airports.map((airport) => (
                    <option key={airport.id ?? airport.label} value={airport.id} className="bg-slate-950">
                      {airport.label ?? airport.airportName}
                    </option>
                  ))}
                </select>
              </label>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300">
                <span className="live-dot h-2.5 w-2.5 rounded-full bg-emerald-400" />
                Live
              </div>
              <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                {isSyncing ? (
                  <span className="font-mono text-amber-700">Updating...</span>
                ) : (
                  <span className="font-mono text-slate-700">Stable</span>
                )}
              </div>
              <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                Last updated:{" "}
                <span className="font-mono text-slate-700">{formatUpdatedAtWithSeconds(lastUpdated)}</span>
              </div>
              <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                Refresh cycle: <span className="font-mono text-slate-700">60s</span>
              </div>
              <button
                type="button"
                onClick={toggleFullscreen}
                disabled={isSyncing}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700 transition hover:bg-slate-50"
              >
                {isFullscreen ? "Exit Full Screen" : "Full Screen"}
              </button>
            </div>
          </div>
        </header>

        <section className="grid gap-4 xl:grid-cols-2">
          <FidsTable
            title="Arrivals"
            flights={arrivals}
            loading={loading}
            error={error}
            changedFlightIds={changedFlightSet}
            newFlightIds={newFlightSet}
            emptyMessage="Standby — no inbound traffic"
          />
          <FidsTable
            title="Departures"
            flights={departures}
            loading={loading}
            error={error}
            changedFlightIds={changedFlightSet}
            newFlightIds={newFlightSet}
            emptyMessage="No active departures"
          />
        </section>
      </div>
    </main>
  );
}
