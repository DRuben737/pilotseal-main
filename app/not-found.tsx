import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page-shell px-3">
      <div className="site-shell page-stack">
        <section className="saas-empty-page">
          <p className="eyebrow">404</p>
          <h1 className="saas-empty-page-title">This page could not be found.</h1>
          <p className="saas-empty-page-copy">
            The page may have moved, or the link is no longer valid.
          </p>
          <div className="saas-empty-page-actions">
            <Link href="/" className="site-nav-inline-link site-nav-inline-link-active">
              Back home
            </Link>
            <Link href="/tools" className="site-nav-inline-link">
              Browse tools
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
