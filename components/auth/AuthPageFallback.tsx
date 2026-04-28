export default function AuthPageFallback() {
  return (
    <main className="page-shell px-3">
      <div className="site-shell page-stack">
        <section className="grid min-h-[calc(100vh-11rem)] items-center gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
          <div className="rounded-[2rem] border border-slate-200/80 bg-[linear-gradient(145deg,#0b1f40,#123a75)] px-8 py-12 text-white">
            <p className="eyebrow">PilotSeal access</p>
            <h1 className="mt-6 text-4xl font-semibold tracking-[-0.05em]">
              Loading workspace access
            </h1>
            <p className="mt-4 max-w-xl text-base leading-8 text-white/72">
              Preparing the authentication flow for your dashboard session.
            </p>
          </div>

          <div className="lg:border-l lg:border-slate-200/70 lg:pl-8">
            <p className="text-sm leading-7 text-slate-500">
              Loading authentication form...
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
