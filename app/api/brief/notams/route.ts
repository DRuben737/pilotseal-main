import { NextRequest, NextResponse } from "next/server";

const BRIEF_API_BASE = "https://brief.r1978244759.workers.dev";

function buildNotamsUrl(airports: string[]) {
  const qs = encodeURIComponent(airports.join(","));
  return `${BRIEF_API_BASE}/notams?airports=${qs}`;
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

    const response = await fetch(buildNotamsUrl(icaos), {
      cache: "no-store",
    });
    const data = await response.json();

    if (!response.ok || data?.ok === false) {
      return NextResponse.json(
        { error: data?.error || "Unable to fetch NOTAMs." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      notams: Array.isArray(data?.notams) ? data.notams : [],
    });
  } catch {
    return NextResponse.json({ error: "Unable to fetch NOTAMs." }, { status: 500 });
  }
}
