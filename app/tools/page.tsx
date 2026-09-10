import Link from "next/link";

import { toolEmbedConfig } from "@/app/tools/tool-config";

const toolGroups = [
  { title: "Training", tools: ["endorsement-generator", "flight-brief"] },
  { title: "Flight planning", tools: ["flight-computer", "wb", "nighttime", "decoder"] },
] as const;

function ToolIcon({ tool }: { tool: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (tool === "endorsement-generator") return <svg {...common}><path d="M6 3.5h12v17H6z" /><path d="M9 8h6M9 11h4" /><path d="m10 16 1.5 1.5L15 14" /></svg>;
  if (tool === "flight-brief") return <svg {...common}><path d="M4 6.5h16v13H4z" /><path d="M8 3.5v6M16 3.5v6M4 10.5h16" /><path d="M8 14h3M13 14h3M8 17h3" /></svg>;
  if (tool === "flight-computer") return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M12 6v12M6 12h12M8 8l8 8M16 8l-8 8" /></svg>;
  if (tool === "wb") return <svg {...common}><path d="M12 4v16M5 7h14M7 7l-3 7h6L7 7Zm10 0-3 7h6l-3-7Z" /></svg>;
  if (tool === "nighttime") return <svg {...common}><path d="M18.5 15.5A7.5 7.5 0 0 1 8.5 5a8 8 0 1 0 10 10.5Z" /><path d="M16 5h.01M20 9h.01" /></svg>;
  return <svg {...common}><path d="M5 5h14v14H5z" /><path d="M8 9h8M8 12h5M8 15h7" /></svg>;
}

export default function ToolsPage() {
  return (
    <main className="page-shell page-tools px-3">
      <div className="site-shell tools-index">
        <h1 className="sr-only">Tools</h1>
        <div className="tools-index-groups">
          {toolGroups.map((group) => (
            <section className="tools-index-group" key={group.title}>
              <h2>{group.title}</h2>
              <div className="tools-index-list">
                {group.tools.map((key) => {
                  const tool = toolEmbedConfig[key];
                  return (
                    <Link key={key} href={`/tools/${key}`} className="tools-index-row">
                      <span className="tools-index-icon"><ToolIcon tool={key} /></span>
                      <span className="tools-index-copy">
                        <strong>{tool.title}</strong>
                        <span>{tool.description}</span>
                      </span>
                      <svg className="tools-index-chevron" viewBox="0 0 20 20" aria-hidden="true">
                        <path d="m7.5 4.5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
