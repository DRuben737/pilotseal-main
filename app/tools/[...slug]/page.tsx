import { createElement } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getToolEmbedConfig } from "@/app/tools/tool-config";
import { nativeToolRegistry } from "@/components/tools-native/tool-registry";
import { features } from "@/lib/features";

type ToolPageProps = {
  params: Promise<{ slug: string[] }>;
};

function renderNativeTool(slug: string) {
  switch (slug) {
    case "aoa-simulator":
      return createElement(nativeToolRegistry["aoa-simulator"]);
    case "decoder":
      return createElement(nativeToolRegistry.decoder);
    case "endorsement-generator":
      return createElement(nativeToolRegistry["endorsement-generator"]);
    case "flight-brief":
      return createElement(nativeToolRegistry["flight-brief"]);
    case "nighttime":
      return createElement(nativeToolRegistry.nighttime);
    case "wb":
      return createElement(nativeToolRegistry.wb);
    default:
      return null;
  }
}

export async function generateMetadata({
  params,
}: ToolPageProps): Promise<Metadata> {
  const { slug } = await params;
  const tool = getToolEmbedConfig(slug);

  if (!tool) {
    return {};
  }

  return {
    title: `${tool.title} | PilotSeal`,
    description: tool.description,
  };
}

export default async function EmbeddedToolPage({ params }: ToolPageProps) {
  const { slug } = await params;
  const tool = getToolEmbedConfig(slug);
  const toolLinks = [
    ["aoa-simulator", "AOA"],
    ["endorsement-generator", "Endorsements"],
    ["flight-brief", "Brief"],
    ["wb", "W&B"],
    ["nighttime", "Night"],
    ["decoder", "Decoder"],
  ].filter(([key]) => {
    if (key === slug.join("/")) {
      return false;
    }

    if (key === "aoa-simulator" && !features.aoaSimulator) {
      return false;
    }

    return true;
  });

  if (!tool) {
    notFound();
  }
  const slugKey = slug.join("/");
  const toolContent = renderNativeTool(slugKey);

  if (!toolContent) {
    notFound();
  }

  return (
    <main className={`page-shell page-tool-child tool-theme-${slugKey} px-3`}>
      <div className="site-shell page-stack space-y-6">
        <section className="tools-child-shell">
          <div className="tools-child-header">
            <div>
              <p className="muted-kicker">{tool.eyebrow}</p>
              <h1 className="tools-child-title">{tool.title}</h1>
            </div>
            <div className="tools-child-actions">
              <Link href="/tools" className="reference-chip">
                All tools
              </Link>
            </div>
          </div>
          <div className="tools-child-nav">
            {toolLinks.map(([key, label]) => (
              <Link key={key} href={`/tools/${key}`} className="tools-child-chip">
                {label}
              </Link>
            ))}
          </div>
        </section>

        <section className="content-card tool-stage p-3 sm:p-4">
          {toolContent}
        </section>
      </div>
    </main>
  );
}
