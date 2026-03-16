"use client";

import { create } from "zustand";
import type { FlightState } from "../types";
import { DEFAULT_FLIGHT_STATE } from "../lib/constants/defaults";
import { updateFlightState } from "../lib/physics/aoa";

type AoaSimulatorStore = FlightState & {
  setPitchDeg: (pitchDeg: number) => void;
  setFlightPathDeg: (flightPathDeg: number) => void;
  setSpeed: (speed: number) => void;
  syncDerivedState: () => void;
  reset: () => void;
};

export const useAoaSimulatorStore = create<AoaSimulatorStore>((set, get) => ({
  ...DEFAULT_FLIGHT_STATE,
  setPitchDeg: (pitchDeg) => {
    set({ pitchDeg });
    get().syncDerivedState();
  },
  setFlightPathDeg: (flightPathDeg) => {
    set({ flightPathDeg });
    get().syncDerivedState();
  },
  setSpeed: (speed) => {
    set({ speed });
    get().syncDerivedState();
  },
  syncDerivedState: () => {
    const { pitchDeg, flightPathDeg, speed } = get();
    set(updateFlightState({ pitchDeg, flightPathDeg, speed }));
  },
  reset: () => set(DEFAULT_FLIGHT_STATE),
}));
