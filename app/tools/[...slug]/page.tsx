import Link from "next/link";
import { createElement, type CSSProperties } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getToolEmbedConfig, primaryToolKeys, toolEmbedConfig } from "@/app/tools/tool-config";
import { nativeToolRegistry } from "@/components/tools-native/tool-registry";
import endorsementPageImage from "@/images/endorsementpage.png";
import endorsementSampleImage from "@/images/endorsementsample.png";
import feature1Image from "@/images/feature1.png";
import feature2Image from "@/images/feature2.png";
import feature3Image from "@/images/feature3.png";
import feature4Image from "@/images/feature4.png";
import utilityToolsImage from "@/images/utility-tools-illustration.png";
import { buildPageMetadata } from "@/lib/seo";

type ToolPageProps = {
  params: Promise<{ slug: string[] }>;
};

const toolVisuals = {
  "endorsement-generator": {
    image: endorsementPageImage,
    pageImage: endorsementSampleImage,
    alt: "FAA endorsement workflow preview",
  },
  "flight-brief": {
    image: feature2Image,
    pageImage: utilityToolsImage,
    alt: "Flight brief planning preview",
  },
  "flight-computer": {
    image: feature1Image,
    pageImage: feature1Image,
    alt: "Flight computer planning preview",
  },
  wb: {
    image: feature4Image,
    pageImage: feature4Image,
    alt: "Weight and balance workflow preview",
  },
  nighttime: {
    image: feature3Image,
    pageImage: feature3Image,
    alt: "Night time calculator preview",
  },
  decoder: {
    image: feature1Image,
    pageImage: feature1Image,
    alt: "Weather decoder preview",
  },
} as const;

function renderNativeTool(slug: string) {
  switch (slug) {
    case "decoder":
      return createElement(nativeToolRegistry.decoder);
    case "endorsement-generator":
      return createElement(nativeToolRegistry["endorsement-generator"]);
    case "flight-brief":
      return createElement(nativeToolRegistry["flight-brief"]);
    case "flight-computer":
      return createElement(nativeToolRegistry["flight-computer"]);
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

  const slugPath = `/${["tools", ...slug].join("/")}`;

  if (slugPath === "/tools/endorsement-generator") {
    return {
      title: "FAA Endorsement Generator (Free Tool)",
      description:
        "Generate FAA endorsements instantly. Fast, accurate, and ready to use for CFIs.",
      alternates: {
        canonical: slugPath,
      },
      keywords: [
        "faa endorsement generator",
        "generate FAA endorsement",
        "FAA endorsements",
        "CFI endorsement generator",
        "pilot logbook endorsement",
      ],
    };
  }

  return buildPageMetadata({
    title: tool.title,
    description: tool.description,
    path: slugPath,
    keywords: ["pilot tools", "FAA", "CFI", tool.title, "PilotSeal"],
  });
}

export default async function EmbeddedToolPage({ params }: ToolPageProps) {
  const { slug } = await params;
  const tool = getToolEmbedConfig(slug);

  if (!tool) {
    notFound();
  }
  const slugKey = slug.join("/");
  const toolContent = renderNativeTool(slugKey);
  const toolNavItems = primaryToolKeys.map((key) => ({
    key,
    href: `/tools/${key}`,
    title: toolEmbedConfig[key].title,
    active: key === slugKey,
  }));
  const toolVisual = toolVisuals[slugKey as keyof typeof toolVisuals];
  const pageStyle = toolVisual
    ? ({
        "--tool-page-image": `url(${toolVisual.pageImage.src})`,
      } as CSSProperties)
    : undefined;

  if (!toolContent) {
    notFound();
  }

  if (slugKey === "endorsement-generator") {
    return (
      <main
        className="page-shell page-tool-child tool-theme-endorsement-generator px-3"
        style={pageStyle}
      >
        <div className="site-shell mx-auto max-w-7xl space-y-8">
          <section className="overflow-x-auto">
            <nav className="flex w-max min-w-full gap-2 rounded-[18px] border border-slate-200/75 bg-white/86 p-2 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
              {toolNavItems.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`whitespace-nowrap rounded-[14px] px-3 py-2 text-sm font-medium transition ${
                    item.active
                      ? "bg-slate-950 text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                  }`}
                >
                  {item.title}
                </Link>
              ))}
            </nav>
          </section>

          <section className="content-card tool-stage p-3 sm:p-4">
            {toolContent}
          </section>

          <section>
            <details className="px-1 py-1">
              <summary className="cursor-pointer list-none text-sm font-medium text-slate-900">
                FAQ
              </summary>
              <div className="mt-3 space-y-3 text-xs leading-5 text-slate-600">
                <div>
                  <p className="font-medium text-slate-900">What does this FAA endorsement generator do?</p>
                  <p className="mt-1">
                    It helps CFIs generate FAA endorsement text, add signatures, and prepare a PDF packet
                    immediately.
                  </p>
                </div>
                <div>
                  <p className="font-medium text-slate-900">Can I use saved CFI and student profiles?</p>
                  <p className="mt-1">
                    Yes. Signed-in users can autofill saved CFI and student details directly in the form.
                  </p>
                </div>
                <div>
                  <p className="font-medium text-slate-900">Does it generate a printable result?</p>
                  <p className="mt-1">
                    Yes. The generator opens a PDF preview and supports printing once the endorsement is confirmed.
                  </p>
                </div>
                <div>
                  <p className="font-medium text-slate-900">Do I need to browse a hub before using it?</p>
                  <p className="mt-1">
                    No. This page loads the FAA endorsement generator immediately so you can start generating
                    endorsements right away.
                  </p>
                </div>
              </div>
            </details>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main
      className={`page-shell page-tool-child tool-theme-${slugKey} px-3`}
      style={pageStyle}
    >
      <div className="site-shell page-stack space-y-6">
        <section className="overflow-x-auto">
          <nav className="flex w-max min-w-full gap-2 rounded-[18px] border border-slate-200/75 bg-white/86 p-2 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
            {toolNavItems.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className={`whitespace-nowrap rounded-[14px] px-3 py-2 text-sm font-medium transition ${
                  item.active
                    ? "bg-slate-950 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                }`}
              >
                {item.title}
              </Link>
            ))}
          </nav>
        </section>

        <section className="content-card tool-stage p-3 sm:p-4">
          {toolContent}
        </section>
      </div>
    </main>
  );
}
