import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { Marked } from "marked";

const marked = new Marked({
  gfm: true,
  breaks: false,
});

function getPrivacyContent() {
  const filePath = path.join(
    process.cwd(),
    "content",
    "sitelog",
    "sitelog.md"
  );

  const raw = fs.readFileSync(filePath, "utf8");

  const { data, content } = matter(raw);

  return {
    title: String(data.title ?? "Site Log"),
    summary: data.summary ? String(data.summary) : undefined,
    highlights: Array.isArray(data.highlights)
      ? data.highlights.map((item) => String(item)).filter(Boolean)
      : [],
    updated: data.updated
      ? String(data.updated)
      : undefined,
    html: marked.parse(content) as string,
  };
}

export default function PrivacyPage() {
  const privacy = getPrivacyContent();

  return (
    <main className="min-h-screen bg-[#fcfcfb] px-6 py-12 text-slate-900 sm:px-8 sm:py-16">
      <div className="mx-auto max-w-[42rem]">
        <header className="mb-8">
          
          <h1 className="mt-2 text-[1.85rem] font-semibold tracking-[-0.02em] text-slate-950 sm:text-[2rem]">
            {privacy.title}
          </h1>
          {privacy.summary ? (
            <p className="mt-3 max-w-[34rem] text-[0.98rem] leading-7 text-slate-600">
              {privacy.summary}
            </p>
          ) : null}
          {privacy.updated ? (
            <p className="mt-3 text-[0.82rem] font-medium text-slate-500">
              Last updated {privacy.updated}
            </p>
          ) : null}
        </header>

        {privacy.highlights.length > 0 ? (
          <section className="mb-8 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
            <h2 className="text-[0.82rem] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Key points
            </h2>
            <ul className="mt-3 grid gap-2 text-[0.95rem] leading-7 text-slate-700">
              {privacy.highlights.map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-[0.7rem] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <article
          className="policy-copy"
          dangerouslySetInnerHTML={{ __html: privacy.html }}
        />
      </div>
    </main>
  );
}
