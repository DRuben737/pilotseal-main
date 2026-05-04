import Link from "next/link";
import type { Metadata } from "next";

import {
  formatArticleDate,
  getAllArticles,
  getAllArticleTags,
  slugifyTag,
} from "@/lib/articles";
import { buildPageMetadata } from "@/lib/seo";

type SearchParamsValue = string | string[] | undefined;

type ReadPageProps = {
  searchParams?: Promise<Record<string, SearchParamsValue>>;
};

const POSTS_PER_PAGE = 8;

function getParamValue(value: SearchParamsValue) {
  return Array.isArray(value) ? value[0] : value;
}

export const metadata: Metadata = buildPageMetadata({
  title: "Read",
  description:
    "FAA-oriented notes on aviation training, pilot currency, and practical instructor workflows.",
  path: "/read",
  type: "website",
});

export default async function ReadPage({ searchParams }: ReadPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const selectedTag = getParamValue(resolvedSearchParams.tag);
  const searchQuery = (getParamValue(resolvedSearchParams.q) ?? "").trim();
  const normalizedSearchQuery = searchQuery.toLowerCase();
  const rawPage = Number(getParamValue(resolvedSearchParams.page) ?? "1");
  const currentPage = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;

  const articles = getAllArticles();
  const tags = getAllArticleTags();
  const filteredArticles = articles.filter((article) => {
    const matchesTag = selectedTag
      ? article.tags.some((tag) => slugifyTag(tag) === selectedTag)
      : true;
    const searchableText = [
      article.title,
      article.summary,
      article.tags.join(" "),
      article.body,
    ]
      .join(" ")
      .toLowerCase();
    const matchesSearch = normalizedSearchQuery
      ? searchableText.includes(normalizedSearchQuery)
      : true;

    return matchesTag && matchesSearch;
  });
  const totalPages = Math.ceil(filteredArticles.length / POSTS_PER_PAGE);
  const pageArticles = filteredArticles.slice(
    (currentPage - 1) * POSTS_PER_PAGE,
    currentPage * POSTS_PER_PAGE
  );
  const getPageHref = (page: number) => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    if (selectedTag) params.set("tag", selectedTag);
    if (searchQuery) params.set("q", searchQuery);
    return `/read?${params.toString()}`;
  };

  return (
    <main className="page-shell read-page px-3">
      <div className="read-shell">
        <header className="read-masthead">
          <p>
            Use Read to browse short aviation notes. Pick a topic, then open a
            post for the full explanation.
          </p>
          <form className="read-search" action="/read">
            {selectedTag ? (
              <input type="hidden" name="tag" value={selectedTag} />
            ) : null}
            <input
              type="search"
              name="q"
              placeholder="Search tags or keywords"
              defaultValue={searchQuery}
              aria-label="Search Read"
            />
            <button type="submit">Search</button>
          </form>
        </header>

        <div className="read-layout">
          <aside className="read-tags" aria-label="Read tags">
            <p className="read-section-label">Topics</p>
            <Link
              href="/read"
              className={`read-tag-link ${!selectedTag ? "is-active" : ""}`}
            >
              <span>All</span>
              <span>{articles.length}</span>
            </Link>
            {tags.map((tag) => (
              <Link
                key={tag.slug}
                href={`/read?tag=${tag.slug}`}
                className={`read-tag-link ${
                  selectedTag === tag.slug ? "is-active" : ""
                }`}
              >
                <span>{tag.label}</span>
                <span>{tag.count}</span>
              </Link>
            ))}
          </aside>

          <section className="read-posts" aria-label="Latest posts">
            <div className="read-posts-head">
              <p className="read-section-label">
                {searchQuery
                  ? "Search results"
                  : selectedTag
                    ? tags.find((tag) => tag.slug === selectedTag)?.label ?? "Topic"
                    : "Latest"}
              </p>
              {selectedTag || searchQuery ? <Link href="/read">Clear filter</Link> : null}
            </div>

            {pageArticles.length ? (
              <div className="read-post-list">
                {pageArticles.map((article) => (
                  <article key={article.slug} className="read-post-item">
                    <time dateTime={article.date}>{formatArticleDate(article.date)}</time>
                    <div>
                      <h2>
                        <Link href={`/read/${article.slug}`}>{article.title}</Link>
                      </h2>
                      <p>{article.summary}</p>
                      <div className="read-chip-row">
                        {article.tags.map((tag) => (
                          <Link key={tag} href={`/read?tag=${slugifyTag(tag)}`}>
                            {tag}
                          </Link>
                        ))}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="read-empty">
                <h2>No posts found</h2>
                <p>This topic does not have any published notes yet.</p>
                <Link href="/read">Back to all posts</Link>
              </div>
            )}

            {totalPages > 1 ? (
              <nav className="read-pagination" aria-label="Read pagination">
                {currentPage > 1 ? (
                  <Link href={getPageHref(currentPage - 1)}>
                    Previous
                  </Link>
                ) : (
                  <span>Previous</span>
                )}
                <span>
                  {currentPage} / {totalPages}
                </span>
                {currentPage < totalPages ? (
                  <Link href={getPageHref(currentPage + 1)}>
                    Next
                  </Link>
                ) : (
                  <span>Next</span>
                )}
              </nav>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
