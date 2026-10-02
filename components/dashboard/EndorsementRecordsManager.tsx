"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminDataTable, DetailDrawer, ManagementDisclosure } from "@/components/admin/AdminConsole";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { useOrganization } from "@/components/organizations/OrganizationProvider";
import {
  createEndorsementRecordSignedUrl, deleteEndorsementRecord, fetchEndorsementRecords,
  fetchIssuedOrganizationEndorsementRecords, fetchOrganizationEndorsementRecords,
  fetchReceivedEndorsementRecords, type EndorsementRecord,
} from "@/lib/endorsement-records";
import { fetchEndorsementPeople, type EndorsementPerson } from "@/lib/saved-people";
import {
  createStudentRecordFileSignedUrl, createStudentRecordFolder, createStudentRecordItem,
  deleteStudentRecordItem, fetchStudentRecordFolders, fetchStudentRecordItems,
  removeStudentRecordFiles, updateStudentRecordItem, uploadStudentRecordFile,
  validateStudentRecordFile, type StudentRecordFolder, type StudentRecordItem,
} from "@/lib/student-records";
import { canManageOrganization } from "@/lib/organizations";
import { formatUsDate, formatUsDateTime } from "@/lib/date-format";

type RecordView = "personal" | "received" | "organization";
type StudentGroup = {
  key: string; folder: StudentRecordFolder | null; studentName: string;
  studentCertNumber: string | null; endorsements: EndorsementRecord[];
  items: StudentRecordItem[]; latestAt: string;
};
type ItemForm = { title: string; recordDate: string; category: string; notes: string };

const emptyItemForm = (): ItemForm => ({
  title: "", recordDate: new Date().toISOString().slice(0, 10), category: "", notes: "",
});

function formatRecordDate(value: string) {
  if (!value) return "No date";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return value;
  return formatUsDate(value, value);
}

