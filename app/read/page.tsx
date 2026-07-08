import Link from "next/link";
import type { Metadata } from "next";

import {
  articleMatchesSearch,
  formatArticleDate,
  getAllArticles,
  getAllArticleCategories,
  getAllArticleTags,
  getArticleSearchScore,
  slugifyCategory,
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

function getQuestionPreview(questions: string[], query: string) {
  if (!questions.length) {
    return [];
  }

  const queryTokens = query
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);

  if (!queryTokens.length) {
    return questions.slice(0, 2);
  }

  const scoredQuestions = questions
    .map((question, index) => {
      const normalized = question.toLowerCase();
      const score = queryTokens.filter((token) => normalized.includes(token)).length;

      return { question, index, score };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);

  return scoredQuestions
    .filter((question) => question.score > 0)
    .slice(0, 2)
    .map((question) => question.question);
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
  const selectedCategory = getParamValue(resolvedSearchParams.category);
  const selectedTag = getParamValue(resolvedSearchParams.tag);
  const searchQuery = (getParamValue(resolvedSearchParams.q) ?? "").trim();
  const rawPage = Number(getParamValue(resolvedSearchParams.page) ?? "1");
  const currentPage = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;

  const articles = getAllArticles();
  const categories = getAllArticleCategories();
  const tags = getAllArticleTags();
  const filteredArticles = articles
    .filter((article) => {
      const matchesCategory = selectedCategory
        ? slugifyCategory(article.category) === selectedCategory
        : true;
      const matchesTag = selectedTag
        ? article.tags.some((tag) => slugifyTag(tag) === selectedTag)
        : true;
      const matchesSearch = articleMatchesSearch(article, searchQuery);

      return matchesCategory && matchesTag && matchesSearch;
    })
    .sort((a, b) => {
      if (!searchQuery) {
        return 0;
      }

      return getArticleSearchScore(b, searchQuery) - getArticleSearchScore(a, searchQuery);
    });
  const totalPages = Math.ceil(filteredArticles.length / POSTS_PER_PAGE);
  const pageArticles = filteredArticles.slice(
    (currentPage - 1) * POSTS_PER_PAGE,
    currentPage * POSTS_PER_PAGE
  );
  const getPageHref = (page: number) => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    if (selectedCategory) params.set("category", selectedCategory);
    if (selectedTag) params.set("tag", selectedTag);
    if (searchQuery) params.set("q", searchQuery);
    return `/read?${params.toString()}`;
  };

  return (
    <main className="page-shell read-page px-3">
      <div className="read-shell">
        <header className="read-masthead">
          <p>
            Use Read to browse short aviation notes. Pick or search a topic, then open a
            post for the full explanation.
          </p>
          <form className="read-search" action="/read">
            {selectedCategory ? (
              <input type="hidden" name="category" value={selectedCategory} />
            ) : null}
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
          <aside className="read-tags" aria-label="Read categories">
            <p className="read-section-label">Categories</p>
            <Link
              href="/read"
              className={`read-tag-link ${!selectedCategory && !selectedTag ? "is-active" : ""}`}
            >
              <span>All</span>
              <span>{articles.length}</span>
            </Link>
            {categories.map((category) => (
              <Link
                key={category.slug}
                href={`/read?category=${category.slug}`}
                className={`read-tag-link ${
                  selectedCategory === category.slug ? "is-active" : ""
                }`}
              >
                <span>{category.label}</span>
                <span>{category.count}</span>
              </Link>
            ))}
          </aside>

          <section className="read-posts" aria-label="Latest posts">
            <div className="read-posts-head">
              <p className="read-section-label">
                {searchQuery
                  ? "Search results"
                  : selectedCategory
                    ? categories.find((category) => category.slug === selectedCategory)?.label ?? "Category"
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
                      <Link className="read-category-link" href={`/read?category=${slugifyCategory(article.category)}`}>
                        {article.category}
                      </Link>
                      <h2>
                        <Link href={`/read/${article.slug}`}>{article.title}</Link>
                      </h2>
                      <p>{article.summary}</p>
                      <p className="read-answer-preview">
                        <span>Answer:</span> {article.quickAnswer}
                      </p>
                      {getQuestionPreview(article.questions, searchQuery).length ? (
                        <div className="read-question-preview" aria-label="Questions answered">
                          {getQuestionPreview(article.questions, searchQuery).map((question) => (
                            <span key={question}>{question}</span>
                          ))}
                        </div>
                      ) : null}
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
