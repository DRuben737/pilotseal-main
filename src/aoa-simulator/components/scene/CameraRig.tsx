"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { useGameplayState } from "../../lib/aoa/gameplayState";
import { useAoaSimulatorStore } from "../../store/useAoaSimulatorStore";

const sideViewPosition = new Vector3(0, 1.35, 5.2);
const chaseBaseOffset = new Vector3(-2.6, 1.25, 3.15);
const lookAtTarget = new Vector3(0.2, 0.2, 0);

export default function CameraRig() {
  const camera = useThree((state) => state.camera);
  const cameraMode = useGameplayState((state) => state.cameraMode);

  useFrame((frameState, delta) => {
    const { pitchDeg, isStalled } = useAoaSimulatorStore.getState();
    const time = frameState.clock.elapsedTime;
    const targetPosition =
      cameraMode === "SideView"
        ? sideViewPosition.clone()
        : chaseBaseOffset.clone().add(new Vector3(0, pitchDeg * 0.03, 0));

    if (isStalled) {
      targetPosition.x += Math.sin(time * 23) * 0.05;
      targetPosition.y += Math.cos(time * 17) * 0.05;
    }

    camera.position.lerp(targetPosition, 1 - Math.exp(-delta * (cameraMode === "SideView" ? 4.5 : 3.2)));
    camera.lookAt(lookAtTarget.x, lookAtTarget.y + pitchDeg * 0.01, lookAtTarget.z);
  });

  return null;
}