function formatFileSize(value: number | null) {
  if (!value) return "";
  return value < 1024 * 1024
    ? `${Math.max(1, Math.round(value / 1024))} KB`
    : `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function endorsementIdentity(record: EndorsementRecord) {
  if (record.student_user_id) return `user:${record.student_user_id}`;
  if (record.student_id) return `student:${record.student_id}`;
  return `legacy:${record.student_name.trim().toLowerCase()}|${(record.student_cert_number ?? "").trim().toLowerCase()}`;
}

function folderIdentity(folder: StudentRecordFolder) {
  if (folder.student_user_id) return `user:${folder.student_user_id}`;
  if (folder.student_id) return `student:${folder.student_id}`;
  return `folder:${folder.id}`;
}

export function buildStudentRecordGroups(
  folders: StudentRecordFolder[], endorsements: EndorsementRecord[], items: StudentRecordItem[]
) {
  const groups = new Map<string, StudentGroup>();
  const folderKeys = new Map<string, string>();
  for (const folder of folders) {
    const key = `folder:${folder.id}`;
    groups.set(key, { key, folder, studentName: folder.student_name,
      studentCertNumber: folder.student_cert_number, endorsements: [], items: [], latestAt: folder.updated_at });
    folderKeys.set(folderIdentity(folder), key);
    if (folder.student_id) folderKeys.set(`student:${folder.student_id}`, key);
    if (folder.student_user_id) folderKeys.set(`user:${folder.student_user_id}`, key);
  }
  for (const record of endorsements) {
    const identity = endorsementIdentity(record);
    const key = folderKeys.get(identity) ?? `endorsement:${identity}`;
    const group = groups.get(key);
    if (group) {
      group.endorsements.push(record);
      if (record.created_at > group.latestAt) group.latestAt = record.created_at;
    } else {
      groups.set(key, { key, folder: null, studentName: record.student_name,
        studentCertNumber: record.student_cert_number, endorsements: [record], items: [], latestAt: record.created_at });
    }
  }
  for (const item of items) {
    const group = groups.get(`folder:${item.folder_id}`);
    if (!group) continue;
    group.items.push(item);
    if (item.updated_at > group.latestAt) group.latestAt = item.updated_at;
  }
  return Array.from(groups.values()).sort((a, b) => b.latestAt.localeCompare(a.latestAt));
}

function groupMatches(group: StudentGroup, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [group.studentName, group.studentCertNumber ?? "",
    ...group.endorsements.flatMap((record) => [record.instructor_name, record.endorsement_date, record.template_titles.join(" ")]),
    ...group.items.flatMap((item) => [item.title, item.category ?? "", item.notes ?? "", item.record_date]),
  ].join(" ").toLowerCase().includes(normalized);
}

function fileExtension(file: File) {
  if (file.type === "application/pdf") return "pdf";
  if (file.type === "image/png") return "png";
  return "jpg";
}

function ActionIcon({ kind }: { kind: "open" | "external" | "delete" | "expand" | "file" }) {
  const cn = "h-4 w-4";
  if (kind === "delete") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={cn}><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" /></svg>;
  if (kind === "external") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={cn}><path d="M14 4h6v6M20 4l-9 9M11 5H5v14h14v-6" /></svg>;
  if (kind === "expand") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={cn}><path d="M9 6l6 6-6 6" /></svg>;
  if (kind === "file") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={cn}><path d="M6 3h8l4 4v14H6V3Z" /><path d="M14 3v5h5" /></svg>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={cn}><path d="M6 4h9l3 3v13H6V4Z" /><path d="M14 4v4h4M9 13h6M9 16h4" /></svg>;
}

export default function EndorsementRecordsManager({ organizationOnly = false }: { organizationOnly?: boolean }) {
  const router = useRouter();
  const { session } = useAuthSession();
  const { activeOrganization } = useOrganization();
  const canViewOrganizationRecords = canManageOrganization(activeOrganization?.member_role);
  const [view, setView] = useState<RecordView>(organizationOnly ? "organization" : "personal");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [records, setRecords] = useState<EndorsementRecord[]>([]);
  const [folders, setFolders] = useState<StudentRecordFolder[]>([]);
  const [items, setItems] = useState<StudentRecordItem[]>([]);
  const [people, setPeople] = useState<EndorsementPerson[]>([]);
  const [query, setQuery] = useState("");
  const [activeGroupKey, setActiveGroupKey] = useState<string | null>(null);
  const [activeRecord, setActiveRecord] = useState<EndorsementRecord | null>(null);
  const [activePdfUrl, setActivePdfUrl] = useState("");
  const [activeItem, setActiveItem] = useState<StudentRecordItem | null>(null);
  const [activeFileUrl, setActiveFileUrl] = useState("");
  const [folderFormOpen, setFolderFormOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [itemFormOpen, setItemFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<StudentRecordItem | null>(null);
  const [itemForm, setItemForm] = useState<ItemForm>(emptyItemForm);
  const [itemFile, setItemFile] = useState<File | null>(null);
  const [removeExistingFile, setRemoveExistingFile] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      const userId = session?.user?.id;
      if (!userId) { setLoading(false); return; }
      try {
        setLoading(true); setStatus("");
        const effectiveView = organizationOnly ? "organization" : view;
        if (effectiveView === "organization") {
          const [issued, organizationRecords] = await Promise.all([
            organizationOnly ? Promise.resolve([]) : fetchIssuedOrganizationEndorsementRecords(userId),
            activeOrganization?.id && canViewOrganizationRecords
              ? fetchOrganizationEndorsementRecords(activeOrganization.id) : Promise.resolve([]),
          ]);
          if (!cancelled) {
            setRecords(Array.from(new Map([...issued, ...organizationRecords].map((record) => [record.id, record])).values()));
            setFolders([]); setItems([]);
          }
          return;
        }
        const [nextRecords, visibleFolders, nextPeople] = await Promise.all([
          effectiveView === "personal" ? fetchEndorsementRecords(userId) : fetchReceivedEndorsementRecords(userId),
          fetchStudentRecordFolders(),
          effectiveView === "personal" ? fetchEndorsementPeople() : Promise.resolve([]),
        ]);
        const scopedFolders = visibleFolders.filter((folder) => effectiveView === "personal"
          ? folder.owner_user_id === userId : folder.student_user_id === userId);
        const nextItems = await fetchStudentRecordItems(scopedFolders.map((folder) => folder.id));
        if (!cancelled) { setRecords(nextRecords); setFolders(scopedFolders); setItems(nextItems); setPeople(nextPeople); }
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "Unable to load records.");
      } finally { if (!cancelled) setLoading(false); }
    }
    void loadData();
    return () => { cancelled = true; };
  }, [activeOrganization?.id, canViewOrganizationRecords, organizationOnly, session?.user?.id, view]);

  const groups = useMemo(() => buildStudentRecordGroups(folders, records, items), [folders, records, items]);
  const filteredGroups = useMemo(() => groups.filter((group) => groupMatches(group, query)), [groups, query]);
  const activeGroup = groups.find((group) => group.key === activeGroupKey) ?? null;
  const existingStudentIds = useMemo(() => new Set(folders.map((folder) => folder.student_id).filter(Boolean)), [folders]);
  const isOrganizationView = organizationOnly || view === "organization";
  const personalOwnerView = !organizationOnly && view === "personal";

  async function openEndorsement(record: EndorsementRecord) {
    setBusy(true); setStatus("");
    try { setActivePdfUrl(await createEndorsementRecordSignedUrl(record.storage_path)); setActiveRecord(record); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Unable to open the saved PDF."); }
    finally { setBusy(false); }
  }

  async function handleDeleteEndorsement(record: EndorsementRecord) {
    if (!window.confirm("Permanently delete this endorsement? This cannot be undone.")) return;
    setBusy(true);
    try {
      await deleteEndorsementRecord(record);
      setRecords((current) => current.filter((item) => item.id !== record.id));
      setActiveRecord(null); setStatus("Endorsement record deleted.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Unable to delete record."); }
    finally { setBusy(false); }
  }

  async function handleCreateFolder() {
    if (!selectedStudentId) { setStatus("Select a student first."); return; }
    const existing = folders.find((folder) => folder.student_id === selectedStudentId);
    if (existing) { setFolderFormOpen(false); setActiveGroupKey(`folder:${existing.id}`); return; }
    setBusy(true); setStatus("");
    try {
      const folder = await createStudentRecordFolder(selectedStudentId);
      setFolders((current) => [folder, ...current.filter((value) => value.id !== folder.id)]);
      setFolderFormOpen(false); setSelectedStudentId(""); setActiveGroupKey(`folder:${folder.id}`);
      setStatus("Student record created.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Unable to create the student record."); }
    finally { setBusy(false); }
  }

  function openItemForm(item?: StudentRecordItem) {
    setEditingItem(item ?? null);
    setItemForm(item ? { title: item.title, recordDate: item.record_date,
      category: item.category ?? "", notes: item.notes ?? "" } : emptyItemForm());
    setItemFile(null); setRemoveExistingFile(false); setFileInputKey((value) => value + 1); setItemFormOpen(true);
  }

  async function handleSaveItem() {
    const folder = activeGroup?.folder;
    const userId = session?.user?.id;
    if (!folder || !userId || !itemForm.title.trim() || !itemForm.recordDate) {
      setStatus("Title and record date are required."); return;
    }
    if (itemFile) {
      try { validateStudentRecordFile(itemFile); }
      catch (error) { setStatus(error instanceof Error ? error.message : "Invalid attachment."); return; }
    }
    setBusy(true); setStatus("");
    const itemId = editingItem?.id ?? crypto.randomUUID();
    let uploadedPath: string | null = null;
    const previousPath = editingItem?.storage_path ?? null;
    try {
      let storagePath = removeExistingFile ? null : previousPath;
      let originalFileName = removeExistingFile ? null : editingItem?.original_file_name ?? null;
      let mimeType = removeExistingFile ? null : editingItem?.mime_type ?? null;
      let fileSizeBytes = removeExistingFile ? null : editingItem?.file_size_bytes ?? null;
      if (itemFile) {
        storagePath = `${userId}/${folder.id}/${itemId}/${crypto.randomUUID()}.${fileExtension(itemFile)}`;
        await uploadStudentRecordFile(storagePath, itemFile); uploadedPath = storagePath;
        originalFileName = itemFile.name; mimeType = itemFile.type; fileSizeBytes = itemFile.size;
      }
      const input = { id: itemId, folderId: folder.id, title: itemForm.title,
        recordDate: itemForm.recordDate, category: itemForm.category, notes: itemForm.notes,
        storagePath, originalFileName, mimeType, fileSizeBytes };
      const saved = editingItem ? await updateStudentRecordItem(input) : await createStudentRecordItem(input);
      setItems((current) => editingItem
        ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current]);
      setFolders((current) => current.map((value) => value.id === folder.id
        ? { ...value, updated_at: saved.updated_at } : value));
      if (previousPath && previousPath !== saved.storage_path) {
        await removeStudentRecordFiles([previousPath]).catch((error) => console.warn("Old student record file cleanup failed:", error));
      }
      setItemFormOpen(false); setStatus(editingItem ? "Student record updated." : "Content added to the student record.");
    } catch (error) {
      if (uploadedPath) await removeStudentRecordFiles([uploadedPath]).catch(() => {});
      setStatus(error instanceof Error ? error.message : "Unable to save the student record.");
    } finally { setBusy(false); }
  }

  async function openStudentFile(item: StudentRecordItem) {
    if (!item.storage_path) return;
    setBusy(true);
    try { setActiveFileUrl(await createStudentRecordFileSignedUrl(item.storage_path)); setActiveItem(item); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Unable to open the attachment."); }
    finally { setBusy(false); }
  }

  async function handleDeleteItem(item: StudentRecordItem) {
    if (!window.confirm(`Delete “${item.title}” from this student record? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const storagePath = await deleteStudentRecordItem(item.id);
      setItems((current) => current.filter((value) => value.id !== item.id)); setActiveItem(null);
      if (storagePath) await removeStudentRecordFiles([storagePath]).catch((error) => console.warn("Student record file cleanup failed:", error));
      setStatus("Student record content deleted.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Unable to delete the student record content."); }
    finally { setBusy(false); }
  }

  return <>
    {status ? <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600" role="status">{status}</p> : null}
    <ManagementDisclosure id="endorsement-records" title={organizationOnly ? "Issued endorsements" : "Student Records"}
      summary={loading ? "Loading…" : isOrganizationView ? `${records.length}` : `${groups.length} students`}
      className="dashboard-data-workspace" defaultOpen
      actions={personalOwnerView ? <button className="primary-button" type="button" onClick={() => setFolderFormOpen(true)}>Add student record</button> : null}
      helpContent={organizationOnly ? <p>Shows endorsements issued while the instructor belonged to this organization.</p>
        : <p>Each student has one record containing issued endorsements, notes, and private files shared with that student account.</p>}>
      {!organizationOnly ? <nav className="mt-2 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1" aria-label="Student record views">
        {([ ["personal", "My student records"], ["received", "Shared with me"], ["organization", "Organization activity"] ] as const).map(([key, label]) =>
          <button key={key} type="button" aria-current={view === key ? "page" : undefined}
            className={`min-h-8 shrink-0 rounded-lg px-3 text-xs font-semibold ${view === key ? "bg-blue-700 text-white" : "text-slate-600 hover:bg-white"}`}
            onClick={() => { setView(key); setActiveGroupKey(null); }}>{label}</button>)}
      </nav> : null}
      <div className="mt-4 flex flex-col items-end gap-2 sm:flex-row">
        <label className="saas-field min-w-0 flex-1"><span>Search</span><input type="search" value={query}
          onChange={(event) => setQuery(event.target.value)} placeholder="Search student or record content" /></label>
        {query ? <button className="ghost-button" type="button" onClick={() => setQuery("")}>Clear search</button> : null}
      </div>
      {loading ? <p className="saas-meta-text mt-5">Loading records...</p> : null}
      {!loading && (isOrganizationView ? records.length === 0 : filteredGroups.length === 0)
        ? <p className="saas-empty-state mt-5">{query.trim() ? "No records match your search." : "No student records saved yet."}</p> : null}
      {isOrganizationView && records.length > 0 ? <div className="mt-3"><AdminDataTable label="Organization endorsement records">
        <thead><tr><th>Student</th><th>Endorsement</th><th>Date</th><th>Instructor</th><th>Saved</th><th aria-label="Actions" /></tr></thead>
        <tbody>{records.map((record) => <tr key={record.id}><td className="font-semibold text-slate-900">{record.student_name}</td>
          <td>{record.template_titles.length ? record.template_titles.join(", ") : "Endorsement PDF"}</td>
          <td>{formatRecordDate(record.endorsement_date)}</td><td>{record.instructor_name}</td><td>{formatUsDateTime(record.created_at, "")}</td>
          <td><button className="secondary-button icon-button" type="button" aria-label={`View PDF for ${record.student_name}`} disabled={busy} onClick={() => void openEndorsement(record)}><ActionIcon kind="open" /></button></td></tr>)}</tbody>
      </AdminDataTable></div> : null}
      {!isOrganizationView && filteredGroups.length > 0 ? <div className="mt-3"><AdminDataTable label="Student records">
        <thead><tr><th>Student</th><th>Certificate</th><th>Endorsements</th><th>Records</th><th>Files</th><th>Latest</th><th aria-label="Actions" /></tr></thead>
        <tbody>{filteredGroups.map((group) => <tr key={group.key}><td className="font-semibold text-slate-900">{group.studentName}</td>
          <td>{group.studentCertNumber || "—"}</td><td>{group.endorsements.length}</td><td>{group.items.length}</td>
          <td>{group.items.filter((item) => item.storage_path).length}</td><td>{formatUsDateTime(group.latestAt, "")}</td>
          <td><button className="secondary-button icon-button" type="button" aria-label={`Open record for ${group.studentName}`} title="Open student record" onClick={() => setActiveGroupKey(group.key)}><ActionIcon kind="expand" /></button></td></tr>)}</tbody>
      </AdminDataTable></div> : null}
    </ManagementDisclosure>

    <DetailDrawer open={Boolean(activeGroup)} title={activeGroup ? `Student record · ${activeGroup.studentName}` : "Student record"}
      description={activeGroup?.studentCertNumber ? `Certificate ${activeGroup.studentCertNumber}` : undefined} onClose={() => setActiveGroupKey(null)}>
      {activeGroup ? <div className="space-y-4">
        {personalOwnerView && activeGroup.folder ? <div className="flex justify-end"><button className="primary-button" type="button" onClick={() => openItemForm()}>Add content</button></div> : null}
        {personalOwnerView && !activeGroup.folder ? <p className="saas-meta-text">This legacy endorsement does not have a selectable student identity. Create a current student record before adding custom content.</p> : null}
        {activeGroup.endorsements.length + activeGroup.items.length === 0 ? <p className="saas-empty-state">This student record is empty.</p> : null}
        {[...activeGroup.endorsements.map((record) => ({ kind: "endorsement" as const, date: record.endorsement_date, created: record.created_at, record })),
          ...activeGroup.items.map((item) => ({ kind: "item" as const, date: item.record_date, created: item.created_at, item }))]
          .sort((a, b) => (b.date || b.created).localeCompare(a.date || a.created))
          .map((entry) => entry.kind === "endorsement" ? <article key={`endorsement:${entry.record.id}`} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Endorsement</p>
              <h3 className="mt-1 text-sm font-semibold text-slate-950">{entry.record.template_titles.join(", ") || "Endorsement PDF"}</h3>
              <p className="mt-1 text-xs text-slate-500">{formatRecordDate(entry.record.endorsement_date)} · {entry.record.instructor_name}</p></div>
              <div className="data-row-actions"><button className="secondary-button icon-button" type="button" aria-label="View endorsement PDF" disabled={busy} onClick={() => void openEndorsement(entry.record)}><ActionIcon kind="open" /></button>
                {entry.record.user_id === session?.user?.id ? <button className="secondary-button" type="button" onClick={() => router.push(`/tools/endorsement-generator?editRecord=${encodeURIComponent(entry.record.id)}`)}>Edit</button> : null}
                {entry.record.user_id === session?.user?.id ? <button className="danger-button icon-button" type="button" aria-label="Delete endorsement" disabled={busy} onClick={() => void handleDeleteEndorsement(entry.record)}><ActionIcon kind="delete" /></button> : null}</div></div>
          </article> : <article key={`item:${entry.item.id}`} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{entry.item.category || "Record"}</p>
              <h3 className="mt-1 text-sm font-semibold text-slate-950">{entry.item.title}</h3><p className="mt-1 text-xs text-slate-500">{formatRecordDate(entry.item.record_date)}</p>
              {entry.item.notes ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{entry.item.notes}</p> : null}
              {entry.item.original_file_name ? <p className="mt-2 text-xs text-slate-500">{entry.item.original_file_name}{entry.item.file_size_bytes ? ` · ${formatFileSize(entry.item.file_size_bytes)}` : ""}</p> : null}</div>
              <div className="data-row-actions">{entry.item.storage_path ? <button className="secondary-button icon-button" type="button" aria-label={`Open ${entry.item.original_file_name ?? "attachment"}`} disabled={busy} onClick={() => void openStudentFile(entry.item)}><ActionIcon kind="file" /></button> : null}
                {personalOwnerView ? <button className="secondary-button" type="button" onClick={() => openItemForm(entry.item)}>Edit</button> : null}
                {personalOwnerView ? <button className="danger-button icon-button" type="button" aria-label="Delete record content" disabled={busy} onClick={() => void handleDeleteItem(entry.item)}><ActionIcon kind="delete" /></button> : null}</div></div>
          </article>)}
      </div> : null}
    </DetailDrawer>

    <DetailDrawer open={folderFormOpen} title="Add student record" description="Select an existing student. An existing record will be opened instead of duplicated." onClose={() => setFolderFormOpen(false)}>
      <div className="space-y-4"><label className="saas-field"><span>Student</span><select value={selectedStudentId} onChange={(event) => setSelectedStudentId(event.target.value)}>
        <option value="">Select student</option>{people.map((person) => <option key={person.saved_person_id} value={person.saved_person_id}>{person.formal_name}{existingStudentIds.has(person.saved_person_id) ? " · existing record" : ""}</option>)}</select></label>
        <div className="flex justify-end gap-2"><button className="secondary-button" type="button" onClick={() => setFolderFormOpen(false)}>Cancel</button><button className="primary-button" type="button" disabled={busy || !selectedStudentId} onClick={() => void handleCreateFolder()}>Open record</button></div></div>
    </DetailDrawer>

    <DetailDrawer open={itemFormOpen} title={editingItem ? "Edit record content" : "Add record content"} onClose={() => setItemFormOpen(false)}>
      <div className="space-y-4"><label className="saas-field"><span>Title</span><input value={itemForm.title} maxLength={120} onChange={(event) => setItemForm((value) => ({ ...value, title: event.target.value }))} /></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="saas-field"><span>Record date</span><input type="date" value={itemForm.recordDate} onChange={(event) => setItemForm((value) => ({ ...value, recordDate: event.target.value }))} /></label>
          <label className="saas-field"><span>Category</span><input value={itemForm.category} maxLength={80} onChange={(event) => setItemForm((value) => ({ ...value, category: event.target.value }))} /></label></div>
        <label className="saas-field"><span>Notes</span><textarea rows={6} maxLength={10000} value={itemForm.notes} onChange={(event) => setItemForm((value) => ({ ...value, notes: event.target.value }))} /></label>
        <label className="saas-field"><span>Attachment</span><input key={fileInputKey} type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => setItemFile(event.target.files?.[0] ?? null)} /><small>PDF, JPG, or PNG · maximum 5 MB</small></label>
        {editingItem?.storage_path ? <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={removeExistingFile} disabled={Boolean(itemFile)} onChange={(event) => setRemoveExistingFile(event.target.checked)} />Remove current attachment</label> : null}
        <div className="flex justify-end gap-2"><button className="secondary-button" type="button" onClick={() => setItemFormOpen(false)}>Cancel</button><button className="primary-button" type="button" disabled={busy} onClick={() => void handleSaveItem()}>{busy ? "Saving…" : "Save"}</button></div></div>
    </DetailDrawer>

    <DetailDrawer open={Boolean(activeRecord)} title={activeRecord ? `Endorsement · ${activeRecord.student_name}` : "Endorsement"} onClose={() => { setActiveRecord(null); setActivePdfUrl(""); }}>
      {activePdfUrl ? <div className="space-y-3"><div className="flex justify-end"><a className="secondary-button icon-button" href={activePdfUrl} target="_blank" rel="noreferrer" aria-label="Open PDF in a new tab"><ActionIcon kind="external" /></a></div><iframe title="Endorsement PDF" src={activePdfUrl} className="min-h-[70vh] w-full rounded-lg border border-slate-200" /></div> : null}
    </DetailDrawer>
    <DetailDrawer open={Boolean(activeItem)} title={activeItem?.title ?? "Attachment"} onClose={() => { setActiveItem(null); setActiveFileUrl(""); }}>
      {activeItem && activeFileUrl ? <div className="space-y-3"><div className="flex justify-end"><a className="secondary-button" href={activeFileUrl} target="_blank" rel="noreferrer">Download</a></div>
        <iframe title={activeItem.title} src={activeFileUrl} className="min-h-[70vh] w-full rounded-lg border border-slate-200 bg-white" /></div> : null}
    </DetailDrawer>
  </>;
}
