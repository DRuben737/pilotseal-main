"use client";

import { memo } from "react";

function Environment() {
  return (
    <>
      <color attach="background" args={["#e9f6ff"]} />
      <fog attach="fog" args={["#e9f6ff", 6.5, 16]} />

      <mesh position={[0, 4.8, -7]}>
        <planeGeometry args={[28, 18]} />
        <meshBasicMaterial color="#dff3ff" />
      </mesh>

      <mesh position={[0, -4.6, -7]}>
        <planeGeometry args={[28, 18]} />
        <meshBasicMaterial color="#c6dff7" />
      </mesh>

      <mesh position={[0, 0.03, -6.8]}>
        <planeGeometry args={[26, 0.26]} />
        <meshBasicMaterial color="#f8fbff" transparent opacity={0.7} />
      </mesh>

      <ambientLight intensity={1.05} />
      <directionalLight position={[5, 6, 4]} intensity={1.15} color="#fff7ed" />
      <directionalLight position={[-4, 3, 5]} intensity={0.45} color="#dbeafe" />
    </>
  );
}

export default memo(Environment);
