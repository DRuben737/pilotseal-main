"use client";

import { useEffect } from "react";
import { audioManager } from "./AudioManager";

export default function StallSound() {
  useEffect(() => {
    audioManager.initialize();
    return () => {
      audioManager.stopStall();
    };
  }, []);

  return null;
}
