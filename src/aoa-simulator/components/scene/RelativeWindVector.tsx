"use client";

import { memo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group, MathUtils } from "three";
import { useAoaSimulatorStore } from "../../store/useAoaSimulatorStore";

function RelativeWindVector() {
  const groupRef = useRef<Group>(null);

  useFrame(() => {
    if (!groupRef.current) {
      return;
    }

    groupRef.current.rotation.z = MathUtils.degToRad(
      useAoaSimulatorStore.getState().relativeWindDeg
    );
  });

  return (
    <group ref={groupRef} position={[0, 0.05, 0.01]}>
      <mesh position={[0.94, 0, 0]}>
        <boxGeometry args={[1.88, 0.04, 0.04]} />
        <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={0.15} />
      </mesh>
      <mesh position={[1.96, 0, 0]}>
        <coneGeometry args={[0.11, 0.3, 16]} />
        <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={0.15} />
      </mesh>
    </group>
  );
}

export default memo(RelativeWindVector);
