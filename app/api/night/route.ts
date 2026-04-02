import { NextRequest, NextResponse } from "next/server";
import SunCalc from "suncalc";

function toUtcTime(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

async function geocodeLocation(location: string) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`,
    {
      cache: "no-store",
      headers: {
        "User-Agent": "PilotSeal/1.0",
      },
    }
  );

  if (!response.ok) {
    throw new Error("Geocoding failed.");
  }

  const data = await response.json();
  if (!Array.isArray(data) || !data.length) {
    throw new Error("Location not found.");
  }

  return {
    lat: Number(data[0].lat),
    lon: Number(data[0].lon),
    displayName: data[0].display_name || location,
  };
}

async function getTimezone(lat: number, lon: number) {
  const response = await fetch(
    `https://timeapi.io/api/TimeZone/coordinate?latitude=${lat}&longitude=${lon}`,
    {
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error("Timezone lookup failed.");
  }

  return response.json();
}

function getSunTimes(lat: number, lon: number, date: Date) {
  const times = SunCalc.getTimes(date, lat, lon);

  return {
    utc: {
      sunrise: toUtcTime(times.sunrise),
      sunset: toUtcTime(times.sunset),
      civilDawn: toUtcTime(times.dawn),
      civilDusk: toUtcTime(times.dusk),
    },
    raw: {
      sunrise: times.sunrise.toISOString(),
      sunset: times.sunset.toISOString(),
      civilDawn: times.dawn.toISOString(),
      civilDusk: times.dusk.toISOString(),
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const { location, date } = (await request.json()) as {
      location?: string;
      date?: string;
    };

    if (!location || !date) {
      return NextResponse.json({ error: "Location and date are required." }, { status: 400 });
    }

    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) {
      return NextResponse.json({ error: "Invalid date." }, { status: 400 });
    }

    const coords = await geocodeLocation(location);
    const nextDate = new Date(parsedDate);
    nextDate.setDate(nextDate.getDate() + 1);

    const [timezoneData, sunToday, sunNext] = await Promise.all([
      getTimezone(coords.lat, coords.lon),
      Promise.resolve(getSunTimes(coords.lat, coords.lon, parsedDate)),
      Promise.resolve(getSunTimes(coords.lat, coords.lon, nextDate)),
    ]);

    return NextResponse.json({
      zone: timezoneData?.timeZone ?? null,
      displayName: coords.displayName,
      sunToday,
      sunNext,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch night data." }, { status: 500 });
  }
}
