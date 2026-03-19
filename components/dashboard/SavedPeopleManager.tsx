"use client";

import { type Dispatch, type SetStateAction, useEffect, useState } from "react";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import Badge from "@/components/ui/Badge";
import {
  createSavedPerson,
  deleteSavedPerson,
  fetchSavedPeople,
  formatStoredDateForDisplay,
  formatUsDateInput,
  getExpirationStatus,
  isOnOrAfterToday,
  setDefaultCfi,
  updateSavedPerson,
  type SavedPerson,
  type SavedPersonRole,
} from "@/lib/saved-people";

const emptyCfiForm = {
  cert_exp_date: "",
  cert_number: "",
  display_name: "",
  is_default: false,
};

const emptyStudentForm = {
  cert_number: "",
  display_name: "",
};

type DraftState = {
  display_name: string;
  cert_number: string;
  cert_exp_date: string;
};

function createDraft(person: SavedPerson): DraftState {
  return {
    display_name: person.display_name,
    cert_number: person.cert_number ?? "",
    cert_exp_date: formatStoredDateForDisplay(person.cert_exp_date),
  };
}

function expirationBadge(person: SavedPerson) {
  const status = getExpirationStatus(person.cert_exp_date);

  if (status === "valid") {
    return <Badge tone="success">Valid</Badge>;
  }

  if (status === "expiring-soon") {
    return <Badge tone="caution">Expiring soon</Badge>;
  }

  if (status === "expired") {
    return <Badge tone="warning">Expired</Badge>;
  }

  return <Badge tone="neutral">No expiration</Badge>;
}

function toggleSection(
  section: "cfis" | "students",
  showCfis: boolean,
  showStudents: boolean,
  setShowCfis: Dispatch<SetStateAction<boolean>>,
  setShowStudents: Dispatch<SetStateAction<boolean>>
) {
  if (section === "cfis") {
    const next = !showCfis;
    setShowCfis(next);
    setShowStudents(false);
    return;
  }

  const next = !showStudents;
  setShowStudents(next);
  setShowCfis(false);
}

