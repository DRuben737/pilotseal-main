"use client";

import StallSound from "../audio/StallSound";
import { useSimulationLoop } from "../../hooks/useSimulationLoop";
import CameraRig from "./CameraRig";

export default function SimulationDriver() {
  useSimulationLoop();
  return (
    <>
      <StallSound />
      <CameraRig />
    </>
  );
}
