"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  AdminDataTable,
  AdminPageHeader,
  BulkActionBar,
  ConfirmDialog,
  DetailDrawer,
  EmptyState,
  FilterToolbar,
  StatusBadge,
} from "@/components/admin/AdminConsole";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import {
  bulkUpdatePlatformAircraftOrganizations,
  fetchAircraftOrganizationAssignments,
  fetchMyAircraft,
  type AircraftAssignmentBulkMode,
  type AircraftOrganizationAssignment,
  type AircraftRecord,
} from "@/lib/aircraft";
import { fetchPlatformOrganizations, type PlatformOrganization } from "@/lib/platform-admin";
import { fetchCurrentProfile } from "@/lib/profile";

const PAGE_SIZE = 25;

export default function AircraftAssignmentsManager() {
  const { session } = useAuthSession();
  const [aircraft, setAircraft] = useState<AircraftRecord[]>([]);
  const [organizations, setOrganizations] = useState<PlatformOrganization[]>([]);
  const [assignments, setAssignments] = useState<AircraftOrganizationAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [organizationFilter, setOrganizationFilter] = useState("");
  const [assignmentFilter, setAssignmentFilter] = useState<"" | "assigned" | "unassigned">("");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drawerMode, setDrawerMode] = useState<AircraftAssignmentBulkMode | null>(null);
  const [selectedOrganizationIds, setSelectedOrganizationIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const assignmentMap = useMemo(() => {
    const map = new Map<string, string[]>();
    assignments.forEach((assignment) => {
      map.set(assignment.aircraft_id, [...(map.get(assignment.aircraft_id) ?? []), assignment.organization_id]);
    });
    return map;
  }, [assignments]);
  const organizationMap = useMemo(() => new Map(organizations.map((item) => [item.id, item.name])), [organizations]);

  const load = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) return;
    setLoading(true);
    setError("");
    try {
      const profile = await fetchCurrentProfile(userId);
      if (profile?.role !== "admin") throw new Error("Platform administrator access is required.");
      const [myAircraft, platformOrganizations] = await Promise.all([
        fetchMyAircraft(userId),
        fetchPlatformOrganizations(),
      ]);
      const eligible = myAircraft.filter((item) =>
        item.owner_user_id === userId && item.visibility === "private" && !item.organization_id
      );
      const currentAssignments = await fetchAircraftOrganizationAssignments(eligible.map((item) => item.id));
      setAircraft(eligible);
      setOrganizations(platformOrganizations);
      setAssignments(currentAssignments);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load aircraft assignments.");
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => { void load(); }, [load]);

  const modelNames = useMemo(() => Array.from(new Set(aircraft.map((item) => item.model?.name ?? "Unknown model"))).sort(), [aircraft]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return aircraft.filter((item) => {
      const organizationIds = assignmentMap.get(item.id) ?? [];
      if (needle && !`${item.tail_number} ${item.model?.name ?? ""}`.toLowerCase().includes(needle)) return false;
      if (modelFilter && (item.model?.name ?? "Unknown model") !== modelFilter) return false;
      if (organizationFilter && !organizationIds.includes(organizationFilter)) return false;
      if (assignmentFilter === "assigned" && organizationIds.length === 0) return false;
      if (assignmentFilter === "unassigned" && organizationIds.length > 0) return false;
      return true;
    });
  }, [aircraft, assignmentFilter, assignmentMap, modelFilter, organizationFilter, query]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const pageSelected = pageRows.length > 0 && pageRows.every((item) => selectedIds.has(item.id));

  useEffect(() => { setPage(1); }, [query, modelFilter, organizationFilter, assignmentFilter]);

  function toggleAircraft(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function togglePage() {
    setSelectedIds((current) => {
      const next = new Set(current);
      pageRows.forEach((item) => pageSelected ? next.delete(item.id) : next.add(item.id));
      return next;
    });
  }

  function selectAllFiltered() {
    if (filtered.length > 200) {
      setError(`This filter contains ${filtered.length} aircraft. Narrow it to 200 or fewer before selecting all.`);
      return;
    }
    setError("");
    setSelectedIds(new Set(filtered.map((item) => item.id)));
  }

  function openBulk(mode: AircraftAssignmentBulkMode) {
    setDrawerMode(mode);
    setSelectedOrganizationIds(new Set());
  }

  function toggleOrganization(id: string) {
    setSelectedOrganizationIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function saveBulk() {
    if (!drawerMode || selectedIds.size === 0 || selectedOrganizationIds.size === 0) return;
    setSaving(true);
    setError("");
    try {
      const result = await bulkUpdatePlatformAircraftOrganizations({
        aircraftIds: Array.from(selectedIds),
        organizationIds: Array.from(selectedOrganizationIds),
        mode: drawerMode,
      });
      const relationChanges = result.reduce((sum, item) => sum + item.changed_count, 0);
      setNotice(`${drawerMode === "add" ? "Added" : "Removed"} ${relationChanges} organization access relationship${relationChanges === 1 ? "" : "s"} across ${result.length} aircraft.`);
      setConfirmOpen(false);
      setDrawerMode(null);
      setSelectedIds(new Set());
      setSelectedOrganizationIds(new Set());
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The batch could not be saved.");
      setConfirmOpen(false);
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
  const selectedCount = selectedIds.size;

  return (
    <section className="space-y-5 pb-24">
      <AdminPageHeader eyebrow="Platform administration" title="Aircraft Assignments" description="Grant one or more organizations access to private aircraft owned by your Platform Super Admin account. Ownership and visibility never change." />
      {error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}
      {notice ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p> : null}

      <div className="hidden md:block"><AdminDataTable label="Aircraft organization assignments">
        <caption className="sr-only">Private aircraft owned by the signed-in Platform Super Admin</caption>
        <thead>
          <tr><th colSpan={8} className="p-0 font-normal">
            <FilterToolbar resultLabel={`${filtered.length} result${filtered.length === 1 ? "" : "s"}`}>
              <input aria-label="Search tail number or model" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tail or model" className={inputClass} />
              <select aria-label="Filter by aircraft model" value={modelFilter} onChange={(event) => setModelFilter(event.target.value)} className={inputClass}><option value="">All models</option>{modelNames.map((name) => <option key={name}>{name}</option>)}</select>
              <select aria-label="Filter by organization" value={organizationFilter} onChange={(event) => setOrganizationFilter(event.target.value)} className={inputClass}><option value="">All organizations</option>{organizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              <select aria-label="Filter by assignment status" value={assignmentFilter} onChange={(event) => setAssignmentFilter(event.target.value as typeof assignmentFilter)} className={inputClass}><option value="">Any access status</option><option value="assigned">Assigned</option><option value="unassigned">Unassigned</option></select>
            </FilterToolbar>
          </th></tr>
          <tr className="border-b border-slate-200 bg-white text-xs uppercase tracking-wide text-slate-500">
            <th className="w-12 px-4 py-3"><input type="checkbox" aria-label="Select current page" checked={pageSelected} onChange={togglePage} /></th>
            <th className="px-3 py-3">Tail number</th><th className="px-3 py-3">Aircraft model</th><th className="px-3 py-3">Operational status</th><th className="px-3 py-3">Organizations</th><th className="px-3 py-3 text-center">Count</th><th className="px-3 py-3">Updated</th><th className="px-4 py-3 text-right">Details</th>
          </tr>
        </thead>
        <tbody>
          {loading ? <tr><td colSpan={8} className="p-8 text-center text-slate-500">Loading assignments…</td></tr> : null}
          {!loading && pageRows.length === 0 ? <tr><td colSpan={8}><EmptyState title="No eligible aircraft" description="Only private aircraft owned by this Platform Super Admin account appear here." /></td></tr> : null}
          {pageRows.map((item) => {
            const organizationIds = assignmentMap.get(item.id) ?? [];
            return <tr key={item.id} className="border-b border-slate-100 text-slate-700 hover:bg-blue-50/40">
              <td className="px-4 py-3"><input type="checkbox" aria-label={`Select ${item.tail_number}`} checked={selectedIds.has(item.id)} onChange={() => toggleAircraft(item.id)} /></td>
              <td className="px-3 py-3 font-semibold text-slate-950">{item.tail_number}</td><td className="px-3 py-3">{item.model?.name ?? "Unknown model"}</td><td className="px-3 py-3"><StatusBadge tone={item.operational_status === "grounded" ? "danger" : item.operational_status === "in_maintenance" ? "warning" : "success"}>● {formatStatus(item.operational_status ?? "available")}</StatusBadge></td>
              <td className="max-w-[280px] px-3 py-3"><span className="line-clamp-1">{organizationIds.length ? organizationIds.map((id) => organizationMap.get(id) ?? "Unknown").join(", ") : "—"}</span></td><td className="px-3 py-3 text-center font-semibold">{organizationIds.length}</td><td className="px-3 py-3 text-slate-500">{formatDate(item.updated_at)}</td><td className="px-4 py-3 text-right"><button type="button" onClick={() => { setSelectedIds(new Set([item.id])); setDrawerMode("add"); }} className="min-h-10 rounded-xl px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50">Manage</button></td>
            </tr>;
          })}
        </tbody>
        <tfoot><tr><td colSpan={8} className="px-4 py-3"><div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600"><div>{filtered.length > PAGE_SIZE ? <button type="button" onClick={selectAllFiltered} className="font-semibold text-blue-700 hover:underline">Select all {Math.min(filtered.length, 200)} filtered aircraft</button> : `${selectedCount} selected`}</div><div className="flex items-center gap-2"><button type="button" disabled={currentPage <= 1} onClick={() => setPage((value) => value - 1)} className="min-h-10 rounded-xl border border-slate-200 px-3 disabled:opacity-40">Previous</button><span>Page {currentPage} of {pageCount}</span><button type="button" disabled={currentPage >= pageCount} onClick={() => setPage((value) => value + 1)} className="min-h-10 rounded-xl border border-slate-200 px-3 disabled:opacity-40">Next</button></div></div></td></tr></tfoot>
      </AdminDataTable></div>

      <div className="grid gap-3 md:hidden" aria-label="Aircraft organization assignments">
        <FilterToolbar resultLabel={`${filtered.length} results`}>
          <input aria-label="Search tail number or model" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tail or model" className={inputClass} />
          <select aria-label="Filter by aircraft model" value={modelFilter} onChange={(event) => setModelFilter(event.target.value)} className={inputClass}><option value="">All models</option>{modelNames.map((name) => <option key={name}>{name}</option>)}</select>
          <select aria-label="Filter by organization" value={organizationFilter} onChange={(event) => setOrganizationFilter(event.target.value)} className={inputClass}><option value="">All organizations</option>{organizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <select aria-label="Filter by assignment status" value={assignmentFilter} onChange={(event) => setAssignmentFilter(event.target.value as typeof assignmentFilter)} className={inputClass}><option value="">Any access status</option><option value="assigned">Assigned</option><option value="unassigned">Unassigned</option></select>
        </FilterToolbar>
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><label className="flex min-h-10 items-center gap-2 font-semibold text-slate-700"><input type="checkbox" checked={pageSelected} onChange={togglePage} /> Select page</label>{filtered.length <= 200 ? <button type="button" onClick={selectAllFiltered} className="min-h-10 font-semibold text-blue-700">Select all filtered</button> : null}</div>
        {!loading && !pageRows.length ? <div className="rounded-2xl border border-slate-200 bg-white"><EmptyState title="No eligible aircraft" description="Only private aircraft owned by this Platform Super Admin account appear here." /></div> : null}
        {pageRows.map((item) => {
          const organizationIds = assignmentMap.get(item.id) ?? [];
          return <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><input className="mt-1" type="checkbox" aria-label={`Select ${item.tail_number}`} checked={selectedIds.has(item.id)} onChange={() => toggleAircraft(item.id)} /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div><h2 className="font-semibold text-slate-950">{item.tail_number}</h2><p className="text-sm text-slate-500">{item.model?.name ?? "Unknown model"}</p></div><StatusBadge tone={item.operational_status === "grounded" ? "danger" : item.operational_status === "in_maintenance" ? "warning" : "success"}>● {formatStatus(item.operational_status ?? "available")}</StatusBadge></div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-slate-400">Organizations</dt><dd className="mt-1 font-semibold text-slate-800">{organizationIds.length}</dd></div><div><dt className="text-xs text-slate-400">Updated</dt><dd className="mt-1 text-slate-700">{formatDate(item.updated_at)}</dd></div></dl><p className="mt-3 truncate text-xs text-slate-500">{organizationIds.length ? organizationIds.map((id) => organizationMap.get(id) ?? "Unknown").join(", ") : "No organization access"}</p><button type="button" onClick={() => { setSelectedIds(new Set([item.id])); setDrawerMode("add"); }} className="mt-3 min-h-11 w-full rounded-xl border border-blue-200 text-sm font-semibold text-blue-700">Manage</button></div></div></article>;
        })}
        <div className="flex items-center justify-between text-sm text-slate-600"><button type="button" disabled={currentPage <= 1} onClick={() => setPage((value) => value - 1)} className="min-h-10 rounded-xl border border-slate-200 px-3 disabled:opacity-40">Previous</button><span>{currentPage} / {pageCount}</span><button type="button" disabled={currentPage >= pageCount} onClick={() => setPage((value) => value + 1)} className="min-h-10 rounded-xl border border-slate-200 px-3 disabled:opacity-40">Next</button></div>
      </div>

      <BulkActionBar count={selectedCount} onClear={() => setSelectedIds(new Set())}>
        <button type="button" onClick={() => openBulk("add")} className="min-h-10 rounded-xl bg-blue-500 px-4 text-sm font-semibold hover:bg-blue-400">Add access</button>
        <button type="button" onClick={() => openBulk("remove")} className="min-h-10 rounded-xl border border-white/20 px-4 text-sm font-semibold hover:bg-white/10">Remove access</button>
      </BulkActionBar>

      <DetailDrawer open={drawerMode !== null} onClose={() => setDrawerMode(null)} title={drawerMode === "remove" ? "Remove organization access" : "Add organization access"} description="Choose one or more organizations. Existing unrelated access remains unchanged.">
        <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-50 p-4 text-center"><Metric label="Aircraft" value={selectedCount} /><Metric label="Organizations" value={selectedOrganizationIds.size} /><Metric label="Max changes" value={selectedCount * selectedOrganizationIds.size} /></div>
        <fieldset className="mt-5"><legend className="text-sm font-semibold text-slate-900">Organizations</legend><div className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200">{organizations.map((item) => <label key={item.id} className="flex min-h-12 cursor-pointer items-center gap-3 px-4 hover:bg-slate-50"><input type="checkbox" checked={selectedOrganizationIds.has(item.id)} onChange={() => toggleOrganization(item.id)} /><span className="flex-1 text-sm font-medium text-slate-800">{item.name}</span><span className="text-xs text-slate-400">{item.member_count} members</span></label>)}</div></fieldset>
        <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setDrawerMode(null)} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold">Cancel</button><button type="button" disabled={!selectedOrganizationIds.size} onClick={() => setConfirmOpen(true)} className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-40">Save</button></div>
      </DetailDrawer>
      <ConfirmDialog open={confirmOpen} title={`${drawerMode === "remove" ? "Remove" : "Add"} organization access?`} description={`This will ${drawerMode} access for ${selectedCount} aircraft and ${selectedOrganizationIds.size} organizations in one transaction. Ownership and private visibility will not change.`} confirmLabel={drawerMode === "remove" ? "Remove access" : "Add access"} destructive={drawerMode === "remove"} busy={saving} onCancel={() => setConfirmOpen(false)} onConfirm={() => void saveBulk()} />
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) { return <div><p className="text-xl font-semibold text-slate-950">{value}</p><p className="text-xs text-slate-500">{label}</p></div>; }
function formatDate(value?: string | null) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date); }
function formatStatus(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
