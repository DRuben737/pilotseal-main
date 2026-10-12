"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function RecordMenu({ label, disabled = false, children }: { label: string; disabled?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  const contentId = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && ref.current && !ref.current.contains(event.target)) ref.current.open = false; };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  function close() { if (ref.current) { ref.current.open = false; ref.current.querySelector("summary")?.focus(); } }
  return <details ref={ref} className="relative shrink-0" onToggle={event => setOpen(event.currentTarget.open)}
    onClickCapture={event => { if (event.target instanceof Element && event.target.closest("button")) close(); }}
    onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); close(); } }}>
    <summary role="button" aria-label={label} aria-expanded={open} aria-controls={contentId} aria-disabled={disabled}
      onClick={event => { if (disabled) event.preventDefault(); }} onKeyDown={event => { if (disabled && ["Enter", " "].includes(event.key)) event.preventDefault(); }}
      className={`cursor-pointer list-none rounded-sm border border-slate-200 px-2 py-1 text-sm ${disabled ? "opacity-50" : "hover:bg-slate-100"}`}>⋯</summary>
    <div id={contentId} className="absolute right-0 z-20 mt-1 min-w-32 border border-slate-200 bg-white p-1 text-slate-900 shadow-lg">{children}</div>
  </details>;
}
