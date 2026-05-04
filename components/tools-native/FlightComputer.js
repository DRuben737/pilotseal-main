"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

const MACH_ONE_KT = 661.47;
const LITERS_PER_US_GALLON = 3.78541;
const LITERS_PER_IMP_GALLON = 4.54609;
const FEET_PER_NM = 6076.12;
const KG_PER_LITER_PER_LB_PER_GALLON = 0.119826427;
const CLIMB_DESCENT_ANGLES = [2.0, 2.5, 2.7, 2.8, 2.9, 3.0, 3.1, 3.2, 3.3, 3.4];

const DISTANCE_UNITS = [
  { id: "nauticalMiles", label: "Nautical miles", toBase: (v) => v, fromBase: (v) => v },
  { id: "statuteMiles", label: "Statute miles", toBase: (v) => v / 1.15078, fromBase: (v) => v * 1.15078 },
  { id: "kilometers", label: "Kilometers", toBase: (v) => v / 1.852, fromBase: (v) => v * 1.852 },
  { id: "meters", label: "Meters", toBase: (v) => v / 1852, fromBase: (v) => v * 1852 },
  { id: "feet", label: "Feet", toBase: (v) => v / FEET_PER_NM, fromBase: (v) => v * FEET_PER_NM },
  { id: "yards", label: "Yards", toBase: (v) => v / 2025.3718, fromBase: (v) => v * 2025.3718 },
];

const SPEED_UNITS = [
  { id: "knots", label: "Knots", toBase: (v) => v, fromBase: (v) => v },
  { id: "mach", label: "Mach number at SL", toBase: (v) => v * MACH_ONE_KT, fromBase: (v) => v / MACH_ONE_KT },
  { id: "mph", label: "Miles per hour", toBase: (v) => v / 1.15078, fromBase: (v) => v * 1.15078 },
  { id: "kph", label: "Kilometers per hour", toBase: (v) => v / 1.852, fromBase: (v) => v * 1.852 },
  { id: "feetPerMinute", label: "Feet per minute", toBase: (v) => v / FEET_PER_NM * 60, fromBase: (v) => (v / 60) * FEET_PER_NM },
  { id: "metersPerSecond", label: "Meters per second", toBase: (v) => (v * 1.94384), fromBase: (v) => v / 1.94384 },
];

const TEMPERATURE_UNITS = [
  { id: "fahrenheit", label: "Fahrenheit", toBase: (v) => (v - 32) * (5 / 9), fromBase: (v) => v * (9 / 5) + 32 },
  { id: "celsius", label: "Celsius", toBase: (v) => v, fromBase: (v) => v },
  { id: "kelvin", label: "Kelvin", toBase: (v) => v - 273.15, fromBase: (v) => v + 273.15 },
];

const FUEL_TYPES = [
  { id: "avgas", label: "Avgas (6 lbs/US Gal)", densityLbPerGal: 6 },
  { id: "jetA", label: "Jet A (6.7 lbs/US Gal)", densityLbPerGal: 6.7 },
  { id: "mogas", label: "Mogas (6.01 lbs/US Gal)", densityLbPerGal: 6.01 },
  { id: "diesel", label: "Diesel (7.1 lbs/US Gal)", densityLbPerGal: 7.1 },
  { id: "custom", label: "Custom density", densityLbPerGal: 6 },
];

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeAngle(angle) {
  const value = angle % 360;
  return value < 0 ? value + 360 : value;
}

function formatNumber(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : "--";
}

function formatCompact(value, digits = 2) {
  if (!Number.isFinite(value)) return "";
  return value.toFixed(digits).replace(/\.?0+$/, "");
}

