"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import styles from "./CollapsibleMobileNav.module.css";

export default function CollapsibleMobileNav({ label, floating = false, desktopVisible = false, children }: {
  label: string; floating?: boolean; desktopVisible?: boolean; children: ReactNode;
}) {
  const pathname = usePathname();
  const [expandedPath, setExpandedPath] = useState<string | null>(null);
  const expanded = expandedPath === pathname;
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLButtonElement>(null);
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);

  useEffect(() => {
    if (!expanded) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setExpandedPath(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setExpandedPath(null); handle.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [expanded]);

  return <div ref={root} className={`${styles.root} ${floating ? styles.floating : ""} ${desktopVisible ? styles.desktopVisible : ""}`}>
    <button ref={handle} type="button" className={styles.handle} aria-expanded={expanded} aria-controls={id}
      aria-label={`${label}: pull down or tap to ${expanded ? "collapse" : "expand"}`}
      onPointerDown={(event) => {
        gesture.current = { x: event.clientX, y: event.clientY }; dragged.current = false;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={(event) => {
        const start = gesture.current; gesture.current = null;
        if (!start) return;
        const dy = event.clientY - start.y;
        if (Math.abs(dy) >= 14 && Math.abs(dy) > Math.abs(event.clientX - start.x)) {
          dragged.current = true; setExpandedPath(dy > 0 ? pathname : null);
        }
      }}
      onPointerCancel={() => { gesture.current = null; dragged.current = false; }}
      onClick={() => {
        if (dragged.current) { dragged.current = false; return; }
        setExpandedPath(expanded ? null : pathname);
      }}>
      <span>{label}</span><span aria-hidden="true">{expanded ? "▴" : "▾"}</span>
    </button>
    <div id={id} hidden={!desktopVisible && !expanded} className={`${styles.panel} ${!expanded ? styles.collapsed : ""}`} onClick={(event) => {
      if ((event.target as Element).closest("a, button")) setExpandedPath(null);
    }}>{children}</div>
  </div>;
}
