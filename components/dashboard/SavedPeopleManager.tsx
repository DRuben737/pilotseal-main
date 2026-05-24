"use client";

import { useEffect, useMemo, useState } from "react";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import Badge from "@/components/ui/Badge";
import { fetchCurrentProfile } from "@/lib/profile";
import {
  CERTIFICATE_TYPE_LABELS,
  convertDisplayDateToIsoDate,
  createPersonCertificate,
  deletePersonCertificate,
  fetchPersonCertificates,
  formatIsoDateForDisplay,
  getCertificateCurrencyLabel,
  getCertificateCurrencyStatus,
  updatePersonCertificate,
  type PersonCertificate,
  type PersonCertificateType,
} from "@/lib/person-certificates";
import {
  createSavedPerson,
  deleteSavedPerson,
  fetchSavedPeople,
  formatUsDateInput,
  updateSavedPerson,
  type SavedPerson,
} from "@/lib/saved-people";

const emptyPersonForm = {
  cert_number: "",
  display_name: "",
  weight_lbs: "",
};

const emptyCertificateForm = {
  certificate_number: "",
  certificate_type: "pilot" as PersonCertificateType,
  issue_date: "",
  last_event_date: "",
  ratings: [] as string[],
  level: "",
  is_default_for_endorsements: false,
  notes: "",
};

type PersonDraft = typeof emptyPersonForm;
type CertificateForm = typeof emptyCertificateForm;

const PILOT_RATING_OPTIONS = [
  "ASEL",
  "AMEL",
  "ASES",
  "AMES",
  "IR-Airplane",
  "IR-Helicopter",
  "Rotorcraft-Helicopter",
  "Rotorcraft-Gyroplane",
  "Glider",
  "Balloon",
  "Powered Lift",
];

const PILOT_LEVEL_OPTIONS = ["Student", "Private", "Commercial", "ATP"];

const RATING_OPTIONS: Record<PersonCertificateType, string[]> = {
  pilot: PILOT_RATING_OPTIONS,
  flight_instructor: PILOT_RATING_OPTIONS,
  ground_instructor: ["Basic", "Instrument", "Advanced"],
};

function createDraft(person: SavedPerson): PersonDraft {
  return {
    cert_number: person.cert_number ?? "",
    display_name: person.display_name,
    weight_lbs: typeof person.weight_lbs === "number" ? String(person.weight_lbs) : "",
  };
}

function createCertificateDraft(certificate: PersonCertificate): CertificateForm {
  return {
    certificate_number: certificate.certificate_number ?? "",
    certificate_type: certificate.certificate_type,
    issue_date: formatIsoDateForDisplay(certificate.issue_date),
    last_event_date: formatIsoDateForDisplay(certificate.last_event_date),
    ratings: certificate.ratings,
    level: certificate.certificate_type === "pilot" ? certificate.event_type ?? "" : "",
    is_default_for_endorsements: certificate.is_default_for_endorsements,
    notes: certificate.notes ?? "",
  };
}

function normalizeRatingsForType(ratings: string[], certificateType: PersonCertificateType) {
  const allowed = new Set(RATING_OPTIONS[certificateType]);
  return ratings.filter((rating) => allowed.has(rating));
}

function certificateBadge(certificate: PersonCertificate) {
  const status = getCertificateCurrencyStatus(certificate);

  if (status === "current") {
    return <Badge tone="success">Current</Badge>;
  }

  if (status === "due-soon") {
    return <Badge tone="caution">Due soon</Badge>;
  }

  if (status === "expired") {
    return <Badge tone="warning">Due</Badge>;
  }

  return <Badge tone="neutral">No date</Badge>;
}

function normalizePeople(people: SavedPerson[]) {
  const seen = new Set<string>();
  return people.filter((person) => {
    if (seen.has(person.id)) {
      return false;
    }
    seen.add(person.id);
    return true;
  });
}

