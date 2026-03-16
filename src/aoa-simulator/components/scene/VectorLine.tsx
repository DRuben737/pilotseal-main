"use client";

import { useMemo } from "react";
import * as THREE from "three";

export default function VectorLine({
  start,
  end,
  color,
}: {
  start: [number, number, number];
  end: [number, number, number];
  color: string;
}) {
  const line = useMemo(() => {
    const points = [new THREE.Vector3(...start), new THREE.Vector3(...end)];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color });
    return new THREE.Line(geometry, material);
  }, [color, end, start]);

  return <primitive object={line} />;
}
