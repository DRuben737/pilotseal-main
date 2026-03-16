"use client";

import { memo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Group, MathUtils, Mesh, MeshStandardMaterial } from "three";
import { useAoaSimulatorStore } from "../../store/useAoaSimulatorStore";

const modelUrl = new URL("../../assets/models/trainer-aircraft.glb", import.meta.url).href;

function Aircraft() {
  const gltf = useGLTF(modelUrl);
  const aircraftRef = useRef<Group>(null);
  const chordRef = useRef<Mesh>(null);

  useFrame((frameState, delta) => {
    const { pitchDeg, isStalled } = useAoaSimulatorStore.getState();
    const time = frameState.clock.elapsedTime;

    if (aircraftRef.current) {
      aircraftRef.current.rotation.z = MathUtils.degToRad(pitchDeg);

      if (isStalled) {
        aircraftRef.current.position.y = 0.05 + Math.sin(time * 21) * 0.018;
        aircraftRef.current.position.x = Math.cos(time * 17) * 0.012;
      } else {
        aircraftRef.current.position.y += (0.05 - aircraftRef.current.position.y) * (1 - Math.exp(-delta * 8));
        aircraftRef.current.position.x += (0 - aircraftRef.current.position.x) * (1 - Math.exp(-delta * 8));
      }
    }

    if (chordRef.current) {
      const material = chordRef.current.material as MeshStandardMaterial;
      const flicker = isStalled ? 0.32 + Math.sin(time * 26) * 0.18 : 0.08;
      material.emissiveIntensity += (flicker - material.emissiveIntensity) * (1 - Math.exp(-delta * 16));
      material.color.set(isStalled ? "#fecaca" : "#ffffff");
      material.emissive.set(isStalled ? "#ef4444" : "#ffffff");
    }
  });

  return (
    <group ref={aircraftRef} position={[0, 0.05, 0]}>
      <primitive
        object={gltf.scene}
        scale={0.8}
        rotation={[0, 0, 0]}
        position={[0, 0, 0]}
      />
      <mesh ref={chordRef} position={[0.18, 0, 0.02]}>
        <boxGeometry args={[1.95, 0.02, 0.03]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.08} />
      </mesh>
    </group>
  );
}

useGLTF.preload(modelUrl);

export default memo(Aircraft);
