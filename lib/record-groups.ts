import { parseUsDate } from "./date-format";

export type AircraftGroupRecord = {
  id: string; organization_id: string; aircraft_id: string | null;
  aircraft_tail_number: string | null; created_at: string; status: string;
};
export type RecordGroup<T> = { id: string; label: string; records: T[]; latestAt: string; openCount: number; statusLabel?: string };

export function groupAircraftReports<T extends AircraftGroupRecord>(records: T[]): RecordGroup<T>[] {
  const groups = new Map<string, RecordGroup<T>>();
  for (const record of records) {
    const identity = record.aircraft_id ? `aircraft:${record.aircraft_id}`
      : record.aircraft_tail_number ? `external-record:${record.id}` : "no-aircraft";
    const id = `${record.organization_id}:${identity}`;
    let group = groups.get(id);
    if (!group) {
      group = { id, label: record.aircraft_tail_number || "No aircraft", records: [], latestAt: record.created_at, openCount: 0 };
      groups.set(id, group);
    }
    group.records.push(record);
    if (record.created_at > group.latestAt) group.latestAt = record.created_at;
    if (!["closed", "superseded"].includes(record.status)) group.openCount++;
  }
  for (const group of groups.values()) group.records.sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
  return [...groups.values()].sort((a, b) => b.latestAt.localeCompare(a.latestAt) || a.label.localeCompare(b.label));
}

export function endorsementPersonIdentity(record: { id: string; student_user_id: string | null; student_id: string | null }) {
  if (record.student_user_id) return `user:${record.student_user_id}`;
  if (record.student_id) return `student:${record.student_id}`;
  // A name/certificate snapshot is not sufficient evidence to merge two people.
  return `unlinked-record:${record.id}`;
}
export function recordSortDate(value: string, createdAt: string) {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const normalized = iso ? parseUsDate(`${iso[2]}/${iso[3]}/${iso[1]}`) : parseUsDate(value);
  return normalized ?? createdAt.slice(0, 10);
}
