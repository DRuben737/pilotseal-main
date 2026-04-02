export type FlightType = "arrival" | "departure";

export type RawFlightRecord = {
  id: string;
  callsign: string | null;
  type: FlightType;
  status: string | null;
  altitude: number | null;
  velocity: number | null;
  updated_at: string | null;
  distance_km?: number | null;
  heading?: number | null;
  phase?: string | null;
  sequence?: number | null;
  last_seen?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type FlightHistory = {
  altitudeSamples: number[];
  headingSamples: number[];
  timestampSamples: number[];
};

export type AirportOpsConfig = {
  airportName: string;
  runwayName: string;
  runwayHeadingDeg: number;
  latitude: number | null;
  longitude: number | null;
};

export type EnrichedFlightRecord = RawFlightRecord & {
  distanceKm: number | null;
  phase: string;
  sequence: number | null;
  trend: "climbing" | "descending" | "level";
  trendSymbol: "↑" | "↓" | "→";
  isPriority: boolean;
  isFinalPhase: boolean;
  isTouchAndGo: boolean;
  lastSeenAt: string | null;
};

const HISTORY_LIMIT = 6;

function parseOptionalNumber(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getAirportOpsConfig(): AirportOpsConfig {
  return {
    airportName: process.env.NEXT_PUBLIC_FIDS_AIRPORT_NAME ?? "Primary Airport",
    runwayName: process.env.NEXT_PUBLIC_FIDS_ACTIVE_RUNWAY ?? "25",
    runwayHeadingDeg:
      parseOptionalNumber(process.env.NEXT_PUBLIC_FIDS_ACTIVE_RUNWAY_HEADING) ?? 250,
    latitude: parseOptionalNumber(process.env.NEXT_PUBLIC_FIDS_AIRPORT_LAT),
    longitude: parseOptionalNumber(process.env.NEXT_PUBLIC_FIDS_AIRPORT_LON),
  };
}

function normalizeAngle(value: number) {
  return ((value % 360) + 360) % 360;
}

function angleDelta(a: number, b: number) {
  const delta = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return delta > 180 ? 360 - delta : delta;
}

function haversineDistanceKm(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number
) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(latitudeB - latitudeA);
  const deltaLon = toRadians(longitudeB - longitudeA);
  const lat1 = toRadians(latitudeA);
  const lat2 = toRadians(latitudeB);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLon / 2) *
      Math.sin(deltaLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function bearingToTarget(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number
) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const toDegrees = (radians: number) => (radians * 180) / Math.PI;
  const lat1 = toRadians(latitudeA);
  const lat2 = toRadians(latitudeB);
  const deltaLon = toRadians(longitudeB - longitudeA);
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);

  return normalizeAngle(toDegrees(Math.atan2(y, x)));
}

function getLatestSample(values: number[]) {
  return values.length > 0 ? values[values.length - 1] : null;
}

function getVerticalRateFpm(
  altitude: number | null,
  history: FlightHistory | undefined,
  observedAt: number
) {
  if (altitude == null || !history) {
    return 0;
  }

  const previousAltitude = getLatestSample(history.altitudeSamples);
  const previousTimestamp = getLatestSample(history.timestampSamples);

  if (previousAltitude == null || previousTimestamp == null) {
    return 0;
  }

  const minutes = (observedAt - previousTimestamp) / 60_000;
  if (minutes <= 0) {
    return 0;
  }

  return (altitude - previousAltitude) / minutes;
}

function getTrend(verticalRateFpm: number) {
  if (verticalRateFpm >= 200) {
    return "climbing" as const;
  }

  if (verticalRateFpm <= -200) {
    return "descending" as const;
  }

  return "level" as const;
}

function countAltitudeOscillations(history: FlightHistory | undefined, altitude: number | null) {
  const samples = [...(history?.altitudeSamples ?? [])];
  if (altitude != null) {
    samples.push(altitude);
  }

  if (samples.length < 4) {
    return 0;
  }

  let previousDirection = 0;
  let oscillations = 0;

  for (let index = 1; index < samples.length; index += 1) {
    const delta = samples[index] - samples[index - 1];
    const direction = delta > 120 ? 1 : delta < -120 ? -1 : 0;

    if (direction !== 0 && previousDirection !== 0 && direction !== previousDirection) {
      oscillations += 1;
    }

    if (direction !== 0) {
      previousDirection = direction;
    }
  }

  return oscillations;
}

function resolveDistanceKm(flight: RawFlightRecord, airport: AirportOpsConfig) {
  if (typeof flight.distance_km === "number" && Number.isFinite(flight.distance_km)) {
    return flight.distance_km;
  }

  if (
    airport.latitude == null ||
    airport.longitude == null ||
    flight.latitude == null ||
    flight.longitude == null
  ) {
    return null;
  }

  return haversineDistanceKm(
    flight.latitude,
    flight.longitude,
    airport.latitude,
    airport.longitude
  );
}

function resolveInboundBearing(flight: RawFlightRecord, airport: AirportOpsConfig) {
  if (
    airport.latitude == null ||
    airport.longitude == null ||
    flight.latitude == null ||
    flight.longitude == null
  ) {
    return null;
  }

  return bearingToTarget(flight.latitude, flight.longitude, airport.latitude, airport.longitude);
}

