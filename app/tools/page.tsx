export default function ToolsPage() {
  const tools = [
    {
      name: "Endorsement Generator",
      desc:
        "Generate FAA-style logbook endorsement text and keep your workflow consistent. Always verify against FAR 61 and current guidance.",
      href: "https://tool.pilotseal.com/",
    },
    {
      name: "Flight Brief / Planning Tools",
      desc:
        "A collection of planning utilities intended to support preflight preparation and decision-making.",
      href: "https://tool.pilotseal.com/",
    },
    {
      name: "More Tools (Hub)",
      desc:
        "All tools are hosted on the Tool Hub. This page explains what they do and who they are for.",
      href: "https://tool.pilotseal.com/",
    },
  ];

  return (
    <main className="min-h-screen bg-white text-black px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold tracking-tight">Tools</h1>
        <p className="mt-4 text-lg text-gray-700">
          PilotSeal tools are built for CFIs and student pilots. The Tool Hub
          hosts the actual applications; this page documents what each tool is
          for and links you to the right place.
        </p>

        <div className="mt-10 space-y-6">
          {tools.map((t) => (
            <div key={t.name} className="rounded-2xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold">{t.name}</h2>
              <p className="mt-2 text-gray-700">{t.desc}</p>
              <a
                className="mt-4 inline-block text-sm font-medium underline"
                href={t.href}
              >
                Open Tool Hub →
              </a>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t pt-8 text-sm text-gray-600">
          <p className="font-medium">Compliance note</p>
          <p className="mt-2">
            PilotSeal is provided for educational purposes. It does not replace
            official FAA regulations, guidance, or flight instructor judgment.
            Always verify wording and applicability for your scenario.
          </p>
        </div>
      </div>
    </main>
  );
}
