"use client";

import { useMemo } from "react";
import { useAoaSimulatorStore } from "../../store/useAoaSimulatorStore";

export default function LiftVector() {
  const liftForce = useAoaSimulatorStore((state) => state.liftForce);
  const isStalled = useAoaSimulatorStore((state) => state.isStalled);
  const arrowLength = useMemo(() => Math.max(0.45, Math.min(2.2, liftForce * 1.35)), [liftForce]);
  const color = isStalled ? "#ef4444" : "#facc15";

  return (
    <group position={[0.28, 0.05, 0.03]}>
      <mesh position={[0, arrowLength * 0.5, 0]}>
        <boxGeometry args={[0.05, arrowLength, 0.05]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[0, arrowLength + 0.18, 0]}>
        <coneGeometry args={[0.12, 0.34, 18]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.2} />
      </mesh>
    </group>
  );
}