function ActionIcon({
  kind,
}: {
  kind: "add" | "save" | "cancel" | "edit" | "delete" | "default" | "expand" | "search";
}) {
  const common = "h-4 w-4";

  switch (kind) {
    case "add":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={common}>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    case "save":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={common}>
          <path d="M5 12.5l4 4L19 6.5" />
        </svg>
      );
    case "cancel":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={common}>
          <path d="M6 6l12 12" />
          <path d="M18 6L6 18" />
        </svg>
      );
    case "edit":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={common}>
          <path d="M4 20h4l10-10-4-4L4 16v4Z" />
          <path d="M13 7l4 4" />
        </svg>
      );
    case "delete":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={common}>
          <path d="M4 7h16" />
          <path d="M9 7V4h6v3" />
          <path d="M7 7l1 13h8l1-13" />
        </svg>
      );
    case "default":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={common}>
          <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />
        </svg>
      );
    case "expand":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={common}>
          <path d="M9 6l6 6-6 6" />
        </svg>
      );
    case "search":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={common}>
          <circle cx="11" cy="11" r="6" />
          <path d="M16 16l4 4" />
        </svg>
      );
  }
}

function RatingPicker({
  certificateType,
  value,
  onChange,
}: {
  certificateType: PersonCertificateType;
  value: string[];
  onChange: (ratings: string[]) => void;
}) {
  function toggleRating(rating: string) {
    onChange(value.includes(rating) ? value.filter((item) => item !== rating) : [...value, rating]);
  }

  return (
    <div className="rating-picker" role="group" aria-label="Ratings">
      {RATING_OPTIONS[certificateType].map((rating) => (
        <button
          key={rating}
          type="button"
          className={`rating-picker-option ${value.includes(rating) ? "rating-picker-option-active" : ""}`}
          aria-pressed={value.includes(rating)}
          onClick={() => toggleRating(rating)}
        >
          {rating}
        </button>
      ))}
    </div>
  );
}

