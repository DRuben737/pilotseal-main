export type ToolEmbedConfig = {
  title: string;
  description: string;
  eyebrow: string;
};

export const toolEmbedConfig: Record<string, ToolEmbedConfig> = {
  "endorsement-generator": {
    title: "Endorsement Generator",
    description:
      "Generate FAA-style endorsement draft packets with searchable templates, signatures, and PDF export.",
    eyebrow: "Most used",
  },
  "flight-brief": {
    title: "Flight Brief",
    description:
      "Review preflight workflow details, weather context, and planning notes in one place.",
    eyebrow: "Preflight",
  },
  "flight-computer": {
    title: "Flight Computer",
    description:
      "Compute wind correction, runway wind, time, fuel, and unit conversions in one cockpit-ready tool.",
    eyebrow: "Performance",
  },
  wb: {
    title: "Weight & Balance",
    description:
      "Run loading scenarios and check envelope impact without leaving the main PilotSeal domain.",
    eyebrow: "Safety",
  },
  nighttime: {
    title: "Night Time Calculator",
    description:
      "Calculate night periods and supporting timing details for training and currency use cases.",
    eyebrow: "Reference",
  },
  decoder: {
    title: "Aviation Decoder",
    description:
      "Decode METARs, TAFs, NOTAMs, and common aviation shorthand into a faster operational read.",
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
