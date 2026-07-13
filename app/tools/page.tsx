import Image from "next/image";
import Link from "next/link";
import { primaryToolKeys, toolEmbedConfig } from "@/app/tools/tool-config";
import feature1Image from "@/images/toolFlightcomputer.png";
import toolEndorsementBannerImage from "@/images/tool-endorsement-banner-v2.png";
import toolFlightBriefBannerImage from "@/images/tool-flight-brief-banner-v2.png";
import toolNighttimeHeroImage from "@/images/tool-nighttime-hero.png";
import toolWeatherDecoderImage from "@/images/tool-weather-decoder.png";
import toolWbBannerImage from "@/images/tool-wb-banner-v2.png";

export default function ToolsPage() {
  const tools = primaryToolKeys.map((key) => ({
    key,
    ...toolEmbedConfig[key],
  }));

  const toolImages: Record<string, { src: typeof feature1Image; alt: string }> = {
    "endorsement-generator": {
      src: toolEndorsementBannerImage,
      alt: "Endorsement Generator preview",
    },
    "flight-brief": {
      src: toolFlightBriefBannerImage,
      alt: "Flight Brief preview",
    },
    "flight-computer": {
      src: feature1Image,
      alt: "Flight Computer preview",
    },
    wb: {
      src: toolWbBannerImage,
      alt: "Weight and Balance preview",
    },
    nighttime: {
      src: toolNighttimeHeroImage,
      alt: "Night Time Calculator preview",
    },
    decoder: {
      src: toolWeatherDecoderImage,
      alt: "Aviation Decoder preview",
    },
  };

  return (
    <main className="page-shell page-tools px-3">
      <div className="site-shell page-stack space-y-4">
        <section className="tools-mobile-hero">
          <div>
            <p className="tools-mobile-kicker">PilotSeal tools</p>
            <h1 className="tools-mobile-title">Fast cockpit and training utilities.</h1>
            <p className="tools-mobile-copy">
              Start with the generator, brief a flight, calculate loading, or decode weather from one mobile-friendly hub.
            </p>
          </div>
          <Link href="/tools/endorsement-generator" className="tools-mobile-cta">
            New endorsement
          </Link>
        </section>

        <section className="tools-mobile-list">
          {tools.map((tool) => (
            <Link
              key={tool.key}
              href={`/tools/${tool.key}`}
              className="tools-mobile-tool-card group relative overflow-hidden rounded-[16px] border border-slate-200/75 bg-white/78 xl:max-w-[340px]"
            >
              <div className="relative overflow-hidden bg-slate-100 p-2">
                <Image
                  src={toolImages[tool.key].src}
                  alt={toolImages[tool.key].alt}
                  className="aspect-[16/9] w-full rounded-[10px] transition-transform duration-300 group-hover:scale-[1.02]"
                  style={{ objectFit: "contain", objectPosition: "center" }}
                />
                <div className="absolute inset-x-2 bottom-2 rounded-[10px] bg-[linear-gradient(180deg,rgba(9,19,31,0),rgba(9,19,31,0.82))] px-2.5 pb-2 pt-8 text-white">
                  <p className="text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-white/72">
                    {tool.eyebrow}
                  </p>
                  <h2 className="mt-1 text-[0.8rem] font-semibold leading-tight text-white sm:text-[0.92rem]">
                    {tool.title}
                  </h2>
                </div>
              </div>
              <div className="tools-mobile-tool-copy">
                <h2>{tool.title}</h2>
                <p>{tool.description}</p>
                <span>Open tool</span>
              </div>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
