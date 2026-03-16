"use client";

import { memo, useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useAoaSimulatorStore } from "../../store/useAoaSimulatorStore";

const PARTICLE_COUNT = 120;

type ParticleSeed = {
  x: number;
  y: number;
  band: number;
  speed: number;
  phase: number;
};

function createSeeds(): ParticleSeed[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, index) => ({
    x: (index % 22) * 0.3 - 3.2,
    y: Math.floor(index / 22) * 0.2 - 0.5,
    band: Math.floor(index / 22) * 0.2 - 0.5,
    speed: 0.6 + (index % 7) * 0.06,
    phase: index * 0.37,
  }));
}

function AirflowParticles() {
  const pointsRef = useRef<THREE.Points>(null);
  const seedsRef = useRef<ParticleSeed[]>(createSeeds());
  const positionsRef = useRef<Float32Array>(new Float32Array(PARTICLE_COUNT * 3));
  const attributeRef = useRef<THREE.BufferAttribute | null>(null);

  useEffect(() => {
    if (!pointsRef.current) {
      return;
    }

    const geometry = pointsRef.current.geometry as THREE.BufferGeometry;
    const attribute = new THREE.BufferAttribute(
      positionsRef.current,
      3
    ).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", attribute);
    attributeRef.current = attribute;
  }, []);

  useFrame((_, delta) => {
    const { relativeWindDeg, aoaDeg, isStalled } = useAoaSimulatorStore.getState();
    const seeds = seedsRef.current;
    const positions = positionsRef.current;
    const flowAngle = THREE.MathUtils.degToRad(relativeWindDeg + 180);
    const flowX = Math.cos(flowAngle);
    const flowY = Math.sin(flowAngle);
    const curvature = THREE.MathUtils.clamp(Math.abs(aoaDeg) / 15, 0.02, 1.1);
    const chaos = isStalled ? 0.18 : 0.01;
    const turbulence = isStalled ? 5.8 : 2.1;

    for (let index = 0; index < seeds.length; index += 1) {
      const seed = seeds[index];
      const swirl = Math.sin(seed.phase + seed.x * 0.9) * curvature * 0.08;
      const downwardPull = isStalled ? Math.cos(seed.phase * 1.2 + seed.x * 4) * 0.08 : 0;

      seed.x += flowX * seed.speed * delta * turbulence;
      seed.y += flowY * seed.speed * delta * 0.45 + swirl * delta + downwardPull * delta;

      if (seed.x > 3.6) {
        seed.x = -3.6;
      }

      if (seed.x < -3.6) {
        seed.x = 3.6;
      }

      const baseCurve = Math.sin(seed.phase + seed.x * 1.15) * curvature * 0.06;
      const wakeBend = seed.x > 0 ? curvature * 0.12 * (seed.x / 3.6) ** 2 : 0;
      const chaosJitter =
        Math.sin(seed.phase * (isStalled ? 3.8 : 1.8) + seed.x * (isStalled ? 8 : 3)) * chaos;
      const displacedY = seed.band + baseCurve + wakeBend + chaosJitter;

      positions[index * 3] = seed.x;
      positions[index * 3 + 1] = displacedY;
      positions[index * 3 + 2] = 0.15;
      seed.phase += delta * (isStalled ? 5.2 : 2.1);
    }

    if (pointsRef.current && attributeRef.current) {
      attributeRef.current.needsUpdate = true;
      const material = pointsRef.current.material as THREE.PointsMaterial;
      material.color.set(isStalled ? "#f87171" : "#60a5fa");
      material.size = isStalled ? 0.058 : 0.045;
      material.opacity = isStalled ? 0.82 : 0.65;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry />
      <pointsMaterial color="#93c5fd" size={0.055} sizeAttenuation transparent opacity={0.82} />
    </points>
  );
}

export default memo(AirflowParticles);
