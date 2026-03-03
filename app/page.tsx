export default function Home() {
  const highlights = [
    {
      title: "Built for CFIs & student pilots",
      desc: "Aviation tools designed for real training workflows—clear, consistent, and practical.",
    },
    {
      title: "Compliance-first mindset",
      desc: "Centered around FAR 61 concepts and good recordkeeping habits. Always verify against official FAA references.",
    },
    {
      title: "Tools + guidance (not just buttons)",
      desc: "The main site documents what each tool is for; the Tool Hub runs the applications.",
    },
  ];

  const featuredTools = [
    {
      name: "Endorsement Generator",
      desc:
        "Generate consistent FAA-style logbook endorsement wording aligned with FAR 61 concepts. Reduce omissions and formatting inconsistencies.",
      href: "https://tool.pilotseal.com/endorsement-generator",
    },
    {
      name: "Flight Brief",
      desc:
        "Structured preflight briefing workflow for training scenarios—designed to support decision-making and instructional consistency.",
      href: "https://tool.pilotseal.com/flight-brief",
    },
    {
      name: "Weight & Balance",
      desc:
        "Quick weight and balance calculations for training aircraft. Designed to reinforce performance awareness during instruction.",
      href: "https://tool.pilotseal.com/wb",
    },
  ];

  return (
    <main className="min-h-screen bg-white text-black px-6 py-16">
      <div className="max-w-3xl mx-auto">
        {/* Hero */}
        <h1 className="text-5xl font-bold tracking-tight">PilotSeal</h1>
        <p className="mt-6 text-lg text-gray-700">
          FAA-oriented pilot tools for CFIs and student pilots — including endorsement generation,
          structured flight brief workflows, and weight &amp; balance utilities.
        </p>

        <div className="mt-8 flex gap-4 flex-wrap">
          <a
            href="https://tool.pilotseal.com"
            className="px-5 py-3 rounded-xl bg-black text-white"
          >
            Open Tool Hub →
          </a>
          <a
            href="/tools"
            className="px-5 py-3 rounded-xl border border-gray-300"
          >
            Tools Overview
          </a>
          <a
            href="/endorsements"
            className="px-5 py-3 rounded-xl border border-gray-300"
          >
            Endorsements Guide
          </a>
        </div>

        {/* Highlights */}
        <section className="mt-14">
          <h2 className="text-2xl font-semibold">What PilotSeal is</h2>
          <div className="mt-6 grid gap-4">
            {highlights.map((h) => (
              <div
                key={h.title}
                className="rounded-2xl border border-gray-200 p-6"
              >
                <h3 className="text-lg font-semibold">{h.title}</h3>
                <p className="mt-2 text-gray-700">{h.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Featured tools */}
        <section className="mt-14">
          <h2 className="text-2xl font-semibold">Featured tools</h2>
          <p className="mt-3 text-gray-700">
            Jump straight into the tools, then use the guides to understand the structure behind
            common endorsements and training workflows.
          </p>

          <div className="mt-6 grid gap-4">
            {featuredTools.map((t) => (
              <div
                key={t.name}
                className="rounded-2xl border border-gray-200 p-6"
              >
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <h3 className="text-lg font-semibold">{t.name}</h3>
                    <p className="mt-2 text-gray-700">{t.desc}</p>
                  </div>
                  <a
                    className="text-sm font-medium underline whitespace-nowrap"
                    href={t.href}
                  >
                    Open →
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Regulatory focus */}
        <section className="mt-14">
          <h2 className="text-2xl font-semibold">Regulatory focus</h2>
          <p className="mt-3 text-gray-700">
            PilotSeal tools are built with awareness of FAA Part 61 training structures and common
            endorsement workflows. The goal is clarity and consistency — not legal substitution.
          </p>
          <p className="mt-3 text-gray-700">
            Instructors remain responsible for verifying applicability, aircraft category/class,
            limitations, and current FAA requirements.
          </p>
        </section>

        {/* Compliance note */}
        <section className="mt-14 rounded-2xl border border-gray-200 p-6">
          <h2 className="text-xl font-semibold">Compliance note</h2>
          <p className="mt-3 text-gray-700">
            PilotSeal is provided for educational purposes and does not replace official FAA
            regulations, guidance, or instructor judgment. Always verify applicability and currency
            for your scenario.
          </p>
          <a
            className="mt-4 inline-block text-sm font-medium underline"
            href="/disclaimer"
          >
            Read the disclaimer →
          </a>
        </section>
      </div>
    </main>
  );
}