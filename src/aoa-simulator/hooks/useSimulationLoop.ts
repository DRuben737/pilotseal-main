"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { audioManager } from "../components/audio/AudioManager";
import { clamp } from "../lib/math/angles";
import { stepFlightPhysics } from "../lib/aoa/physics";
import { aoaScenarios } from "../lib/aoa/scenarios";
import { getGameplayState, setGameplayState } from "../lib/aoa/gameplayState";
import { useAoaSimulatorStore } from "../store/useAoaSimulatorStore";

export function useSimulationLoop() {
  const wasStalledRef = useRef(false);

  useFrame((_frameState, deltaTime) => {
    const dt = clamp(deltaTime, 1 / 240, 1 / 24);
    const currentState = useAoaSimulatorStore.getState();
    const gameplay = getGameplayState();
    const activeScenario =
      aoaScenarios.find((scenario) => scenario.id === gameplay.scenario.activeScenarioId) ??
      aoaScenarios[0];

    const modePitchRate =
      gameplay.gameplayMode === "TeachingMode"
        ? 18
        : gameplay.gameplayMode === "ChallengeMode"
          ? 22
          : 26;

    const modePitchResponse =
      gameplay.gameplayMode === "TeachingMode"
        ? 3.2
        : gameplay.gameplayMode === "ChallengeMode"
          ? 4
          : 4.8;

    const modeSpeedRate = gameplay.gameplayMode === "TeachingMode" ? 10 : 14;

    let targetPitchDeg = gameplay.targetPitchDeg;
    let targetSpeed = gameplay.targetSpeed;

    if (!gameplay.controls.pitchUp && !gameplay.controls.pitchDown) {
      targetPitchDeg = currentState.pitchDeg;
    }

    if (!gameplay.controls.throttleUp && !gameplay.controls.throttleDown) {
      targetSpeed = currentState.speed;
    }

    if (gameplay.controls.pitchUp) {
      targetPitchDeg += modePitchRate * dt;
    }
    if (gameplay.controls.pitchDown) {
      targetPitchDeg -= modePitchRate * dt;
    }
    if (gameplay.controls.throttleUp) {
      targetSpeed += modeSpeedRate * dt;
    }
    if (gameplay.controls.throttleDown) {
      targetSpeed -= modeSpeedRate * dt;
    }

    targetPitchDeg = clamp(targetPitchDeg, -12, 20);
    targetSpeed = clamp(targetSpeed, 40, 160);

    const smoothedPitchDeg =
      currentState.pitchDeg +
      (targetPitchDeg - currentState.pitchDeg) * (1 - Math.exp(-modePitchResponse * dt));
    const smoothedSpeed =
      currentState.speed +
      (targetSpeed - currentState.speed) * (1 - Math.exp(-2.2 * dt));

    const nextFlightState = stepFlightPhysics(
      {
        ...currentState,
        pitchDeg: smoothedPitchDeg,
        speed: smoothedSpeed,
      },
      dt
    );

    const inTargetBand =
      nextFlightState.aoaDeg >= activeScenario.targetAOA[0] &&
      nextFlightState.aoaDeg <= activeScenario.targetAOA[1];

    const nextSecondsInBand =
      gameplay.gameplayMode === "ChallengeMode" && inTargetBand
        ? gameplay.scenario.secondsInBand + dt
        : 0;

    const nextScore =
      gameplay.gameplayMode === "ChallengeMode" && inTargetBand
        ? gameplay.scenario.score + Math.round(10 * dt)
        : 0;

    useAoaSimulatorStore.setState(nextFlightState);

    const nextCompleted =
      gameplay.gameplayMode === "ChallengeMode"
        ? nextSecondsInBand >= activeScenario.duration
        : false;

    if (targetPitchDeg !== gameplay.targetPitchDeg ||
        targetSpeed !== gameplay.targetSpeed ||
        nextScore !== gameplay.scenario.score ||
        nextSecondsInBand !== gameplay.scenario.secondsInBand ||
        nextCompleted !== gameplay.scenario.completed) {
      setGameplayState((current) => ({
        ...current,
        targetPitchDeg,
        targetSpeed,
        scenario: {
          ...current.scenario,
          score: nextScore,
          secondsInBand: nextSecondsInBand,
          completed: nextCompleted,
        },
      }));
    }

    if (nextFlightState.isStalled && !wasStalledRef.current) {
      audioManager.playStall();
    }

    if (!nextFlightState.isStalled && wasStalledRef.current) {
      audioManager.stopStall();
    }

    wasStalledRef.current = nextFlightState.isStalled;
  });
}
