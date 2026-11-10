"use client";

import Image from "next/image";

import authWorkspaceImage from "@/images/pilotseal-valley-background-v2.jpg";

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
        <section className="auth-shell">
          <div className="auth-shell-media">
            <Image
              src={authWorkspaceImage}
              alt="Mountain valley viewed from the air"
              fill
              sizes="(min-width: 960px) 45vw, 0px"
              priority={imagePriority}
            />
          </div>

          <div className="auth-shell-panel">
            <div className="auth-shell-content space-y-6">{children}</div>
          </div>
        </section>
      </div>
    </main>
  );
}