function formatClock(hours) {
  if (!Number.isFinite(hours) || hours < 0) return "--";
  const totalMinutes = Math.round(hours * 60);
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${hh}:${String(mm).padStart(2, "0")}`;
}

function formatMinutes(totalMinutes) {
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return "--";
  const rounded = Math.round(totalMinutes);
  const hh = Math.floor(rounded / 60);
  const mm = rounded % 60;
  return `${hh}:${String(mm).padStart(2, "0")}`;
}

function signedVariation(value, direction) {
  if (!Number.isFinite(value)) return 0;
  return direction === "W" ? -Math.abs(value) : Math.abs(value);
}

function clampRatio(value) {
  return Math.max(-1, Math.min(1, value));
}

function computeWindCourse({
  trueCourse,
  trueAirspeed,
  windDirection,
  windSpeed,
  variation,
}) {
  if (
    [trueCourse, trueAirspeed, windDirection, windSpeed].some(
      (value) => !Number.isFinite(value)
    ) ||
    trueAirspeed <= 0
  ) {
    return null;
  }

  const relativeRadians = ((windDirection - trueCourse) * Math.PI) / 180;
  const crosswind = windSpeed * Math.sin(relativeRadians);
  const headwind = windSpeed * Math.cos(relativeRadians);
  const ratio = clampRatio(crosswind / trueAirspeed);
  const wca = (Math.asin(ratio) * 180) / Math.PI;
  const headingTrue = normalizeAngle(trueCourse + wca);
  const headingMagnetic = normalizeAngle(headingTrue - (variation || 0));
  const groundspeed = trueAirspeed * Math.cos(Math.asin(ratio)) - headwind;

  return {
    wca,
    headingTrue,
    headingMagnetic,
    groundspeed,
    crosswind,
    headwind,
    tailwind: headwind < 0 ? Math.abs(headwind) : 0,
  };
}

function computeRunwayWind({
  runwayHeading,
  windDirection,
  windSpeed,
  gustSpeed,
}) {
  if (
    [runwayHeading, windDirection, windSpeed].some(
      (value) => !Number.isFinite(value)
    )
  ) {
    return null;
  }

  const radians = ((windDirection - runwayHeading) * Math.PI) / 180;
  const headwind = windSpeed * Math.cos(radians);
  const crosswind = windSpeed * Math.sin(radians);
  const gustCrosswind = Number.isFinite(gustSpeed)
    ? gustSpeed * Math.sin(radians)
    : null;

  return {
    headwind,
    tailwind: headwind < 0 ? Math.abs(headwind) : 0,
    crosswind,
    gustCrosswind,
  };
}

function computeFuelPlan({
  distanceNm,
  groundspeed,
  burnRate,
  reserveMinutes,
}) {
  if (
    [distanceNm, groundspeed, burnRate].some((value) => !Number.isFinite(value)) ||
    groundspeed <= 0 ||
    burnRate < 0
  ) {
    return null;
  }

  const enrouteHours = distanceNm / groundspeed;
  const reserveHours = (reserveMinutes || 0) / 60;
  const tripFuel = enrouteHours * burnRate;
  const reserveFuel = reserveHours * burnRate;

  return {
    enrouteHours,
    tripFuel,
    reserveFuel,
    totalFuel: tripFuel + reserveFuel,
  };
}

function computeFuelRemaining({
  fuelOnBoard,
  distanceNm,
  groundspeed,
  burnRate,
  reserveMinutes,
}) {
  if (
    [fuelOnBoard, distanceNm, groundspeed, burnRate].some(
      (value) => !Number.isFinite(value)
    ) ||
    fuelOnBoard < 0 ||
    distanceNm < 0 ||
    groundspeed <= 0 ||
    burnRate <= 0
  ) {
    return null;
  }

  const enrouteHours = distanceNm / groundspeed;
  const tripFuel = enrouteHours * burnRate;
  const fuelRemaining = fuelOnBoard - tripFuel;
  const reserveFuel = ((reserveMinutes || 0) / 60) * burnRate;
  const fuelAfterReserve = fuelRemaining - reserveFuel;
  const enduranceHours = fuelRemaining > 0 ? fuelRemaining / burnRate : 0;

  return {
    enrouteHours,
    tripFuel,
    fuelRemaining,
    reserveFuel,
    fuelAfterReserve,
    enduranceHours,
  };
}

function computeAltitude({ fieldElevation, altimeter, oat }) {
  if ([fieldElevation, altimeter, oat].some((value) => !Number.isFinite(value))) {
    return null;
  }

  const pressureAltitude = (29.92 - altimeter) * 1000 + fieldElevation;
  const isaTemp = 15 - 2 * (pressureAltitude / 1000);
  const densityAltitude = pressureAltitude + 120 * (oat - isaTemp);

  return {
    pressureAltitude,
    densityAltitude,
    isaTemp,
  };
}

function computeClimbDescent({ altitudeChange, groundspeed, verticalSpeed }) {
  if (
    [altitudeChange, groundspeed, verticalSpeed].some((value) => !Number.isFinite(value)) ||
    groundspeed <= 0 ||
    verticalSpeed <= 0
  ) {
    return null;
  }

  const minutes = altitudeChange / verticalSpeed;
  const distanceNm = groundspeed * (minutes / 60);
  const gradient = altitudeChange / distanceNm;

  return {
    minutes,
    distanceNm,
    gradient,
  };
}

function computeTopOfDescent({
  altitudeToLose,
  descentRate,
  groundspeed,
}) {
  if (
    [altitudeToLose, descentRate, groundspeed].some((value) => !Number.isFinite(value)) ||
    altitudeToLose <= 0 ||
    descentRate <= 0 ||
    groundspeed <= 0
  ) {
    return null;
  }

  const minutes = altitudeToLose / descentRate;
  const distanceNm = groundspeed * (minutes / 60);

  return {
    minutes,
    distanceNm,
  };
}

function computeSpeedDistanceTime({
  distanceNm,
  groundspeed,
  timeMinutes,
}) {
  const hasDistance = Number.isFinite(distanceNm) && distanceNm > 0;
  const hasGroundspeed = Number.isFinite(groundspeed) && groundspeed > 0;
  const hasTime = Number.isFinite(timeMinutes) && timeMinutes > 0;
  const provided = [hasDistance, hasGroundspeed, hasTime].filter(Boolean).length;

  if (provided < 2) return null;

  const solvedDistance =
    hasDistance ? distanceNm : groundspeed * (timeMinutes / 60);
  const solvedGroundspeed =
    hasGroundspeed ? groundspeed : distanceNm / (timeMinutes / 60);
  const solvedTime =
    hasTime ? timeMinutes : (distanceNm / groundspeed) * 60;

  if (
    !Number.isFinite(solvedDistance) ||
    !Number.isFinite(solvedGroundspeed) ||
    !Number.isFinite(solvedTime) ||
    solvedDistance <= 0 ||
    solvedGroundspeed <= 0 ||
    solvedTime <= 0
  ) {
    return null;
  }

  return {
    distanceNm: solvedDistance,
    groundspeed: solvedGroundspeed,
    timeMinutes: solvedTime,
  };
}

function computeRequiredGroundspeed({
  distanceNm,
  timeMinutes,
  currentGroundspeed,
}) {
  if (
    !Number.isFinite(distanceNm) ||
    !Number.isFinite(timeMinutes) ||
    distanceNm <= 0 ||
    timeMinutes <= 0
  ) {
    return null;
  }

  const requiredGroundspeed = distanceNm / (timeMinutes / 60);
  const currentEtaMinutes =
    Number.isFinite(currentGroundspeed) && currentGroundspeed > 0
      ? (distanceNm / currentGroundspeed) * 60
      : null;

  return {
    requiredGroundspeed,
    currentEtaMinutes,
    speedDelta:
      Number.isFinite(currentGroundspeed) && currentGroundspeed > 0
        ? requiredGroundspeed - currentGroundspeed
        : null,
  };
}

function computeFuelByWeight({
  fuelGallons,
  fuelWeight,
  weightPerGallon,
}) {
  const factor =
    Number.isFinite(weightPerGallon) && weightPerGallon > 0 ? weightPerGallon : 6;
  const hasGallons = Number.isFinite(fuelGallons) && fuelGallons >= 0;
  const hasWeight = Number.isFinite(fuelWeight) && fuelWeight >= 0;
  const provided = [hasGallons, hasWeight].filter(Boolean).length;

  if (provided === 0) return null;

  const gallons = hasGallons ? fuelGallons : fuelWeight / factor;
  const weight = hasWeight ? fuelWeight : fuelGallons * factor;

  if (!Number.isFinite(gallons) || !Number.isFinite(weight) || gallons < 0 || weight < 0) {
    return null;
  }

  return {
    gallons,
    weight,
    weightPerGallon: factor,
  };
}

function computeRequiredDescentRate({
  altitudeToLose,
  distanceNm,
  groundspeed,
}) {
  if (
    !Number.isFinite(altitudeToLose) ||
    !Number.isFinite(distanceNm) ||
    !Number.isFinite(groundspeed) ||
    altitudeToLose <= 0 ||
    distanceNm <= 0 ||
    groundspeed <= 0
  ) {
    return null;
  }

  const timeMinutes = (distanceNm / groundspeed) * 60;
  const descentRate = altitudeToLose / timeMinutes;
  const gradient = altitudeToLose / distanceNm;

  return {
    descentRate,
    timeMinutes,
    gradient,
  };
}

function computeVerticalSpeedFromGradient({
  groundspeed,
  gradientFtPerNm,
}) {
  if (
    !Number.isFinite(groundspeed) ||
    !Number.isFinite(gradientFtPerNm) ||
    groundspeed <= 0 ||
    gradientFtPerNm <= 0
  ) {
    return null;
  }

  return {
    verticalSpeed: (groundspeed / 60) * gradientFtPerNm,
  };
}

function computeRuleOf60({
  offCourseNm,
  distanceFlownNm,
  distanceRemainingNm,
}) {
  if (
    !Number.isFinite(offCourseNm) ||
    !Number.isFinite(distanceFlownNm) ||
    offCourseNm < 0 ||
    distanceFlownNm <= 0
  ) {
    return null;
  }

  const trackErrorDeg = (offCourseNm / distanceFlownNm) * 60;
  const interceptDeg =
    Number.isFinite(distanceRemainingNm) && distanceRemainingNm > 0
      ? (offCourseNm / distanceRemainingNm) * 60
      : null;

  return {
    trackErrorDeg,
    interceptDeg,
    correctionDeg:
      Number.isFinite(interceptDeg) ? trackErrorDeg + interceptDeg : trackErrorDeg,
  };
}

function computeGradientForAngle(angle) {
  if (!Number.isFinite(angle) || angle <= 0) return null;
  return Math.tan((angle * Math.PI) / 180) * FEET_PER_NM;
}

function computeClimbDescentTable(groundspeed) {
  if (!Number.isFinite(groundspeed) || groundspeed <= 0) return [];
  return CLIMB_DESCENT_ANGLES.map((angle) => {
    const ftPerNm = computeGradientForAngle(angle);
    return {
      angle,
      ftPerNm,
      fpm: (groundspeed / 60) * ftPerNm,
    };
  });
}

function estimateDrift(course, tas, windDirection, windSpeed) {
  if (
    [course, tas, windDirection, windSpeed].some((value) => !Number.isFinite(value)) ||
    tas <= 0
  ) {
    return null;
  }

  const relativeRadians = ((windDirection - course) * Math.PI) / 180;
  const crosswind = windSpeed * Math.sin(relativeRadians);
  return (Math.asin(clampRatio(crosswind / tas)) * 180) / Math.PI;
}

function classifyHoldingEntry(relativeFromInbound, turnDirection) {
  if (turnDirection === "L") {
    if (relativeFromInbound >= 70 && relativeFromInbound <= 250) return "Direct";
    if (relativeFromInbound > 250 && relativeFromInbound < 360) return "Parallel";
    return "Teardrop";
  }

  if (relativeFromInbound >= 110 && relativeFromInbound <= 290) return "Direct";
  if (relativeFromInbound > 290 && relativeFromInbound < 360) return "Teardrop";
  return "Parallel";
}

function computeHoldingGroundspeed(course, trueAirspeed, windDirection, windSpeed) {
  if (
    [course, trueAirspeed, windDirection, windSpeed].some(
      (value) => !Number.isFinite(value)
    ) ||
    trueAirspeed <= 0
  ) {
    return null;
  }

  const wind = computeWindCourse({
    trueCourse: course,
    trueAirspeed,
    windDirection,
    windSpeed,
    variation: 0,
  });

  return wind && Number.isFinite(wind.groundspeed) && wind.groundspeed > 0
    ? wind.groundspeed
    : null;
}

function computeHoldingTrainer({
  inboundCourse,
  aircraftHeading,
  turnDirection,
  windDirection,
  windSpeed,
  trueAirspeed,
}) {
  if (
    !Number.isFinite(inboundCourse) ||
    !Number.isFinite(aircraftHeading)
  ) {
    return null;
  }

  const outboundCourse = normalizeAngle(inboundCourse + 180);
  const relativeFromInbound = normalizeAngle(aircraftHeading - inboundCourse);
  const entry = classifyHoldingEntry(relativeFromInbound, turnDirection);
  const inboundDrift = estimateDrift(
    inboundCourse,
    trueAirspeed,
    windDirection,
    windSpeed
  );
  const outboundDrift =
    Number.isFinite(inboundDrift) ? inboundDrift * 3 : null;
  const teardropHeading = normalizeAngle(
    outboundCourse + (turnDirection === "R" ? -30 : 30)
  );
  const crossFixHeading =
    entry === "Direct"
      ? outboundCourse
      : entry === "Teardrop"
        ? teardropHeading
        : outboundCourse;
  const crossFixAction =
    entry === "Direct"
      ? `Turn to ${formatNumber(outboundCourse, 0)}° and fly the outbound leg.`
      : entry === "Teardrop"
        ? `Turn to ${formatNumber(teardropHeading, 0)}° for the teardrop entry.`
        : `Turn to ${formatNumber(outboundCourse, 0)}° and fly the inbound leg.`;
  const inboundGroundspeed = computeHoldingGroundspeed(
    inboundCourse,
    trueAirspeed,
    windDirection,
    windSpeed
  );
  const outboundGroundspeed = computeHoldingGroundspeed(
    outboundCourse,
    trueAirspeed,
    windDirection,
    windSpeed
  );
  const outboundTimeSeconds =
    Number.isFinite(inboundGroundspeed) && Number.isFinite(outboundGroundspeed)
      ? (60 * inboundGroundspeed) / outboundGroundspeed
      : null;
  const timeCorrectionSeconds = Number.isFinite(outboundTimeSeconds)
    ? outboundTimeSeconds - 60
    : null;

  const procedure =
    entry === "Direct"
      ? "Cross the fix, turn onto the holding side, time outbound, then turn inbound."
      : entry === "Parallel"
        ? "Cross the fix, fly the outbound course on the non-holding side for one minute, then turn back toward the protected side to intercept inbound."
        : "Cross the fix, fly a 30° offset outbound toward the holding side for one minute, then turn inbound.";

  return {
    entry,
    inboundCourse: normalizeAngle(inboundCourse),
    outboundCourse,
    teardropHeading,
    crossFixHeading,
    crossFixAction,
    inboundCorrection: Number.isFinite(inboundDrift)
      ? normalizeAngle(inboundCourse + inboundDrift)
      : null,
    outboundCorrection: Number.isFinite(outboundDrift)
      ? normalizeAngle(outboundCourse + outboundDrift)
      : null,
    inboundDrift,
    outboundDrift,
    inboundGroundspeed,
    outboundGroundspeed,
    outboundTimeSeconds,
    timeCorrectionSeconds,
    procedure,
    relativeFromInbound,
    directVariant:
      entry === "Direct"
        ? relativeFromInbound <= 170
          ? "arc"
          : relativeFromInbound <= 230
            ? "tangent"
            : "offset"
        : null,
  };
}

function createNavlogLeg() {
  return {
    id: crypto.randomUUID(),
    from: "",
    to: "",
    course: "",
    distance: "",
    tas: "",
    windDir: "",
    windSpeed: "",
    variation: "",
    variationDir: "E",
    burnRate: "",
  };
}

function computeNavlogLeg(leg) {
  const distanceNm = toNumber(leg.distance);
  const tas = toNumber(leg.tas);
  const windDirection = toNumber(leg.windDir);
  const windSpeed = toNumber(leg.windSpeed);
  const variation = signedVariation(toNumber(leg.variation), leg.variationDir);
  const course = toNumber(leg.course);
  const burnRate = toNumber(leg.burnRate);

  const wind = computeWindCourse({
    trueCourse: course,
    trueAirspeed: tas,
    windDirection,
    windSpeed,
    variation,
  });

  const eteHours =
    wind && Number.isFinite(distanceNm) && distanceNm > 0 && wind.groundspeed > 0
      ? distanceNm / wind.groundspeed
      : null;

  const legFuel =
    Number.isFinite(burnRate) && burnRate >= 0 && Number.isFinite(eteHours)
      ? burnRate * eteHours
      : null;

  return {
    wind,
    eteHours,
    legFuel,
  };
}

function convertByUnits(units, sourceId, sourceValue) {
  const parsed = toNumber(sourceValue);
  if (parsed == null) {
    return units.reduce((acc, unit) => {
      acc[unit.id] = "";
      return acc;
    }, {});
  }

  const sourceUnit = units.find((unit) => unit.id === sourceId);
  if (!sourceUnit) return {};

  const baseValue = sourceUnit.toBase(parsed);
  return units.reduce((acc, unit) => {
    acc[unit.id] = unit.id === sourceId ? sourceValue : formatCompact(unit.fromBase(baseValue), 4);
    return acc;
  }, {});
}

function densityLbToKgPerLiter(value) {
  return value * KG_PER_LITER_PER_LB_PER_GALLON;
}

function densityKgPerLiterToLb(value) {
  return value / KG_PER_LITER_PER_LB_PER_GALLON;
}

function computeFuelFields(sourceId, sourceValue, densityKgPerLiter) {
  const parsed = toNumber(sourceValue);
  const empty = {
    liters: "",
    usGallons: "",
    imperialGallons: "",
    pounds: "",
    kilograms: "",
    metricTons: "",
  };

  if (parsed == null || !Number.isFinite(densityKgPerLiter) || densityKgPerLiter <= 0) {
    return empty;
  }

  let liters = null;
  let kilograms = null;

  if (sourceId === "liters") liters = parsed;
  if (sourceId === "usGallons") liters = parsed * LITERS_PER_US_GALLON;
  if (sourceId === "imperialGallons") liters = parsed * LITERS_PER_IMP_GALLON;
  if (sourceId === "kilograms") kilograms = parsed;
  if (sourceId === "pounds") kilograms = parsed * 0.45359237;
  if (sourceId === "metricTons") kilograms = parsed * 1000;

  if (liters == null && kilograms != null) liters = kilograms / densityKgPerLiter;
  if (kilograms == null && liters != null) kilograms = liters * densityKgPerLiter;

  if (!Number.isFinite(liters) || !Number.isFinite(kilograms)) {
    return empty;
  }

  return {
    liters: sourceId === "liters" ? sourceValue : formatCompact(liters, 3),
    usGallons:
      sourceId === "usGallons" ? sourceValue : formatCompact(liters / LITERS_PER_US_GALLON, 3),
    imperialGallons:
      sourceId === "imperialGallons"
        ? sourceValue
        : formatCompact(liters / LITERS_PER_IMP_GALLON, 3),
    pounds:
      sourceId === "pounds" ? sourceValue : formatCompact(kilograms / 0.45359237, 3),
    kilograms:
      sourceId === "kilograms" ? sourceValue : formatCompact(kilograms, 3),
    metricTons:
      sourceId === "metricTons" ? sourceValue : formatCompact(kilograms / 1000, 5),
  };
}

function Field({
  label,
  value,
  setValue,
  suffix = "",
  placeholder = "",
  inputMode = "decimal",
}) {
  return (
    <label className="flight-computer-field">
      <span>{label}</span>
      <div className="flight-computer-inputWrap">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          inputMode={inputMode}
          placeholder={placeholder}
        />
        {suffix ? <small>{suffix}</small> : null}
      </div>
    </label>
  );
}

function SelectField({ label, value, setValue, options }) {
  return (
    <label className="flight-computer-field">
      <span>{label}</span>
      <div className="flight-computer-inputWrap">
        <select value={value} onChange={(event) => setValue(event.target.value)}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </label>
  );
}

function VariationField({
  label,
  value,
  setValue,
  direction,
  setDirection,
  placeholder = "",
}) {
  return (
    <label className="flight-computer-field">
      <span>{label}</span>
      <div className="flight-computer-inputWrap flight-computer-inputWrapVariation">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          inputMode="decimal"
          placeholder={placeholder}
        />
        <div className="flight-computer-inlineToggle" role="group" aria-label={`${label} direction`}>
          <button
            type="button"
            className={`flight-computer-inlineToggleButton ${direction === "E" ? "is-active" : ""}`}
            onClick={() => setDirection("E")}
          >
            E
          </button>
          <button
            type="button"
            className={`flight-computer-inlineToggleButton ${direction === "W" ? "is-active" : ""}`}
            onClick={() => setDirection("W")}
          >
            W
          </button>
        </div>
      </div>
    </label>
  );
}

function HoldingCourseField({
  mode,
  value,
  setValue,
  setMode,
}) {
  const isRadial = mode === "radial";

  return (
    <label className="flight-computer-field flight-computer-fieldWide">
      <span>{isRadial ? "Inbound radial" : "Inbound course"}</span>
      <div className="flight-computer-inputWrap flight-computer-inputWrapVariation">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          inputMode="decimal"
          placeholder={isRadial ? "180" : "360"}
        />
        <div className="flight-computer-inlineToggle" role="group" aria-label="Holding inbound reference">
          <button
            type="button"
            className={`flight-computer-inlineToggleButton ${!isRadial ? "is-active" : ""}`}
            onClick={() => setMode("course")}
          >
            CRS
          </button>
          <button
            type="button"
            className={`flight-computer-inlineToggleButton ${isRadial ? "is-active" : ""}`}
            onClick={() => setMode("radial")}
          >
            RAD
          </button>
        </div>
      </div>
    </label>
  );
}

function Result({ label, value }) {
  return (
    <div className="flight-computer-resultCard">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ConverterInput({ label, value, onChange, placeholder = "" }) {
  return (
    <label className="flight-computer-converterRow">
      <span>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode="decimal"
        placeholder={placeholder}
      />
    </label>
  );
}

function ConverterPanel() {
  const converterSections = [
    { id: "distance", label: "Distance" },
    { id: "speed", label: "Speed" },
    { id: "temperature", label: "Temperature" },
    { id: "fuel", label: "Fuel" },
  ];
  const [activeConverter, setActiveConverter] = useState("distance");
  const [distance, setDistance] = useState(() =>
    convertByUnits(DISTANCE_UNITS, "nauticalMiles", "1")
  );
  const [speed, setSpeed] = useState({
    knots: "",
    mach: "",
    mph: "",
    kph: "",
    feetPerMinute: "",
    metersPerSecond: "",
  });
  const [fuel, setFuel] = useState({
    type: "avgas",
    densityUnit: "lbpg",
    density: "6",
    lastEdited: "usGallons",
    liters: "",
    usGallons: "",
    imperialGallons: "",
    pounds: "",
    kilograms: "",
    metricTons: "",
  });
  const [temperature, setTemperature] = useState({
    fahrenheit: "",
    celsius: "",
    kelvin: "",
  });

  function updateDistance(sourceId, value) {
    setDistance(convertByUnits(DISTANCE_UNITS, sourceId, value));
  }

  function updateSpeed(sourceId, value) {
    setSpeed(convertByUnits(SPEED_UNITS, sourceId, value));
  }

  function updateTemperature(sourceId, value) {
    setTemperature(convertByUnits(TEMPERATURE_UNITS, sourceId, value));
  }

  function fuelDensityKgPerLiter(currentFuel = fuel) {
    const densityValue = toNumber(currentFuel.density);
    if (!Number.isFinite(densityValue) || densityValue <= 0) return null;
    return currentFuel.densityUnit === "kgpl"
      ? densityValue
      : densityLbToKgPerLiter(densityValue);
  }

  function updateFuelField(sourceId, value, draft = fuel) {
    const densityKgPerLiter = fuelDensityKgPerLiter(draft);
    const nextFields = computeFuelFields(sourceId, value, densityKgPerLiter);
    setFuel((current) => ({
      ...current,
      ...nextFields,
      lastEdited: sourceId,
      type: draft.type,
      densityUnit: draft.densityUnit,
      density: draft.density,
    }));
  }

  function updateFuelType(nextTypeId) {
    const selected = FUEL_TYPES.find((item) => item.id === nextTypeId) ?? FUEL_TYPES[0];
    const nextDensity =
      fuel.densityUnit === "kgpl"
        ? formatCompact(densityLbToKgPerLiter(selected.densityLbPerGal), 3)
        : formatCompact(selected.densityLbPerGal, 2);

    const draft = {
      ...fuel,
      type: nextTypeId,
      density: nextDensity,
    };

    const anchorValue = draft[draft.lastEdited];
    const nextFields = computeFuelFields(
      draft.lastEdited,
      anchorValue,
      fuelDensityKgPerLiter(draft)
    );

    setFuel({
      ...draft,
      ...nextFields,
    });
  }

  function updateFuelDensityUnit(nextUnit) {
    const densityValue = toNumber(fuel.density);
    const convertedDensity =
      densityValue == null
        ? ""
        : nextUnit === "kgpl"
          ? formatCompact(
              fuel.densityUnit === "kgpl"
                ? densityValue
                : densityLbToKgPerLiter(densityValue),
              3
            )
          : formatCompact(
              fuel.densityUnit === "lbpg"
                ? densityValue
                : densityKgPerLiterToLb(densityValue),
              2
            );

    const draft = {
      ...fuel,
      densityUnit: nextUnit,
      density: convertedDensity,
    };
    const nextFields = computeFuelFields(
      draft.lastEdited,
      draft[draft.lastEdited],
      fuelDensityKgPerLiter(draft)
    );

    setFuel({
      ...draft,
      ...nextFields,
    });
  }

  function updateFuelDensity(value) {
    const draft = { ...fuel, density: value };
    const nextFields = computeFuelFields(
      draft.lastEdited,
      draft[draft.lastEdited],
      fuelDensityKgPerLiter(draft)
    );

    setFuel({
      ...draft,
      ...nextFields,
    });
  }

  return (
    <article className="flight-computer-card flight-computer-cardCompact flight-computer-converterPanel">
      <div className="flight-computer-cardHead">
        <h3>Converters</h3>
        <p>Select a converter, then work in one panel.</p>
      </div>

      <div className="flight-computer-segmented">
        {converterSections.map((section) => (
          <button
            key={section.id}
            type="button"
            className={`flight-computer-chip ${activeConverter === section.id ? "is-active" : ""}`}
            onClick={() => setActiveConverter(section.id)}
          >
            {section.label}
          </button>
        ))}
      </div>

      {activeConverter === "distance" ? (
        <div className="flight-computer-converterCard">
          <div className="flight-computer-cardHead">
            <h3>Distance converter</h3>
            <p>NM, SM, KM, meters, feet, yards.</p>
          </div>
          <div className="flight-computer-converterGrid">
            {DISTANCE_UNITS.map((unit) => (
              <ConverterInput
                key={unit.id}
                label={unit.label}
                value={distance[unit.id] ?? ""}
                onChange={(value) => updateDistance(unit.id, value)}
                placeholder="0"
              />
            ))}
          </div>
        </div>
      ) : null}

      {activeConverter === "speed" ? (
        <div className="flight-computer-converterCard">
          <div className="flight-computer-cardHead">
            <h3>Speed converter</h3>
            <p>Knots, Mach at sea level, MPH, KPH, FPM, M/S.</p>
          </div>
          <div className="flight-computer-converterGrid">
            {SPEED_UNITS.map((unit) => (
              <ConverterInput
                key={unit.id}
                label={unit.label}
                value={speed[unit.id] ?? ""}
                onChange={(value) => updateSpeed(unit.id, value)}
                placeholder="0"
              />
            ))}
          </div>
        </div>
      ) : null}

      {activeConverter === "temperature" ? (
        <div className="flight-computer-converterCard">
          <div className="flight-computer-cardHead">
            <h3>Temperature converter</h3>
            <p>Fahrenheit, Celsius, Kelvin.</p>
          </div>
          <div className="flight-computer-converterGrid flight-computer-converterGridTight">
            {TEMPERATURE_UNITS.map((unit) => (
              <ConverterInput
                key={unit.id}
                label={unit.label}
                value={temperature[unit.id] ?? ""}
                onChange={(value) => updateTemperature(unit.id, value)}
                placeholder="0"
              />
            ))}
          </div>
        </div>
      ) : null}

      {activeConverter === "fuel" ? (
        <div className="flight-computer-converterCard">
          <div className="flight-computer-cardHead">
            <h3>Fuel converter</h3>
            <p>Volume and mass with selectable fuel density.</p>
          </div>

          <div className="flight-computer-converterMeta">
            <label className="flight-computer-converterRow">
              <span>Type</span>
              <select value={fuel.type} onChange={(event) => updateFuelType(event.target.value)}>
                {FUEL_TYPES.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="flight-computer-densityBlock">
              <span>Density</span>
              <div className="flight-computer-inlineToggle" role="group" aria-label="Fuel density units">
                <button
                  type="button"
                  className={`flight-computer-inlineToggleButton ${fuel.densityUnit === "kgpl" ? "is-active" : ""}`}
                  onClick={() => updateFuelDensityUnit("kgpl")}
                >
                  kg/L
                </button>
                <button
                  type="button"
                  className={`flight-computer-inlineToggleButton ${fuel.densityUnit === "lbpg" ? "is-active" : ""}`}
                  onClick={() => updateFuelDensityUnit("lbpg")}
                >
                  lb/gal
                </button>
              </div>
              <input
                className="flight-computer-densityInput"
                value={fuel.density}
                onChange={(event) => updateFuelDensity(event.target.value)}
                inputMode="decimal"
                placeholder="6"
              />
            </div>
          </div>

          <div className="flight-computer-converterGrid">
            <ConverterInput label="Liters" value={fuel.liters} onChange={(value) => updateFuelField("liters", value)} placeholder="0" />
            <ConverterInput label="(US) Gallons" value={fuel.usGallons} onChange={(value) => updateFuelField("usGallons", value)} placeholder="0" />
            <ConverterInput label="(Imperial) Gallons" value={fuel.imperialGallons} onChange={(value) => updateFuelField("imperialGallons", value)} placeholder="0" />
            <ConverterInput label="Pounds (lb)" value={fuel.pounds} onChange={(value) => updateFuelField("pounds", value)} placeholder="0" />
            <ConverterInput label="Kilograms (kg)" value={fuel.kilograms} onChange={(value) => updateFuelField("kilograms", value)} placeholder="0" />
            <ConverterInput label="Metric tons" value={fuel.metricTons} onChange={(value) => updateFuelField("metricTons", value)} placeholder="0" />
          </div>
        </div>
      ) : null}
    </article>
  );
}

export default function FlightComputer() {
  const [activeToolId, setActiveToolId] = useState("wind");
  const workspaceRef = useRef(null);
  const didMountRef = useRef(false);
  const [nav, setNav] = useState({
    trueCourse: "",
    trueAirspeed: "",
    windDirection: "",
    windSpeed: "",
    variation: "",
    variationDir: "E",
  });
  const [runway, setRunway] = useState({
    runwayHeading: "",
    windDirection: "",
    windSpeed: "",
    gustSpeed: "",
  });
  const [fuelPlan, setFuelPlan] = useState({
    distanceNm: "",
    groundspeed: "",
    burnRate: "",
    reserveMinutes: "45",
  });
  const [fuelRemaining, setFuelRemaining] = useState({
    fuelOnBoard: "",
    distanceNm: "",
    groundspeed: "",
    burnRate: "",
    reserveMinutes: "45",
  });
  const [sdt, setSdt] = useState({
    distanceNm: "",
    groundspeed: "",
    timeMinutes: "",
  });
  const [altitude, setAltitude] = useState({
    fieldElevation: "",
    altimeter: "",
    oat: "",
  });
  const [fuelWeightCalc, setFuelWeightCalc] = useState({
    fuelGallons: "",
    fuelWeight: "",
    weightPerGallon: "6",
  });
  const [climb, setClimb] = useState({
    altitudeChange: "",
    groundspeed: "",
    verticalSpeed: "",
  });
  const [tod, setTod] = useState({
    altitudeToLose: "",
    descentRate: "",
    groundspeed: "",
  });
  const [requiredGs, setRequiredGs] = useState({
    distanceNm: "",
    timeMinutes: "",
    currentGroundspeed: "",
  });
  const [requiredDescent, setRequiredDescent] = useState({
    altitudeToLose: "",
    distanceNm: "",
    groundspeed: "",
  });
  const [gradientVs, setGradientVs] = useState({
    groundspeed: "",
    gradientFtPerNm: "",
  });
  const [rule60, setRule60] = useState({
    offCourseNm: "",
    distanceFlownNm: "",
    distanceRemainingNm: "",
  });
  const [holding, setHolding] = useState({
    inboundReference: "",
    inboundReferenceMode: "course",
    aircraftHeading: "",
    turnDirection: "R",
    windDirection: "",
    windSpeed: "",
    trueAirspeed: "",
  });
  const [climbTable, setClimbTable] = useState({
    groundspeed: "",
    verticalPathAngle: "3.0",
  });
  const [navlogLegs, setNavlogLegs] = useState([
    createNavlogLeg(),
    createNavlogLeg(),
  ]);
  const [openGroups, setOpenGroups] = useState(["Wind"]);

  const navResult = useMemo(
    () =>
      computeWindCourse({
        trueCourse: toNumber(nav.trueCourse),
        trueAirspeed: toNumber(nav.trueAirspeed),
        windDirection: toNumber(nav.windDirection),
        windSpeed: toNumber(nav.windSpeed),
        variation: signedVariation(toNumber(nav.variation), nav.variationDir),
      }),
    [nav]
  );

  const runwayResult = useMemo(
    () =>
      computeRunwayWind({
        runwayHeading: toNumber(runway.runwayHeading),
        windDirection: toNumber(runway.windDirection),
        windSpeed: toNumber(runway.windSpeed),
        gustSpeed: toNumber(runway.gustSpeed),
      }),
    [runway]
  );

  const fuelResult = useMemo(
    () =>
      computeFuelPlan({
        distanceNm: toNumber(fuelPlan.distanceNm),
        groundspeed: toNumber(fuelPlan.groundspeed),
        burnRate: toNumber(fuelPlan.burnRate),
        reserveMinutes: toNumber(fuelPlan.reserveMinutes) ?? 0,
      }),
    [fuelPlan]
  );

  const altitudeResult = useMemo(
    () =>
      computeAltitude({
        fieldElevation: toNumber(altitude.fieldElevation),
        altimeter: toNumber(altitude.altimeter),
        oat: toNumber(altitude.oat),
      }),
    [altitude]
  );

  const fuelRemainingResult = useMemo(
    () =>
      computeFuelRemaining({
        fuelOnBoard: toNumber(fuelRemaining.fuelOnBoard),
        distanceNm: toNumber(fuelRemaining.distanceNm),
        groundspeed: toNumber(fuelRemaining.groundspeed),
        burnRate: toNumber(fuelRemaining.burnRate),
        reserveMinutes: toNumber(fuelRemaining.reserveMinutes) ?? 0,
      }),
    [fuelRemaining]
  );

  const climbResult = useMemo(
    () =>
      computeClimbDescent({
        altitudeChange: toNumber(climb.altitudeChange),
        groundspeed: toNumber(climb.groundspeed),
        verticalSpeed: toNumber(climb.verticalSpeed),
      }),
    [climb]
  );

  const todResult = useMemo(
    () =>
      computeTopOfDescent({
        altitudeToLose: toNumber(tod.altitudeToLose),
        descentRate: toNumber(tod.descentRate),
        groundspeed: toNumber(tod.groundspeed),
      }),
    [tod]
  );

  const sdtResult = useMemo(
    () =>
      computeSpeedDistanceTime({
        distanceNm: toNumber(sdt.distanceNm),
        groundspeed: toNumber(sdt.groundspeed),
        timeMinutes: toNumber(sdt.timeMinutes),
      }),
    [sdt]
  );

  const requiredGsResult = useMemo(
    () =>
      computeRequiredGroundspeed({
        distanceNm: toNumber(requiredGs.distanceNm),
        timeMinutes: toNumber(requiredGs.timeMinutes),
        currentGroundspeed: toNumber(requiredGs.currentGroundspeed),
      }),
    [requiredGs]
  );

  const fuelWeightResult = useMemo(
    () =>
      computeFuelByWeight({
        fuelGallons: toNumber(fuelWeightCalc.fuelGallons),
        fuelWeight: toNumber(fuelWeightCalc.fuelWeight),
        weightPerGallon: toNumber(fuelWeightCalc.weightPerGallon),
      }),
    [fuelWeightCalc]
  );

  const requiredDescentResult = useMemo(
    () =>
      computeRequiredDescentRate({
        altitudeToLose: toNumber(requiredDescent.altitudeToLose),
        distanceNm: toNumber(requiredDescent.distanceNm),
        groundspeed: toNumber(requiredDescent.groundspeed),
      }),
    [requiredDescent]
  );

  const gradientVsResult = useMemo(
    () =>
      computeVerticalSpeedFromGradient({
        groundspeed: toNumber(gradientVs.groundspeed),
        gradientFtPerNm: toNumber(gradientVs.gradientFtPerNm),
      }),
    [gradientVs]
  );

  const rule60Result = useMemo(
    () =>
      computeRuleOf60({
        offCourseNm: toNumber(rule60.offCourseNm),
        distanceFlownNm: toNumber(rule60.distanceFlownNm),
        distanceRemainingNm: toNumber(rule60.distanceRemainingNm),
      }),
    [rule60]
  );

  const holdingResult = useMemo(
    () => {
      const inboundReference = toNumber(holding.inboundReference);
      const inboundCourse =
        Number.isFinite(inboundReference)
          ? holding.inboundReferenceMode === "radial"
            ? normalizeAngle(inboundReference + 180)
            : normalizeAngle(inboundReference)
          : null;

      return computeHoldingTrainer({
        inboundCourse,
        aircraftHeading: toNumber(holding.aircraftHeading),
        turnDirection: holding.turnDirection,
        windDirection: toNumber(holding.windDirection),
        windSpeed: toNumber(holding.windSpeed),
        trueAirspeed: toNumber(holding.trueAirspeed),
      });
    },
    [holding]
  );

  const climbTableRows = useMemo(
    () => computeClimbDescentTable(toNumber(climbTable.groundspeed)),
    [climbTable.groundspeed]
  );

  const selectedClimbTableRow = useMemo(() => {
    const requestedAngle = toNumber(climbTable.verticalPathAngle);
    if (!Number.isFinite(requestedAngle)) return null;
    return (
      climbTableRows.find((row) => Math.abs(row.angle - requestedAngle) < 0.001) ??
      null
    );
  }, [climbTable.verticalPathAngle, climbTableRows]);

  const navlogResults = useMemo(
    () => navlogLegs.map((leg) => ({ ...leg, calc: computeNavlogLeg(leg) })),
    [navlogLegs]
  );

  const navlogSummary = useMemo(() => {
    const totals = navlogResults.reduce(
      (acc, leg) => {
        const distance = toNumber(leg.distance);
        if (Number.isFinite(distance)) acc.distance += distance;
        if (Number.isFinite(leg.calc.eteHours)) acc.eteHours += leg.calc.eteHours;
        if (Number.isFinite(leg.calc.legFuel)) acc.fuel += leg.calc.legFuel;
        return acc;
      },
      { distance: 0, eteHours: 0, fuel: 0 }
    );

    return totals;
  }, [navlogResults]);

  const toolPanels = {
    wind: {
      title: "Wind correction",
      content: (
        <article className="flight-computer-card flight-computer-cardCompact">
          <div className="flight-computer-cardHead">
            <h3>Wind correction</h3>
            <p>Course, TAS, wind.</p>
          </div>
          <div className="flight-computer-fieldGrid">
            <Field label="True course" value={nav.trueCourse} setValue={(v) => setNav((c) => ({ ...c, trueCourse: v }))} suffix="°" placeholder="090" />
            <Field label="True airspeed" value={nav.trueAirspeed} setValue={(v) => setNav((c) => ({ ...c, trueAirspeed: v }))} suffix="kt" placeholder="110" />
            <Field label="Wind direction" value={nav.windDirection} setValue={(v) => setNav((c) => ({ ...c, windDirection: v }))} suffix="°" placeholder="240" />
            <Field label="Wind speed" value={nav.windSpeed} setValue={(v) => setNav((c) => ({ ...c, windSpeed: v }))} suffix="kt" placeholder="18" />
            <VariationField
              label="Variation"
              value={nav.variation}
              setValue={(v) => setNav((c) => ({ ...c, variation: v }))}
              direction={nav.variationDir}
              setDirection={(v) => setNav((c) => ({ ...c, variationDir: v }))}
              placeholder="13"
            />
          </div>
          <div className="flight-computer-resultsGrid">
            <Result label="Wind correction" value={navResult ? `${formatNumber(navResult.wca, 1)}°` : "--"} />
            <Result label="Heading true" value={navResult ? `${formatNumber(navResult.headingTrue, 0)}°` : "--"} />
            <Result label="Heading magnetic" value={navResult ? `${formatNumber(navResult.headingMagnetic, 0)}°` : "--"} />
            <Result label="Groundspeed" value={navResult ? `${formatNumber(navResult.groundspeed, 1)} kt` : "--"} />
            <Result label="Crosswind" value={navResult ? `${formatNumber(Math.abs(navResult.crosswind), 1)} kt` : "--"} />
            <Result label="Head/Tailwind" value={navResult ? navResult.headwind >= 0 ? `${formatNumber(navResult.headwind, 1)} kt head` : `${formatNumber(navResult.tailwind, 1)} kt tail` : "--"} />
          </div>
        </article>
      ),
    },
    runway: {
      title: "Runway wind",
      content: (
        <article className="flight-computer-card flight-computer-cardCompact">
          <div className="flight-computer-cardHead">
            <h3>Runway wind</h3>
            <p>Runway and wind.</p>
          </div>
          <div className="flight-computer-fieldGrid">
            <Field label="Runway heading" value={runway.runwayHeading} setValue={(v) => setRunway((c) => ({ ...c, runwayHeading: v }))} suffix="°" placeholder="250" />
            <Field label="Wind direction" value={runway.windDirection} setValue={(v) => setRunway((c) => ({ ...c, windDirection: v }))} suffix="°" placeholder="220" />
            <Field label="Wind speed" value={runway.windSpeed} setValue={(v) => setRunway((c) => ({ ...c, windSpeed: v }))} suffix="kt" placeholder="14" />
            <Field label="Gust" value={runway.gustSpeed} setValue={(v) => setRunway((c) => ({ ...c, gustSpeed: v }))} suffix="kt" placeholder="20" />
          </div>
          <div className="flight-computer-resultsGrid">
            <Result label="Headwind" value={runwayResult ? `${formatNumber(Math.max(runwayResult.headwind, 0), 1)} kt` : "--"} />
            <Result label="Tailwind" value={runwayResult ? `${formatNumber(runwayResult.tailwind, 1)} kt` : "--"} />
            <Result label="Crosswind" value={runwayResult ? `${formatNumber(Math.abs(runwayResult.crosswind), 1)} kt` : "--"} />
            <Result label="Gust crosswind" value={runwayResult && Number.isFinite(runwayResult.gustCrosswind) ? `${formatNumber(Math.abs(runwayResult.gustCrosswind), 1)} kt` : "--"} />
          </div>
        </article>
      ),
    },
    rule60: {
      title: "Rule of 60",
      content: (
        <article className="flight-computer-card flight-computer-cardCompact">
          <div className="flight-computer-cardHead">
            <h3>Rule of 60</h3>
            <p>Track error and intercept.</p>
          </div>
          <div className="flight-computer-fieldGrid">
            <Field label="Off course" value={rule60.offCourseNm} setValue={(v) => setRule60((c) => ({ ...c, offCourseNm: v }))} suffix="nm" placeholder="2" />
            <Field label="Distance flown" value={rule60.distanceFlownNm} setValue={(v) => setRule60((c) => ({ ...c, distanceFlownNm: v }))} suffix="nm" placeholder="20" />
            <Field label="Distance remaining" value={rule60.distanceRemainingNm} setValue={(v) => setRule60((c) => ({ ...c, distanceRemainingNm: v }))} suffix="nm" placeholder="40" />
          </div>
          <div className="flight-computer-resultsGrid">
            <Result label="Track error" value={rule60Result ? `${formatNumber(rule60Result.trackErrorDeg, 1)}°` : "--"} />
            <Result label="Intercept" value={rule60Result && Number.isFinite(rule60Result.interceptDeg) ? `${formatNumber(rule60Result.interceptDeg, 1)}°` : "--"} />
            <Result label="Total correction" value={rule60Result ? `${formatNumber(rule60Result.correctionDeg, 1)}°` : "--"} />
          </div>
        </article>
      ),
    },
    fuel: {
      title: "Time and fuel",
      content: (
        <article className="flight-computer-card flight-computer-cardCompact">
          <div className="flight-computer-cardHead">
            <h3>Time and fuel</h3>
            <p>Distance, GS, burn.</p>
          </div>
          <div className="flight-computer-fieldGrid">
            <Field label="Distance" value={fuelPlan.distanceNm} setValue={(v) => setFuelPlan((c) => ({ ...c, distanceNm: v }))} suffix="nm" placeholder="245" />
            <Field label="Groundspeed" value={fuelPlan.groundspeed} setValue={(v) => setFuelPlan((c) => ({ ...c, groundspeed: v }))} suffix="kt" placeholder="118" />
            <Field label="Fuel burn" value={fuelPlan.burnRate} setValue={(v) => setFuelPlan((c) => ({ ...c, burnRate: v }))} suffix="gph" placeholder="9.5" />
            <Field label="Reserve" value={fuelPlan.reserveMinutes} setValue={(v) => setFuelPlan((c) => ({ ...c, reserveMinutes: v }))} suffix="min" placeholder="45" />
          </div>
          <div className="flight-computer-resultsGrid">
            <Result label="ETE" value={fuelResult ? formatClock(fuelResult.enrouteHours) : "--"} />
            <Result label="Trip fuel" value={fuelResult ? `${formatNumber(fuelResult.tripFuel, 1)} gal` : "--"} />
            <Result label="Reserve fuel" value={fuelResult ? `${formatNumber(fuelResult.reserveFuel, 1)} gal` : "--"} />
            <Result label="Total fuel" value={fuelResult ? `${formatNumber(fuelResult.totalFuel, 1)} gal` : "--"} />
          </div>
        </article>
      ),
    },
    fuelRemaining: {
      title: "Fuel remaining",
      content: (
        <article className="flight-computer-card flight-computer-cardCompact">
          <div className="flight-computer-cardHead">
            <h3>Fuel remaining</h3>
            <p>Onboard fuel, distance, GS, burn.</p>
          </div>
          <div className="flight-computer-fieldGrid">
            <Field label="Fuel on board" value={fuelRemaining.fuelOnBoard} setValue={(v) => setFuelRemaining((c) => ({ ...c, fuelOnBoard: v }))} suffix="gal" placeholder="42" />
            <Field label="Distance remaining" value={fuelRemaining.distanceNm} setValue={(v) => setFuelRemaining((c) => ({ ...c, distanceNm: v }))} suffix="nm" placeholder="120" />
            <Field label="Groundspeed" value={fuelRemaining.groundspeed} setValue={(v) => setFuelRemaining((c) => ({ ...c, groundspeed: v }))} suffix="kt" placeholder="115" />
            <Field label="Fuel burn" value={fuelRemaining.burnRate} setValue={(v) => setFuelRemaining((c) => ({ ...c, burnRate: v }))} suffix="gph" placeholder="9.5" />
            <Field label="Reserve" value={fuelRemaining.reserveMinutes} setValue={(v) => setFuelRemaining((c) => ({ ...c, reserveMinutes: v }))} suffix="min" placeholder="45" />
          </div>
          <div className="flight-computer-resultsGrid">
            <Result label="Trip fuel" value={fuelRemainingResult ? `${formatNumber(fuelRemainingResult.tripFuel, 1)} gal` : "--"} />
            <Result label="Fuel on landing" value={fuelRemainingResult ? `${formatNumber(fuelRemainingResult.fuelRemaining, 1)} gal` : "--"} />
            <Result label="After reserve" value={fuelRemainingResult ? `${formatNumber(fuelRemainingResult.fuelAfterReserve, 1)} gal` : "--"} />
            <Result label="Reserve fuel" value={fuelRemainingResult ? `${formatNumber(fuelRemainingResult.reserveFuel, 1)} gal` : "--"} />
            <Result label="Endurance left" value={fuelRemainingResult ? formatClock(fuelRemainingResult.enduranceHours) : "--"} />
            <Result label="ETE" value={fuelRemainingResult ? formatClock(fuelRemainingResult.enrouteHours) : "--"} />
          </div>
        </article>
      ),
    },
    sdt: {
      title: "Speed / distance / time",
      content: (
        <article className="flight-computer-card flight-computer-cardCompact">
          <div className="flight-computer-cardHead">
            <h3>Speed / distance / time</h3>
            <p>Enter any two values.</p>
          </div>
          <div className="flight-computer-fieldGrid">
            <Field label="Distance" value={sdt.distanceNm} setValue={(v) => setSdt((c) => ({ ...c, distanceNm: v }))} suffix="nm" placeholder="120" />
            <Field label="Groundspeed" value={sdt.groundspeed} setValue={(v) => setSdt((c) => ({ ...c, groundspeed: v }))} suffix="kt" placeholder="110" />
            <Field label="Time" value={sdt.timeMinutes} setValue={(v) => setSdt((c) => ({ ...c, timeMinutes: v }))} suffix="min" placeholder="65" />
          </div>
          <div className="flight-computer-resultsGrid">
            <Result label="Distance" value={sdtResult ? `${formatNumber(sdtResult.distanceNm, 1)} nm` : "--"} />
            <Result label="Groundspeed" value={sdtResult ? `${formatNumber(sdtResult.groundspeed, 1)} kt` : "--"} />
            <Result label="Time" value={sdtResult ? formatMinutes(sdtResult.timeMinutes) : "--"} />
          </div>
        </article>
      ),
    },
    altitude: {
      title: "Altitude",
      content: (
        <article className="flight-computer-card flight-computer-cardCompact">
          <div className="flight-computer-cardHead">
            <h3>Altitude</h3>
            <p>Elevation, altimeter, OAT.</p>
          </div>
          <div className="flight-computer-fieldGrid">
            <Field label="Field elevation" value={altitude.fieldElevation} setValue={(v) => setAltitude((c) => ({ ...c, fieldElevation: v }))} suffix="ft" placeholder="500" />
            <Field label="Altimeter" value={altitude.altimeter} setValue={(v) => setAltitude((c) => ({ ...c, altimeter: v }))} suffix="inHg" placeholder="29.92" />
            <Field label="OAT" value={altitude.oat} setValue={(v) => setAltitude((c) => ({ ...c, oat: v }))} suffix="°C" placeholder="22" />
          </div>
          <div className="flight-computer-resultsGrid">
            <Result label="Pressure altitude" value={altitudeResult ? `${formatNumber(altitudeResult.pressureAltitude, 0)} ft` : "--"} />
            <Result label="Density altitude" value={altitudeResult ? `${formatNumber(altitudeResult.densityAltitude, 0)} ft` : "--"} />
            <Result label="ISA temp" value={altitudeResult ? `${formatNumber(altitudeResult.isaTemp, 1)}°C` : "--"} />
          </div>
        </article>
      ),
    },
    fuelWeight: {
      title: "Fuel by weight",
      content: (
        <article className="flight-computer-card flight-computer-cardCompact">
          <div className="flight-computer-cardHead">
            <h3>Fuel by weight</h3>
            <p>Gallons and pounds.</p>
          </div>
          <div className="flight-computer-fieldGrid">
            <Field label="Fuel gallons" value={fuelWeightCalc.fuelGallons} setValue={(v) => setFuelWeightCalc((c) => ({ ...c, fuelGallons: v }))} suffix="gal" placeholder="32.5" />
            <Field label="Fuel weight" value={fuelWeightCalc.fuelWeight} setValue={(v) => setFuelWeightCalc((c) => ({ ...c, fuelWeight: v }))} suffix="lb" placeholder="195" />
            <Field label="Weight / gallon" value={fuelWeightCalc.weightPerGallon} setValue={(v) => setFuelWeightCalc((c) => ({ ...c, weightPerGallon: v }))} suffix="lb" placeholder="6" />
          </div>
          <div className="flight-computer-resultsGrid">
            <Result label="Gallons" value={fuelWeightResult ? `${formatNumber(fuelWeightResult.gallons, 2)} gal` : "--"} />
            <Result label="Weight" value={fuelWeightResult ? `${formatNumber(fuelWeightResult.weight, 1)} lb` : "--"} />
            <Result label="Factor" value={fuelWeightResult ? `${formatNumber(fuelWeightResult.weightPerGallon, 2)} lb/gal` : "--"} />
          </div>
        </article>
      ),
    },
    climb: {
      title: "Climb / descent",
      content: (
        <article className="flight-computer-card flight-computer-cardCompact">
          <div className="flight-computer-cardHead">
            <h3>Climb / descent</h3>
            <p>Altitude, GS, vertical speed.</p>
          </div>
          <div className="flight-computer-fieldGrid">
            <Field label="Altitude change" value={climb.altitudeChange} setValue={(v) => setClimb((c) => ({ ...c, altitudeChange: v }))} suffix="ft" placeholder="3000" />
            <Field label="Groundspeed" value={climb.groundspeed} setValue={(v) => setClimb((c) => ({ ...c, groundspeed: v }))} suffix="kt" placeholder="120" />
            <Field label="Vertical speed" value={climb.verticalSpeed} setValue={(v) => setClimb((c) => ({ ...c, verticalSpeed: v }))} suffix="fpm" placeholder="500" />
          </div>
          <div className="flight-computer-resultsGrid">
            <Result label="Time" value={climbResult ? `${formatNumber(climbResult.minutes, 1)} min` : "--"} />
            <Result label="Distance" value={climbResult ? `${formatNumber(climbResult.distanceNm, 1)} nm` : "--"} />
            <Result label="Gradient" value={climbResult ? `${formatNumber(climbResult.gradient, 0)} ft/nm` : "--"} />
          </div>
        </article>
      ),
    },
    climbTable: {
      title: "Rate of climb / descent",
      content: (
        <article className="flight-computer-card flight-computer-cardCompact">
          <div className="flight-computer-cardHead">
            <h3>Rate of climb / descent table</h3>
            <p>Quick FPM reference from groundspeed and path angle.</p>
          </div>
          <div className="flight-computer-fieldGrid">
            <Field label="Groundspeed" value={climbTable.groundspeed} setValue={(v) => setClimbTable((c) => ({ ...c, groundspeed: v }))} suffix="kt" placeholder="120" />
            <Field label="Vertical path angle" value={climbTable.verticalPathAngle} setValue={(v) => setClimbTable((c) => ({ ...c, verticalPathAngle: v }))} suffix="°" placeholder="3.0" />
          </div>
          <div className="flight-computer-resultsGrid">
            <Result label="Selected angle" value={selectedClimbTableRow ? `${selectedClimbTableRow.angle.toFixed(1)}°` : "--"} />
            <Result label="Gradient" value={selectedClimbTableRow ? `${formatNumber(selectedClimbTableRow.ftPerNm, 0)} ft/nm` : "--"} />
            <Result label="Target rate" value={selectedClimbTableRow ? `${formatNumber(selectedClimbTableRow.fpm, 0)} fpm` : "--"} />
          </div>
          <div className="flight-computer-tableWrap">
            <table className="flight-computer-miniTable">
              <thead>
                <tr>
                  <th>Angle</th>
                  <th>FT/NM</th>
                  <th>FPM @ GS</th>
                </tr>
              </thead>
              <tbody>
                {climbTableRows.length ? (
                  climbTableRows.map((row) => (
                    <tr key={row.angle} className={selectedClimbTableRow?.angle === row.angle ? "is-active" : ""}>
                      <td>{row.angle.toFixed(1)}°</td>
                      <td>{formatNumber(row.ftPerNm, 0)}</td>
                      <td>{formatNumber(row.fpm, 0)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3}>Enter groundspeed to build the quick table.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      ),
    },
    requiredDescent: {
      title: "Required descent rate",
      content: (
        <article className="flight-computer-card flight-computer-cardCompact">
          <div className="flight-computer-cardHead">
            <h3>Required descent rate</h3>
            <p>Altitude, distance, GS.</p>
          </div>
          <div className="flight-computer-fieldGrid">
            <Field label="Altitude to lose" value={requiredDescent.altitudeToLose} setValue={(v) => setRequiredDescent((c) => ({ ...c, altitudeToLose: v }))} suffix="ft" placeholder="4500" />
            <Field label="Distance remaining" value={requiredDescent.distanceNm} setValue={(v) => setRequiredDescent((c) => ({ ...c, distanceNm: v }))} suffix="nm" placeholder="24" />
            <Field label="Groundspeed" value={requiredDescent.groundspeed} setValue={(v) => setRequiredDescent((c) => ({ ...c, groundspeed: v }))} suffix="kt" placeholder="120" />
          </div>
          <div className="flight-computer-resultsGrid">
            <Result label="Descent rate" value={requiredDescentResult ? `${formatNumber(requiredDescentResult.descentRate, 0)} fpm` : "--"} />
            <Result label="Time" value={requiredDescentResult ? formatMinutes(requiredDescentResult.timeMinutes) : "--"} />
            <Result label="Gradient" value={requiredDescentResult ? `${formatNumber(requiredDescentResult.gradient, 0)} ft/nm` : "--"} />
          </div>
        </article>
      ),
    },
    gradientVs: {
      title: "Vertical speed from gradient",
      content: (
        <article className="flight-computer-card flight-computer-cardCompact">
          <div className="flight-computer-cardHead">
            <h3>Vertical speed from gradient</h3>
            <p>GS and ft per NM.</p>
          </div>
          <div className="flight-computer-fieldGrid">
            <Field label="Groundspeed" value={gradientVs.groundspeed} setValue={(v) => setGradientVs((c) => ({ ...c, groundspeed: v }))} suffix="kt" placeholder="120" />
            <Field label="Gradient" value={gradientVs.gradientFtPerNm} setValue={(v) => setGradientVs((c) => ({ ...c, gradientFtPerNm: v }))} suffix="ft/nm" placeholder="300" />
          </div>
          <div className="flight-computer-resultsGrid">
            <Result label="Vertical speed" value={gradientVsResult ? `${formatNumber(gradientVsResult.verticalSpeed, 0)} fpm` : "--"} />
          </div>
        </article>
      ),
    },
    tod: {
      title: "Top of descent",
      content: (
        <article className="flight-computer-card flight-computer-cardCompact">
          <div className="flight-computer-cardHead">
            <h3>Top of descent</h3>
            <p>Altitude, rate, GS.</p>
          </div>
          <div className="flight-computer-fieldGrid">
            <Field label="Altitude to lose" value={tod.altitudeToLose} setValue={(v) => setTod((c) => ({ ...c, altitudeToLose: v }))} suffix="ft" placeholder="6000" />
            <Field label="Descent rate" value={tod.descentRate} setValue={(v) => setTod((c) => ({ ...c, descentRate: v }))} suffix="fpm" placeholder="500" />
            <Field label="Groundspeed" value={tod.groundspeed} setValue={(v) => setTod((c) => ({ ...c, groundspeed: v }))} suffix="kt" placeholder="140" />
          </div>
          <div className="flight-computer-resultsGrid">
            <Result label="Start down in" value={todResult ? `${formatNumber(todResult.distanceNm, 1)} nm` : "--"} />
            <Result label="Time to descend" value={todResult ? `${formatNumber(todResult.minutes, 1)} min` : "--"} />
          </div>
        </article>
      ),
    },
    requiredGs: {
      title: "Required groundspeed",
      content: (
        <article className="flight-computer-card flight-computer-cardCompact">
          <div className="flight-computer-cardHead">
            <h3>Required groundspeed</h3>
            <p>Distance and time remaining.</p>
          </div>
          <div className="flight-computer-fieldGrid">
            <Field label="Distance remaining" value={requiredGs.distanceNm} setValue={(v) => setRequiredGs((c) => ({ ...c, distanceNm: v }))} suffix="nm" placeholder="84" />
            <Field label="Time remaining" value={requiredGs.timeMinutes} setValue={(v) => setRequiredGs((c) => ({ ...c, timeMinutes: v }))} suffix="min" placeholder="40" />
            <Field label="Current groundspeed" value={requiredGs.currentGroundspeed} setValue={(v) => setRequiredGs((c) => ({ ...c, currentGroundspeed: v }))} suffix="kt" placeholder="118" />
          </div>
          <div className="flight-computer-resultsGrid">
            <Result label="Required GS" value={requiredGsResult ? `${formatNumber(requiredGsResult.requiredGroundspeed, 1)} kt` : "--"} />
            <Result label="Current ETA" value={requiredGsResult && Number.isFinite(requiredGsResult.currentEtaMinutes) ? formatMinutes(requiredGsResult.currentEtaMinutes) : "--"} />
            <Result label="GS delta" value={requiredGsResult && Number.isFinite(requiredGsResult.speedDelta) ? `${requiredGsResult.speedDelta >= 0 ? "+" : ""}${formatNumber(requiredGsResult.speedDelta, 1)} kt` : "--"} />
          </div>
        </article>
      ),
    },
    holding: {
      title: "Holding trainer",
      content: (
        <article className="flight-computer-card flight-computer-cardCompact">
          <div className="flight-computer-cardHead">
            <h3>Holding trainer</h3>
            <p>Entry type, drift, and outbound setup.</p>
          </div>
          <div className="flight-computer-fieldGrid">
            <HoldingCourseField
              mode={holding.inboundReferenceMode}
              value={holding.inboundReference}
              setValue={(v) => setHolding((c) => ({ ...c, inboundReference: v }))}
              setMode={(v) => setHolding((c) => ({ ...c, inboundReferenceMode: v }))}
            />
            <Field label="Current heading" value={holding.aircraftHeading} setValue={(v) => setHolding((c) => ({ ...c, aircraftHeading: v }))} suffix="°" placeholder="210" />
            <SelectField
              label="Turns"
              value={holding.turnDirection}
              setValue={(v) => setHolding((c) => ({ ...c, turnDirection: v }))}
              options={[
                { value: "R", label: "Right turns" },
                { value: "L", label: "Left turns" },
              ]}
            />
            <Field label="Wind direction" value={holding.windDirection} setValue={(v) => setHolding((c) => ({ ...c, windDirection: v }))} suffix="°" placeholder="290" />
            <Field label="Wind speed" value={holding.windSpeed} setValue={(v) => setHolding((c) => ({ ...c, windSpeed: v }))} suffix="kt" placeholder="18" />
            <Field label="True airspeed" value={holding.trueAirspeed} setValue={(v) => setHolding((c) => ({ ...c, trueAirspeed: v }))} suffix="kt" placeholder="110" />
          </div>
          <div className="flight-computer-resultsGrid">
            <Result label="Entry" value={holdingResult ? holdingResult.entry : "--"} />
            <Result label="Outbound course" value={holdingResult ? `${formatNumber(holdingResult.outboundCourse, 0)}°` : "--"} />
            <Result label="Cross-fix action" value={holdingResult ? holdingResult.crossFixAction : "--"} />
            <Result label="Inbound correction" value={holdingResult && Number.isFinite(holdingResult.inboundCorrection) ? `${formatNumber(holdingResult.inboundCorrection, 0)}°` : "--"} />
            <Result label="Outbound correction" value={holdingResult && Number.isFinite(holdingResult.outboundCorrection) ? `${formatNumber(holdingResult.outboundCorrection, 0)}°` : "--"} />
            <Result
              label="Time correction"
              value={
                holdingResult && Number.isFinite(holdingResult.timeCorrectionSeconds)
                  ? `${holdingResult.timeCorrectionSeconds >= 0 ? "+" : ""}${formatNumber(holdingResult.timeCorrectionSeconds, 0)} sec`
                  : "--"
              }
            />
          </div>
          <div className="flight-computer-holdingSummary">
            <div className="flight-computer-callout">
              <strong>Recommended entry</strong>
              <span>{holdingResult ? holdingResult.procedure : "Enter inbound course and current heading to classify the hold."}</span>
            </div>
            <div className="flight-computer-callout">
              <strong>Wind note</strong>
              <span>
                {holdingResult && Number.isFinite(holdingResult.inboundDrift)
                  ? `Use about ${formatNumber(Math.abs(holdingResult.inboundDrift), 1)}° inbound drift and ${formatNumber(Math.abs(holdingResult.outboundDrift), 1)}° outbound drift.`
                  : "Add wind to the trainer if you want a quick inbound / outbound drift correction."}
              </span>
            </div>
          </div>
        </article>
      ),
    },
    navlog: {
      title: "Nav log",
      content: (
        <article className="flight-computer-card flight-computer-cardCompact">
          <div className="flight-computer-cardHead">
            <h3>Nav log</h3>
            <p>Build route legs and totals.</p>
          </div>

          <div className="flight-computer-navlogList">
            {navlogResults.map((leg, index) => (
              <div key={leg.id} className="flight-computer-navlogLeg">
                <div className="flight-computer-navlogLegHead">
                  <strong>Leg {index + 1}</strong>
                  <button
                    type="button"
                    className="flight-computer-chip"
                    onClick={() =>
                      setNavlogLegs((current) =>
                        current.length > 1
                          ? current.filter((item) => item.id !== leg.id)
                          : current
                      )
                    }
                  >
                    Remove
                  </button>
                </div>

                <div className="flight-computer-fieldGrid">
                  <Field label="From" value={leg.from} setValue={(v) => setNavlogLegs((current) => current.map((item) => item.id === leg.id ? { ...item, from: v } : item))} placeholder="KSQL" inputMode="text" />
                  <Field label="To" value={leg.to} setValue={(v) => setNavlogLegs((current) => current.map((item) => item.id === leg.id ? { ...item, to: v } : item))} placeholder="KMRY" inputMode="text" />
                  <Field label="Course" value={leg.course} setValue={(v) => setNavlogLegs((current) => current.map((item) => item.id === leg.id ? { ...item, course: v } : item))} suffix="°" placeholder="154" />
                  <Field label="Distance" value={leg.distance} setValue={(v) => setNavlogLegs((current) => current.map((item) => item.id === leg.id ? { ...item, distance: v } : item))} suffix="nm" placeholder="62" />
                  <Field label="TAS" value={leg.tas} setValue={(v) => setNavlogLegs((current) => current.map((item) => item.id === leg.id ? { ...item, tas: v } : item))} suffix="kt" placeholder="110" />
                  <Field label="Wind dir" value={leg.windDir} setValue={(v) => setNavlogLegs((current) => current.map((item) => item.id === leg.id ? { ...item, windDir: v } : item))} suffix="°" placeholder="240" />
                  <Field label="Wind speed" value={leg.windSpeed} setValue={(v) => setNavlogLegs((current) => current.map((item) => item.id === leg.id ? { ...item, windSpeed: v } : item))} suffix="kt" placeholder="18" />
                  <VariationField
                    label="Variation"
                    value={leg.variation}
                    setValue={(v) => setNavlogLegs((current) => current.map((item) => item.id === leg.id ? { ...item, variation: v } : item))}
                    direction={leg.variationDir}
                    setDirection={(v) => setNavlogLegs((current) => current.map((item) => item.id === leg.id ? { ...item, variationDir: v } : item))}
                    placeholder="13"
                  />
                  <Field label="Burn" value={leg.burnRate} setValue={(v) => setNavlogLegs((current) => current.map((item) => item.id === leg.id ? { ...item, burnRate: v } : item))} suffix="gph" placeholder="9.5" />
                </div>

                <div className="flight-computer-resultsGrid">
                  <Result label="Heading" value={leg.calc.wind ? `${formatNumber(leg.calc.wind.headingMagnetic, 0)}°` : "--"} />
                  <Result label="GS" value={leg.calc.wind ? `${formatNumber(leg.calc.wind.groundspeed, 1)} kt` : "--"} />
                  <Result label="ETE" value={Number.isFinite(leg.calc.eteHours) ? formatClock(leg.calc.eteHours) : "--"} />
                  <Result label="Fuel" value={Number.isFinite(leg.calc.legFuel) ? `${formatNumber(leg.calc.legFuel, 1)} gal` : "--"} />
                </div>
              </div>
            ))}
          </div>

          <div className="flight-computer-segmented">
            <button
              type="button"
              className="flight-computer-chip"
              onClick={() => setNavlogLegs((current) => [...current, createNavlogLeg()])}
            >
              Add leg
            </button>
          </div>

          <div className="flight-computer-resultsGrid">
            <Result label="Total distance" value={`${formatNumber(navlogSummary.distance, 1)} nm`} />
            <Result label="Total ETE" value={navlogSummary.eteHours > 0 ? formatClock(navlogSummary.eteHours) : "--"} />
            <Result label="Total fuel" value={navlogSummary.fuel > 0 ? `${formatNumber(navlogSummary.fuel, 1)} gal` : "--"} />
          </div>
        </article>
      ),
    },
    converters: {
      title: "Converters",
      content: <ConverterPanel />,
    },
  };

  const toolGroups = [
    {
      label: "Wind",
      items: [
        { id: "wind", title: "WIND" },
        { id: "runway", title: "RWY WIND" },
        { id: "rule60", title: "RULE 60" },
      ],
    },
    {
      label: "Performance",
      items: [
        { id: "climb", title: "CLIMB/DESC" },
        { id: "climbTable", title: "ROC/ROD" },
        { id: "altitude", title: "ALTITUDE" },
        { id: "requiredDescent", title: "REQ DESC" },
        { id: "gradientVs", title: "VS/GRAD" },
        { id: "fuelWeight", title: "FUEL WT" },
      ],
    },
    {
      label: "Planning",
      items: [
        { id: "fuel", title: "TIME/FUEL" },
        { id: "fuelRemaining", title: "FUEL REM" },
        { id: "sdt", title: "SPD/DIST/T" },
        { id: "requiredGs", title: "REQ GS" },
        { id: "tod", title: "TOD" },
        { id: "holding", title: "HOLD" },
        { id: "navlog", title: "NAV LOG" },
      ],
    },
    {
      label: "Utility",
      items: [{ id: "converters", title: "CONVERT" }],
    },
  ];

  useEffect(() => {
    const activeGroup = toolGroups.find((group) =>
      group.items.some((item) => item.id === activeToolId)
    );

    if (!activeGroup) return;
    setOpenGroups((current) =>
      current.includes(activeGroup.label) ? current : [activeGroup.label]
    );
  }, [activeToolId]);

  const activeTool = toolPanels[activeToolId];

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }

    if (typeof window === "undefined" || window.innerWidth > 720 || !workspaceRef.current) {
      return;
    }

    const header = document.querySelector("header.sticky");
    const headerOffset = header instanceof HTMLElement ? header.offsetHeight + 12 : 12;
    const top =
      workspaceRef.current.getBoundingClientRect().top + window.scrollY - headerOffset;

    window.scrollTo({
      top: Math.max(0, top),
      behavior: "smooth",
    });
  }, [activeToolId]);

  return (
    <div className="flight-computer-shell">
      <section className="flight-computer-hero">
        <div className="flight-computer-heroCopy">
          <h2>Flight computer</h2>
          <p>Operational calculations in one panel.</p>
        </div>
      </section>

      <section className="flight-computer-workbench">
        <aside className="flight-computer-sidebar" aria-label="Flight computer tools">
          {toolGroups.map((group) => (
            <div key={group.label} className="flight-computer-toolGroup">
              <button
                type="button"
                className={`flight-computer-toolGroupLabel ${openGroups.includes(group.label) ? "is-open" : ""}`}
                onClick={() =>
                  setOpenGroups((current) =>
                    current.includes(group.label) ? [] : [group.label]
                  )
                }
              >
                <span>{group.label}</span>
                <span className="flight-computer-toolGroupCaret">+</span>
              </button>
              {openGroups.includes(group.label) ? (
                <div className="flight-computer-toolList">
                  {group.items.map((tool) => {
                    const isActive = activeToolId === tool.id;
                    return (
                      <button
                        key={tool.id}
                        type="button"
                        className={`flight-computer-toolButton ${isActive ? "is-active" : ""}`}
                        onClick={() => setActiveToolId(tool.id)}
                      >
                        <span className="flight-computer-toolCode">{tool.title}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ))}
        </aside>

        <div className="flight-computer-workspace" ref={workspaceRef}>
          <div className="flight-computer-workspaceBody">{activeTool.content}</div>
        </div>
      </section>
    </div>
  );
}
