import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get("query")?.trim();

    if (!query) {
      return NextResponse.json({ error: "Query is required." }, { status: 400 });
    }

    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
      {
        cache: "no-store",
        headers: {
          "User-Agent": "PilotSeal/1.0",
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json({ error: "Geocoding failed." }, { status: 500 });
    }

    const data = await response.json();

    if (!Array.isArray(data) || !data.length) {
      return NextResponse.json({ error: "Location not found." }, { status: 404 });
    }

    return NextResponse.json({
      lat: Number(data[0].lat),
      lon: Number(data[0].lon),
      displayName: data[0].display_name || query,
    });
  } catch {
    return NextResponse.json({ error: "Geocoding failed." }, { status: 500 });
  }
}
