"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
}: {
  title: string;
  flights: FlightRecord[];
  loading: boolean;
  emptyMessage: string;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/70 shadow-sm">
      <div className="border-b border-neutral-800 px-4 py-4 sm:px-5">
        <h2 className="text-lg font-semibold text-neutral-100">{title}</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-neutral-900/95 backdrop-blur">
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
                  className="border-t border-neutral-800 text-sm text-neutral-200 transition-colors hover:bg-neutral-900"
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
  const [flights, setFlights] = useState<FlightRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [groundOpen, setGroundOpen] = useState(false);

  const fetchFlights = useCallback(async () => {
    const response = await fetch("/api/fids", {
      cache: "no-store",
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error || "Unable to fetch flights.");
    }

    const nextFlights = Array.isArray(data?.flights) ? (data.flights as FlightRecord[]) : [];
    setFlights(nextFlights);
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
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-neutral-400">
            Operations Display
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-neutral-100">
                Flight Information Display
              </h1>
              <p className="mt-2 text-sm text-neutral-400">
                Live traffic view for arrivals, departures, and ground activity.
              </p>
            </div>
            <div className="text-sm text-neutral-400">
              {error ? error : loading ? "Refreshing traffic" : "Auto refresh every 30 seconds"}
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-2">
          <FidsTable
            title="Arrivals"
            flights={arrivals}
            loading={loading}
            emptyMessage="Standby — no inbound traffic"
          />
          <FidsTable
            title="Departures"
            flights={departures}
            loading={loading}
            emptyMessage="No active departures"
          />
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/70 shadow-sm">
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
              />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
