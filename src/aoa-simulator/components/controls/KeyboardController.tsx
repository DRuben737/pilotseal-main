"use client";

import { useEffect } from "react";
import { setManualTargets, updateControls } from "../../lib/aoa/gameplayState";
import { useAoaSimulatorStore } from "../../store/useAoaSimulatorStore";

function getMappedControl(key: string) {
  switch (key) {
    case "w":
    case "arrowup":
      return "pitchUp";
    case "s":
    case "arrowdown":
      return "pitchDown";
    case "shift":
      return "throttleUp";
    case "control":
      return "throttleDown";
    default:
      return null;
  }
}

export default function KeyboardController() {
  useEffect(() => {
    const heldKeys = new Set<string>();

    function handleKeyDown(event: KeyboardEvent) {
      const store = useAoaSimulatorStore.getState();
      if (event.key === "ArrowLeft") {
        store.setFlightPathDeg(store.flightPathDeg - 0.6);
        return;
      }

      if (event.key === "ArrowRight") {
        store.setFlightPathDeg(store.flightPathDeg + 0.6);
        return;
      }

      const control = getMappedControl(event.key.toLowerCase());
      if (!control || heldKeys.has(control)) {
        return;
      }

      heldKeys.add(control);
      updateControls({ [control]: true });

      if (control === "pitchUp" || control === "pitchDown") {
        setManualTargets({ targetPitchDeg: store.pitchDeg });
      }

      if (control === "throttleUp" || control === "throttleDown") {
        setManualTargets({ targetSpeed: store.speed });
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      const control = getMappedControl(event.key.toLowerCase());
      if (!control) {
        return;
      }

      heldKeys.delete(control);
      updateControls({ [control]: false });
    }

    function handleBlur() {
      heldKeys.clear();
      updateControls({
        pitchUp: false,
        pitchDown: false,
        throttleUp: false,
        throttleDown: false,
      });
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  return null;
}
