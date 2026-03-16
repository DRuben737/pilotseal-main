"use client";

import { memo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group, MathUtils } from "three";
import { useAoaSimulatorStore } from "../../store/useAoaSimulatorStore";

function FlightPathVector() {
  const groupRef = useRef<Group>(null);

  useFrame(() => {
    if (!groupRef.current) {
      return;
    }

    groupRef.current.rotation.z = MathUtils.degToRad(
      useAoaSimulatorStore.getState().flightPathDeg
    );
  });

  return (
    <group ref={groupRef} position={[0, 0.05, 0.02]}>
      <mesh position={[0.82, 0, 0]}>
        <boxGeometry args={[1.64, 0.035, 0.035]} />
        <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.18} />
      </mesh>
      <mesh position={[1.72, 0, 0]}>
        <coneGeometry args={[0.1, 0.28, 16]} />
        <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.18} />
      </mesh>
    </group>
  );
}

export default memo(FlightPathVector);
