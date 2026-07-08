import "server-only";

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { Marked, type Renderer, type Tokens } from "marked";

export type ArticleMeta = {
  slug: string;
  title: string;
  date: string;
  updated?: string;
  summary: string;
  category: string;
  tags: string[];
  questions: string[];
  quickAnswer: string;
  rank: number;
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

export type ArticleCategory = ArticleTag;

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
    link(this: Renderer, token: Tokens.Link) {
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

function normalizeStringList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeCategory(value: unknown, tags: string[]) {
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }

  return tags[0] ?? "General";
}

function normalizeInlineMarkdown(value: string) {
  return value
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSectionFirstParagraph(content: string, headingPattern: RegExp) {
  const lines = content.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => headingPattern.test(line.trim()));

  if (headingIndex < 0) {
    return "";
  }

  const paragraph: string[] = [];

  for (const line of lines.slice(headingIndex + 1)) {
    const trimmed = line.trim();

    if (/^#{1,6}\s+/.test(trimmed)) {
      break;
    }

    if (!trimmed || trimmed === "---") {
      if (paragraph.length) break;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      continue;
    }

    paragraph.push(trimmed);
  }

  return normalizeInlineMarkdown(paragraph.join(" "));
}

function extractQuickAnswer(content: string, summary: string) {
  const answer =
    extractSectionFirstParagraph(content, /^#{1,6}\s+(Key Conclusion|Practical takeaway|One-Sentence Summary)\s*$/i) ||
    extractSectionFirstParagraph(content, /^#{1,6}\s+(FAA Interpretation|Core Logic|Why It Matters)\s*$/i);

  return answer || summary;
}

function tokenizeSearchQuery(query: string) {
  const stopWords = new Set([
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "can",
    "do",
    "does",
    "for",
    "from",
    "how",
    "i",
    "in",
    "is",
    "it",
    "may",
    "of",
    "on",
    "or",
    "the",
    "to",
    "under",
    "what",
    "when",
    "who",
    "with",
  ]);

  return query
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !stopWords.has(token));
}

function normalizeRank(value: unknown) {
  const rank = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : 0;

  return Number.isFinite(rank) ? rank : 0;
}

function getArticleTimestamp(article: Pick<ArticleMeta, "date">) {
  const timestamp = new Date(article.date).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortArticlesByRank(a: ArticleMeta, b: ArticleMeta) {
  return b.rank - a.rank || getArticleTimestamp(b) - getArticleTimestamp(a) || a.title.localeCompare(b.title);
}

function readArticleFile(slug: string): ArticleRecord {
  const filePath = path.join(READ_DIR, `${slug}.md`);
  const raw = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(raw);

  const tags = normalizeTags(data.tags);
  const questions = normalizeStringList(data.questions);
  const summary = String(data.summary ?? "");

  return {
    slug,
    title: String(data.title ?? ""),
    date: String(data.date ?? ""),
    updated: data.updated ? String(data.updated) : undefined,
    summary,
    category: normalizeCategory(data.category, tags),
    tags,
    questions,
    quickAnswer: extractQuickAnswer(content, summary),
    rank: normalizeRank(data.rank),
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
    .map(({ slug, title, date, updated, summary, category, tags, questions, quickAnswer, rank, body }) => ({
      slug,
      title,
      date,
      updated,
      summary,
      category,
      tags,
      questions,
      quickAnswer,
      rank,
      body,
    }))
    .sort(sortArticlesByRank);
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

export const slugifyCategory = slugifyTag;

export function getAllArticleCategories(): ArticleCategory[] {
  const counts = new Map<string, { label: string; count: number }>();

  for (const article of getAllArticles()) {
    const slug = slugifyCategory(article.category);
    const current = counts.get(slug);
    counts.set(slug, {
      label: current?.label ?? article.category,
      count: (current?.count ?? 0) + 1,
    });
  }

  return [...counts.entries()]
    .map(([slug, value]) => ({ slug, ...value }))
    .sort((a, b) => a.label.localeCompare(b.label));
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

export function getArticlesByCategory(categorySlug: string) {
  return getAllArticles().filter((article) =>
    slugifyCategory(article.category) === categorySlug
  );
}

export function articleMatchesSearch(article: ArticleMeta, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  const searchableText = [
    article.title,
    article.questions.join(" "),
    article.summary,
    article.quickAnswer,
    article.category,
    article.tags.join(" "),
    article.body,
  ]
    .join(" ")
    .toLowerCase();

  if (searchableText.includes(normalizedQuery)) {
    return true;
  }

  const queryTokens = tokenizeSearchQuery(normalizedQuery);

  if (!queryTokens.length) {
    return true;
  }

  const matchedTokens = queryTokens.filter((token) => searchableText.includes(token));
  const minimumMatches = queryTokens.length <= 2 ? queryTokens.length : Math.ceil(queryTokens.length * 0.7);

  return matchedTokens.length >= minimumMatches;
}

export function getArticleSearchScore(article: ArticleMeta, query: string) {
  const queryTokens = tokenizeSearchQuery(query);

  if (!queryTokens.length) {
    return 0;
  }

  const weightedFields = [
    { value: article.title, weight: 8 },
    { value: article.questions.join(" "), weight: 10 },
    { value: article.quickAnswer, weight: 7 },
    { value: article.summary, weight: 5 },
    { value: article.category, weight: 4 },
    { value: article.tags.join(" "), weight: 4 },
    { value: article.body, weight: 1 },
  ];

  return weightedFields.reduce((score, field) => {
    const text = field.value.toLowerCase();
    const matches = queryTokens.filter((token) => text.includes(token)).length;

    return score + matches * field.weight;
  }, 0);
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
    .sort((a, b) => b.score - a.score || sortArticlesByRank(a.article, b.article))
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
