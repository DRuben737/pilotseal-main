"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">{eyebrow}</p> : null}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
        {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function AdminCollapsibleSection({
  id,
  title,
  description,
  summary,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  summary?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const contentId = `${id}-content`;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
      <button
        type="button"
        className="group flex min-h-20 w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 sm:px-5"
        aria-expanded={open}
        aria-controls={contentId}
        aria-label={`${open ? "Collapse" : "Expand"} ${title}`}
        title={open ? `Collapse ${title}` : `Expand ${title}`}
        onClick={onToggle}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-950 sm:text-base">{title}</span>
          {description ? <span className="mt-1 block text-sm leading-5 text-slate-500">{description}</span> : null}
        </span>
        {summary ? <span className="hidden shrink-0 text-right text-xs font-semibold text-slate-500 sm:block">{summary}</span> : null}
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition group-hover:border-slate-300 group-hover:text-blue-700" aria-hidden="true">
          <svg viewBox="0 0 20 20" fill="none" className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}>
            <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {open ? (
        <div id={contentId} className="border-t border-slate-200 bg-slate-50/35 p-4 sm:p-5">
          {children}
        </div>
      ) : null}
    </section>
  );
}

export function AdminSectionControls({
  expanded,
  onToggleAll,
}: {
  expanded: boolean;
  onToggleAll: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggleAll}
      aria-label={expanded ? "Collapse all sections" : "Expand all sections"}
      title={expanded ? "Collapse all sections" : "Expand all sections"}
      className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
    >
      {expanded ? (
        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
          <path d="m6 8 4-4 4 4M6 12l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
          <path d="m6 4 4 4 4-4M6 16l4-4 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

export function FilterToolbar({ children, resultLabel }: { children: ReactNode; resultLabel?: string }) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/70 p-3 lg:flex-row lg:items-center">
      <div className="grid flex-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap">{children}</div>
      {resultLabel ? <p className="shrink-0 text-xs font-medium text-slate-500">{resultLabel}</p> : null}
    </div>
  );
}

export function AdminDataTable({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
      <div className="overflow-x-auto">
        <table aria-label={label} className="w-full min-w-[820px] border-collapse text-left text-sm">
          {children}
        </table>
      </div>
    </div>
  );
}

const badgeStyles = {
  neutral: "border-slate-200 bg-slate-100 text-slate-700",
  info: "border-blue-200 bg-blue-50 text-blue-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
};

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: keyof typeof badgeStyles;
}) {
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold ${badgeStyles[tone]}`}>{children}</span>;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="px-6 py-14 text-center">
      <div aria-hidden="true" className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500">—</div>
      <h2 className="mt-3 text-sm font-semibold text-slate-900">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{description}</p>
    </div>
  );
}

export function DetailDrawer({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <button aria-label="Close details" className="absolute inset-0 cursor-default bg-slate-950/35" onClick={onClose} />
      <section role="dialog" aria-modal="true" aria-labelledby="admin-drawer-title" className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="admin-drawer-title" className="text-lg font-semibold text-slate-950">{title}</h2>
            {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
          </div>
          <button autoFocus type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-xl text-slate-600 hover:bg-slate-50" aria-label="Close">×</button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </section>
    </div>
  );
}

export function BulkActionBar({ count, children, onClear }: { count: number; children: ReactNode; onClear: () => void }) {
  if (!count) return null;
  return (
    <div className="sticky bottom-4 z-30 mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white shadow-2xl sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm font-semibold">{count} aircraft selected</p>
      <div className="flex flex-wrap items-center gap-2">{children}<button type="button" onClick={onClear} className="min-h-10 rounded-xl px-3 text-sm text-slate-300 hover:bg-white/10 hover:text-white">Clear</button></div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy,
  destructive,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/45 p-4">
      <section role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <h2 id="confirm-title" className="text-lg font-semibold text-slate-950">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={onCancel} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="button" disabled={busy} onClick={onConfirm} className={`min-h-11 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-60 ${destructive ? "bg-rose-600 hover:bg-rose-700" : "bg-blue-600 hover:bg-blue-700"}`}>{busy ? "Saving…" : confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}
