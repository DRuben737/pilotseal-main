export default function AuthPageFallback() {
  return (
    <main className="page-shell px-3">
      <div className="site-shell page-stack">
        <section className="saas-auth-grid">
          <div className="saas-auth-aside">
            <p className="eyebrow">PilotSeal access</p>
            <h1 className="saas-auth-title">Loading workspace access</h1>
            <p className="saas-auth-copy">
              Preparing the authentication flow for your dashboard session.
            </p>
          </div>

          <div className="saas-auth-card">
            <p className="saas-feedback saas-feedback-info">Loading authentication form...</p>
          </div>
        </section>
      </div>
    </main>
  );
}
