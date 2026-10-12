import type { Metadata } from "next";

import DashboardShell from "@/components/dashboard/DashboardShell";

export const metadata: Metadata = {
  title: {
    default: "PilotSeal Console",
    template: "%s | PilotSeal Console",
  },
};

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
