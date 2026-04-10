"use client";

import React, { useEffect, useMemo, useState } from "react";

import {
  fetchAircraft,
  parseAircraftEnvelopeSet,
  parseAircraftStations,
} from "@/lib/aircraft";
import { fetchSavedPeople } from "@/lib/saved-people";
import { getSupabaseClient } from "@/lib/supabase";
import { useToolState } from "@/stores/toolState";
import CGEnvelopeChart from "./CGEnvelopeChart";

const DEFAULT_INPUTS = {};

function toNumber(value) {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getCgBoundsAtWeight(weight, envelope) {
  if (!Array.isArray(envelope) || envelope.length < 3) {
    return null;
  }

  const intersections = [];

  for (let index = 0; index < envelope.length; index += 1) {
    const current = envelope[index];
    const next = envelope[(index + 1) % envelope.length];

    const withinSegment =
      weight >= Math.min(current.weight, next.weight) &&
      weight <= Math.max(current.weight, next.weight);

    if (!withinSegment) {
      continue;
    }

    if (current.weight === next.weight) {
      intersections.push(current.cg, next.cg);
      continue;
    }

    const ratio = (weight - current.weight) / (next.weight - current.weight);
    const cg = current.cg + ratio * (next.cg - current.cg);
    intersections.push(cg);
  }

  const valid = intersections.filter(Number.isFinite).sort((a, b) => a - b);
  if (valid.length < 2) {
    return null;
  }

  return {
    min: valid[0],
    max: valid[valid.length - 1],
  };
}

function isInsidePolygon(point, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) {
    return false;
  }

  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersects =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function resolveAircraftProfile(selectedAircraft) {
  if (!selectedAircraft?.model) {
    return null;
  }

  const stations = parseAircraftStations(selectedAircraft.model.stations);
  const envelopeSet = parseAircraftEnvelopeSet(selectedAircraft.model.envelope);

  if (stations.length < 1) {
    return null;
  }

  return {
    id: selectedAircraft.id,
    name: selectedAircraft.name,
    category: selectedAircraft.model.category ?? selectedAircraft.category ?? null,
    chartType: resolveChartType(selectedAircraft.model.chart_type, envelopeSet, selectedAircraft.model.category),
    emptyWeight: toNumber(selectedAircraft.empty_weight),
    emptyArm: toNumber(selectedAircraft.empty_arm),
    emptyLatArm: toNumber(selectedAircraft.empty_lat_arm),
    maxWeight: toNumber(selectedAircraft.max_weight),
    stations,
    envelopeSet,
  };
}

function resolveChartType(chartType, envelopeSet, category) {
  const normalized = String(chartType || "").trim().toLowerCase();
  if (normalized === "1d1p" || normalized === "2d1p" || normalized === "2d2p") {
    return normalized;
  }

  if (category === "helicopter") {
    if (envelopeSet.topView.length > 0 && envelopeSet.sideView.length > 0) {
      return "2d2p";
    }

    if (envelopeSet.topView.length > 0 || envelopeSet.sideView.length > 0) {
      return "2d1p";
    }
  }

  return "1d1p";
}

function calculateWeightBalance(profile, inputs, envelopeMode = "normal") {
  if (!profile) {
    return null;
  }

  const isHelicopter = profile.category === "helicopter";
  const chartType = profile.chartType ?? "1d1p";
  const activeEnvelope =
    envelopeMode === "utility" && profile.envelopeSet.utility.length > 0
      ? profile.envelopeSet.utility
      : profile.envelopeSet.normal;
  const topView = profile.envelopeSet.topView;
  const sideView = profile.envelopeSet.sideView;

  const stationBreakdown = profile.stations.map((station) => {
    const input = toNumber(inputs[station.id]);
    const usesEditableDefaultWeight =
      typeof station.fixedWeight === "number" && isEditableDefaultWeightStation(station);
    const weight =
      typeof station.fixedWeight === "number" && !usesEditableDefaultWeight
        ? station.fixedWeight
        : typeof station.weightPerGallon === "number" && station.weightPerGallon > 0
          ? input * station.weightPerGallon
          : usesEditableDefaultWeight && String(inputs[station.id] ?? "").trim() === ""
            ? station.fixedWeight
            : input;

    return {
      ...station,
      input,
      weight,
      longMoment: weight * station.arm,
      latMoment:
        typeof station.latArm === "number" && Number.isFinite(station.latArm)
          ? weight * station.latArm
          : null,
      isFuelStation:
        typeof station.weightPerGallon === "number" && station.weightPerGallon > 0,
      isFixedWeight: typeof station.fixedWeight === "number" && !usesEditableDefaultWeight,
    };
  });

  const totalWeight =
    profile.emptyWeight + stationBreakdown.reduce((sum, station) => sum + station.weight, 0);
  const totalLongMoment =
    profile.emptyWeight * profile.emptyArm +
    stationBreakdown.reduce((sum, station) => sum + station.longMoment, 0);
  const totalLatMoment =
    (typeof profile.emptyLatArm === "number" ? profile.emptyWeight * profile.emptyLatArm : 0) +
    stationBreakdown.reduce(
      (sum, station) => sum + (typeof station.latMoment === "number" ? station.latMoment : 0),
      0
    );
  const cg = totalWeight > 0 ? totalLongMoment / totalWeight : 0;
  const cgLat =
    isHelicopter && totalWeight > 0 ? totalLatMoment / totalWeight : null;
  const zeroFuelBreakdown = stationBreakdown.filter((station) => !station.isFuelStation);
  const zeroFuelWeight =
    profile.emptyWeight + zeroFuelBreakdown.reduce((sum, station) => sum + station.weight, 0);
  const zeroFuelLongMoment =
    profile.emptyWeight * profile.emptyArm +
    zeroFuelBreakdown.reduce((sum, station) => sum + station.longMoment, 0);
  const zeroFuelCg = zeroFuelWeight > 0 ? zeroFuelLongMoment / zeroFuelWeight : null;
  const zeroFuelLat =
    isHelicopter && zeroFuelWeight > 0
      ? ((typeof profile.emptyLatArm === "number"
          ? profile.emptyWeight * profile.emptyLatArm
          : 0) +
          zeroFuelBreakdown.reduce(
            (sum, station) => sum + (typeof station.latMoment === "number" ? station.latMoment : 0),
            0
          )) / zeroFuelWeight
      : null;

  const bounds = getCgBoundsAtWeight(totalWeight, activeEnvelope);
  const maxEnvelopeWeight = activeEnvelope.reduce(
    (max, point) => Math.max(max, point.weight),
    0
  );

  let status = "within";
  let insideTop = null;
  let insideSide = null;
  let insidePrimary2d = null;

  if (chartType === "2d2p") {
    insideTop =
      topView.length >= 3 && Number.isFinite(cgLat)
        ? isInsidePolygon({ x: cg, y: cgLat }, topView)
        : null;
    insideSide =
      sideView.length >= 3
        ? isInsidePolygon({ x: cg, y: totalWeight }, sideView)
        : null;

    status =
      (insideTop === null || insideTop) && (insideSide === null || insideSide)
        ? "within"
        : "outside";
  } else if (chartType === "2d1p") {
    const hasTopView = topView.length >= 3;
    const hasSideView = sideView.length >= 3;
    const hasNormalAs2d = profile.envelopeSet.normal.length >= 3;
    const primaryTwoDimensionalEnvelope = hasTopView
      ? topView
      : hasSideView
        ? sideView
        : [];
    const primaryPoint = hasTopView
      ? { x: cg, y: cgLat }
      : { x: cg, y: totalWeight };

    insidePrimary2d =
      primaryTwoDimensionalEnvelope.length >= 3 &&
      Number.isFinite(primaryPoint.x) &&
      Number.isFinite(primaryPoint.y)
        ? isInsidePolygon(primaryPoint, primaryTwoDimensionalEnvelope)
        : null;

    status = insidePrimary2d === null || insidePrimary2d ? "within" : "outside";
  } else if (maxEnvelopeWeight > 0 && totalWeight > maxEnvelopeWeight) {
    status = "overweight";
  } else if (bounds && cg < bounds.min) {
    status = "forward";
  } else if (bounds && cg > bounds.max) {
    status = "aft";
  }

  return {
    aircraft_name: profile.name,
    category: profile.category,
    chart_type: chartType,
    empty_weight: profile.emptyWeight,
    empty_arm: profile.emptyArm,
    empty_lat_arm: profile.emptyLatArm,
    total_weight: totalWeight,
    total_moment: totalLongMoment,
    cg,
    cg_long: cg,
    cg_lat: cgLat,
    zero_fuel_weight: zeroFuelWeight,
    zero_fuel_cg: zeroFuelCg,
    zero_fuel_cg_lat: zeroFuelLat,
    fuel_weight: stationBreakdown
      .filter((station) => station.isFuelStation)
      .reduce((sum, station) => sum + station.weight, 0),
    status,
    normal_envelope: profile.envelopeSet.normal,
    utility_envelope: profile.envelopeSet.utility,
    top_view_envelope: topView,
    side_view_envelope: sideView,
    inside_top_view: insideTop,
    inside_side_view: insideSide,
    inside_primary_2d: insidePrimary2d,
    envelope: activeEnvelope,
    envelopeMode,
    hasUtilityEnvelope: profile.envelopeSet.utility.length > 0,
    stationBreakdown,
  };
}

function getStatusLabel(status) {
  switch (status) {
    case "within":
      return "Within envelope";
    case "forward":
      return "Forward of envelope";
    case "aft":
      return "Aft of envelope";
    case "overweight":
      return "Overweight";
    case "outside":
      return "Outside envelope";
    default:
      return "No result";
  }
}

function isPilotStation(station) {
  return /pilot|left|front/i.test(station.id) || /pilot|left|front/i.test(station.name);
}

function isRightSeatStation(station) {
  return /passenger|right|copilot/i.test(station.id) || /passenger|right|copilot/i.test(station.name);
}

function resolveCrewStations(stations) {
  const seatStations = stations.filter(
    (station) =>
      !(typeof station.weightPerGallon === "number" && station.weightPerGallon > 0) &&
      !/bag|baggage|cargo/i.test(station.id) &&
      !/bag|baggage|cargo/i.test(station.name)
  );

  const leftStation = seatStations.find(isPilotStation) ?? seatStations[0] ?? null;
  const rightStation =
    seatStations.find(
      (station) => station !== leftStation && isRightSeatStation(station)
    ) ??
    seatStations.find((station) => station !== leftStation) ??
    null;

  return { leftStation, rightStation };
}

function getAircraftType(profile) {
  return profile?.category === "helicopter" ? "helicopter" : "airplane";
}

function shouldRenderStation(station, aircraftType) {
  return true;
}

function isEditableDefaultWeightStation(station) {
  return (
    /door/i.test(station.id) ||
    /door/i.test(station.name) ||
    /glove/i.test(station.id) ||
    /glove/i.test(station.name)
  );
}

export default function WeightBalanceCalculator({
  stateKey = "wb",
  embedded = false,
}) {
  const {
    wb,
    briefWb,
    setWb,
    setBriefWb,
    selectedAircraft,
    briefSelectedAircraft,
    setSelectedAircraft,
    setBriefSelectedAircraft,
    brief,
  } = useToolState();
  const activeWb = stateKey === "briefWb" ? briefWb : wb;
  const setActiveWb = stateKey === "briefWb" ? setBriefWb : setWb;
  const activeSelectedAircraft =
    stateKey === "briefWb" ? briefSelectedAircraft : selectedAircraft;
  const setActiveSelectedAircraft =
    stateKey === "briefWb" ? setBriefSelectedAircraft : setSelectedAircraft;
  const [aircraftOptions, setAircraftOptions] = useState([]);
  const [savedStudents, setSavedStudents] = useState([]);
  const [savedCfis, setSavedCfis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [envelopeMode, setEnvelopeMode] = useState("normal");

  const inputs = activeWb.inputs ?? DEFAULT_INPUTS;
  const selectedAircraftId = activeWb.selectedTail || activeSelectedAircraft?.id || "";
  const selectedStudentId = brief?.selectedStudentId ?? "";
  const selectedInstructorId = brief?.selectedInstructorId ?? "";
  const briefAircraftId = brief?.aircraftId ?? "";

  useEffect(() => {
    const supabase = getSupabaseClient();

    async function loadData() {
      setLoading(true);
      setError("");

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const [aircraftList, students, cfis] = await Promise.all([
          fetchAircraft(),
          embedded && session?.user?.id
            ? fetchSavedPeople(session.user.id, "student")
            : Promise.resolve([]),
          embedded && session?.user?.id
            ? fetchSavedPeople(session.user.id, "cfi")
            : Promise.resolve([]),
        ]);

        setAircraftOptions(aircraftList);
        setSavedStudents(students);
        setSavedCfis(cfis);

        if (aircraftList.length > 0) {
          const persistedAircraft =
            aircraftList.find((aircraft) => aircraft.id === selectedAircraftId) ??
            (embedded && briefAircraftId
              ? aircraftList.find((aircraft) => {
                  const aircraftName = String(aircraft.name ?? "").trim().toLowerCase();
                  const nextBriefAircraftId = String(briefAircraftId).trim().toLowerCase();
                  return (
                    aircraftName === nextBriefAircraftId ||
                    String(aircraft.id ?? "").trim().toLowerCase() === nextBriefAircraftId
                  );
                })
              : null) ??
            aircraftList[0];

          setActiveSelectedAircraft(persistedAircraft);
          setActiveWb((current) => ({
            ...current,
            selectedTail: persistedAircraft.id,
          }));
        }
      } catch {
        setError("Unable to load aircraft data right now.");
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, [briefAircraftId, embedded, selectedAircraftId, setActiveSelectedAircraft, setActiveWb]);

  const aircraftProfile = useMemo(
    () => resolveAircraftProfile(activeSelectedAircraft),
    [activeSelectedAircraft]
  );
  const aircraftType = getAircraftType(aircraftProfile);

  useEffect(() => {
    if (!aircraftProfile) {
      setActiveWb((current) => ({
        ...current,
        result: null,
        status: "",
      }));
      return;
    }

    const result = calculateWeightBalance(aircraftProfile, inputs, envelopeMode);
    setActiveWb((current) => ({
      ...current,
      result,
      status: result?.status ?? "",
    }));
  }, [aircraftProfile, envelopeMode, inputs, setActiveWb]);

  const result = activeWb.result;
  const chartType = result?.chart_type ?? aircraftProfile?.chartType ?? "1d1p";
  const renderedStations = useMemo(
    () => (aircraftProfile?.stations ?? []).filter((station) => shouldRenderStation(station, aircraftType)),
    [aircraftProfile?.stations, aircraftType]
  );
  const selectedStudent = savedStudents.find((person) => person.id === selectedStudentId) ?? null;
  const selectedInstructor =
    savedCfis.find((person) => person.id === selectedInstructorId) ?? null;

  const handleInputChange = (key, value) => {
    setActiveWb((current) => ({
      ...current,
      inputs: {
        ...(current.inputs ?? DEFAULT_INPUTS),
        [key]: value,
      },
    }));
  };

  const handleAircraftChange = (event) => {
    const nextId = event.target.value;
    const nextAircraft = aircraftOptions.find((aircraft) => aircraft.id === nextId) ?? null;

    setActiveSelectedAircraft(nextAircraft);
    setActiveWb((current) => ({
      ...current,
      selectedTail: nextId,
    }));
  };

  useEffect(() => {
    setEnvelopeMode("normal");
  }, [selectedAircraftId]);

  useEffect(() => {
    if (!embedded || !aircraftProfile || (!selectedStudent && !selectedInstructor)) {
      return;
    }

    const { leftStation, rightStation } = resolveCrewStations(renderedStations);
    const isHelicopter = /helicopter/i.test(aircraftProfile.category ?? "");
    const leftWeight = isHelicopter
      ? selectedInstructor?.weight_lbs ?? null
      : selectedStudent?.weight_lbs ?? null;
    const rightWeight = isHelicopter
      ? selectedStudent?.weight_lbs ?? null
      : selectedInstructor?.weight_lbs ?? null;

    setActiveWb((current) => {
      const currentInputs = current.inputs ?? DEFAULT_INPUTS;
      return {
        ...current,
        inputs: {
          ...currentInputs,
          ...(leftStation
            ? {
                [leftStation.id]:
                  typeof leftWeight === "number" ? String(leftWeight) : currentInputs[leftStation.id] ?? "",
              }
            : {}),
          ...(rightStation
            ? {
                [rightStation.id]:
                  typeof rightWeight === "number" ? String(rightWeight) : currentInputs[rightStation.id] ?? "",
              }
            : {}),
        },
      };
    });
  }, [
    aircraftProfile,
    embedded,
    renderedStations,
    selectedInstructor,
    selectedStudent,
    setActiveWb,
  ]);

  return (
    <div className={`wb-shell ${embedded ? "wb-shell-embedded" : ""}`}>
      <div className="wb-grid">
        <section className={`wb-panel ${embedded ? "wb-panel-embedded" : ""}`}>
          <div className="wb-section-head">
            <h3>Aircraft and loading</h3>
            <p>
              {aircraftType === "helicopter"
                ? "Seat, fuel, and baggage inputs follow the selected helicopter model."
                : "Seat, fuel, and baggage inputs follow the selected airplane model."}
            </p>
          </div>

          <div className="wb-top-fields">
            <label className="wb-field">
              <span>Aircraft</span>
              <select value={selectedAircraftId} onChange={handleAircraftChange} disabled={loading}>
                <option value="">{loading ? "Loading aircraft..." : "Select an aircraft"}</option>
                {aircraftOptions.map((aircraft) => (
                  <option key={aircraft.id} value={aircraft.id}>
                    {aircraft.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error ? <p className="copy-muted mt-2">{error}</p> : null}

          {chartType === "1d1p" && aircraftType === "airplane" && result?.hasUtilityEnvelope ? (
            <div className="wb-top-fields">
              <label className="wb-field">
                <span>Envelope</span>
                <select
                  value={envelopeMode}
                  onChange={(event) => setEnvelopeMode(event.target.value)}
                >
                  <option value="normal">Normal</option>
                  <option value="utility">Utility</option>
                </select>
              </label>
            </div>
          ) : null}

          <div className="wb-input-grid">
            {renderedStations.map((station) => (
              <label key={station.id} className="wb-field">
                <span>{station.name}</span>
                <small>
                  {typeof station.fixedWeight === "number" && !isEditableDefaultWeightStation(station)
                    ? "Fixed weight"
                    : typeof station.fixedWeight === "number" && isEditableDefaultWeightStation(station)
                    ? "lbs"
                    : typeof station.weightPerGallon === "number" && station.weightPerGallon > 0
                    ? `Gallons (${station.weightPerGallon} lbs/gal)`
                    : "lbs"}
                </small>
                <input
                  className="wb-number-input"
                  type="number"
                  value={
                    typeof station.fixedWeight === "number" && !isEditableDefaultWeightStation(station)
                      ? station.fixedWeight
                      : typeof station.fixedWeight === "number" &&
                          isEditableDefaultWeightStation(station) &&
                          String(inputs[station.id] ?? "").trim() === ""
                        ? station.fixedWeight
                      : inputs[station.id] ?? ""
                  }
                  onChange={(event) => handleInputChange(station.id, event.target.value)}
                  readOnly={
                    typeof station.fixedWeight === "number" &&
                    !isEditableDefaultWeightStation(station)
                  }
                />
              </label>
            ))}
          </div>
        </section>

        <section className={`wb-panel wb-results ${embedded ? "wb-panel-embedded" : ""}`}>
          <div className="wb-result-head">
            <div>
              <h3>Current result</h3>
              <p className="copy-muted mt-2">
                CG and total weight update as soon as aircraft or loading changes.
              </p>
            </div>
            <div className="wb-result-actions">
              <p
                className={
                  result?.status === "within" ? "wb-ok" : result ? "wb-alert" : "copy-muted"
                }
              >
                {result ? getStatusLabel(result.status) : "Select aircraft and loading to begin"}
              </p>
            </div>
          </div>

          <div className="wb-stat-grid">
            {aircraftType === "helicopter" ? (
              <div className="wb-stat-card">
                <span>Total empty fuel</span>
                <strong>
                  {typeof result?.zero_fuel_weight === "number"
                    ? `${result.zero_fuel_weight.toFixed(1)} lbs`
                    : "--"}
                </strong>
              </div>
            ) : null}
            <div className="wb-stat-card">
              <span>{aircraftType === "helicopter" ? "Total with fuel" : "Total weight"}</span>
              <strong>
                {typeof result?.total_weight === "number"
                  ? `${result.total_weight.toFixed(1)} lbs`
                  : "--"}
              </strong>
            </div>
            <div className="wb-stat-card">
              <span>{aircraftType === "helicopter" ? "CG Long" : "Center of gravity"}</span>
              <strong>
                {typeof result?.cg_long === "number" ? `${result.cg_long.toFixed(2)} in` : "--"}
              </strong>
            </div>
            {aircraftType === "helicopter" ? (
              <div className="wb-stat-card">
                <span>CG Lat</span>
                <strong>
                  {typeof result?.cg_lat === "number" ? `${result.cg_lat.toFixed(2)} in` : "--"}
                </strong>
              </div>
            ) : (
              <div className="wb-stat-card">
                <span>Fuel weight</span>
                <strong>
                  {typeof result?.fuel_weight === "number"
                    ? `${result.fuel_weight.toFixed(1)} lbs`
                    : "--"}
                </strong>
              </div>
            )}
            {aircraftType === "helicopter" ? (
              <>
                <div className="wb-stat-card">
                  <span>Empty fuel CG Long</span>
                  <strong>
                    {typeof result?.zero_fuel_cg === "number"
                      ? `${result.zero_fuel_cg.toFixed(2)} in`
                      : "--"}
                  </strong>
                </div>
                <div className="wb-stat-card">
                  <span>Empty fuel CG Lat</span>
                  <strong>
                    {typeof result?.zero_fuel_cg_lat === "number"
                      ? `${result.zero_fuel_cg_lat.toFixed(2)} in`
                      : "--"}
                  </strong>
                </div>
              </>
            ) : null}
            <div className="wb-stat-card">
              <span>Status</span>
              <strong>{result ? getStatusLabel(result.status) : "--"}</strong>
            </div>
          </div>

          {chartType === "1d1p" &&
          Array.isArray(result?.normal_envelope) &&
          result.normal_envelope.length > 0 ? (
            <div className="wb-chart-wrap">
              <CGEnvelopeChart
                title="CG Envelope"
                xLabel="CG Location (in)"
                yLabel="Weight (lbs)"
                primaryPolygon={result.normal_envelope}
                secondaryPolygon={result.utility_envelope}
                currentPoint={{ x: result.cg_long, y: result.total_weight }}
                referencePoint={{ x: result.zero_fuel_cg, y: result.zero_fuel_weight }}
              />
              <p className="wb-chart-note">Black dot is current CG. Red dot is zero-fuel CG.</p>
            </div>
          ) : null}

          {chartType === "2d2p" ? (
            <div className="wb-chart-wrap">
              <CGEnvelopeChart
                title="Top View Envelope"
                xLabel="CG Long"
                yLabel="CG Lat"
                primaryPolygon={result?.top_view_envelope}
                currentPoint={{ x: result?.cg_long, y: result?.cg_lat }}
                referencePoint={{ x: result?.zero_fuel_cg, y: result?.zero_fuel_cg_lat }}
              />
              <CGEnvelopeChart
                title="Side View Envelope"
                xLabel="CG Long"
                yLabel="Weight"
                primaryPolygon={result?.side_view_envelope}
                currentPoint={{ x: result?.cg_long, y: result?.total_weight }}
                referencePoint={{ x: result?.zero_fuel_cg, y: result?.zero_fuel_weight }}
              />
              <p className="wb-chart-note">Black dot is current CG. Red dot is zero-fuel CG.</p>
            </div>
          ) : null}

          {chartType === "2d1p" ? (
            <div className="wb-chart-wrap">
              {(() => {
                const hasTopView =
                  Array.isArray(result?.top_view_envelope) && result.top_view_envelope.length > 0;
                const polygon = hasTopView
                  ? result?.top_view_envelope
                  : result?.side_view_envelope;
                const isLatChart = hasTopView;

                return (
              <CGEnvelopeChart
                title={isLatChart ? "Top View Envelope" : "Side View Envelope"}
                xLabel="CG Long"
                yLabel={isLatChart ? "CG Lat" : "Weight"}
                primaryPolygon={polygon}
                currentPoint={isLatChart
                  ? { x: result?.cg_long, y: result?.cg_lat }
                  : { x: result?.cg_long, y: result?.total_weight }}
                referencePoint={isLatChart
                  ? { x: result?.zero_fuel_cg, y: result?.zero_fuel_cg_lat }
                  : { x: result?.zero_fuel_cg, y: result?.zero_fuel_weight }}
              />
                );
              })()}
              <p className="wb-chart-note">Black dot is current CG. Red dot is zero-fuel CG.</p>
            </div>
          ) : null}

          {aircraftType === "helicopter" && result && !embedded ? (
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200/70 bg-white/70">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50/80 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Item</th>
                    <th className="px-3 py-2 font-medium">Weight</th>
                    <th className="px-3 py-2 font-medium">Long arm</th>
                    <th className="px-3 py-2 font-medium">Lat arm</th>
                    <th className="px-3 py-2 font-medium">Long moment</th>
                    <th className="px-3 py-2 font-medium">Lat moment</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-100">
                    <td className="px-3 py-2">Empty</td>
                    <td className="px-3 py-2">
                      {typeof result.empty_weight === "number" ? result.empty_weight.toFixed(1) : "--"}
                    </td>
                    <td className="px-3 py-2">
                      {typeof result.empty_arm === "number" ? result.empty_arm.toFixed(2) : "--"}
                    </td>
                    <td className="px-3 py-2">
                      {typeof result.empty_lat_arm === "number" ? result.empty_lat_arm.toFixed(2) : "--"}
                    </td>
                    <td className="px-3 py-2">
                      {typeof result.empty_weight === "number" && typeof result.empty_arm === "number"
                        ? (result.empty_weight * result.empty_arm).toFixed(1)
                        : "--"}
                    </td>
                    <td className="px-3 py-2">
                      {typeof result.empty_weight === "number" && typeof result.empty_lat_arm === "number"
                        ? (result.empty_weight * result.empty_lat_arm).toFixed(1)
                        : "--"}
                    </td>
                  </tr>
                  {result.stationBreakdown.map((station) => (
                    <tr key={station.id} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-3 py-2">{station.name}</td>
                      <td className="px-3 py-2">{station.weight.toFixed(1)}</td>
                      <td className="px-3 py-2">{station.arm.toFixed(2)}</td>
                      <td className="px-3 py-2">
                        {typeof station.latArm === "number" ? station.latArm.toFixed(2) : "--"}
                      </td>
                      <td className="px-3 py-2">{station.longMoment.toFixed(1)}</td>
                      <td className="px-3 py-2">
                        {typeof station.latMoment === "number" ? station.latMoment.toFixed(1) : "--"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
