export default function Home() {
  return (
    <main className="min-h-screen bg-white text-black px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-5xl font-bold tracking-tight">
          PilotSeal
        </h1>

        <p className="mt-6 text-lg text-gray-700">
          FAA-oriented pilot tools built around FAR 61 regulations.
          Designed for CFIs and student pilots.
        </p>

        <div className="mt-8 flex gap-4">
          <a
            href="https://tool.pilotseal.com"
            className="px-5 py-3 rounded-xl bg-black text-white"
          >
            Use the Tools
          </a>

          <a
            href="/tools"
            className="px-5 py-3 rounded-xl border border-gray-300"
          >
            Explore Tools
          </a>
        </div>

        <div className="mt-16 border-t pt-8 text-sm text-gray-500">
          <p>
            PilotSeal provides educational resources and aviation tools.
            Always verify against official FAA regulations.
          </p>
        </div>
      </div>
    </main>
  );
}