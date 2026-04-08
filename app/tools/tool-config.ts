import { features } from "@/lib/features";

export type ToolEmbedConfig = {
  title: string;
  description: string;
  eyebrow: string;
};

export const toolEmbedConfig: Record<string, ToolEmbedConfig> = {
  "aoa-simulator": {
    title: "AOA Simulator",
    description:
      "Explore a modular angle-of-attack teaching sandbox with placeholder scene, HUD, controls, and simulation layers.",
    eyebrow: "Simulator",
  },
  "endorsement-generator": {
    title: "Endorsement Generator",
    description:
      "Generate FAA-style endorsement draft packets with searchable templates, signatures, and PDF export.",
    eyebrow: "Most used",
  },
  fids: {
    title: "Flight Display",
    description:
      "Monitor arrivals and departures on a live airport-style flight information display.",
    eyebrow: "Operations",
  },
  "flight-brief": {
    title: "Flight Brief",
    description:
      "Review preflight workflow details, weather context, and planning notes in one place.",
    eyebrow: "Preflight",
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
    title: "Weather Decoder",
    description:
      "Decode common aviation weather strings when you need a faster read on briefing inputs.",
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
  "wb",
  "nighttime",
  "decoder",
  "aoa-simulator",
] as const;

export const primaryToolKeys = allPrimaryToolKeys.filter(
  (key) => key !== "aoa-simulator" || features.aoaSimulator
);
