import { NextRequest, NextResponse } from "next/server";
import SunCalc from "suncalc";
import { DateTime } from "luxon";

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

function buildLocalNoon(date: string, zone: string) {
  const localDate = DateTime.fromISO(date, { zone });
  if (!localDate.isValid) {
    throw new Error("Invalid date.");
  }

  return localDate.set({ hour: 12, minute: 0, second: 0, millisecond: 0 }).toJSDate();
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

    const parsedDate = DateTime.fromISO(date);
    if (!parsedDate.isValid) {
      return NextResponse.json({ error: "Invalid date." }, { status: 400 });
    }

    const coords = await geocodeLocation(location);
    const timezoneData = await getTimezone(coords.lat, coords.lon);
    const zone = timezoneData?.timeZone ?? null;

    if (!zone) {
      return NextResponse.json({ error: "Timezone lookup failed." }, { status: 500 });
    }

    const localDate = DateTime.fromISO(date, { zone });
    const nextLocalDate = localDate.plus({ days: 1 });
    const sunTodayDate = buildLocalNoon(localDate.toISODate(), zone);
    const sunNextDate = buildLocalNoon(nextLocalDate.toISODate(), zone);

    const [sunToday, sunNext] = await Promise.all([
      Promise.resolve(getSunTimes(coords.lat, coords.lon, sunTodayDate)),
      Promise.resolve(getSunTimes(coords.lat, coords.lon, sunNextDate)),
    ]);

    return NextResponse.json({
      zone,
      displayName: coords.displayName,
      sunToday,
      sunNext,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch night data." }, { status: 500 });
  }
}
