"use client";

export default function Horizon() {
  return (
    <>
      <mesh position={[0, 0, -1.8]}>
        <boxGeometry args={[18, 0.03, 0.03]} />
        <meshBasicMaterial color="#dbeafe" />
      </mesh>
    </>
  );
}
