"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { primaryToolKeys, toolEmbedConfig } from "@/app/tools/tool-config";

export default function ToolQuickSwitcher({ currentToolKey }: { currentToolKey: string }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const activeItem = activeItemRef.current;
    if (!scroller || !activeItem) return;

    const targetLeft = activeItem.offsetLeft - (scroller.clientWidth - activeItem.offsetWidth) / 2;
    scroller.scrollTo({ left: Math.max(0, targetLeft), behavior: "instant" });
  }, [currentToolKey]);

  return (
    <div className="tool-switcher-shell" ref={scrollerRef}>
      <nav className="tool-switcher" aria-label="Switch tools">
        {primaryToolKeys.map((key) => {
          const active = key === currentToolKey;
          return (
            <Link
              key={key}
              ref={active ? activeItemRef : undefined}
              href={`/tools/${key}`}
              className="tool-switcher-link"
              aria-current={active ? "page" : undefined}
            >
              {toolEmbedConfig[key].title}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
