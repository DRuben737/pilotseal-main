import { useSyncExternalStore } from "react";
import { DEFAULT_FLIGHT_STATE } from "../constants/defaults";
import type { FlightState } from "../../types";
import type { CameraMode, GameplayMode } from "./scenarios";
import { aoaScenarios } from "./scenarios";

type ControlState = {
  pitchUp: boolean;
  pitchDown: boolean;
  throttleUp: boolean;
  throttleDown: boolean;
};

type ScenarioProgress = {
  activeScenarioId: string;
  score: number;
  secondsInBand: number;
  completed: boolean;
};

type GameplayState = {
  cameraMode: CameraMode;
  gameplayMode: GameplayMode;
  controls: ControlState;
  targetPitchDeg: number;
  targetSpeed: number;
  scenario: ScenarioProgress;
};

const listeners = new Set<() => void>();

let state: GameplayState = {
  cameraMode: "SideView",
  gameplayMode: "TeachingMode",
  controls: {
    pitchUp: false,
    pitchDown: false,
    throttleUp: false,
    throttleDown: false,
  },
  targetPitchDeg: DEFAULT_FLIGHT_STATE.pitchDeg,
  targetSpeed: DEFAULT_FLIGHT_STATE.speed,
  scenario: {
    activeScenarioId: aoaScenarios[0].id,
    score: 0,
    secondsInBand: 0,
    completed: false,
  },
};

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribeGameplayState(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getGameplayState() {
  return state;
}

export function setGameplayState(updater: GameplayState | ((current: GameplayState) => GameplayState)) {
  state = typeof updater === "function" ? updater(state) : updater;
  emit();
}

export function updateControls(partial: Partial<ControlState>) {
  setGameplayState((current) => ({
    ...current,
    controls: {
      ...current.controls,
      ...partial,
    },
  }));
}

export function setCameraMode(cameraMode: CameraMode) {
  setGameplayState((current) => ({ ...current, cameraMode }));
}

export function setGameplayMode(gameplayMode: GameplayMode, flightState?: FlightState) {
  setGameplayState((current) => ({
    ...current,
    gameplayMode,
    targetPitchDeg: flightState?.pitchDeg ?? current.targetPitchDeg,
    targetSpeed: flightState?.speed ?? current.targetSpeed,
    scenario: {
      ...current.scenario,
      score: 0,
      secondsInBand: 0,
      completed: false,
    },
  }));
}

export function resetGameplayState(flightState?: FlightState) {
  setGameplayState((current) => ({
    ...current,
    controls: {
      pitchUp: false,
      pitchDown: false,
      throttleUp: false,
      throttleDown: false,
    },
    targetPitchDeg: flightState?.pitchDeg ?? DEFAULT_FLIGHT_STATE.pitchDeg,
    targetSpeed: flightState?.speed ?? DEFAULT_FLIGHT_STATE.speed,
    scenario: {
      ...current.scenario,
      score: 0,
      secondsInBand: 0,
      completed: false,
    },
  }));
}

export function setManualTargets(partial: {
  targetPitchDeg?: number;
  targetSpeed?: number;
}) {
  setGameplayState((current) => ({
    ...current,
    targetPitchDeg: partial.targetPitchDeg ?? current.targetPitchDeg,
    targetSpeed: partial.targetSpeed ?? current.targetSpeed,
  }));
}

export function useGameplayState<T>(selector: (state: GameplayState) => T) {
  return useSyncExternalStore(
    subscribeGameplayState,
    () => selector(getGameplayState()),
    () => selector(getGameplayState())
  );
}
