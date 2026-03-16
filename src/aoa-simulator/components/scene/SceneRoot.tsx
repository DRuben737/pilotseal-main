"use client";

import { Canvas } from "@react-three/fiber";
import GameHUD from "../hud/GameHUD";
import Aircraft from "./Aircraft";
import AoaArc from "./AoaArc";
import AirflowParticles from "./AirflowParticles";
import Environment from "./Environment";
import FlightPathVector from "./FlightPathVector";
import Horizon from "./Horizon";
import LiftVector from "./LiftVector";
import RelativeWindVector from "./RelativeWindVector";
import SimulationDriver from "./SimulationDriver";

export default function SceneRoot() {
  return (
    <div className="relative overflow-hidden rounded-[24px] border border-black/8 bg-[#f7fbfc]">
      <Canvas
        camera={{ position: [0, 1.6, 4.8], fov: 42 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true }}
        style={{ height: 420 }}
      >
        <Environment />
        <SimulationDriver />
        <group position={[0, -0.1, 0]}>
          <Horizon />
          <AirflowParticles />
          <Aircraft />
          <FlightPathVector />
          <RelativeWindVector />
          <LiftVector />
          <AoaArc />
        </group>
      </Canvas>
      <GameHUD />
    </div>
  );
}
