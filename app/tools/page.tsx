import Image from "next/image";
import Link from "next/link";

import feature1Image from "@/images/feature1.png";
import feature2Image from "@/images/feature2.png";
import feature4Image from "@/images/feature4.png";
import { primaryToolKeys, toolEmbedConfig } from "@/app/tools/tool-config";

export default function ToolsPage() {
  const tools = primaryToolKeys.map((key) => ({
    key,
    ...toolEmbedConfig[key],
  }));

  const toolImages: Partial<Record<(typeof primaryToolKeys)[number], { src: typeof feature1Image; alt: string }>> = {
    "endorsement-generator": {
      src: feature1Image,
      alt: "Endorsement Generator tool preview",
    },
    "flight-brief": {
      src: feature2Image,
      alt: "Flight Brief tool preview",
    },
    wb: {
      src: feature4Image,
      alt: "Weight and Balance tool preview",
    },
  };

  const priorityTools = tools.filter((tool) =>
    ["endorsement-generator", "flight-brief", "wb"].includes(tool.key)
  );
  const secondaryTools = tools.filter(
    (tool) => !["endorsement-generator", "flight-brief", "wb"].includes(tool.key)
  );

  return (
    <main className="page-shell page-tools px-3">
      <div className="site-shell page-stack space-y-6">
        <section className="tools-minimal-shell">
          <div className="tools-minimal-top">
            <div>
              <p className="muted-kicker">Tools</p>
              <h1 className="tools-minimal-title">PilotSeal tools</h1>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/tools/endorsement-generator" className="primary-button">
                Open Generator
              </Link>
              <Link href="/disclaimer" className="secondary-button">
                Disclaimer
              </Link>
            </div>
          </div>
        </section>

        <section className="tools-priority-grid">
          {priorityTools.map((tool) => {
            const toolImage = toolImages[tool.key];

            return (
              <article key={tool.key} className="tools-priority-card">
                <div className="tools-priority-copy">
                  <p className="muted-kicker">{tool.eyebrow}</p>
                  <h2 className="tools-priority-title">{tool.title}</h2>
                  <p className="copy-muted">{tool.description}</p>
                  <Link className="primary-button mt-5" href={`/tools/${tool.key}`}>
                    Open {tool.title}
                  </Link>
                </div>
                {toolImage ? (
                  <div className="tools-preview-frame">
                    <Image
                      src={toolImage.src}
                      alt={toolImage.alt}
                      className="tools-preview-image"
                    />
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>

        {secondaryTools.length > 0 ? (
          <section className="tools-secondary-shell">
            <div className="tools-secondary-header">
              <p className="muted-kicker">More tools</p>
            </div>
            <div className="tools-secondary-grid">
              {secondaryTools.map((tool) => (
                <article key={tool.key} className="tools-secondary-card">
                  <div>
                    <p className="muted-kicker">{tool.eyebrow}</p>
                    <h3 className="mt-2 text-xl font-semibold">{tool.title}</h3>
                    <p className="copy-muted mt-3 leading-7">{tool.description}</p>
                  </div>
                  <Link className="reference-chip" href={`/tools/${tool.key}`}>
                    Open
                  </Link>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