function CertificateFormFields({
  form,
  saving,
  submitLabel,
  onChange,
  onCancel,
  onSubmit,
}: {
  form: CertificateForm;
  saving: boolean;
  submitLabel: string;
  onChange: (field: keyof CertificateForm, value: string | string[] | boolean) => void;
  onCancel?: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="people-certificate-form">
      <label className="saas-field">
        <span>Certificate type</span>
        <select
          value={form.certificate_type}
          onChange={(event) => onChange("certificate_type", event.target.value as PersonCertificateType)}
        >
          <option value="pilot">Pilot certificate</option>
          <option value="flight_instructor">Flight instructor certificate</option>
          <option value="ground_instructor">Ground instructor certificate</option>
        </select>
      </label>
      <label className="saas-field">
        <span>Certificate number</span>
        <input
          value={form.certificate_number}
          onChange={(event) => onChange("certificate_number", event.target.value)}
        />
      </label>
      {form.certificate_type === "pilot" ? (
        <label className="saas-field">
          <span>Level</span>
          <select value={form.level} onChange={(event) => onChange("level", event.target.value)}>
            <option value="">Select level</option>
            {PILOT_LEVEL_OPTIONS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="saas-field people-ratings-field">
        <span>Ratings</span>
        <RatingPicker
          certificateType={form.certificate_type}
          value={form.ratings}
          onChange={(ratings) => onChange("ratings", ratings)}
        />
      </label>
      <label className="saas-field">
        <span>Last flight review / issuance / activity</span>
        <input
          value={form.last_event_date}
          onChange={(event) => onChange("last_event_date", event.target.value)}
          placeholder="MM/DD/YYYY"
        />
      </label>
      <label className="saas-field people-notes-field">
        <span>Notes</span>
        <textarea value={form.notes} onChange={(event) => onChange("notes", event.target.value)} />
      </label>
      {form.certificate_type === "flight_instructor" || form.certificate_type === "ground_instructor" ? (
        <label className="people-default-check">
          <input
            type="checkbox"
            checked={form.is_default_for_endorsements}
            onChange={(event) => onChange("is_default_for_endorsements", event.target.checked)}
          />
          Default endorsement instructor
        </label>
      ) : null}
      <div className="saas-inline-actions people-form-actions">
        <button
          type="button"
          className="primary-button icon-button"
          aria-label={saving ? "Saving certificate" : submitLabel}
          title={submitLabel}
          disabled={saving}
          onClick={onSubmit}
        >
          <ActionIcon kind="save" />
        </button>
        {onCancel ? (
          <button
            type="button"
            className="secondary-button icon-button"
            aria-label="Cancel certificate edits"
            title="Cancel"
            disabled={saving}
            onClick={onCancel}
          >
            <ActionIcon kind="cancel" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function SavedPeopleManager() {
  const { session } = useAuthSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [people, setPeople] = useState<SavedPerson[]>([]);
  const [certificates, setCertificates] = useState<PersonCertificate[]>([]);
  const [certificatesAvailable, setCertificatesAvailable] = useState(true);
  const [personForm, setPersonForm] = useState(emptyPersonForm);
  const [certificateForms, setCertificateForms] = useState<Record<string, CertificateForm>>({});
  const [showPersonForm, setShowPersonForm] = useState(false);
  const [certificateFormPersonIds, setCertificateFormPersonIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCertificateId, setEditingCertificateId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, PersonDraft>>({});
  const [certificateDrafts, setCertificateDrafts] = useState<Record<string, CertificateForm>>({});
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadPeople() {
      if (!session?.user?.id) {
        if (!cancelled) {
          setPeople([]);
          setCertificates([]);
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        setStatus("");
        const [nextPeople, nextCertificates, nextProfile] = await Promise.all([
          fetchSavedPeople(session.user.id),
          fetchPersonCertificates(session.user.id).catch((error) => {
            console.error("Unable to load person certificates:", error);
            setCertificatesAvailable(false);
            return [];
          }),
          fetchCurrentProfile(session.user.id).catch(() => null),
        ]);

        if (!cancelled) {
          setPeople(normalizePeople(nextPeople).filter((person) => (
            person.role !== "self" && person.id !== nextProfile?.self_person_id
          )));
          setCertificates(nextCertificates);
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : "Unable to load people right now.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPeople();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const certificatesByPerson = useMemo(() => {
    const groups = new Map<string, PersonCertificate[]>();

    certificates.forEach((certificate) => {
      groups.set(certificate.person_id, [...(groups.get(certificate.person_id) ?? []), certificate]);
    });

    return groups;
  }, [certificates]);

  const filteredPeople = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return people;
    }

    return people.filter((person) => {
      const personCertificates = certificatesByPerson.get(person.id) ?? [];
      const searchable = [
        person.display_name,
        person.cert_number,
        typeof person.weight_lbs === "number" ? String(person.weight_lbs) : "",
        ...personCertificates.flatMap((certificate) => [
          CERTIFICATE_TYPE_LABELS[certificate.certificate_type],
          certificate.certificate_number,
          certificate.ratings.join(" "),
        ]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(query);
    });
  }, [certificatesByPerson, people, search]);

  async function refreshPeople() {
    if (!session?.user?.id) {
      return;
    }

    const [nextPeople, nextCertificates, nextProfile] = await Promise.all([
      fetchSavedPeople(session.user.id),
      certificatesAvailable
        ? fetchPersonCertificates(session.user.id).catch(() => {
            setCertificatesAvailable(false);
            return [];
          })
        : Promise.resolve([]),
      fetchCurrentProfile(session.user.id).catch(() => null),
    ]);

    setPeople(normalizePeople(nextPeople).filter((person) => (
      person.role !== "self" && person.id !== nextProfile?.self_person_id
    )));
    setCertificates(nextCertificates);
  }

  function toggleExpanded(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
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

  function startCertificateEditing(certificate: PersonCertificate) {
    setEditingCertificateId(certificate.id);
    setCertificateDrafts((current) => ({
      ...current,
      [certificate.id]: createCertificateDraft(certificate),
    }));
  }

  function cancelCertificateEditing(id: string) {
    setEditingCertificateId((current) => (current === id ? null : current));
    setCertificateDrafts((current) => {
      const nextDrafts = { ...current };
      delete nextDrafts[id];
      return nextDrafts;
    });
  }

  function updateDraft(id: string, field: keyof PersonDraft, value: string) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? emptyPersonForm),
        [field]: value,
      },
    }));
  }

  function updateCertificateForm(
    personId: string,
    field: keyof CertificateForm,
    value: string | string[] | boolean
  ) {
    setCertificateForms((current) => {
      const currentForm = current[personId] ?? emptyCertificateForm;
      const nextType =
        field === "certificate_type" ? value as PersonCertificateType : currentForm.certificate_type;
      const nextRatings =
        field === "ratings"
          ? normalizeRatingsForType(value as string[], nextType)
          : field === "certificate_type"
            ? normalizeRatingsForType(currentForm.ratings, nextType)
            : currentForm.ratings;

      return {
        ...current,
        [personId]: {
          ...currentForm,
          [field]:
            field === "issue_date" || field === "last_event_date"
              ? formatUsDateInput(String(value))
              : value,
          certificate_type: nextType,
          level: nextType === "pilot" ? currentForm.level : "",
          ratings: nextRatings,
        },
      };
    });
  }

  function updateCertificateDraft(
    id: string,
    field: keyof CertificateForm,
    value: string | string[] | boolean
  ) {
    setCertificateDrafts((current) => {
      const currentForm = current[id] ?? emptyCertificateForm;
      const nextType =
        field === "certificate_type" ? value as PersonCertificateType : currentForm.certificate_type;
      const nextRatings =
        field === "ratings"
          ? normalizeRatingsForType(value as string[], nextType)
          : field === "certificate_type"
            ? normalizeRatingsForType(currentForm.ratings, nextType)
            : currentForm.ratings;

      return {
        ...current,
        [id]: {
          ...currentForm,
          [field]:
            field === "issue_date" || field === "last_event_date"
              ? formatUsDateInput(String(value))
              : value,
          certificate_type: nextType,
          level: nextType === "pilot" ? currentForm.level : "",
          ratings: nextRatings,
        },
      };
    });
  }

  async function handleCreatePerson() {
    if (!session?.user?.id) {
      setStatus("You must be signed in to save people.");
      return;
    }

    setSaving(true);

    try {
      await createSavedPerson({
        userId: session.user.id,
        role: "student",
        display_name: personForm.display_name,
        cert_number: personForm.cert_number,
        weight_lbs: personForm.weight_lbs.trim() ? Number.parseFloat(personForm.weight_lbs) : null,
      });
      setPersonForm(emptyPersonForm);
      setShowPersonForm(false);
      await refreshPeople();
      setStatus("Person saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to save person.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSavePerson(person: SavedPerson) {
    if (!session?.user?.id) {
      setStatus("You must be signed in to manage people.");
      return;
    }

    const draft = drafts[person.id];
    if (!draft?.display_name.trim()) {
      setStatus("Name is required.");
      return;
    }

    setSaving(true);

    try {
      await updateSavedPerson(session.user.id, person.id, {
        display_name: draft.display_name,
        cert_number: draft.cert_number,
        weight_lbs: draft.weight_lbs.trim() ? Number.parseFloat(draft.weight_lbs) : null,
      });
      await refreshPeople();
      cancelEditing(person.id);
      setStatus("Person updated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to update person.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePerson(id: string) {
    if (!session?.user?.id) {
      setStatus("You must be signed in to manage people.");
      return;
    }

    setSaving(true);

    try {
      await deleteSavedPerson(session.user.id, id);
      await refreshPeople();
      setStatus("Person deleted.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to delete person.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateCertificate(personId: string) {
    if (!session?.user?.id) {
      setStatus("You must be signed in to manage certificates.");
      return;
    }

    const form = certificateForms[personId] ?? emptyCertificateForm;
    setSaving(true);

    try {
      await createPersonCertificate({
        userId: session.user.id,
        personId,
        certificateType: form.certificate_type,
        certificateNumber: form.certificate_number,
        ratings: form.ratings,
        issueDate: form.issue_date ? convertDisplayDateToIsoDate(form.issue_date) : null,
        lastEventDate: form.last_event_date ? convertDisplayDateToIsoDate(form.last_event_date) : null,
        eventType: form.certificate_type === "pilot" ? form.level : null,
        isDefaultForEndorsements: form.is_default_for_endorsements,
        notes: form.notes,
      });
      setCertificateForms((current) => ({ ...current, [personId]: emptyCertificateForm }));
      setCertificateFormPersonIds((current) => {
        const next = new Set(current);
        next.delete(personId);
        return next;
      });
      await refreshPeople();
      setStatus("Certificate saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to save certificate.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveCertificate(certificate: PersonCertificate) {
    if (!session?.user?.id) {
      setStatus("You must be signed in to manage certificates.");
      return;
    }

    const draft = certificateDrafts[certificate.id];
    if (!draft) {
      setStatus("Certificate changes are missing.");
      return;
    }

    setSaving(true);

    try {
      await updatePersonCertificate(session.user.id, certificate.id, {
        certificateType: draft.certificate_type,
        certificateNumber: draft.certificate_number,
        ratings: draft.ratings,
        issueDate: draft.issue_date ? convertDisplayDateToIsoDate(draft.issue_date) : null,
        lastEventDate: draft.last_event_date ? convertDisplayDateToIsoDate(draft.last_event_date) : null,
        eventType: draft.certificate_type === "pilot" ? draft.level : null,
        isDefaultForEndorsements: draft.is_default_for_endorsements,
        notes: draft.notes,
      });
      await refreshPeople();
      cancelCertificateEditing(certificate.id);
      setStatus("Certificate updated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to update certificate.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteCertificate(id: string) {
    if (!session?.user?.id) {
      setStatus("You must be signed in to manage certificates.");
      return;
    }

    setSaving(true);

    try {
      await deletePersonCertificate(session.user.id, id);
      await refreshPeople();
      setStatus("Certificate deleted.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to delete certificate.");
    } finally {
      setSaving(false);
    }
  }

  function toggleCertificateForm(personId: string) {
    setCertificateFormPersonIds((current) => {
      const next = new Set(current);
      if (next.has(personId)) {
        next.delete(personId);
      } else {
        next.add(personId);
      }
      return next;
    });
  }

  return (
    <section className="saas-panel people-list-panel">
      <div className="people-toolbar">
        <div>
          <h3 className="saas-subsection-title">People</h3>
          <p className="saas-meta-text">{people.length} saved</p>
        </div>
        <label className="people-search" aria-label="Search people">
          <ActionIcon kind="search" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search people"
          />
        </label>
        <button
          type="button"
          className="secondary-button icon-button"
          aria-label={showPersonForm ? "Hide add person form" : "Add person"}
          title={showPersonForm ? "Hide add person form" : "Add person"}
          onClick={() => setShowPersonForm((current) => !current)}
        >
          <ActionIcon kind="add" />
        </button>
      </div>

      {loading ? <p className="saas-meta-text mt-3">Loading people...</p> : null}
      {!loading && status ? <p className="saas-meta-text mt-3">{status}</p> : null}
      {!certificatesAvailable ? (
        <p className="saas-feedback saas-feedback-warning mt-3">
          Certificate management needs the saved_person_certificates table. Run
          supabase/person_certificates.sql in Supabase to enable it.
        </p>
      ) : null}

      {showPersonForm ? (
        <div className="people-edit-row">
          <label className="saas-field">
            <span>Name</span>
            <input
              value={personForm.display_name}
              onChange={(event) =>
                setPersonForm((current) => ({
                  ...current,
                  display_name: event.target.value,
                }))
              }
            />
          </label>
          <label className="saas-field">
            <span>Primary certificate number</span>
            <input
              value={personForm.cert_number}
              onChange={(event) =>
                setPersonForm((current) => ({
                  ...current,
                  cert_number: event.target.value,
                }))
              }
            />
          </label>
          <label className="saas-field">
            <span>Weight</span>
            <input
              type="number"
              value={personForm.weight_lbs}
              onChange={(event) =>
                setPersonForm((current) => ({
                  ...current,
                  weight_lbs: event.target.value,
                }))
              }
            />
          </label>
          <div className="saas-inline-actions people-form-actions">
            <button
              type="button"
              className="primary-button icon-button"
              aria-label={saving ? "Saving person" : "Save person"}
              title="Save person"
              disabled={saving || !personForm.display_name.trim()}
              onClick={() => void handleCreatePerson()}
            >
              <ActionIcon kind="save" />
            </button>
            <button
              type="button"
              className="secondary-button icon-button"
              aria-label="Cancel add person"
              title="Cancel"
              disabled={saving}
              onClick={() => setShowPersonForm(false)}
            >
              <ActionIcon kind="cancel" />
            </button>
          </div>
        </div>
      ) : null}

      <div className="people-table">
        <div className="people-table-head">
          <span>Name</span>
          <span>Certificates</span>
          <span>Weight</span>
          <span aria-hidden="true" />
        </div>

        {people.length === 0 && !loading ? (
          <p className="saas-empty-state">No people saved yet.</p>
        ) : null}
        {people.length > 0 && filteredPeople.length === 0 ? (
          <p className="saas-empty-state">No people match your search.</p>
        ) : null}

        {filteredPeople.map((person) => {
          const isEditing = editingId === person.id;
          const isExpanded = expandedIds.has(person.id);
          const isAddingCertificate = certificateFormPersonIds.has(person.id);
          const draft = drafts[person.id] ?? createDraft(person);
          const personCertificates = certificatesByPerson.get(person.id) ?? [];
          const form = certificateForms[person.id] ?? emptyCertificateForm;

          return (
            <div key={person.id} className="people-row-group">
              <div className="people-row">
                <button
                  type="button"
                  className={`people-expand-button ${isExpanded ? "people-expand-button-open" : ""}`}
                  aria-label={isExpanded ? `Collapse ${person.display_name}` : `Expand ${person.display_name}`}
                  title={isExpanded ? "Collapse" : "Expand"}
                  onClick={() => toggleExpanded(person.id)}
                >
                  <ActionIcon kind="expand" />
                </button>

                {isEditing ? (
                  <>
                    <label className="saas-field">
                      <span>Name</span>
                      <input
                        value={draft.display_name}
                        onChange={(event) => updateDraft(person.id, "display_name", event.target.value)}
                      />
                    </label>
                    <label className="saas-field">
                      <span>Primary certificate number</span>
                      <input
                        value={draft.cert_number}
                        onChange={(event) => updateDraft(person.id, "cert_number", event.target.value)}
                      />
                    </label>
                    <label className="saas-field">
                      <span>Weight</span>
                      <input
                        type="number"
                        value={draft.weight_lbs}
                        onChange={(event) => updateDraft(person.id, "weight_lbs", event.target.value)}
                      />
                    </label>
                    <div className="saas-inline-actions people-row-actions">
                      <button
                        type="button"
                        className="primary-button icon-button"
                        aria-label={saving ? "Saving changes" : "Save changes"}
                        title="Save changes"
                        disabled={saving}
                        onClick={() => void handleSavePerson(person)}
                      >
                        <ActionIcon kind="save" />
                      </button>
                      <button
                        type="button"
                        className="secondary-button icon-button"
                        aria-label="Cancel person edits"
                        title="Cancel"
                        disabled={saving}
                        onClick={() => cancelEditing(person.id)}
                      >
                        <ActionIcon kind="cancel" />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="people-name-cell">
                      <p className="saas-card-title">{person.display_name}</p>
                      <p className="saas-meta-text">{person.cert_number || "No primary certificate number"}</p>
                    </div>
                    <div className="people-cert-summary">
                      {personCertificates.length > 0 ? (
                        personCertificates.map((certificate) => (
                          <Badge key={certificate.id} tone="neutral">
                            {CERTIFICATE_TYPE_LABELS[certificate.certificate_type]}
                          </Badge>
                        ))
                      ) : (
                        <span className="saas-meta-text">No certificates</span>
                      )}
                    </div>
                    <p className="saas-meta-text">
                      {typeof person.weight_lbs === "number" ? `${person.weight_lbs} lbs` : "--"}
                    </p>
                    <div className="saas-inline-actions people-row-actions">
                      <button
                        type="button"
                        className="secondary-button icon-button"
                        aria-label={`Edit ${person.display_name}`}
                        title="Edit person"
                        disabled={saving}
                        onClick={() => startEditing(person)}
                      >
                        <ActionIcon kind="edit" />
                      </button>
                      <button
                        type="button"
                        className="danger-button icon-button"
                        aria-label={`Delete ${person.display_name}`}
                        title="Delete person"
                        disabled={saving}
                        onClick={() => void handleDeletePerson(person.id)}
                      >
                        <ActionIcon kind="delete" />
                      </button>
                    </div>
                  </>
                )}
              </div>

              {isExpanded && certificatesAvailable ? (
                <div className="people-detail-row">
                  <div className="people-cert-list">
                    {personCertificates.length > 0 ? (
                      personCertificates.map((certificate) => {
                        const draftForm = certificateDrafts[certificate.id] ?? createCertificateDraft(certificate);
                        return (
                          <div key={certificate.id} className="people-cert-row">
                            {editingCertificateId === certificate.id ? (
                              <CertificateFormFields
                                form={draftForm}
                                saving={saving}
                                submitLabel="Save certificate"
                                onChange={(field, value) => updateCertificateDraft(certificate.id, field, value)}
                                onCancel={() => cancelCertificateEditing(certificate.id)}
                                onSubmit={() => void handleSaveCertificate(certificate)}
                              />
                            ) : (
                              <>
                                <div className="people-cert-main">
                                  <div className="people-cert-title">
                                    <p className="saas-card-title">
                                      {CERTIFICATE_TYPE_LABELS[certificate.certificate_type]}
                                    </p>
                                    {certificateBadge(certificate)}
                                    {certificate.is_default_for_endorsements ? (
                                      <Badge tone="neutral">Default instructor</Badge>
                                    ) : null}
                                  </div>
                                  <p className="saas-meta-text">
                                    {certificate.certificate_number || "No certificate number"} |{" "}
                                    {getCertificateCurrencyLabel(certificate)}
                                  </p>
                                  {certificate.certificate_type === "pilot" && certificate.event_type ? (
                                    <p className="saas-meta-text">Level: {certificate.event_type}</p>
                                  ) : null}
                                  {certificate.ratings.length > 0 ? (
                                    <p className="saas-meta-text">Ratings: {certificate.ratings.join(", ")}</p>
                                  ) : null}
                                  {certificate.notes ? (
                                    <p className="saas-meta-text">Notes: {certificate.notes}</p>
                                  ) : null}
                                </div>
                                <div className="saas-inline-actions people-row-actions">
                                  <button
                                    type="button"
                                    className="secondary-button icon-button"
                                    aria-label="Edit certificate"
                                    title="Edit certificate"
                                    disabled={saving}
                                    onClick={() => startCertificateEditing(certificate)}
                                  >
                                    <ActionIcon kind="edit" />
                                  </button>
                                  <button
                                    type="button"
                                    className="danger-button icon-button"
                                    aria-label="Delete certificate"
                                    title="Delete certificate"
                                    disabled={saving}
                                    onClick={() => void handleDeleteCertificate(certificate.id)}
                                  >
                                    <ActionIcon kind="delete" />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <p className="saas-empty-state">No certificates saved for this person.</p>
                    )}
                  </div>

                  {isAddingCertificate ? (
                    <CertificateFormFields
                      form={form}
                      saving={saving}
                      submitLabel="Add certificate"
                      onChange={(field, value) => updateCertificateForm(person.id, field, value)}
                      onCancel={() => toggleCertificateForm(person.id)}
                      onSubmit={() => void handleCreateCertificate(person.id)}
                    />
                  ) : (
                    <button
                      type="button"
                      className="secondary-button icon-button"
                      aria-label={`Add certificate for ${person.display_name}`}
                      title="Add certificate"
                      disabled={saving}
                      onClick={() => toggleCertificateForm(person.id)}
                    >
                      <ActionIcon kind="add" />
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
