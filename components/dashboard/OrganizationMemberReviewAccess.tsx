"use client";

import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/admin/AdminConsole";
import { fetchAsrReviewerAssignments, setAsrReviewerCapability, type AsrReviewerCapability } from "@/lib/asr-reports";

const reviews: { capability: AsrReviewerCapability; label: string }[] = [
  { capability: "safety_reviewer", label: "Safety review" },
  { capability: "training_reviewer", label: "Training review" },
  { capability: "maintenance_reviewer", label: "Maintenance review" },
];

export default function OrganizationMemberReviewAccess({ organizationId, userId, memberName, disabled, onBusy }: {
  organizationId: string; userId: string; memberName: string; disabled: boolean; onBusy: (busy: boolean) => void;
}) {
  const [capabilities, setCapabilities] = useState<AsrReviewerCapability[]>([]);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState<{ capability: AsrReviewerCapability; enabled: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetchAsrReviewerAssignments(organizationId, userId).then(assignments => {
      if (!cancelled) { setCapabilities(assignments.map(item => item.capability)); setLoading(false); }
    }, value => {
      if (!cancelled) { setError(message(value, "Unable to load report review access.")); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [organizationId, userId, reload]);

  async function apply() {
    if (!pending || savingRef.current) return;
    savingRef.current = true; setSaving(true); onBusy(true); setError("");
    try {
      await setAsrReviewerCapability({ organizationId, userId, ...pending });
      setCapabilities(current => pending.enabled
        ? [...new Set([...current, pending.capability])]
        : current.filter(item => item !== pending.capability));
      setStatus("Report review access updated."); setPending(null);
    } catch (value) { setError(message(value, "Unable to update report review access.")); }
    finally { savingRef.current = false; setSaving(false); onBusy(false); }
  }

  const pendingLabel = reviews.find(item => item.capability === pending?.capability)?.label.toLowerCase();
  return <section className="grid gap-2">
    <h3 className="border-b border-slate-200 pb-2 text-sm font-semibold text-slate-950">Safety report reviews</h3>
    <fieldset disabled={disabled || loading || saving || Boolean(error && !pending)} className="grid gap-1">
      <legend className="sr-only">Safety report review access</legend>
      {reviews.map(item => <label key={item.capability} className="flex min-h-9 items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={capabilities.includes(item.capability)} onChange={event => {
          setStatus(""); setError(""); setPending({ capability: item.capability, enabled: event.target.checked });
        }} />{item.label}
      </label>)}
    </fieldset>
    {loading ? <p className="text-xs text-slate-500">Loading review access…</p> : null}
    {error && !pending ? <div role="alert" className="text-xs text-rose-700"><p>{error}</p><button type="button" className="mt-1 underline" disabled={disabled || saving} onClick={() => { setError(""); setLoading(true); setReload(value => value + 1); }}>Retry</button></div> : null}
    {status ? <p role="status" className="text-xs text-emerald-700">{status}</p> : null}
    <ConfirmDialog open={pending !== null} title="Change report review access?"
      description={pending ? `${pending.enabled ? "Allow" : "Remove"} ${memberName}'s ${pendingLabel} access?` : ""}
      confirmLabel="Apply" busy={saving} destructive={pending?.enabled === false}
      onCancel={() => { if (!savingRef.current) { setPending(null); setError(""); } }} onConfirm={() => void apply()}>
      {error && pending ? <p role="alert" className="mt-3 text-xs text-rose-700">{error}</p> : null}
    </ConfirmDialog>
  </section>;
}

function message(value: unknown, fallback: string) {
  return typeof (value as { message?: unknown })?.message === "string" ? String((value as { message: string }).message) : fallback;
}
