import "./globals.css";

export const metadata = {
  title: "PilotSeal | FAA Pilot Tools for CFIs and Student Pilots",
  description:
    "FAA-oriented pilot tools built around FAR 61 regulations. Endorsement generator and training utilities for CFIs and student pilots.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-white text-black">
        <header className="border-b border-gray-200">
          <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
            <a href="/" className="font-semibold">
              PilotSeal
            </a>
            <nav className="flex gap-5 text-sm text-gray-700">
              <a className="hover:underline" href="/tools">Tools</a>
              <a className="hover:underline" href="/endorsements">Endorsements</a>
              <a className="hover:underline" href="/disclaimer">Disclaimer</a>
            </nav>
          </div>
        </header>

        {children}

        <footer className="border-t border-gray-200">
          <div className="max-w-3xl mx-auto px-6 py-8 text-sm text-gray-600">
            <p>© {new Date().getFullYear()} PilotSeal</p>
          </div>
        </footer>
      </body>
    </html>
  );
}