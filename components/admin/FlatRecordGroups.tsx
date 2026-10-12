"use client";

import { useId, useState, type ReactNode } from "react";
import { AdminPagination } from "@/components/admin/AdminConsole";
import { formatUsDateTime } from "@/lib/date-format";
import type { RecordGroup } from "@/lib/record-groups";

export function FlatRecordGroups<T extends { id: string }>({ groups, searching, renderRecord }: {
  groups: RecordGroup<T>[]; searching: string; renderRecord: (record: T) => ReactNode;
}) {
  const prefix = useId();
  const [expansion, setExpansion] = useState<{ query: string; overrides: Map<string, boolean> }>({ query: searching, overrides: new Map() });
  const [page, setPage] = useState(1);
  const [limits, setLimits] = useState<Record<string, number>>({});
  if (expansion.query !== searching) {
    setExpansion({ query: searching, overrides: new Map() });
    setPage(1);
  }
  const pageSize = 20;
  const currentPage = Math.min(page, Math.max(1, Math.ceil(groups.length / pageSize)));
  return <div className="mt-3 min-w-0">
    <div className="divide-y divide-slate-200 border border-slate-200 bg-white">
      {groups.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((group) => {
        const open = expansion.overrides.get(group.id) ?? Boolean(searching);
        const contentId = `${prefix}-${encodeURIComponent(group.id)}`;
        return <div key={group.id} className="min-w-0">
          <button type="button" className="flex min-h-10 w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-sm hover:bg-slate-50 focus-visible:bg-blue-50" aria-expanded={open} aria-controls={contentId}
            onClick={() => setExpansion(previous => { const next = new Map(previous.overrides); next.set(group.id, !open); return { query: searching, overrides: next }; })}>
            <span aria-hidden="true" className="w-3 shrink-0 text-slate-500">{open ? "▾" : "▸"}</span>
            <span className="min-w-0 flex-1 break-words font-semibold text-slate-900">{group.label}</span>
            {group.statusLabel ? <span className={`text-xs ${group.statusLabel === "Grounded" ? "text-rose-700" : "text-slate-500"}`}>{group.statusLabel}</span> : null}
            <span className="text-xs text-slate-500">{group.records.length} {group.records.length === 1 ? "record" : "records"}{group.openCount ? ` · ${group.openCount} open` : ""}</span>
            <span className="text-xs text-slate-500" title="Latest activity">{formatUsDateTime(group.latestAt).split(',')[0]}</span>
          </button>
          {open ? <div id={contentId} className="divide-y divide-slate-100 border-t border-slate-200">{group.records.slice(0, limits[group.id] ?? 20).map(record => <div key={record.id}>{renderRecord(record)}</div>)}
            {group.records.length === 0 ? <p className="px-3 py-2 text-xs text-slate-500">No records.</p> : null}
            {group.records.length > (limits[group.id] ?? 20) ? <button type="button" className="w-full px-3 py-2 text-left text-xs text-blue-700 hover:bg-blue-50" onClick={() => setLimits(previous => ({ ...previous, [group.id]: (previous[group.id] ?? 20) + 20 }))}>Show more records</button> : null}
          </div> : null}
        </div>;
      })}
    </div>
    {groups.length > pageSize ? <AdminPagination page={currentPage} pageSize={pageSize} total={groups.length} onPageChange={setPage} /> : null}
  </div>;
}
