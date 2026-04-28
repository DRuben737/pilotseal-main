import { createElement } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getToolEmbedConfig } from "@/app/tools/tool-config";
import { nativeToolRegistry } from "@/components/tools-native/tool-registry";
import { buildPageMetadata } from "@/lib/seo";

type ToolPageProps = {
  params: Promise<{ slug: string[] }>;
};

function renderNativeTool(slug: string) {
  switch (slug) {
    case "decoder":
      return createElement(nativeToolRegistry.decoder);
    case "endorsement-generator":
      return createElement(nativeToolRegistry["endorsement-generator"]);
    case "fids":
      return createElement(nativeToolRegistry.fids);
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
  const toolLinks = [
    ["endorsement-generator", "Endorsements"],
    ["flight-brief", "Brief"],
    ["wb", "W&B"],
    ["nighttime", "Night"],
    ["decoder", "Decoder"],
  ].filter(([key]) => key !== slug.join("/"));

  if (!tool) {
    notFound();
  }
  const slugKey = slug.join("/");
  const toolContent = renderNativeTool(slugKey);

  if (!toolContent) {
    notFound();
  }

  if (slugKey === "endorsement-generator") {
    return (
      <main className="page-shell page-tool-child px-3">
        <div className="site-shell mx-auto max-w-7xl space-y-8">
          <section className="rounded-[24px] border border-slate-200 bg-white/92 px-5 py-4 shadow-[0_14px_36px_rgba(15,23,42,0.06)] sm:px-6 sm:py-5">
            <div className="max-w-3xl space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                FAA Endorsement Generator
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-[2rem]">
                FAA Endorsement Generator
              </h1>
              <p className="max-w-2xl text-sm text-slate-600">
                Generate FAA endorsements instantly.
              </p>
            </div>
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
