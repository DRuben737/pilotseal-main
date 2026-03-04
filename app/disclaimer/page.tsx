import Link from "next/link";

export default function DisclaimerPage() {
  return (
    <main className="min-h-screen bg-white text-black px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold tracking-tight">Disclaimer</h1>

        <p className="mt-6 text-gray-700">
          PilotSeal is provided for educational and informational purposes only.
          It does not replace official FAA regulations, guidance, training
          materials, or the judgment of a certificated flight instructor.
        </p>

        <h2 className="mt-10 text-2xl font-semibold">No regulatory guarantee</h2>
        <p className="mt-3 text-gray-700">
          Regulations, policy, and guidance can change. You are responsible for
          verifying that any output, endorsement wording, procedures, or
          recommendations are accurate and applicable to your specific
          situation, and consistent with current FAA requirements (including
          FAR/AIM and any relevant FAA guidance).
        </p>

        <h2 className="mt-10 text-2xl font-semibold">No liability</h2>
        <p className="mt-3 text-gray-700">
          By using this site and any associated tools, you agree that PilotSeal
          and its authors are not liable for any losses, damages, or claims
          arising from use of the site, tools, or generated content.
        </p>

        <h2 className="mt-10 text-2xl font-semibold">Not legal advice</h2>
        <p className="mt-3 text-gray-700">
          Nothing on this site constitutes legal advice. If you need an official
          interpretation, consult the FAA or qualified professionals.
        </p>

        <div className="mt-12 border-t pt-8 text-sm text-gray-600">
          <Link className="underline" href="/">
            ← Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
