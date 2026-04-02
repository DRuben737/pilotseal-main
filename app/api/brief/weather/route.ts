import { NextRequest, NextResponse } from "next/server";

const BRIEF_API_BASE = "https://brief.r1978244759.workers.dev";

async function fetchJson(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

function avwxMetarUrl(icao: string) {
  return `${BRIEF_API_BASE}/?url=${encodeURIComponent(`https://avwx.rest/api/metar/${icao}?format=json`)}`;
}

function avwxTafUrl(icao: string) {
  return `${BRIEF_API_BASE}/?url=${encodeURIComponent(`https://avwx.rest/api/taf/${icao}?format=json`)}`;
}

function avwxAirsigmetUrl() {
  return `${BRIEF_API_BASE}/?url=${encodeURIComponent("https://avwx.rest/api/airsigmet?format=json")}`;
}

export async function POST(request: NextRequest) {
  try {
    const { airports } = (await request.json()) as {
      airports?: string[];
    };

    const icaos = Array.isArray(airports)
      ? airports.map((value) => String(value).trim().toUpperCase()).filter(Boolean)
      : [];

    if (!icaos.length) {
      return NextResponse.json({ error: "No airports provided." }, { status: 400 });
    }

    const results = await Promise.all(
      icaos.map(async (icao) => {
        const [metar, taf] = await Promise.allSettled([
          fetchJson(avwxMetarUrl(icao)),
          fetchJson(avwxTafUrl(icao)),
        ]);

        const metarData = metar.status === "fulfilled" ? metar.value : null;
        const tafData = taf.status === "fulfilled" ? taf.value : null;

        return {
          icao,
          metarRaw: metarData?.raw || "Unavailable",
          flight_rules: metarData?.flight_rules || "",
          alt: metarData?.altimeter?.value,
          temp: metarData?.temperature?.value,
          tafRaw: tafData?.raw || "Unavailable",
        };
      })
    );

    let airsigmetSummary = "AIRMET/SIGMET unavailable";

    try {
      const airsigmetData = await fetchJson(avwxAirsigmetUrl());
      airsigmetSummary =
        Array.isArray(airsigmetData) && airsigmetData.length
          ? `${airsigmetData.length} active AIRMET/SIGMETs in U.S. FIRs`
          : "No active AIRMET/SIGMETs";
    } catch {}

    return NextResponse.json({ results, airsigmetSummary });
  } catch {
    return NextResponse.json({ error: "Weather fetch failed." }, { status: 500 });
  }
}
