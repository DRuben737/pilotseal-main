"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
    <header className="admin-page-header flex min-h-14 flex-col gap-2 border-b border-slate-200 bg-white py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{eyebrow}</p> : null}
        <h1 className="truncate text-lg font-semibold tracking-tight text-slate-950">{title}</h1>
        {description ? <p className="mt-0.5 max-w-3xl text-xs leading-5 text-slate-500">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function HelpDrawer({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <DetailDrawer open={open} title={title} onClose={onClose}>
      <div className="space-y-4 text-sm leading-6 text-slate-700">{children}</div>
    </DetailDrawer>
  );
}

export function ManagementDisclosure({
  id,
  eyebrow,
  title,
  summary,
  actions,
  children,
  className = "",
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  summary?: ReactNode;
  actions?: ReactNode;
  helpTitle?: string;
  helpContent?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  openOnAction?: boolean;
  className?: string;
}) {
  const generatedId = useId();
  const contentId = id ? `${id}-content` : `${generatedId}-content`;

  return (
    <section className={`management-disclosure min-w-0 max-w-full ${className}`} aria-label={title}>
      {actions ? <div className="management-disclosure-header admin-flat-actions flex min-h-10 items-center justify-end border-b border-slate-200 bg-white px-3 py-1.5">{actions}</div> : null}
      <span className="sr-only">{eyebrow ? `${eyebrow}: ` : ""}{title}{summary ? `, ${summary}` : ""}</span>
      <div id={contentId} className="management-disclosure-content min-w-0">{children}</div>
    </section>
  );
}

export function ManagementTabs({
  id,
  label,
  items,
  activeId,
  onChange,
  actions,
  children,
}: {
  id: string;
  label: string;
  items: ReadonlyArray<{ id: string; label: string; summary?: ReactNode }>;
  activeId: string;
  onChange: (id: string) => void;
  actions?: ReactNode;
  helpTitle?: string;
  helpContent?: ReactNode;
  children: ReactNode;
}) {
  const activeIndex = Math.max(0, items.findIndex((item) => item.id === activeId));
  const activeItem = items[activeIndex] ?? items[0];

  function focusTab(index: number) {
    const item = items[index];
    if (!item) return;
    onChange(item.id);
    requestAnimationFrame(() => document.getElementById(`${id}-tab-${item.id}`)?.focus());
  }

  return (
    <section className="management-tabs min-w-0">
      <div className="flex min-h-10 flex-col border-b border-slate-200 bg-white sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 overflow-x-auto" role="tablist" aria-label={label}>
          <div className="flex min-w-max items-stretch">
            {items.map((item, index) => {
              const selected = item.id === activeItem?.id;
              return (
                <button
                  key={item.id}
                  id={`${id}-tab-${item.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`${id}-panel`}
                  tabIndex={selected ? 0 : -1}
                  className={`flex min-h-10 items-center gap-2 border-b-2 px-3 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 ${
                    selected
                      ? "border-blue-600 text-blue-700"
                      : "border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                  }`}
                  onClick={() => onChange(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowRight") {
                      event.preventDefault();
                      focusTab((index + 1) % items.length);
                    } else if (event.key === "ArrowLeft") {
                      event.preventDefault();
                      focusTab((index - 1 + items.length) % items.length);
                    } else if (event.key === "Home") {
                      event.preventDefault();
                      focusTab(0);
                    } else if (event.key === "End") {
                      event.preventDefault();
                      focusTab(items.length - 1);
                    }
                  }}
                >
                  <span>{item.label}</span>
                  {item.summary ? <span className="sr-only">{item.summary}</span> : null}
                </button>
              );
            })}
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2 border-t border-slate-200 px-3 py-1 sm:border-t-0 sm:border-l">
            {actions}
          </div>
        ) : null}
      </div>
      <div
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={activeItem ? `${id}-tab-${activeItem.id}` : undefined}
        className="min-w-0 bg-white pt-3"
      >
        {children}
      </div>
    </section>
  );
}

export function FilterToolbar({ children, resultLabel }: { children: ReactNode; resultLabel?: string }) {
  return (
    <div className="admin-toolbar flex flex-col gap-2 border-b border-slate-200 bg-white py-3 lg:flex-row lg:items-center">
      <div className="grid flex-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap">{children}</div>
      {resultLabel ? <p className="shrink-0 text-xs font-medium text-slate-500">{resultLabel}</p> : null}
    </div>
  );
}

export function CompactToolbar({
  children,
  actions,
  resultLabel,
}: {
  children?: ReactNode;
  actions?: ReactNode;
  resultLabel?: string;
}) {
  return (
    <div className="admin-toolbar flex flex-col gap-2 border-b border-slate-200 bg-white py-2 sm:flex-row sm:items-center">
      {children ? <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div> : <div className="flex-1" />}
      <div className="flex shrink-0 items-center justify-between gap-2">
        {resultLabel ? <p className="text-xs font-medium text-slate-500">{resultLabel}</p> : null}
        {actions}
      </div>
    </div>
  );
}

export function AdminDataTable({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="admin-data-table overflow-hidden border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table aria-label={label} className="w-full min-w-[820px] border-collapse text-left text-sm">
          {children}
        </table>
      </div>
    </div>
  );
}

