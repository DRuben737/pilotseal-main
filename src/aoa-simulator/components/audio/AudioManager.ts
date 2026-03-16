"use client";

type StallAudioNodes = {
  context: AudioContext;
  masterGain: GainNode;
  warningGain: GainNode;
  tone: OscillatorNode;
  modulator: OscillatorNode;
  modulatorGain: GainNode;
};

class AudioManager {
  private nodes: StallAudioNodes | null = null;
  private stallActive = false;
  private unlocked = false;

  initialize() {
    if (typeof window === "undefined" || this.nodes) {
      return;
    }

    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      return;
    }

    const context = new AudioContextCtor();
    const masterGain = context.createGain();
    const warningGain = context.createGain();
    const tone = context.createOscillator();
    const modulator = context.createOscillator();
    const modulatorGain = context.createGain();

    tone.type = "sawtooth";
    tone.frequency.value = 820;

    modulator.type = "sine";
    modulator.frequency.value = 4.4;
    modulatorGain.gain.value = 120;

    warningGain.gain.value = 0.0001;
    masterGain.gain.value = 0.05;

    modulator.connect(modulatorGain);
    modulatorGain.connect(tone.frequency);
    tone.connect(warningGain);
    warningGain.connect(masterGain);
    masterGain.connect(context.destination);

    tone.start();
    modulator.start();

    this.nodes = {
      context,
      masterGain,
      warningGain,
      tone,
      modulator,
      modulatorGain,
    };

    const unlock = () => {
      this.resume();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };

    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
  }

  resume() {
    if (!this.nodes) {
      this.initialize();
    }

    if (this.nodes && this.nodes.context.state !== "running") {
      void this.nodes.context.resume();
    }

    this.unlocked = true;
  }

  playStall() {
    if (!this.nodes) {
      this.initialize();
    }

    if (!this.nodes || this.stallActive) {
      return;
    }

    this.resume();
    const now = this.nodes.context.currentTime;
    this.nodes.warningGain.gain.cancelScheduledValues(now);
    this.nodes.warningGain.gain.linearRampToValueAtTime(0.12, now + 0.08);
    this.stallActive = true;
  }

  stopStall() {
    if (!this.nodes || !this.stallActive) {
      return;
    }

    const now = this.nodes.context.currentTime;
    this.nodes.warningGain.gain.cancelScheduledValues(now);
    this.nodes.warningGain.gain.linearRampToValueAtTime(0.0001, now + 0.18);
    this.stallActive = false;
  }

  isReady() {
    return this.unlocked;
  }
}

export const audioManager = new AudioManager();
