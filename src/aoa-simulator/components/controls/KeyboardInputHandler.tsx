"use client";

import { useEffect } from "react";
import { useAoaSimulatorStore } from "../../store/useAoaSimulatorStore";

export default function KeyboardInputHandler() {
  const setPitchDeg = useAoaSimulatorStore((state) => state.setPitchDeg);
  const setFlightPathDeg = useAoaSimulatorStore((state) => state.setFlightPathDeg);
  const setSpeed = useAoaSimulatorStore((state) => state.setSpeed);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const state = useAoaSimulatorStore.getState();

      if (event.key === "ArrowUp") {
        setPitchDeg(state.pitchDeg + 1);
      }

      if (event.key === "ArrowDown") {
        setPitchDeg(state.pitchDeg - 1);
      }

      if (event.key === "ArrowRight") {
        setFlightPathDeg(state.flightPathDeg + 1);
      }

      if (event.key === "ArrowLeft") {
        setFlightPathDeg(state.flightPathDeg - 1);
      }

      if (event.key === "=" || event.key === "+") {
        setSpeed(state.speed + 2);
      }

      if (event.key === "-") {
        setSpeed(state.speed - 2);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setFlightPathDeg, setPitchDeg, setSpeed]);

  return null;
}
