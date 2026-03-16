"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { useAoaSimulatorStore } from "../../store/useAoaSimulatorStore";

export default function AoaArc() {
  const pitchDeg = useAoaSimulatorStore((state) => state.pitchDeg);
  const flightPathDeg = useAoaSimulatorStore((state) => state.flightPathDeg);
  const aoaDeg = useAoaSimulatorStore((state) => state.aoaDeg);
  const isStalled = useAoaSimulatorStore((state) => state.isStalled);

  const line = useMemo(() => {
    const startDeg = Math.min(flightPathDeg, pitchDeg);
    const endDeg = Math.max(flightPathDeg, pitchDeg);
    const curve = new THREE.ArcCurve(
      0,
      0,
      0.72,
      THREE.MathUtils.degToRad(startDeg),
      THREE.MathUtils.degToRad(endDeg),
      false
    );
    const points = curve
      .getPoints(32)
      .map((point) => new THREE.Vector3(point.x, point.y, 0));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: isStalled ? "#ef4444" : "#facc15",
    });
    return new THREE.Line(geometry, material);
  }, [flightPathDeg, isStalled, pitchDeg]);

  return (
    <group position={[0.12, 0.05, 0.02]}>
      <primitive object={line} />
      <mesh
        position={[
          Math.cos(THREE.MathUtils.degToRad((pitchDeg + flightPathDeg) * 0.5)) * 0.86,
          Math.sin(THREE.MathUtils.degToRad((pitchDeg + flightPathDeg) * 0.5)) * 0.86,
          0,
        ]}
      >
        <sphereGeometry args={[Math.min(0.11, 0.04 + Math.abs(aoaDeg) * 0.004), 12, 12]} />
        <meshStandardMaterial color={isStalled ? "#ef4444" : "#facc15"} />
      </mesh>
    </group>
  );
}