export function CompactButton({
  children,
  tone = "neutral",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "neutral" | "primary" | "success" | "danger";
}) {
  const tones = {
    neutral: "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
    primary: "border-blue-700 bg-blue-700 text-white hover:bg-blue-800",
    success: "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700",
    danger: "border-rose-200 bg-white text-rose-700 hover:bg-rose-50",
  };
  return (
    <button
      {...props}
      className={`min-h-8 cursor-pointer rounded-sm border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

export function WorksheetGrid({
  label,
  children,
  minWidth = 640,
}: {
  label: string;
  children: ReactNode;
  minWidth?: number;
}) {
  return (
    <div className="max-w-full overflow-x-auto border border-slate-300 bg-white">
      <table aria-label={label} className="w-full border-collapse text-left text-xs" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function WorksheetHeader({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <th className={`border-b border-r border-slate-300 bg-blue-100 px-2 py-1.5 font-semibold text-slate-800 last:border-r-0 ${className}`}>{children}</th>;
}

export function WorksheetCell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <td className={`border-b border-r border-slate-200 p-0 last:border-r-0 ${className}`}>{children}</td>;
}

export const worksheetInputClass =
  "h-8 w-full min-w-0 border-0 bg-transparent px-2 text-xs text-slate-900 outline-none placeholder:text-slate-400 focus:bg-blue-50 focus:ring-2 focus:ring-inset focus:ring-blue-600";

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
  return <span className={`inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs font-medium ${badgeStyles[tone]}`}>{children}</span>;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="px-5 py-8 text-center">
      <div aria-hidden="true" className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500">—</div>
      <h2 className="mt-2 text-sm font-semibold text-slate-900">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{description}</p>
    </div>
  );
}

export function DetailDrawer({
  open,
  title,
  description,
  width = "default",
  compact = false,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  width?: "default" | "wide";
  compact?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      const rememberFocus = (event: FocusEvent) => {
        // React can autofocus the mounted drawer before this closed-state
        // listener is cleaned up. Keep the opener, not the drawer's Close button.
        if (event.target instanceof HTMLElement && event.target.closest('[role="dialog"]')?.getAttribute("aria-labelledby") !== titleId) restoreFocusRef.current = event.target;
      };
      const rememberPointerTarget = (event: PointerEvent) => {
        if (!(event.target instanceof Element)) return;
        const control = event.target.closest<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (control) restoreFocusRef.current = control;
      };
      if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
        restoreFocusRef.current = document.activeElement;
      }
      document.addEventListener("focusin", rememberFocus);
      document.addEventListener("pointerdown", rememberPointerTarget, true);
      return () => {
        document.removeEventListener("focusin", rememberFocus);
        document.removeEventListener("pointerdown", rememberPointerTarget, true);
      };
    }
    function onKeyDown(event: KeyboardEvent) {
      if (document.querySelector('[role="alertdialog"]')) return;
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      restoreFocusRef.current?.focus();
    };
  }, [open, titleId]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[90]" role="presentation">
      <button aria-label="Close details" className="absolute inset-0 cursor-default bg-slate-950/35" onClick={onClose} />
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`admin-dialog absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden bg-white shadow-2xl ${width === "wide" ? "max-w-5xl" : "max-w-2xl"} ${compact ? "admin-detail-drawer-compact" : ""}`}>
        <header className={`flex items-start justify-between border-b border-slate-200 ${compact ? "gap-3 px-4 py-3" : "gap-4 px-5 py-4"}`}>
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-slate-950">{title}</h2>
            {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
          </div>
          <button autoFocus type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-sm border border-slate-200 text-lg text-slate-600 hover:bg-slate-50" aria-label="Close">×</button>
        </header>
        <div className={`min-h-0 flex-1 overflow-y-auto ${compact ? "p-4" : "p-5"}`}>{children}</div>
      </section>
    </div>,
    document.body
  );
}

export function QuickEditPopover({
  open,
  onOpenChange,
  label,
  trigger,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  trigger: ReactNode;
  children: ReactNode;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const titleId = useId();

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const updatePosition = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const panelWidth = Math.min(320, window.innerWidth - 24);
      setPosition({
        top: Math.min(anchor.bottom + 6, window.innerHeight - 260),
        left: Math.max(12, Math.min(anchor.left, window.innerWidth - panelWidth - 12)),
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const firstFocusable = panelRef.current?.querySelector<HTMLElement>(
      'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'
    );
    firstFocusable?.focus();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !anchorRef.current?.contains(target)) onOpenChangeRef.current(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChangeRef.current(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      restoreFocus?.focus();
    };
  }, [open]);

  return (
    <>
      <span ref={anchorRef} className="inline-flex" onClick={() => onOpenChange(!open)}>
        {trigger}
      </span>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="false"
              aria-labelledby={titleId}
              className="fixed z-[95] w-[min(20rem,calc(100vw-1.5rem))] rounded-xl border border-slate-200 bg-white p-3 shadow-2xl"
              style={position}
            >
              <h2 id={titleId} className="text-sm font-semibold text-slate-950">{label}</h2>
              <div className="mt-3">{children}</div>
            </div>,
            document.body
          )
        : null}
    </>
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
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef(onCancel);
  useEffect(() => { cancelRef.current = onCancel; }, [onCancel]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) { event.preventDefault(); cancelRef.current(); }
      if (event.key !== "Tab") return;
      const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);
      if (!buttons.length) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0].focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); if (previous?.isConnected) previous.focus(); };
  }, [open, busy]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/45 p-4">
      <section ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <h2 id="confirm-title" className="text-lg font-semibold text-slate-950">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={onCancel} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="button" disabled={busy} onClick={onConfirm} className={`min-h-11 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-60 ${destructive ? "bg-rose-600 hover:bg-rose-700" : "bg-blue-600 hover:bg-blue-700"}`}>{busy ? "Saving…" : confirmLabel}</button>
        </div>
      </section>
    </div>, document.body
  );
}
