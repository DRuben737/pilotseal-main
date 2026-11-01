import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PilotSeal", short_name: "PilotSeal",
    description: "Aviation training and organization operations.",
    start_url: "/console", display: "standalone",
    background_color: "#ffffff", theme_color: "#0f172a",
    icons: [
      { src: "/brand/pilotseal-mark.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/pilotseal-mark-mono-navy.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
