"use client";

import React from "react";
import { useToolState } from "@/stores/toolState";
import loadAircraft, { listAirplanes, getAirplaneInfo } from "./aircraft/loadAircraft";
import { computeWeightAndBalance, computeZeroFuel } from "./lib/weightBalance";
import CGEnvelopeChart from "./CGEnvelopeChart";

const fields = [
  { key: "left_seat", label: "Pilot", hint: "Left seat" },
  { key: "right_seat", label: "Copilot", hint: "Right seat" },
  { key: "rear_seat", label: "Rear seat", hint: "Passengers" },
  { key: "baggage_1", label: "Baggage 1", hint: "Forward area" },
  { key: "baggage_2", label: "Baggage 2", hint: "Aft area" },
  { key: "fuel", label: "Fuel", hint: "Gallons usable" },
];

export default function WeightBalanceCalculator() {
  const airplaneList = listAirplanes();
  const { wb, setWb } = useToolState();
  const selectedTail = wb.selectedTail || airplaneList[0];
  const airplaneInfo = getAirplaneInfo(selectedTail);
  const aircraftType = airplaneInfo.type;
  const inputs = wb.inputs ?? {
    left_seat: "",
    right_seat: "",
    rear_seat: "",
    baggage_1: "",
    baggage_2: "",
    fuel: "",
  };
  const result = wb.result ?? null;

  const handleCalculate = () => {
    const numericInputs = Object.fromEntries(
      Object.entries(inputs).map(([key, value]) => [key, Number(value) || 0])
    );

    const loaded = loadAircraft(selectedTail);
    const computed = computeWeightAndBalance(loaded, numericInputs);
    const zeroFuel = computeZeroFuel(loaded, numericInputs);
    setWb((current) => ({
      ...current,
      result: { ...computed, zeroFuel, aircraft: loaded },
    }));
  };

  const handleChange = (key, value) => {
    setWb((current) => ({
      ...current,
      inputs: { ...(current.inputs ?? {}), [key]: value },
    }));
  };

  return (
    <div className="wb-shell">
      <div className="wb-grid">
        <section className="wb-panel">
          <div className="wb-section-head">
            <h3>Aircraft and loading inputs</h3>
            <p>Start with the aircraft, then enter weights for each station.</p>
          </div>
          <div className="wb-top-fields">
            <label className="wb-field">
              <span>Aircraft</span>
              <select
                value={selectedTail}
                onChange={(event) =>
                  setWb((current) => ({
                    ...current,
                    selectedTail: event.target.value,
                  }))
                }
              >
                {airplaneList.map((tail) => (
                  <option key={tail} value={tail}>
                    {tail}
                  </option>
                ))}
              </select>
            </label>

            <label className="wb-field">
              <span>Model</span>
              <input value={aircraftType} readOnly />
            </label>
          </div>

          <div className="wb-input-grid">
            {fields.map((field) => (
              <label key={field.key} className="wb-field">
                <span>{field.label}</span>
                <small>{field.hint}</small>
                <input
                  className="wb-number-input"
                  type="number"
                  value={inputs[field.key]}
                  onChange={(event) => handleChange(field.key, event.target.value)}
                />
              </label>
            ))}
          </div>
        </section>

        <section className="wb-panel wb-results">
          <div className="wb-result-head">
            <div>
              <h3>Current result</h3>
              <p className="copy-muted mt-2">
                Review total weight, CG, and the plotted position before dispatch.
              </p>
            </div>
            <div className="wb-result-actions">
              <p className={result?.inLimits ? "wb-ok" : "wb-alert"}>
                {result
                  ? result.inLimits
                    ? "Within CG envelope"
                    : "Out of envelope"
                  : "Run a calculation to see the result"}
              </p>
              <button className="primary-button" onClick={handleCalculate} type="button">
                Calculate
              </button>
            </div>
          </div>

          <div className="wb-stat-grid">
            <div className="wb-stat-card">
              <span>Total weight</span>
              <strong>{result ? `${result.totalWeight.toFixed(1)} lbs` : "--"}</strong>
            </div>
            <div className="wb-stat-card">
              <span>Center of gravity</span>
              <strong>{result ? `${result.cg.toFixed(2)} in` : "--"}</strong>
            </div>
            <div className="wb-stat-card">
              <span>Zero-fuel weight</span>
              <strong>
                {result?.zeroFuel ? `${result.zeroFuel.totalWeight.toFixed(1)} lbs` : "--"}
              </strong>
            </div>
            <div className="wb-stat-card">
              <span>Zero-fuel CG</span>
              <strong>
                {result?.zeroFuel ? `${result.zeroFuel.cg.toFixed(2)} in` : "--"}
              </strong>
            </div>
          </div>

          {result ? (
            <div className="wb-chart-wrap">
              <CGEnvelopeChart
                normalEnvelope={result.aircraft.envelopeNormal}
                utilityEnvelope={result.aircraft.envelopeUtility}
                currentCG={result.cg}
                currentWeight={result.totalWeight}
                zeroFuelCG={result.zeroFuel?.cg}
                zeroFuelWeight={result.zeroFuel?.totalWeight}
              />
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
