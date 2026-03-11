"use client";

import { useEffect, useState } from "react";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import {
  createSavedPerson,
  deleteSavedPerson,
  fetchSavedPeople,
  type SavedPerson,
  type SavedPersonRole,
} from "@/lib/saved-people";

const emptyCfiForm = {
  cert_exp_date: "",
  cert_number: "",
  display_name: "",
};

const emptyStudentForm = {
  cert_number: "",
  display_name: "",
};

export default function SavedPeopleManager() {
  const { session } = useAuthSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("Manage saved CFI and student profiles here.");
  const [cfis, setCfis] = useState<SavedPerson[]>([]);
  const [students, setStudents] = useState<SavedPerson[]>([]);
  const [cfiForm, setCfiForm] = useState(emptyCfiForm);
  const [studentForm, setStudentForm] = useState(emptyStudentForm);
  const [showCfiForm, setShowCfiForm] = useState(false);
  const [showStudentForm, setShowStudentForm] = useState(false);

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
          setStatus("Saved people synchronized with Supabase.");
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

  async function handleSave(role: SavedPersonRole) {
    if (!session?.user?.id) {
      setStatus("You must be signed in to save people.");
      return;
    }

    setSaving(true);

    try {
      if (role === "cfi") {
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

  return (
    <div className="grid gap-6">
      <section className="saas-panel">
        <p className="eyebrow">Saved people</p>
        <h2 className="saas-section-title">Reusable pilot records</h2>
        <p className="saas-section-copy">
          Store CFI and student details for faster autofill across PilotSeal tools.
        </p>
        <p className="saas-feedback saas-feedback-info mt-5">
          {loading ? "Loading saved people..." : status}
        </p>
      </section>

      <section className="saas-form-grid">
        <article className="saas-panel">
          <div className="flex items-center justify-between gap-3">
            <h3 className="saas-subsection-title">Saved CFIs</h3>
            <span className="saas-pill">{cfis.length}</span>
          </div>

          <div className="mt-5 grid gap-3">
            {cfis.length === 0 ? (
              <p className="saas-empty-state">No CFIs saved yet.</p>
            ) : (
              cfis.map((person) => (
                <article key={person.id} className="saas-list-item">
                  <div>
                    <h4 className="saas-card-title">{person.display_name}</h4>
                    <p className="saas-meta-text">{person.cert_number || "No certificate number"}</p>
                    <p className="saas-meta-text">{person.cert_exp_date || "No expiration saved"}</p>
                  </div>
                  <button
                    type="button"
                    className="danger-button"
                    disabled={saving}
                    onClick={() => handleDelete(person.id)}
                  >
                    Delete
                  </button>
                </article>
              ))
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
                    placeholder="MM/YYYY"
                    value={cfiForm.cert_exp_date}
                    onChange={(event) =>
                      setCfiForm((current) => ({ ...current, cert_exp_date: event.target.value }))
                    }
                  />
                </label>
                <button
                  type="button"
                  className="primary-button justify-center"
                  disabled={saving || !cfiForm.display_name.trim()}
                  onClick={() => handleSave("cfi")}
                >
                  {saving ? "Saving..." : "Save CFI"}
                </button>
              </div>
            ) : null}
          </div>
        </article>

        <article className="saas-panel">
          <div className="flex items-center justify-between gap-3">
            <h3 className="saas-subsection-title">Saved students</h3>
            <span className="saas-pill">{students.length}</span>
          </div>

          <div className="mt-5 grid gap-3">
            {students.length === 0 ? (
              <p className="saas-empty-state">No students saved yet.</p>
            ) : (
              students.map((person) => (
                <article key={person.id} className="saas-list-item">
                  <div>
                    <h4 className="saas-card-title">{person.display_name}</h4>
                    <p className="saas-meta-text">{person.cert_number || "No certificate number"}</p>
                  </div>
                  <button
                    type="button"
                    className="danger-button"
                    disabled={saving}
                    onClick={() => handleDelete(person.id)}
                  >
                    Delete
                  </button>
                </article>
              ))
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
                  onClick={() => handleSave("student")}
                >
                  {saving ? "Saving..." : "Save student"}
                </button>
              </div>
            ) : null}
          </div>
        </article>
      </section>
    </div>
  );
}
