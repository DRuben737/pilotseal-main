"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

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
  const ratio = Math.max(-1, Math.min(1, crosswind / trueAirspeed));
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

function computeEndurance({ usableFuel, burnRate }) {
  if (
    [usableFuel, burnRate].some((value) => !Number.isFinite(value)) ||
    usableFuel < 0 ||
    burnRate <= 0
  ) {
    return null;
  }

  const hours = usableFuel / burnRate;
  return {
    hours,
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
  const factor = Number.isFinite(weightPerGallon) && weightPerGallon > 0 ? weightPerGallon : 6;
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

function computeEta({
  currentHours,
  enrouteMinutes,
}) {
  if (
    !Number.isFinite(currentHours) ||
    !Number.isFinite(enrouteMinutes) ||
    currentHours < 0 ||
    enrouteMinutes < 0
  ) {
    return null;
  }

  const departureMinutes = currentHours * 60;
  const etaMinutes = departureMinutes + enrouteMinutes;

  return {
    departureMinutes,
    etaMinutes,
  };
}

function computeNmPerMinute({ groundspeed }) {
  if (!Number.isFinite(groundspeed) || groundspeed <= 0) {
    return null;
  }

  return {
    nmPerMinute: groundspeed / 60,
    secondsPerNm: 3600 / groundspeed,
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

const CONVERTERS = [
  {
    id: "distance",
    label: "Distance",
    units: [
      { id: "nm", label: "NM", toBase: (v) => v, fromBase: (v) => v },
      { id: "sm", label: "SM", toBase: (v) => v / 1.15078, fromBase: (v) => v * 1.15078 },
      { id: "km", label: "KM", toBase: (v) => v / 1.852, fromBase: (v) => v * 1.852 },
    ],
  },
  {
    id: "fuel",
    label: "Fuel",
    units: [
      { id: "gal", label: "GAL", toBase: (v) => v, fromBase: (v) => v },
      { id: "l", label: "L", toBase: (v) => v / 3.78541, fromBase: (v) => v * 3.78541 },
      { id: "qt", label: "QT", toBase: (v) => v / 4, fromBase: (v) => v * 4 },
    ],
  },
  {
    id: "weight",
    label: "Weight",
    units: [
      { id: "lb", label: "LB", toBase: (v) => v, fromBase: (v) => v },
      { id: "kg", label: "KG", toBase: (v) => v * 2.20462, fromBase: (v) => v / 2.20462 },
    ],
  },
  {
    id: "altitude",
    label: "Altitude",
    units: [
      { id: "ft", label: "FT", toBase: (v) => v, fromBase: (v) => v },
      { id: "m", label: "M", toBase: (v) => v * 3.28084, fromBase: (v) => v / 3.28084 },
    ],
  },
];

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

function Result({ label, value }) {
  return (
    <div className="flight-computer-resultCard">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ConverterPanel() {
  const [value, setValue] = useState("");
  const [converterId, setConverterId] = useState(CONVERTERS[0].id);
  const [fromUnit, setFromUnit] = useState(CONVERTERS[0].units[0].id);

  const converter = CONVERTERS.find((item) => item.id === converterId) ?? CONVERTERS[0];
  const parsed = toNumber(value);
  const fromConfig = converter.units.find((unit) => unit.id === fromUnit) ?? converter.units[0];
  const baseValue = parsed == null ? null : fromConfig.toBase(parsed);

  return (
    <article className="flight-computer-card flight-computer-cardCompact">
      <div className="flight-computer-cardHead">
        <h3>{converter.label}</h3>
        <p>Select units, then enter a value.</p>
      </div>

      <div className="flight-computer-segmented">
        {CONVERTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`flight-computer-chip ${item.id === converterId ? "is-active" : ""}`}
            onClick={() => {
              setConverterId(item.id);
              setFromUnit(item.units[0].id);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flight-computer-segmented">
        {converter.units.map((unit) => (
          <button
            key={unit.id}
            type="button"
            className={`flight-computer-chip ${unit.id === fromUnit ? "is-active" : ""}`}
            onClick={() => setFromUnit(unit.id)}
          >
            {unit.label}
          </button>
        ))}
      </div>

      <Field
        label="Input"
        value={value}
        setValue={setValue}
        placeholder="Enter value"
      />

      <div className="flight-computer-resultsList">
        {converter.units.map((unit) => (
          <div className="flight-computer-resultRow" key={unit.id}>
            <span>{unit.label}</span>
            <strong>{baseValue == null ? "--" : formatNumber(unit.fromBase(baseValue), 2)}</strong>
          </div>
        ))}
      </div>
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
  const [endurance, setEndurance] = useState({
    usableFuel: "",
    burnRate: "",
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
  const [nmMinute, setNmMinute] = useState({
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
  const [eta, setEta] = useState({
    currentHours: "",
    enrouteMinutes: "",
  });
  const [navlogLegs, setNavlogLegs] = useState([
    createNavlogLeg(),
    createNavlogLeg(),
  ]);

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

  const enduranceResult = useMemo(
    () =>
      computeEndurance({
        usableFuel: toNumber(endurance.usableFuel),
        burnRate: toNumber(endurance.burnRate),
      }),
    [endurance]
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

  const etaResult = useMemo(
    () =>
      computeEta({
        currentHours: toNumber(eta.currentHours),
        enrouteMinutes: toNumber(eta.enrouteMinutes),
      }),
    [eta]
  );

  const nmMinuteResult = useMemo(
    () =>
      computeNmPerMinute({
        groundspeed: toNumber(nmMinute.groundspeed),
      }),
    [nmMinute]
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
      hint: "Enter course, TAS, and wind.",
      content: (
        <article className="flight-computer-card flight-computer-cardCompact">
          <div className="flight-computer-cardHead">
            <h3>Wind correction</h3>
            <p>Enter course, TAS, wind.</p>
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
      hint: "Enter runway and wind.",
      content: (
        <article className="flight-computer-card flight-computer-cardCompact">
          <div className="flight-computer-cardHead">
            <h3>Runway wind</h3>
            <p>Enter runway and wind.</p>
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
      hint: "Enter off-course and distance flown.",
      content: (
        <article className="flight-computer-card flight-computer-cardCompact">
          <div className="flight-computer-cardHead">
            <h3>Rule of 60 / off-course correction</h3>
            <p>Enter off-course and distance.</p>
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
      hint: "Enter distance, groundspeed, and burn.",
      content: (
        <article className="flight-computer-card flight-computer-cardCompact">
          <div className="flight-computer-cardHead">
            <h3>Time and fuel</h3>
            <p>Enter distance, GS, burn.</p>
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
      hint: "Enter onboard fuel, distance, GS, burn.",
      content: (
        <article className="flight-computer-card flight-computer-cardCompact">
          <div className="flight-computer-cardHead">
            <h3>Fuel remaining</h3>
            <p>Enter onboard fuel, distance, GS, burn.</p>
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
      hint: "Enter any two values.",
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
      hint: "Enter field elevation, altimeter, and OAT.",
      content: (
        <article className="flight-computer-card flight-computer-cardCompact">
          <div className="flight-computer-cardHead">
            <h3>Altitude</h3>
            <p>Enter elevation, altimeter, OAT.</p>
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
      hint: "Convert gallons and weight.",
      content: (
        <article className="flight-computer-card flight-computer-cardCompact">
          <div className="flight-computer-cardHead">
            <h3>Fuel by weight</h3>
            <p>Enter gallons or weight.</p>
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
      hint: "Enter altitude change, GS, and VSI.",
      content: (
        <article className="flight-computer-card flight-computer-cardCompact">
          <div className="flight-computer-cardHead">
            <h3>Climb / descent</h3>
            <p>Enter altitude, GS, VSI.</p>
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
    requiredDescent: {
      title: "Required descent rate",
      hint: "Enter altitude, distance, and GS.",
      content: (
        <article className="flight-computer-card flight-computer-cardCompact">
          <div className="flight-computer-cardHead">
            <h3>Required descent rate</h3>
            <p>Enter altitude, distance, GS.</p>
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
      hint: "Enter GS and gradient.",
      content: (
        <article className="flight-computer-card flight-computer-cardCompact">
          <div className="flight-computer-cardHead">
            <h3>Vertical speed from gradient</h3>
            <p>Enter GS and ft per NM.</p>
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
    endurance: {
      title: "Endurance",
      hint: "Enter usable fuel and burn rate.",
      content: (
        <article className="flight-computer-card flight-computer-cardCompact">
          <div className="flight-computer-cardHead">
            <h3>Endurance</h3>
            <p>Enter fuel and burn.</p>
          </div>
          <div className="flight-computer-fieldGrid">
            <Field label="Usable fuel" value={endurance.usableFuel} setValue={(v) => setEndurance((c) => ({ ...c, usableFuel: v }))} suffix="gal" placeholder="38" />
            <Field label="Fuel burn" value={endurance.burnRate} setValue={(v) => setEndurance((c) => ({ ...c, burnRate: v }))} suffix="gph" placeholder="9.5" />
          </div>
          <div className="flight-computer-resultsGrid">
            <Result label="Endurance" value={enduranceResult ? formatClock(enduranceResult.hours) : "--"} />
          </div>
        </article>
      ),
    },
    tod: {
      title: "Top of descent",
      hint: "Enter altitude to lose, descent rate, and GS.",
      content: (
        <article className="flight-computer-card flight-computer-cardCompact">
          <div className="flight-computer-cardHead">
            <h3>Top of descent</h3>
            <p>Enter altitude, rate, GS.</p>
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
      hint: "Enter remaining distance and time.",
      content: (
        <article className="flight-computer-card flight-computer-cardCompact">
          <div className="flight-computer-cardHead">
            <h3>Required groundspeed</h3>
            <p>Enter distance and time.</p>
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
    eta: {
      title: "ETA / clock time",
      hint: "Enter current clock and enroute time.",
      content: (
        <article className="flight-computer-card flight-computer-cardCompact">
          <div className="flight-computer-cardHead">
            <h3>ETA / clock time</h3>
            <p>Enter clock and enroute time.</p>
          </div>
          <div className="flight-computer-fieldGrid">
            <Field label="Current time" value={eta.currentHours} setValue={(v) => setEta((c) => ({ ...c, currentHours: v }))} suffix="hr" placeholder="14.5" />
            <Field label="Enroute time" value={eta.enrouteMinutes} setValue={(v) => setEta((c) => ({ ...c, enrouteMinutes: v }))} suffix="min" placeholder="68" />
          </div>
          <div className="flight-computer-resultsGrid">
            <Result label="Depart" value={etaResult ? formatMinutes(etaResult.departureMinutes) : "--"} />
            <Result label="ETA" value={etaResult ? formatMinutes(etaResult.etaMinutes) : "--"} />
          </div>
        </article>
      ),
    },
    nmMinute: {
      title: "NM per minute",
      hint: "Enter groundspeed.",
      content: (
        <article className="flight-computer-card flight-computer-cardCompact">
          <div className="flight-computer-cardHead">
            <h3>NM per minute</h3>
            <p>Enter groundspeed.</p>
          </div>
          <div className="flight-computer-fieldGrid">
            <Field label="Groundspeed" value={nmMinute.groundspeed} setValue={(v) => setNmMinute({ groundspeed: v })} suffix="kt" placeholder="120" />
          </div>
          <div className="flight-computer-resultsGrid">
            <Result label="NM / min" value={nmMinuteResult ? formatNumber(nmMinuteResult.nmPerMinute, 2) : "--"} />
            <Result label="Sec / NM" value={nmMinuteResult ? `${formatNumber(nmMinuteResult.secondsPerNm, 1)} s` : "--"} />
          </div>
        </article>
      ),
    },
    navlog: {
      title: "Nav log",
      hint: "Build route legs and totals.",
      content: (
        <article className="flight-computer-card flight-computer-cardCompact">
          <div className="flight-computer-cardHead">
            <h3>Nav log</h3>
            <p>Enter each leg and review totals.</p>
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
      hint: "Convert distance, fuel, weight, or altitude.",
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
        { id: "endurance", title: "ENDURANCE" },
        { id: "tod", title: "TOD" },
        { id: "eta", title: "ETA" },
        { id: "nmMinute", title: "NM/MIN" },
        { id: "navlog", title: "NAV LOG" },
      ],
    },
    {
      label: "Utility",
      items: [{ id: "converters", title: "CONVERT" }],
    },
  ];

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
          <p>Select a calculation and work in one place.</p>
        </div>
      </section>

      <section className="flight-computer-workbench">
        <aside className="flight-computer-sidebar" aria-label="Flight computer tools">
          {toolGroups.map((group) => (
            <div key={group.label} className="flight-computer-toolGroup">
              <div className="flight-computer-toolGroupLabel">{group.label}</div>
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
