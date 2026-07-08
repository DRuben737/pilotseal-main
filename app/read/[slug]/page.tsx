import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { buildPageMetadata } from "@/lib/seo";
import {
  formatArticleDate,
  getAdjacentArticles,
  getAllArticles,
  getArticleBySlug,
  getRelatedArticles,
  slugifyCategory,
  slugifyTag,
} from "@/lib/articles";

type ReadPostPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return getAllArticles().map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({
  params,
}: ReadPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticleBySlug(slug);

  if (!article) {
    return buildPageMetadata({
      title: "Read",
      description: "PilotSeal aviation notes.",
      path: `/read/${slug}`,
      type: "article",
    });
  }

  return buildPageMetadata({
    title: article.title,
    description: article.summary,
    path: `/read/${article.slug}`,
    type: "article",
  });
}

export default async function ReadPostPage({ params }: ReadPostPageProps) {
  const { slug } = await params;
  const article = getArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  const adjacent = getAdjacentArticles(article.slug);
  const relatedArticles = getRelatedArticles(article, 3, 2);

  return (
    <main id="read-top" className="page-shell read-article-page px-3">
      <article className="read-article-shell">
        <Link href="/read" className="read-back-link">
          Back to Read
        </Link>

        <header className="read-article-head">
          <div className="read-meta-row">
            <time dateTime={article.date}>{formatArticleDate(article.date)}</time>
            {article.updated ? (
              <>
                <span aria-hidden="true">/</span>
                <span>Updated {formatArticleDate(article.updated)}</span>
              </>
            ) : null}
          </div>
          <h1>{article.title}</h1>
          <p>{article.summary}</p>
          <Link className="read-category-link" href={`/read?category=${slugifyCategory(article.category)}`}>
            {article.category}
          </Link>
          <div className="read-chip-row">
            {article.tags.map((tag) => (
              <Link key={tag} href={`/read?tag=${slugifyTag(tag)}`}>
                {tag}
              </Link>
            ))}
          </div>
        </header>

        <div
          className="read-prose"
          dangerouslySetInnerHTML={{ __html: article.html }}
        />
      </article>

      <nav className="read-adjacent" aria-label="Adjacent posts">
        {adjacent.previous ? (
          <Link href={`/read/${adjacent.previous.slug}`}>
            <span>Previous</span>
            {adjacent.previous.title}
          </Link>
        ) : (
          <span />
        )}
        {adjacent.next ? (
          <Link href={`/read/${adjacent.next.slug}`}>
            <span>Next</span>
            {adjacent.next.title}
          </Link>
        ) : (
          <span />
        )}
      </nav>

      {relatedArticles.length ? (
        <section className="read-related" aria-labelledby="more-to-read">
          <p className="read-section-label" id="more-to-read">
            More to read
          </p>
          <div className="read-related-list">
            {relatedArticles.map((related) => (
              <Link key={related.slug} href={`/read/${related.slug}`}>
                <span>{related.title}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <a href="#read-top" className="read-back-to-top" aria-label="Back to top">
        Back to top ↑
      </a>
    </main>
  );
}