export default function SavedPeopleManager() {
  const { session } = useAuthSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [cfis, setCfis] = useState<SavedPerson[]>([]);
  const [students, setStudents] = useState<SavedPerson[]>([]);
  const [cfiForm, setCfiForm] = useState(emptyCfiForm);
  const [studentForm, setStudentForm] = useState(emptyStudentForm);
  const [showCfiForm, setShowCfiForm] = useState(false);
  const [showStudentForm, setShowStudentForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [showCfis, setShowCfis] = useState(false);
  const [showStudents, setShowStudents] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSavedPeople() {
      if (!session?.user?.id) {
        if (!cancelled) {
          setCfis([]);
          setStudents([]);
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        const [nextCfis, nextStudents] = await Promise.all([
          fetchSavedPeople(session.user.id, "cfi"),
          fetchSavedPeople(session.user.id, "student"),
        ]);

        if (!cancelled) {
          setCfis(nextCfis);
          setStudents(nextStudents);
          setStatus("");
        }
      } catch (error) {
        console.error(error);

        if (!cancelled) {
          setStatus("Unable to load saved people right now.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSavedPeople();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  async function refreshSavedPeople() {
    if (!session?.user?.id) {
      return;
    }

    const [nextCfis, nextStudents] = await Promise.all([
      fetchSavedPeople(session.user.id, "cfi"),
      fetchSavedPeople(session.user.id, "student"),
    ]);

    setCfis(nextCfis);
    setStudents(nextStudents);
  }

  function startEditing(person: SavedPerson) {
    setEditingId(person.id);
    setDrafts((current) => ({
      ...current,
      [person.id]: createDraft(person),
    }));
  }

  function cancelEditing(id: string) {
    setEditingId((current) => (current === id ? null : current));
    setDrafts((current) => {
      const nextDrafts = { ...current };
      delete nextDrafts[id];
      return nextDrafts;
    });
  }

  function updateDraft(id: string, field: keyof DraftState, value: string) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? { cert_exp_date: "", cert_number: "", display_name: "" }),
        [field]: field === "cert_exp_date" ? formatUsDateInput(value) : value,
      },
    }));
  }

  async function handleSave(role: SavedPersonRole) {
    if (!session?.user?.id) {
      setStatus("You must be signed in to save people.");
      return;
    }

    setSaving(true);

    try {
      if (role === "cfi") {
        if (cfiForm.cert_exp_date.trim() && !isOnOrAfterToday(cfiForm.cert_exp_date)) {
          setStatus("Certificate expiration date cannot be earlier than today.");
          setSaving(false);
          return;
        }

        await createSavedPerson({ userId: session.user.id, role, ...cfiForm });
        setCfiForm(emptyCfiForm);
        setShowCfiForm(false);
      } else {
        await createSavedPerson({ userId: session.user.id, role, ...studentForm });
        setStudentForm(emptyStudentForm);
        setShowStudentForm(false);
      }

      await refreshSavedPeople();
      setStatus(`${role === "cfi" ? "CFI" : "Student"} profile saved.`);
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  }

  async function handleInlineSave(person: SavedPerson) {
    if (!session?.user?.id) {
      setStatus("You must be signed in to manage saved people.");
      return;
    }

    const draft = drafts[person.id];
    if (!draft?.display_name.trim()) {
      setStatus("Name is required.");
      return;
    }

    setSaving(true);

    try {
      if (person.role === "cfi" && draft.cert_exp_date.trim() && !isOnOrAfterToday(draft.cert_exp_date)) {
        setStatus("Certificate expiration date cannot be earlier than today.");
        setSaving(false);
        return;
      }

      const expirationChanged =
        person.role === "cfi" &&
        draft.cert_exp_date.trim() !== formatStoredDateForDisplay(person.cert_exp_date);

      await updateSavedPerson(session.user.id, person.id, {
        display_name: draft.display_name,
        cert_number: draft.cert_number,
        cert_exp_date: person.role === "cfi" ? draft.cert_exp_date : undefined,
        alert_sent: expirationChanged ? false : undefined,
      });
      await refreshSavedPeople();
      cancelEditing(person.id);
      setStatus("Saved profile updated.");
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!session?.user?.id) {
      setStatus("You must be signed in to manage saved people.");
      return;
    }

    setSaving(true);

    try {
      await deleteSavedPerson(session.user.id, id);
      await refreshSavedPeople();
      setStatus("Saved profile deleted.");
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Failed to delete profile.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSetDefault(id: string) {
    if (!session?.user?.id) {
      setStatus("You must be signed in to manage saved people.");
      return;
    }

    setSaving(true);

    try {
      await setDefaultCfi(session.user.id, id);
      await refreshSavedPeople();
      setStatus("Default CFI updated. Endorsement tools will use this record first.");
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Failed to update default CFI.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6">
      {loading ? <p className="saas-meta-text">Loading saved people...</p> : null}
      {!loading && status ? <p className="saas-meta-text">{status}</p> : null}

      <section className="saas-form-grid">
        <article className="saas-panel">
          <button
            type="button"
            className="saas-section-toggle"
            onClick={() =>
              toggleSection("cfis", showCfis, showStudents, setShowCfis, setShowStudents)
            }
          >
            <h3 className="saas-subsection-title">Saved CFIs</h3>
            <span className="saas-pill">{cfis.length}</span>
          </button>

          {showCfis ? (
            <>
          <div className="mt-5 grid gap-3">
            {cfis.length === 0 ? (
              <p className="saas-empty-state">No CFIs saved yet.</p>
            ) : (
              cfis.map((person) => {
                const isEditing = editingId === person.id;
                const draft = drafts[person.id] ?? createDraft(person);

                return (
                  <article key={person.id} className="saas-list-item saas-list-item-stack">
                    {isEditing ? (
                      <div className="saas-inline-form w-full">
                        <label className="saas-field">
                          <span>Name</span>
                          <input
                            value={draft.display_name}
                            onChange={(event) => updateDraft(person.id, "display_name", event.target.value)}
                          />
                        </label>
                        <label className="saas-field">
                          <span>Certificate number</span>
                          <input
                            value={draft.cert_number}
                            onChange={(event) => updateDraft(person.id, "cert_number", event.target.value)}
                          />
                        </label>
                        <label className="saas-field">
                          <span>Certificate expiration</span>
                          <input
                            placeholder="MM/DD/YYYY"
                            value={draft.cert_exp_date}
                            onChange={(event) => updateDraft(person.id, "cert_exp_date", event.target.value)}
                          />
                        </label>
                        <div className="saas-inline-actions">
                          <button
                            type="button"
                            className="primary-button"
                            disabled={saving}
                            onClick={() => void handleInlineSave(person)}
                          >
                            {saving ? "Saving..." : "Save changes"}
                          </button>
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={saving}
                            onClick={() => cancelEditing(person.id)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="saas-list-main">
                          <div className="saas-list-header">
                            <h4 className="saas-card-title">{person.display_name}</h4>
                            <div className="saas-list-badges">
                              {person.is_default ? <Badge tone="neutral">Default CFI</Badge> : null}
                              {expirationBadge(person)}
                            </div>
                          </div>
                          <p className="saas-meta-text">{person.cert_number || "No certificate number"}</p>
                          <p className="saas-meta-text">
                            {person.cert_exp_date
                              ? formatStoredDateForDisplay(person.cert_exp_date)
                              : "No expiration saved"}
                          </p>
                        </div>
                        <div className="saas-inline-actions">
                          {!person.is_default ? (
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={saving}
                              onClick={() => void handleSetDefault(person.id)}
                            >
                              Set as default
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={saving}
                            onClick={() => startEditing(person)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="danger-button"
                            disabled={saving}
                            onClick={() => void handleDelete(person.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </article>
                );
              })
            )}
          </div>

          <div className="mt-5 grid gap-3">
            <button
              type="button"
              className="secondary-button justify-center"
              onClick={() => setShowCfiForm((current) => !current)}
            >
              {showCfiForm ? "Hide Add CFI" : "+ Add CFI"}
            </button>

            {showCfiForm ? (
              <div className="saas-inline-form">
                <label className="saas-field">
                  <span>Name</span>
                  <input
                    value={cfiForm.display_name}
                    onChange={(event) =>
                      setCfiForm((current) => ({ ...current, display_name: event.target.value }))
                    }
                  />
                </label>
                <label className="saas-field">
                  <span>Certificate number</span>
                  <input
                    value={cfiForm.cert_number}
                    onChange={(event) =>
                      setCfiForm((current) => ({ ...current, cert_number: event.target.value }))
                    }
                  />
                </label>
                <label className="saas-field">
                  <span>Certificate expiration</span>
                  <input
                    placeholder="MM/DD/YYYY"
                    value={cfiForm.cert_exp_date}
                    onChange={(event) =>
                      setCfiForm((current) => ({
                        ...current,
                        cert_exp_date: formatUsDateInput(event.target.value),
                      }))
                    }
                  />
                </label>
                <label className="flex items-center gap-3 text-sm text-[var(--muted)]">
                  <input
                    type="checkbox"
                    checked={cfiForm.is_default}
                    onChange={(event) =>
                      setCfiForm((current) => ({ ...current, is_default: event.target.checked }))
                    }
                  />
                  Set as default CFI
                </label>
                <button
                  type="button"
                  className="primary-button justify-center"
                  disabled={saving || !cfiForm.display_name.trim()}
                  onClick={() => void handleSave("cfi")}
                >
                  {saving ? "Saving..." : "Save CFI"}
                </button>
              </div>
            ) : null}
          </div>
            </>
          ) : null}
        </article>

        <article className="saas-panel">
          <button
            type="button"
            className="saas-section-toggle"
            onClick={() =>
              toggleSection("students", showCfis, showStudents, setShowCfis, setShowStudents)
            }
          >
            <h3 className="saas-subsection-title">Saved students</h3>
            <span className="saas-pill">{students.length}</span>
          </button>

          {showStudents ? (
            <>
          <div className="mt-5 grid gap-3">
            {students.length === 0 ? (
              <p className="saas-empty-state">No students saved yet.</p>
            ) : (
              students.map((person) => {
                const isEditing = editingId === person.id;
                const draft = drafts[person.id] ?? createDraft(person);

                return (
                  <article key={person.id} className="saas-list-item saas-list-item-stack">
                    {isEditing ? (
                      <div className="saas-inline-form w-full">
                        <label className="saas-field">
                          <span>Name</span>
                          <input
                            value={draft.display_name}
                            onChange={(event) => updateDraft(person.id, "display_name", event.target.value)}
                          />
                        </label>
                        <label className="saas-field">
                          <span>Certificate number</span>
                          <input
                            value={draft.cert_number}
                            onChange={(event) => updateDraft(person.id, "cert_number", event.target.value)}
                          />
                        </label>
                        <div className="saas-inline-actions">
                          <button
                            type="button"
                            className="primary-button"
                            disabled={saving}
                            onClick={() => void handleInlineSave(person)}
                          >
                            {saving ? "Saving..." : "Save changes"}
                          </button>
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={saving}
                            onClick={() => cancelEditing(person.id)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="saas-list-main">
                          <h4 className="saas-card-title">{person.display_name}</h4>
                          <p className="saas-meta-text">{person.cert_number || "No certificate number"}</p>
                        </div>
                        <div className="saas-inline-actions">
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={saving}
                            onClick={() => startEditing(person)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="danger-button"
                            disabled={saving}
                            onClick={() => void handleDelete(person.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </article>
                );
              })
            )}
          </div>

          <div className="mt-5 grid gap-3">
            <button
              type="button"
              className="secondary-button justify-center"
              onClick={() => setShowStudentForm((current) => !current)}
            >
              {showStudentForm ? "Hide Add Student" : "+ Add Student"}
            </button>

            {showStudentForm ? (
              <div className="saas-inline-form">
                <label className="saas-field">
                  <span>Name</span>
                  <input
                    value={studentForm.display_name}
                    onChange={(event) =>
                      setStudentForm((current) => ({ ...current, display_name: event.target.value }))
                    }
                  />
                </label>
                <label className="saas-field">
                  <span>Certificate number</span>
                  <input
                    value={studentForm.cert_number}
                    onChange={(event) =>
                      setStudentForm((current) => ({ ...current, cert_number: event.target.value }))
                    }
                  />
                </label>
                <button
                  type="button"
                  className="primary-button justify-center"
                  disabled={saving || !studentForm.display_name.trim()}
                  onClick={() => void handleSave("student")}
                >
                  {saving ? "Saving..." : "Save student"}
                </button>
              </div>
            ) : null}
          </div>
            </>
          ) : null}
        </article>
      </section>
    </div>
  );
}