function classifyArrivalPhase(
  flight: RawFlightRecord,
  history: FlightHistory | undefined,
  airport: AirportOpsConfig,
  distanceKm: number | null,
  verticalRateFpm: number,
  trend: "climbing" | "descending" | "level"
) {
  const oscillations = countAltitudeOscillations(history, flight.altitude);
  const heading = typeof flight.heading === "number" ? normalizeAngle(flight.heading) : null;
  const inboundBearing = resolveInboundBearing(flight, airport);
  const alignedToRunway =
    (heading != null && angleDelta(heading, airport.runwayHeadingDeg) <= 30) ||
    (inboundBearing != null && angleDelta(inboundBearing, airport.runwayHeadingDeg) <= 30);
  const speed = typeof flight.velocity === "number" ? flight.velocity : null;
  const altitude = typeof flight.altitude === "number" ? flight.altitude : null;
  const previousHeading = history ? getLatestSample(history.headingSamples) : null;
  const turning =
    heading != null && previousHeading != null ? angleDelta(heading, previousHeading) >= 12 : false;
  const inPatternWindow =
    altitude != null &&
    altitude >= 800 &&
    altitude <= 1500 &&
    speed != null &&
    speed < 120 &&
    distanceKm != null &&
    distanceKm <= 5;

  if (oscillations >= 2 && inPatternWindow) {
    return "touch_and_go";
  }

  if (alignedToRunway && altitude != null && altitude < 1500 && distanceKm != null && distanceKm < 5) {
    return "short_final";
  }

  if (alignedToRunway) {
    return "on_final";
  }

  if (inPatternWindow && turning && verticalRateFpm <= -200) {
    return "final";
  }

  if (inPatternWindow && trend === "descending") {
    return "base";
  }

  if (inPatternWindow && trend === "level") {
    return "downwind";
  }

  return flight.phase?.trim().toLowerCase() || "arrival";
}

function classifyDeparturePhase(
  flight: RawFlightRecord,
  verticalRateFpm: number,
  trend: "climbing" | "descending" | "level"
) {
  const altitude = typeof flight.altitude === "number" ? flight.altitude : null;

  if (altitude != null && altitude < 500 && verticalRateFpm >= 500) {
    return "takeoff_roll";
  }

  if (altitude != null && altitude < 3000 && trend === "climbing") {
    return "initial_climb";
  }

  if (altitude != null && altitude >= 3000) {
    return "enroute_departure";
  }

  return flight.phase?.trim().toLowerCase() || "departure";
}

function getTrendSymbol(trend: "climbing" | "descending" | "level") {
  if (trend === "climbing") {
    return "↑" as const;
  }

  if (trend === "descending") {
    return "↓" as const;
  }

  return "→" as const;
}

function enrichFlight(
  flight: RawFlightRecord,
  airport: AirportOpsConfig,
  history: FlightHistory | undefined
): EnrichedFlightRecord {
  const observedAt = new Date(flight.last_seen ?? flight.updated_at ?? Date.now()).getTime();
  const verticalRateFpm = getVerticalRateFpm(flight.altitude, history, observedAt);
  const trend = getTrend(verticalRateFpm);
  const distanceKm = resolveDistanceKm(flight, airport);
  const phase =
    flight.type === "arrival"
      ? classifyArrivalPhase(flight, history, airport, distanceKm, verticalRateFpm, trend)
      : classifyDeparturePhase(flight, verticalRateFpm, trend);

  return {
    ...flight,
    distanceKm,
    phase,
    sequence: flight.sequence ?? null,
    trend,
    trendSymbol: getTrendSymbol(trend),
    isPriority: false,
    isFinalPhase: ["on_final", "short_final", "final"].includes(phase),
    isTouchAndGo: phase === "touch_and_go",
    lastSeenAt: flight.last_seen ?? flight.updated_at ?? null,
  };
}

export function buildTrafficBoard(
  flights: RawFlightRecord[],
  airport: AirportOpsConfig,
  histories: Record<string, FlightHistory>
) {
  const enrichedFlights = flights.map((flight) =>
    enrichFlight(flight, airport, histories[flight.id])
  );

  const arrivals = enrichedFlights
    .filter((flight) => flight.type === "arrival")
    .sort((left, right) => {
      const altitudeDelta =
        (left.altitude ?? Number.MAX_SAFE_INTEGER) -
        (right.altitude ?? Number.MAX_SAFE_INTEGER);

      if (altitudeDelta !== 0) {
        return altitudeDelta;
      }

      return (left.distanceKm ?? Number.MAX_SAFE_INTEGER) - (right.distanceKm ?? Number.MAX_SAFE_INTEGER);
    })
    .map((flight, index) => ({
      ...flight,
      sequence: index + 1,
      isPriority: index === 0,
    }));

  const departures = enrichedFlights
    .filter((flight) => flight.type === "departure")
    .sort(
      (left, right) =>
        new Date(right.updated_at ?? 0).getTime() - new Date(left.updated_at ?? 0).getTime()
    );

  return {
    arrivals,
    departures,
    allFlights: [...arrivals, ...departures],
  };
}

export function updateFlightHistories(
  current: Record<string, FlightHistory>,
  flights: RawFlightRecord[]
) {
  const next: Record<string, FlightHistory> = {};

  flights.forEach((flight) => {
    const existing = current[flight.id];
    const altitudeSamples = [...(existing?.altitudeSamples ?? [])];
    const headingSamples = [...(existing?.headingSamples ?? [])];
    const timestampSamples = [...(existing?.timestampSamples ?? [])];
    const nextTimestamp = new Date(flight.last_seen ?? flight.updated_at ?? Date.now()).getTime();

    if (typeof flight.altitude === "number") {
      altitudeSamples.push(flight.altitude);
    }

    if (typeof flight.heading === "number") {
      headingSamples.push(normalizeAngle(flight.heading));
    }

    timestampSamples.push(nextTimestamp);

    next[flight.id] = {
      altitudeSamples: altitudeSamples.slice(-HISTORY_LIMIT),
      headingSamples: headingSamples.slice(-HISTORY_LIMIT),
      timestampSamples: timestampSamples.slice(-HISTORY_LIMIT),
    };
  });

  return next;
}
