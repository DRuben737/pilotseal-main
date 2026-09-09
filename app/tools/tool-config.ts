export type ToolEmbedConfig = {
  title: string;
  description: string;
  eyebrow: string;
};

export const toolEmbedConfig: Record<string, ToolEmbedConfig> = {
  "endorsement-generator": {
    title: "Endorsement Generator",
    description: "Create and print FAA-style endorsement packets.",
    eyebrow: "Most used",
  },
  "flight-brief": {
    title: "Flight Brief",
    description: "Build a briefing from route, aircraft, and weather details.",
    eyebrow: "Preflight",
  },
  "flight-computer": {
    title: "Flight Computer",
    description: "Run wind, time, fuel, and unit calculations.",
    eyebrow: "Performance",
  },
  wb: {
    title: "Weight & Balance",
    description: "Check loading changes against the aircraft envelope.",
    eyebrow: "Safety",
  },
  nighttime: {
    title: "Night Time Calculator",
    description: "Calculate night periods for training and currency.",
    eyebrow: "Reference",
  },
  decoder: {
    title: "Aviation Decoder",
    description: "Read METARs, TAFs, NOTAMs, and aviation shorthand.",
    eyebrow: "Weather",
  },
};

export function getToolEmbedConfig(slug: string[]) {
  const key = slug.join("/");
  return toolEmbedConfig[key];
}

const allPrimaryToolKeys = [
  "endorsement-generator",
  "flight-brief",
  "flight-computer",
  "wb",
  "nighttime",
  "decoder",
] as const;

export const primaryToolKeys = allPrimaryToolKeys;
