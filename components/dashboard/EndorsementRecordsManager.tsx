"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminDataTable, AdminNameList, AdminPagination, CompactButton, ConfirmDialog, DetailDrawer, ManagementDisclosure } from "@/components/admin/AdminConsole";
import { usePersistentDashboardView } from "@/components/admin/usePersistentDashboardView";
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
  return Array.from(groups.values()).sort((a, b) =>
    a.studentName.localeCompare(b.studentName, undefined, { sensitivity: "base" })
  );
}

function groupMatches(group: StudentGroup, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [group.studentName, group.studentCertNumber ?? ""].join(" ").toLowerCase().includes(normalized);
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
  const [storedView, setStoredView] = usePersistentDashboardView({
    defaultValue: "personal",
    enabled: !organizationOnly,
    storageKey: "personal-endorsements",
    values: ["personal", "received", "organization"] as const,
  });
  const view: RecordView = organizationOnly ? "organization" : storedView;
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [records, setRecords] = useState<EndorsementRecord[]>([]);
  const [folders, setFolders] = useState<StudentRecordFolder[]>([]);
  const [items, setItems] = useState<StudentRecordItem[]>([]);
  const [people, setPeople] = useState<EndorsementPerson[]>([]);
  const [query, setQuery] = useState("");
  const [activeGroupKey, setActiveGroupKey] = useState<string | null>(null);
  const [activeGroupPage, setActiveGroupPage] = useState(1);
  const [activeRecord, setActiveRecord] = useState<EndorsementRecord | null>(null);
  const [recordToDelete, setRecordToDelete] = useState<EndorsementRecord | null>(null);
  const [activePdfUrl, setActivePdfUrl] = useState("");
  const [activeItem, setActiveItem] = useState<StudentRecordItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<StudentRecordItem | null>(null);
  const [activeFileUrl, setActiveFileUrl] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [itemFormOpen, setItemFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<StudentRecordItem | null>(null);
  const [itemForm, setItemForm] = useState<ItemForm>(emptyItemForm);
  const [itemFormError, setItemFormError] = useState("");
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
  const sortedPeople = useMemo(() => [...people].sort((a, b) =>
    a.formal_name.localeCompare(b.formal_name, undefined, { sensitivity: "base" })
  ), [people]);
  const sortedOrganizationRecords = useMemo(() => [...records].sort((a, b) => (
    a.student_name.localeCompare(b.student_name, undefined, { sensitivity: "base" })
    || b.created_at.localeCompare(a.created_at)
  )), [records]);
  const activeGroup = groups.find((group) => group.key === activeGroupKey) ?? null;
  const activeGroupEntries = useMemo(() => activeGroup ? [
    ...activeGroup.endorsements.map((record) => ({ kind: "endorsement" as const, date: record.endorsement_date, created: record.created_at, record })),
    ...activeGroup.items.map((item) => ({ kind: "item" as const, date: item.record_date, created: item.created_at, item })),
  ].sort((a, b) => (b.date || b.created).localeCompare(a.date || a.created)) : [], [activeGroup]);
  const activeGroupPageSize = 20;
  const visibleActiveGroupEntries = activeGroupEntries.slice(
    (activeGroupPage - 1) * activeGroupPageSize,
    activeGroupPage * activeGroupPageSize,
  );
  const isOrganizationView = organizationOnly || view === "organization";
  const personalOwnerView = !organizationOnly && view === "personal";

  useEffect(() => {
    setActiveGroupPage(1);
  }, [activeGroupKey]);

  async function openEndorsement(record: EndorsementRecord) {
    setBusy(true); setStatus("");
    try { setActivePdfUrl(await createEndorsementRecordSignedUrl(record.storage_path)); setActiveRecord(record); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Unable to open the saved PDF."); }
    finally { setBusy(false); }
  }

  async function handleDeleteEndorsement(record: EndorsementRecord) {
    setBusy(true);
    try {
      await deleteEndorsementRecord(record);
      setRecords((current) => current.filter((item) => item.id !== record.id));
      setActiveRecord(null); setStatus("Endorsement record deleted.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Unable to delete record."); }
    finally { setBusy(false); }
  }

  function openAddRecordForm() {
    setEditingItem(null);
    setSelectedStudentId("");
    setItemForm(emptyItemForm());
    setItemFormError("");
    setItemFile(null); setRemoveExistingFile(false); setFileInputKey((value) => value + 1); setItemFormOpen(true);
  }

  function openEditItemForm(item: StudentRecordItem) {
    setEditingItem(item);
    setItemForm({ title: item.title, recordDate: item.record_date,
      category: item.category ?? "", notes: item.notes ?? "" });
    setItemFormError("");
    setItemFile(null); setRemoveExistingFile(false); setFileInputKey((value) => value + 1); setItemFormOpen(true);
  }

  async function handleSaveItem() {
    const userId = session?.user?.id;
    if (!userId || (!editingItem && !selectedStudentId) || !itemForm.title.trim() || !itemForm.recordDate) {
      setItemFormError(!editingItem && !selectedStudentId ? "Select a student first." : "Title and record date are required."); return;
    }
    if (itemFile) {
      try { validateStudentRecordFile(itemFile); }
      catch (error) { setItemFormError(error instanceof Error ? error.message : "Invalid attachment."); return; }
    }
    setBusy(true); setStatus(""); setItemFormError("");
    const itemId = editingItem?.id ?? crypto.randomUUID();
    let uploadedPath: string | null = null;
    const previousPath = editingItem?.storage_path ?? null;
    try {
      let folder = editingItem ? activeGroup?.folder ?? null
        : folders.find((value) => value.student_id === selectedStudentId) ?? null;
      if (!folder && !editingItem) {
        folder = await createStudentRecordFolder(selectedStudentId);
        setFolders((current) => [folder as StudentRecordFolder, ...current.filter((value) => value.id !== folder?.id)]);
      }
      if (!folder) throw new Error("Unable to find the student record.");
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
      setItemFormOpen(false); setSelectedStudentId(""); setActiveGroupKey(`folder:${folder.id}`);
      setStatus(editingItem ? "Student record updated." : "Record added.");
    } catch (error) {
      if (uploadedPath) await removeStudentRecordFiles([uploadedPath]).catch(() => {});
      setItemFormError(error instanceof Error ? error.message : "Unable to save the student record.");
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
    <ManagementDisclosure id="endorsement-records" title={organizationOnly ? "Issued endorsements" : "Endorsements"}
      summary={loading ? "Loading…" : isOrganizationView ? `${records.length}` : `${groups.length} students`}
      className="dashboard-data-workspace" defaultOpen
      helpContent={organizationOnly ? <p>Shows endorsements issued while the instructor belonged to this organization.</p>
        : <p>Each student has one record containing issued endorsements, notes, and private files shared with that student account.</p>}>
      {!organizationOnly ? <div className="console-page-subnavigation flex min-h-10 items-stretch border-b border-slate-200 bg-white">
        <nav className="flex min-w-0 flex-1 gap-0 overflow-x-auto" aria-label="Student record views">
          {([ ["personal", "My student records"], ["received", "Shared with me"], ["organization", "Organization activity"] ] as const).map(([key, label]) =>
            <button key={key} type="button" aria-current={view === key ? "page" : undefined}
              className={`shrink-0 border-b-2 px-3 text-xs font-medium transition-colors ${view === key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-950"}`}
              onClick={() => { setStoredView(key); setActiveGroupKey(null); }}>{label}</button>)}
        </nav>
      </div> : null}
      <div className="admin-toolbar flex flex-col items-start gap-2 border-b border-slate-200 py-2 sm:flex-row sm:items-center">
        <label className="w-72 max-w-full flex-none"><span className="sr-only">Search students</span><input className="h-9 w-full rounded-sm border border-slate-300 px-3 text-sm" type="search" value={query}
          onChange={(event) => setQuery(event.target.value)} placeholder="Search students" /></label>
        {query ? <button className="ghost-button" type="button" onClick={() => setQuery("")}>Clear search</button> : null}
        {personalOwnerView ? <div className="sm:ml-auto"><CompactButton type="button" tone="primary" onClick={openAddRecordForm}>Add record</CompactButton></div> : null}
      </div>
      {loading ? <p className="saas-meta-text mt-5">Loading records...</p> : null}
      {!loading && (isOrganizationView ? records.length === 0 : filteredGroups.length === 0)
        ? <p className="saas-empty-state mt-5">{query.trim() ? "No records match your search." : "No student records saved yet."}</p> : null}
      {isOrganizationView && records.length > 0 ? <div className="mt-3"><AdminDataTable label="Organization endorsement records">
        <thead><tr><th>Student</th><th>Endorsement</th><th>Date</th><th>Instructor</th><th>Saved</th><th aria-label="Actions" /></tr></thead>
        <tbody>{sortedOrganizationRecords.map((record) => <tr key={record.id}><td className="font-semibold text-slate-900">{record.student_name}</td>
          <td>{record.template_titles.length ? record.template_titles.join(", ") : "Endorsement PDF"}</td>
          <td>{formatRecordDate(record.endorsement_date)}</td><td>{record.instructor_name}</td><td>{formatUsDateTime(record.created_at, "")}</td>
          <td><button className="secondary-button icon-button" type="button" aria-label={`View PDF for ${record.student_name}`} disabled={busy} onClick={() => void openEndorsement(record)}><ActionIcon kind="open" /></button></td></tr>)}</tbody>
      </AdminDataTable></div> : null}
      {!isOrganizationView && filteredGroups.length > 0 ? <div className="mt-3"><AdminNameList
        label="Student records"
        emptyLabel="No student records saved yet."
        items={filteredGroups.map((group) => ({ id: group.key, name: group.studentName }))}
        onSelect={(item) => setActiveGroupKey(item.id)}
      /></div> : null}
    </ManagementDisclosure>

    <DetailDrawer open={Boolean(activeGroup)} title={activeGroup?.studentName ?? "Student record"} onClose={() => setActiveGroupKey(null)}>
      {activeGroup ? <div className="space-y-4">
        {activeGroup.endorsements.length + activeGroup.items.length === 0 ? <p className="saas-empty-state">This student record is empty.</p> : null}
        <div className="border-x border-t border-slate-200 bg-white">
          {visibleActiveGroupEntries.map((entry) => entry.kind === "endorsement" ? <button key={`endorsement:${entry.record.id}`} type="button" className="flex min-h-9 w-full items-center border-b border-slate-200 px-3 py-2 text-left text-[13px] font-medium text-slate-900 hover:bg-slate-50 focus-visible:bg-blue-50" disabled={busy} onClick={() => void openEndorsement(entry.record)}>
            <span className="min-w-0 break-words">{entry.record.template_titles.join(", ") || "Endorsement PDF"}</span>
          </button> : <button key={`item:${entry.item.id}`} type="button" className="flex min-h-9 w-full items-center border-b border-slate-200 px-3 py-2 text-left text-[13px] font-medium text-slate-900 hover:bg-slate-50 focus-visible:bg-blue-50" disabled={busy} onClick={() => entry.item.storage_path ? void openStudentFile(entry.item) : setActiveItem(entry.item)}>
            <span className="min-w-0 break-words">{entry.item.title}</span>
          </button>)}
        </div>
        <AdminPagination page={activeGroupPage} pageSize={activeGroupPageSize} total={activeGroupEntries.length} onPageChange={setActiveGroupPage} />
      </div> : null}
    </DetailDrawer>

    <DetailDrawer open={itemFormOpen} title={editingItem ? "Edit record" : "Add record"} onClose={() => { setItemFormOpen(false); setItemFormError(""); }}>
      <div className="space-y-4">
        {!editingItem ? <label className="saas-field"><span>Student</span><select value={selectedStudentId} onChange={(event) => setSelectedStudentId(event.target.value)}>
          <option value="">Select student</option>{sortedPeople.map((person) => <option key={person.saved_person_id} value={person.saved_person_id}>{person.formal_name}</option>)}</select></label> : null}
        <label className="saas-field"><span>Title</span><input value={itemForm.title} maxLength={120} onChange={(event) => setItemForm((value) => ({ ...value, title: event.target.value }))} /></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="saas-field"><span>Record date</span><input type="date" value={itemForm.recordDate} onChange={(event) => setItemForm((value) => ({ ...value, recordDate: event.target.value }))} /></label>
          <label className="saas-field"><span>Category</span><input value={itemForm.category} maxLength={80} onChange={(event) => setItemForm((value) => ({ ...value, category: event.target.value }))} /></label></div>
        <label className="saas-field"><span>Notes</span><textarea rows={6} maxLength={10000} value={itemForm.notes} onChange={(event) => setItemForm((value) => ({ ...value, notes: event.target.value }))} /></label>
        <label className="saas-field"><span>Attachment</span><input key={fileInputKey} type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => setItemFile(event.target.files?.[0] ?? null)} /><small>PDF, JPG, or PNG · maximum 5 MB</small></label>
        {editingItem?.storage_path ? <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={removeExistingFile} disabled={Boolean(itemFile)} onChange={(event) => setRemoveExistingFile(event.target.checked)} />Remove current attachment</label> : null}
        {itemFormError ? <p className="border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">{itemFormError}</p> : null}
        <div className="flex justify-end gap-2"><button className="secondary-button" type="button" onClick={() => { setItemFormOpen(false); setItemFormError(""); }}>Cancel</button><button className="primary-button" type="button" disabled={busy} onClick={() => void handleSaveItem()}>{busy ? "Saving…" : "Save"}</button></div></div>
    </DetailDrawer>

    <DetailDrawer open={Boolean(activeRecord)} title={activeRecord ? `Endorsement · ${activeRecord.student_name}` : "Endorsement"} onClose={() => { setActiveRecord(null); setActivePdfUrl(""); }}>
      {activeRecord && activePdfUrl ? <div className="space-y-3"><div className="flex justify-end gap-2"><a className="secondary-button icon-button" href={activePdfUrl} target="_blank" rel="noreferrer" aria-label="Open PDF in a new tab"><ActionIcon kind="external" /></a>
        {activeRecord.user_id === session?.user?.id ? <button className="secondary-button" type="button" onClick={() => router.push(`/tools/endorsement-generator?editRecord=${encodeURIComponent(activeRecord.id)}`)}>Edit</button> : null}
        {activeRecord.user_id === session?.user?.id ? <button className="danger-button" type="button" disabled={busy} onClick={() => { setRecordToDelete(activeRecord); setActiveRecord(null); setActivePdfUrl(""); }}>Delete</button> : null}</div><iframe title="Endorsement PDF" src={activePdfUrl} className="min-h-[70vh] w-full rounded-lg border border-slate-200" /></div> : null}
    </DetailDrawer>
    <DetailDrawer open={Boolean(activeItem)} title={activeItem?.title ?? "Attachment"} onClose={() => { setActiveItem(null); setActiveFileUrl(""); }}>
      {activeItem ? <div className="space-y-3"><div className="flex justify-end gap-2">{activeFileUrl ? <a className="secondary-button" href={activeFileUrl} target="_blank" rel="noreferrer">Download</a> : null}
        {personalOwnerView ? <button className="secondary-button" type="button" onClick={() => { setActiveItem(null); setActiveFileUrl(""); openEditItemForm(activeItem); }}>Edit</button> : null}
        {personalOwnerView ? <button className="danger-button" type="button" disabled={busy} onClick={() => { setItemToDelete(activeItem); setActiveItem(null); setActiveFileUrl(""); }}>Delete</button> : null}</div>
        <dl className="grid gap-2 border-y border-slate-200 py-3 text-[13px]"><div><dt className="text-xs text-slate-500">Date</dt><dd className="text-slate-900">{formatRecordDate(activeItem.record_date)}</dd></div>{activeItem.category ? <div><dt className="text-xs text-slate-500">Category</dt><dd className="text-slate-900">{activeItem.category}</dd></div> : null}{activeItem.notes ? <div><dt className="text-xs text-slate-500">Notes</dt><dd className="whitespace-pre-wrap text-slate-700">{activeItem.notes}</dd></div> : null}</dl>
        {activeFileUrl ? <iframe title={activeItem.title} src={activeFileUrl} className="min-h-[70vh] w-full rounded-lg border border-slate-200 bg-white" /> : null}</div> : null}
    </DetailDrawer>
    <ConfirmDialog
      open={Boolean(recordToDelete)}
      title="Delete endorsement"
      description="Permanently delete this endorsement? This cannot be undone."
      confirmLabel="Delete endorsement"
      destructive
      busy={busy}
      onCancel={() => setRecordToDelete(null)}
      onConfirm={() => {
        if (!recordToDelete) return;
        const record = recordToDelete;
        setRecordToDelete(null);
        void handleDeleteEndorsement(record);
      }}
    />
    <ConfirmDialog
      open={Boolean(itemToDelete)}
      title="Delete record content"
      description={`Delete “${itemToDelete?.title ?? "this item"}” from this student record? This cannot be undone.`}
      confirmLabel="Delete content"
      destructive
      busy={busy}
      onCancel={() => setItemToDelete(null)}
      onConfirm={() => {
        if (!itemToDelete) return;
        const item = itemToDelete;
        setItemToDelete(null);
        void handleDeleteItem(item);
      }}
    />
  </>;
}
