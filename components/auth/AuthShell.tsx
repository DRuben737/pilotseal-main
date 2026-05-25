"use client";

import Image from "next/image";

import authWorkspaceImage from "@/images/auth-workspace-illustration.png";

export default function AuthShell({
  children,
  imagePriority = false,
}: {
  children: React.ReactNode;
  imagePriority?: boolean;
}) {
  return (
    <main className="page-shell px-3">
      <div className="site-shell page-stack">
        <section className="grid gap-8 lg:min-h-[calc(100vh-11rem)] lg:grid-cols-[minmax(260px,420px)_minmax(360px,0.9fr)] lg:items-center">
          <div className="relative hidden min-h-[24rem] overflow-hidden rounded-[1.25rem] border border-slate-200/80 lg:block">
            <div className="absolute inset-0">
              <Image
                src={authWorkspaceImage}
                alt="PilotSeal workspace illustration"
                className="h-full w-full object-cover"
                priority={imagePriority}
              />
            </div>
            <div className="absolute inset-0 bg-[linear-gradient(140deg,rgba(8,22,45,0.92),rgba(18,58,117,0.76),rgba(255,255,255,0.08))]" />
          </div>

          <div className="flex items-start lg:items-center lg:border-l lg:border-slate-200/70 lg:pl-8">
            <div className="w-full max-w-md space-y-6">{children}</div>
          </div>
        </section>
      </div>
    </main>
  );
}
