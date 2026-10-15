"use client";

import { useState } from "react";
import { changeAudienceSelection, publicationAudienceGroups } from "@/lib/notification-audience";
import type { PublicationAudienceMember } from "@/lib/notification-publications";

export default function NotificationAudiencePicker({ audience, value, onChange }: {
  audience: PublicationAudienceMember[];
  value: string[] | null;
  onChange: (value: string[] | null) => void;
}) {
  const [search, setSearch] = useState("");
  const groups = publicationAudienceGroups(audience);
  const members = audience.filter(member => member.display_name.toLowerCase().includes(search.trim().toLowerCase()));
  return <div className="grid min-w-0 gap-2">
    <label className="grid gap-1 text-sm">Recipients<select aria-label="Audience" value={value === null ? "all" : "selected"} onChange={event => onChange(event.target.value === "all" ? null : [])}><option value="all">All members ({audience.length})</option><option value="selected">Choose recipients</option></select></label>
    {value !== null ? <>
      <fieldset className="min-w-0 rounded-md border border-slate-200 p-2">
        <legend className="px-1 text-xs font-semibold text-slate-600">Groups</legend>
        <div className="grid gap-1 sm:grid-cols-2">{groups.map(group => {
          const count = group.ids.filter(id => value.includes(id)).length;
          return <label key={group.key} className="flex min-w-0 items-center gap-2 rounded px-1 py-1 text-sm hover:bg-slate-50">
            <input type="checkbox" aria-label={`Select ${group.label}`} checked={count === group.ids.length} ref={input => { if (input) input.indeterminate = count > 0 && count < group.ids.length; }} onChange={event => onChange(changeAudienceSelection(value, group.ids, event.target.checked))} />
            <span className="min-w-0 break-words">{group.label}</span><span className="ml-auto text-xs tabular-nums text-slate-500">{group.ids.length}</span>
          </label>;
        })}</div>
      </fieldset>
      <div className="flex items-center justify-between gap-2 text-xs text-slate-600"><span role="status">{value.length} {value.length === 1 ? "recipient" : "recipients"} selected</span><button type="button" disabled={!value.length} className="underline disabled:opacity-40" onClick={() => onChange([])}>Clear selection</button></div>
      <input type="search" aria-label="Search recipients" placeholder="Search members" value={search} onChange={event => setSearch(event.target.value)} />
      <div role="group" aria-label="Individual recipients" className="max-h-48 overflow-y-auto rounded-md border border-slate-200 p-2">
        {members.length ? members.map(member => <label key={member.user_id} className="flex min-w-0 items-center gap-2 py-1 text-sm"><input type="checkbox" aria-label={member.display_name} checked={value.includes(member.user_id)} onChange={event => onChange(changeAudienceSelection(value, [member.user_id], event.target.checked))} /><span className="break-words">{member.display_name}</span></label>) : <p className="py-1 text-sm text-slate-500">No members found.</p>}
      </div>
    </> : null}
  </div>;
}
