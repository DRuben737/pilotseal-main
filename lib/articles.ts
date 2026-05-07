import "server-only";

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { Marked } from "marked";

export type ArticleMeta = {
  slug: string;
  title: string;
  date: string;
  updated?: string;
  summary: string;
  tags: string[];
  body: string;
};

export type ArticleRecord = ArticleMeta & {
  html: string;
};

export type ArticleTag = {
  slug: string;
  label: string;
  count: number;
};

const READ_DIR = path.join(process.cwd(), "content/read");
const marked = new Marked({
  async: false,
  gfm: true,
  breaks: false,
});

function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

marked.use({
  renderer: {
    link(this: any, token: any) {
      const href = token.href;
      const title = token.title ? ` title="${escapeHtmlAttribute(token.title)}"` : "";
      const text = this.parser.parseInline(token.tokens);
      const isExternal = /^https?:\/\//i.test(href);
      const target = isExternal ? ' target="_blank" rel="noreferrer noopener"' : "";

      return `<a href="${escapeHtmlAttribute(href)}"${title}${target}>${text}</a>`;
    },
  },
});

function getReadDir() {
  if (!fs.existsSync(READ_DIR)) {
    return [];
  }

  return fs.readdirSync(READ_DIR);
}

function normalizeTags(value: unknown) {
  if (Array.isArray(value)) {
    return value.map(String).map((tag) => tag.trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  return [];
}

function readArticleFile(slug: string): ArticleRecord {
  const filePath = path.join(READ_DIR, `${slug}.md`);
  const raw = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(raw);

  return {
    slug,
    title: String(data.title ?? ""),
    date: String(data.date ?? ""),
    updated: data.updated ? String(data.updated) : undefined,
    summary: String(data.summary ?? ""),
    tags: normalizeTags(data.tags),
    body: content.trim(),
    html: marked.parse(content) as string,
  };
}

export function getArticleSlugs() {
  return getReadDir()
    .filter((file) => file.endsWith(".md"))
    .map((file) => file.replace(/\.md$/, ""));
}

export function getAllArticles(): ArticleMeta[] {
  return getArticleSlugs()
    .map((slug) => readArticleFile(slug))
    .map(({ slug, title, date, updated, summary, tags, body }) => ({
      slug,
      title,
      date,
      updated,
      summary,
      tags,
      body,
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getArticleBySlug(slug: string) {
  const filePath = path.join(READ_DIR, `${slug}.md`);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return readArticleFile(slug);
}

export function slugifyTag(tag: string) {
  return tag
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getAllArticleTags(): ArticleTag[] {
  const counts = new Map<string, { label: string; count: number }>();

  for (const article of getAllArticles()) {
    for (const tag of article.tags) {
      const slug = slugifyTag(tag);
      const current = counts.get(slug);
      counts.set(slug, {
        label: current?.label ?? tag,
        count: (current?.count ?? 0) + 1,
      });
    }
  }

  return [...counts.entries()]
    .map(([slug, value]) => ({ slug, ...value }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function getArticlesByTag(tagSlug: string) {
  return getAllArticles().filter((article) =>
    article.tags.some((tag) => slugifyTag(tag) === tagSlug)
  );
}

export function getAdjacentArticles(slug: string) {
  const articles = getAllArticles();
  const index = articles.findIndex((article) => article.slug === slug);

  return {
    previous: index > 0 ? articles[index - 1] : null,
    next: index >= 0 && index < articles.length - 1 ? articles[index + 1] : null,
  };
}

export function getRelatedArticles(article: ArticleMeta, limit = 3, minSharedTags = 1) {
  const articleTagSlugs = new Set(article.tags.map(slugifyTag));

  return getAllArticles()
    .filter((candidate) => candidate.slug !== article.slug)
    .map((candidate) => ({
      article: candidate,
      score: candidate.tags.filter((tag) => articleTagSlugs.has(slugifyTag(tag))).length,
    }))
    .filter((candidate) => candidate.score >= minSharedTags)
    .sort((a, b) => b.score - a.score || new Date(b.article.date).getTime() - new Date(a.article.date).getTime())
    .slice(0, limit)
    .map(({ article: candidate }) => candidate);
}

export function formatArticleDate(date: string) {
  const normalized = String(date ?? "").trim();
  const parsed = normalized.includes("T")
    ? new Date(normalized)
    : new Date(`${normalized}T00:00:00Z`);

  if (Number.isNaN(parsed.getTime())) {
    return normalized || "Unknown date";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}
