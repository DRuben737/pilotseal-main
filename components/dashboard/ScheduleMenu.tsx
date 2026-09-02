"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import styles from "./CfiScheduleManager.module.css";

export type ScheduleMenuAction = { label: string; onSelect: () => void; disabled?: boolean; danger?: boolean };

export default function ScheduleMenu({ label, icon, actions, disabled = false }: {
  label: string; icon: ReactNode; actions: ScheduleMenuAction[]; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return <div ref={root} className={styles.menu}>
    <button ref={trigger} type="button" className={styles.iconButton} aria-label={label} title={label}
      disabled={disabled} aria-haspopup="menu" aria-expanded={open} aria-controls={id}
      onClick={() => setOpen(!open)} onKeyDown={(event) => {
        if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); }
      }}>{icon}</button>
    {open ? <div ref={panel} id={id} role="menu" aria-label={label} className={styles.menuPanel} onKeyDown={(event) => {
      const buttons = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
      if (event.key === "Tab") { setOpen(false); trigger.current?.focus(); }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) && buttons.length) {
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    }}>{actions.map((action) => <button type="button" role="menuitem" key={action.label} disabled={action.disabled}
      className={action.danger ? styles.danger : undefined} onClick={() => {
        // Restore a persistent opener before mounting a modal drawer.
        trigger.current?.focus(); setOpen(false); action.onSelect();
      }}>{action.label}</button>)}</div> : null}
  </div>;
}
