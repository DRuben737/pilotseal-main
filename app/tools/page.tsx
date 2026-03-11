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
        <section className="tools-priority-grid">
          {priorityTools.map((tool) => {
            const toolImage = toolImages[tool.key];

            return (
              <article key={tool.key} className="tools-priority-card tools-priority-card-compact">
                <div className="tools-priority-copy">
                  <h2 className="tools-priority-title">{tool.title}</h2>
                  <Link className="primary-button tools-card-button mt-4" href={`/tools/${tool.key}`}>
                    Open
                  </Link>
                </div>
                {toolImage ? (
                  <div className="tools-preview-frame tools-preview-frame-square">
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
            <div className="tools-secondary-grid">
              {secondaryTools.map((tool) => (
                <article key={tool.key} className="tools-secondary-card tools-secondary-card-compact">
                  <div>
                    <h3 className="text-lg font-semibold">{tool.title}</h3>
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
