import SunCalc from 'suncalc';
import { DateTime } from 'luxon';
import { getLatLongFromLocation as geocodeLocation } from './geocodeUtils';

export async function getSunTimes(locationOrLat, lonOrDate, maybeDate) {
  let latitude, longitude, dateInput;

  if (typeof locationOrLat === 'string' && !maybeDate) {
    throw new Error('Missing date input for location-based query');
  }

  if (typeof locationOrLat === 'string') {
    const coords = await geocodeLocation(locationOrLat);
    if (!coords) {
      throw new Error('Could not resolve location to coordinates');
    }
    latitude = coords.lat;
    longitude = coords.lon;
    dateInput = lonOrDate;
  } else {
    latitude = locationOrLat;
    longitude = lonOrDate;
    dateInput = maybeDate;
  }

  if (!latitude || !longitude || !dateInput) {
    throw new Error('Missing latitude, longitude, or date');
  }

  const date = typeof dateInput === 'string'
    ? DateTime.fromISO(dateInput, { zone: 'utc' }).toJSDate()
    : DateTime.fromJSDate(dateInput).setZone('utc').toJSDate();

  const times = SunCalc.getTimes(date, latitude, longitude);

  const toUTC = (dt) => DateTime.fromJSDate(dt, { zone: 'utc' }).toFormat('HH:mm');

  return {
    utc: {
      sunrise: toUTC(times.sunrise),
      sunset: toUTC(times.sunset),
      civilDawn: toUTC(times.dawn),
      civilDusk: toUTC(times.dusk),
    },
    raw: {
      sunrise: times.sunrise,
      sunset: times.sunset,
      civilDawn: times.dawn,
      civilDusk: times.dusk,
    },
  };
}