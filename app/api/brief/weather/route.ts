import { NextRequest, NextResponse } from "next/server";

const AVWX_FUNCTION_URL =
  "https://dyewqcrqbhnbsseigcoa.supabase.co/functions/v1/AVWX";

type WeatherResult = {
  icao: string;
  metarRaw: string;
  flight_rules: string;
  alt?: number | null;
  temp?: number | null;
  tafRaw: string;
};

function getAnonKey() {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  return anonKey;
}

function normalizeIcao(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))
      ? Number(value)
      : null;
}

function extractRawText(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return (
      String(
        record.raw ??
          record.text ??
          record.raw_text ??
          record.report ??
          record.message ??
          "Unavailable"
      ) || "Unavailable"
    );
  }

  return "Unavailable";
}

function normalizeWeatherResults(payload: Record<string, unknown>, requestedIcaos: string[]) {
  const rawResults = Array.isArray(payload.results)
    ? payload.results
    : Array.isArray(payload.airports)
      ? payload.airports
      : Array.isArray(payload.weather)
        ? payload.weather
        : [];

  const normalized = rawResults
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const record = entry as Record<string, unknown>;
      const icao = normalizeIcao(
        record.icao ?? record.station ?? record.airport ?? record.ident
      );

      if (!icao) {
        return null;
      }

      const metarSource =
        record.metar ??
        record.metarRaw ??
        record.metar_raw ??
        record.raw_metar;
      const tafSource =
        record.taf ??
        record.tafRaw ??
        record.taf_raw ??
        record.raw_taf;
      const metarRecord =
        metarSource && typeof metarSource === "object"
          ? (metarSource as Record<string, unknown>)
          : null;

      return {
        icao,
        metarRaw: extractRawText(metarSource),
        flight_rules: String(
          record.flight_rules ??
            metarRecord?.flight_rules ??
            record.flightRules ??
            ""
        ),
        alt:
          toNumber(record.alt) ??
          toNumber(record.altimeter) ??
          toNumber((record.altimeter as Record<string, unknown> | undefined)?.value),
        temp:
          toNumber(record.temp) ??
          toNumber(record.temperature) ??
          toNumber((record.temperature as Record<string, unknown> | undefined)?.value),
        tafRaw: extractRawText(tafSource),
      } satisfies WeatherResult;
    })
    .filter(Boolean) as WeatherResult[];

  const byIcao = new Map(normalized.map((item) => [item.icao, item]));

  return requestedIcaos.map((icao) => {
    const existing = byIcao.get(icao);
    return (
      existing ?? {
        icao,
        metarRaw: "Unavailable",
        flight_rules: "",
        alt: null,
        temp: null,
        tafRaw: "Unavailable",
      }
    );
  });
}

function normalizeAdvisoryItems(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (typeof entry === "string") {
        return { text: entry.trim() };
      }

      if (entry && typeof entry === "object") {
        const record = entry as Record<string, unknown>;
        const text = String(
          record.raw ??
            record.text ??
            record.message ??
            record.report ??
            record.body ??
            ""
        ).trim();
        return {
          ...record,
          text,
        };
      }

      return null;
    })
    .filter(Boolean);
}

export async function POST(request: NextRequest) {
  try {
    const { route } = (await request.json()) as {
      route?: string[];
    };

    const requestedIcaos = Array.isArray(route)
      ? route.map(normalizeIcao).filter(Boolean)
      : [];

    if (!requestedIcaos.length) {
      return NextResponse.json({ error: "No airports provided." }, { status: 400 });
    }

    const response = await fetch(AVWX_FUNCTION_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getAnonKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        route: requestedIcaos,
      }),
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      return NextResponse.json(
        {
          error: String(payload.error ?? "Weather fetch failed."),
          upstreamStatus: response.status,
          route: requestedIcaos,
        },
        { status: response.status }
      );
    }

    const results = normalizeWeatherResults(payload, requestedIcaos);
    const airmets = normalizeAdvisoryItems(payload.airmets ?? payload.airmet);
    const sigmets = normalizeAdvisoryItems(payload.sigmets ?? payload.sigmet);
    const pireps = normalizeAdvisoryItems(payload.pireps ?? payload.pirep);
    const combinedSummary =
      typeof payload.airsigmetSummary === "string"
        ? payload.airsigmetSummary
        : typeof payload.summary === "string"
          ? payload.summary
          : airmets.length || sigmets.length
            ? `${airmets.length} AIRMET${airmets.length === 1 ? "" : "s"}, ${sigmets.length} SIGMET${sigmets.length === 1 ? "" : "s"}`
            : "No active AIRMET/SIGMETs";

    return NextResponse.json({
      results,
      airmets,
      sigmets,
      pireps,
      airsigmetSummary: combinedSummary,
      route: requestedIcaos,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Weather fetch failed.",
      },
      { status: 500 }
    );
  }
}
