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
      <header className="bg-black text-white">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="font-semibold text-white">
            PilotSeal
          </a>

          <nav className="flex gap-6 text-sm">
            <a className="text-gray-300 hover:text-white transition-colors" href="/tools">
              Tools
            </a>
            <a className="text-gray-300 hover:text-white transition-colors" href="/endorsements">
              Endorsements
            </a>
            <a className="text-gray-300 hover:text-white transition-colors" href="/about">
              About
            </a>
            <a className="text-gray-300 hover:text-white transition-colors" href="/disclaimer">
              Disclaimer
            </a>
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