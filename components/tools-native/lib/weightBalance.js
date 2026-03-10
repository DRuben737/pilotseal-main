export function computeStationWeight(station, value) {
  if (!value || value <= 0) return 0;

  // 如果是油箱，用 gallons * weightPerGallon
  if (station.weightPerGallon) {
    return value * station.weightPerGallon;
  }

  // 普通站位：直接 weight
  return value;
}

export function computeItems(aircraft, userInput) {
  const items = [];

  // 空重
  items.push({
    name: "Empty Weight",
    weight: aircraft.empty.weight,
    arm: aircraft.empty.arm
  });

  // 其他站位
  for (const s of aircraft.stations) {
    const inputValue = userInput[s.id] || 0;
    const w = computeStationWeight(s, inputValue);

    items.push({
      name: s.name,
      weight: w,
      arm: s.arm
    });
  }

  return items;
}

export function calcTotal(items) {
  let totalWeight = 0;
  let totalMoment = 0;

  for (const item of items) {
    totalWeight += item.weight;
    totalMoment += item.weight * item.arm;
  }

  return {
    totalWeight,
    totalMoment,
    cg: totalMoment / totalWeight
  };
}

export function isWithinEnvelope(cg, weight, polygon) {
  if (!polygon || polygon.length < 3) return false;

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].cg, yi = polygon[i].weight;
    const xj = polygon[j].cg, yj = polygon[j].weight;

    const intersect =
      ((yi > weight) !== (yj > weight)) &&
      (cg < (((xj - xi) * (weight - yi)) / (yj - yi) + xi));

    if (intersect) inside = !inside;
  }
  return inside;
}

export function computeWeightAndBalance(aircraft, userInput) {
  const items = computeItems(aircraft, userInput);
  const totals = calcTotal(items);
  const inLimits = isWithinEnvelope(totals.cg, totals.totalWeight, aircraft.envelopeNormal);

  return {
    items,
    ...totals,
    inLimits
  };
}

export function computeZeroFuel(aircraft, userInput) {
  const zeroFuelInput = { ...userInput };

  // Set all fuel-type station inputs to 0
  if (aircraft.stations) {
    aircraft.stations.forEach(station => {
      if (station.weightPerGallon) {
        zeroFuelInput[station.id] = 0;
      }
    });
  }

  return computeWeightAndBalance(aircraft, zeroFuelInput);
}