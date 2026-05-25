"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { getDeterministicGreeting } from "@/lib/greetings";
import {
  CERTIFICATE_TYPE_LABELS,
  convertDisplayDateToIsoDate,
  createPersonCertificate,
  deletePersonCertificate,
  fetchPersonCertificates,
  formatIsoDateForDisplay,
  getCertificateCurrencyLabel,
  setDefaultInstructorCertificate,
  updatePersonCertificate,
  type PersonCertificate,
  type PersonCertificateType,
} from "@/lib/person-certificates";
import { createSavedPerson, fetchSavedPersonById, updateSavedPerson, type SavedPerson } from "@/lib/saved-people";
import {
  formatMedicalPrivilegeDate,
  formatMedicalPrivilegeRemaining,
  getMedicalPrivileges,
} from "@/lib/medical";
import { fetchCurrentProfile, updateCurrentProfile, type UserProfile } from "@/lib/profile";
import { getSupabaseClient } from "@/lib/supabase";

type MedicalForm = {
  medicalClass: "" | "1" | "2" | "3";
  birthDate: string;
  examDate: string;
};

type CertificateForm = {
  certificate_number: string;
  certificate_type: PersonCertificateType;
  last_event_date: string;
  ratings: string[];
  level: string;
  is_default_for_endorsements: boolean;
  notes: string;
};

type SelfPersonForm = {
  display_name: string;
  weight_lbs: string;
};

const emptyMedicalForm: MedicalForm = {
  medicalClass: "",
  birthDate: "",
  examDate: "",
};

const emptyCertificateForm: CertificateForm = {
  certificate_number: "",
  certificate_type: "pilot",
  last_event_date: "",
  ratings: [],
  level: "",
  is_default_for_endorsements: false,
  notes: "",
};

const emptySelfPersonForm: SelfPersonForm = {
  display_name: "",
  weight_lbs: "",
};

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

const RATING_OPTIONS: Record<PersonCertificateType, string[]> = {
  pilot: PILOT_RATING_OPTIONS,
  flight_instructor: PILOT_RATING_OPTIONS,
  ground_instructor: ["Basic", "Instrument", "Advanced"],
};

const PILOT_LEVEL_OPTIONS = ["Student", "Private", "Commercial", "ATP"];

function formatMonthYearInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 6);
  if (digits.length <= 2) {
    return digits;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function formatMonthDayYearInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) {
    return digits;
  }
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function formatStoredDateToMonthYear(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month] = value.split("-");
    return `${month}/${year}`;
  }

  return value;
}

function toLastDayOfMonth(mmYYYY: string) {
  const [month, year] = mmYYYY.split("/");
  const date = new Date(Number(year), Number(month), 0);
  return date.toISOString().split("T")[0];
}

function validateMonthYear(value: string, options?: { allowFutureYear?: boolean }) {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{2})\/(\d{4})$/);
  if (!match) {
    return "Use MM/YYYY";
  }

  const month = Number.parseInt(match[1], 10);
  const year = Number.parseInt(match[2], 10);
  const currentYear = new Date().getFullYear();

  if (month < 1 || month > 12) {
    return "Month must be 01-12";
  }

  if (year < 1900) {
    return "Year must be 1900 or later";
  }

  if (!options?.allowFutureYear && year > currentYear) {
    return "Year cannot be in the future";
  }

  return "";
}

function buildMedicalForm(profile: UserProfile | null): MedicalForm {
  return {
    medicalClass: profile?.medical_class ? String(profile.medical_class) as "1" | "2" | "3" : "",
    birthDate: formatStoredDateToMonthYear(profile?.medical_birth_date),
    examDate: formatStoredDateToMonthYear(profile?.medical_exam_date),
  };
}

function buildSelfPersonForm(person: SavedPerson | null, profile: UserProfile | null, fallbackEmail?: string | null): SelfPersonForm {
  return {
    display_name: person?.display_name || profile?.display_name || fallbackEmail || "",
    weight_lbs: typeof person?.weight_lbs === "number" ? String(person.weight_lbs) : "",
  };
}

function buildCertificateForm(certificate: PersonCertificate): CertificateForm {
  return {
    certificate_number: certificate.certificate_number ?? "",
    certificate_type: certificate.certificate_type,
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

function formatMedicalClassLabel(value: UserProfile["medical_class"]) {
  if (value === 1) {
    return "First class";
  }
  if (value === 2) {
    return "Second class";
  }
  if (value === 3) {
    return "Third class";
  }
  return "Medical certificate";
}

function ActionIcon({ kind }: { kind: "add" | "edit" | "close" | "save" | "delete" | "default" }) {
  const common = "h-4 w-4";

  switch (kind) {
    case "add":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={common}>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    case "edit":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={common}>
          <path d="M4 20h4l10-10-4-4L4 16v4Z" />
          <path d="M13 7l4 4" />
        </svg>
      );
    case "close":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={common}>
          <path d="M6 6l12 12" />
          <path d="M18 6L6 18" />
        </svg>
      );
    case "save":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className={common}>
          <path d="M5 12.5l4 4L19 6.5" />
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

function AccountCertificateForm({
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
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="people-certificate-form dashboard-setting-form mt-3">
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
        <input value={form.certificate_number} onChange={(event) => onChange("certificate_number", event.target.value)} />
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
        <button
          type="button"
          className="secondary-button icon-button"
          aria-label="Cancel certificate edits"
          title="Cancel"
          disabled={saving}
          onClick={onCancel}
        >
          <ActionIcon kind="close" />
        </button>
      </div>
    </div>
  );
}

export default function AccountSettingsPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loading, session } = useAuthSession();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [status, setStatus] = useState("Checking account settings...");
  const [deleting, setDeleting] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [identityStatus, setIdentityStatus] = useState("");
  const [editingMedical, setEditingMedical] = useState(false);
  const [savingMedical, setSavingMedical] = useState(false);
  const [medicalStatus, setMedicalStatus] = useState("");
  const [medicalForm, setMedicalForm] = useState<MedicalForm>(emptyMedicalForm);
  const [greeting, setGreeting] = useState("");
  const [showDisplayName, setShowDisplayName] = useState(false);
  const [showMedical, setShowMedical] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState("");
  const [selfPerson, setSelfPerson] = useState<SavedPerson | null>(null);
  const [selfPersonForm, setSelfPersonForm] = useState<SelfPersonForm>(emptySelfPersonForm);
  const [selfCertificates, setSelfCertificates] = useState<PersonCertificate[]>([]);
  const [showCertificates, setShowCertificates] = useState(false);
  const [editingWeight, setEditingWeight] = useState(false);
  const [editingSelfPerson, setEditingSelfPerson] = useState(false);
  const [showCertificateForm, setShowCertificateForm] = useState(false);
  const [certificateForm, setCertificateForm] = useState<CertificateForm>(emptyCertificateForm);
  const [editingCertificateId, setEditingCertificateId] = useState<string | null>(null);
  const [certificateDrafts, setCertificateDrafts] = useState<Record<string, CertificateForm>>({});
  const [savingCertificate, setSavingCertificate] = useState(false);
  const [certificateStatus, setCertificateStatus] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      if (!session?.user?.id) {
        if (!cancelled) {
          setProfile(null);
          setMedicalForm(emptyMedicalForm);
          setStatus("No active session.");
        }
        return;
      }

      try {
        const nextProfile = await fetchCurrentProfile(session.user.id);
        const [nextSelfPerson, nextCertificates] = await Promise.all([
          fetchSavedPersonById(session.user.id, nextProfile?.self_person_id),
          fetchPersonCertificates(session.user.id).catch(() => []),
        ]);

        if (!cancelled) {
          setProfile(nextProfile);
          setDisplayName(nextProfile?.display_name ?? "");
          setMedicalForm(buildMedicalForm(nextProfile));
          setSelfPerson(nextSelfPerson);
          setSelfPersonForm(buildSelfPersonForm(nextSelfPerson, nextProfile, session.user.email));
          setSelfCertificates(
            nextProfile?.self_person_id
              ? nextCertificates.filter((certificate) => certificate.person_id === nextProfile.self_person_id)
              : []
          );
          setStatus("");
        }
      } catch (error) {
        console.error(error);

        if (!cancelled) {
          setProfile(null);
          setSelfPerson(null);
          setSelfCertificates([]);
          setStatus("Unable to load account settings right now.");
        }
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.email, session?.user?.id]);

  useEffect(() => {
    if (session?.user?.id) {
      setGreeting(getDeterministicGreeting(session.user.id));
      return;
    }

    setGreeting("");
  }, [session?.user?.id]);

  useEffect(() => {
    const onboardingTarget = searchParams.get("onboarding");
    if (onboardingTarget === "certificates" || onboardingTarget === "endorsement-cfi") {
      setShowCertificates(true);
      setShowCertificateForm(true);
    }
  }, [searchParams]);

  async function handleDeleteAccount() {
    if (!session?.user?.id) {
      setStatus("You must be signed in to delete your account.");
      return;
    }

    const confirmed = window.confirm(
      "This action will delete your saved information and cannot be undone."
    );

    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setStatus("Deleting account...");

    try {
      const supabase = getSupabaseClient();
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (!currentSession?.access_token) {
        throw new Error("Account deletion failed. Please try again.");
      }

      const response = await fetch("/api/delete-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentSession.access_token}`,
        },
        body: JSON.stringify({ userId: session.user.id }),
      });

      const payload = (await response.json()) as { error?: string; success?: boolean };

      if (!response.ok || !payload.success) {
        throw new Error("Account deletion failed. Please try again.");
      }

      await supabase.auth.signOut();
      router.refresh();
      router.replace("/");
    } catch (error) {
      console.error(error);
      setStatus("Account deletion failed. Please try again.");
      setDeleting(false);
      return;
    }
  }

  async function handleIdentitySave() {
    if (!session?.user?.id) {
      setIdentityStatus("You must be signed in to update your profile.");
      return;
    }

    setSavingIdentity(true);
    setIdentityStatus(displayName.trim() ? "Saving nickname..." : "Clearing nickname...");

    try {
      const nextProfile = await updateCurrentProfile(session.user.id, {
        display_name: displayName,
      });

      setProfile(nextProfile);
      setDisplayName(nextProfile.display_name ?? "");
      setIdentityStatus("Nickname saved.");
    } catch (error) {
      console.error(error);
      setIdentityStatus(error instanceof Error ? error.message : "Failed to save nickname.");
    } finally {
      setSavingIdentity(false);
    }
  }

  function handleMedicalInputChange(field: keyof MedicalForm, value: string) {
    setMedicalForm((current) => ({
      ...current,
      [field]: field === "medicalClass" ? value : formatMonthYearInput(value),
    }));
  }

  async function handleMedicalSave() {
    if (!session?.user?.id) {
      setMedicalStatus("You must be signed in to save medical certificate details.");
      return;
    }

    const birthError = medicalForm.birthDate ? validateMonthYear(medicalForm.birthDate) : "";
    const examError = medicalForm.examDate
      ? validateMonthYear(medicalForm.examDate, { allowFutureYear: true })
      : "";

    if (birthError) {
      setMedicalStatus(birthError);
      return;
    }

    if (examError) {
      setMedicalStatus(examError);
      return;
    }

    setSavingMedical(true);
    setMedicalStatus("Saving medical certificate...");

    try {
      const nextProfile = await updateCurrentProfile(session.user.id, {
        medical_class: medicalForm.medicalClass ? Number(medicalForm.medicalClass) as 1 | 2 | 3 : null,
        medical_birth_date: medicalForm.birthDate ? toLastDayOfMonth(medicalForm.birthDate) : null,
        medical_exam_date: medicalForm.examDate ? toLastDayOfMonth(medicalForm.examDate) : null,
      });

      setProfile(nextProfile);
      setMedicalForm(buildMedicalForm(nextProfile));
      setEditingMedical(false);
      setMedicalStatus("Medical certificate saved.");
    } catch (error) {
      console.error(error);
      setMedicalStatus(error instanceof Error ? error.message : "Failed to save medical certificate.");
    } finally {
      setSavingMedical(false);
    }
  }

  function handleMedicalCancel() {
    setMedicalForm(buildMedicalForm(profile));
    setEditingMedical(false);
    setMedicalStatus("");
  }

  async function refreshSelfCertificates(nextProfile = profile) {
    if (!session?.user?.id) {
      return;
    }

    const [nextSelfPerson, nextCertificates] = await Promise.all([
      fetchSavedPersonById(session.user.id, nextProfile?.self_person_id),
      fetchPersonCertificates(session.user.id).catch(() => []),
    ]);

    setSelfPerson(nextSelfPerson);
    setSelfPersonForm(buildSelfPersonForm(nextSelfPerson, nextProfile, session.user.email));
    setSelfCertificates(
      nextProfile?.self_person_id
        ? nextCertificates.filter((certificate) => certificate.person_id === nextProfile.self_person_id)
        : []
    );
  }

  async function ensureSelfPerson() {
    if (!session?.user?.id) {
      throw new Error("You must be signed in to manage certificates.");
    }

    if (profile?.self_person_id) {
      const existing = selfPerson ?? await fetchSavedPersonById(session.user.id, profile.self_person_id);
      if (existing) {
        return { person: existing, nextProfile: profile };
      }
    }

    const displayName =
      selfPersonForm.display_name.trim() ||
      displayNameFromProfile() ||
      session.user.email ||
      "My profile";

    const createdPerson = await createSavedPerson({
      userId: session.user.id,
      role: "self",
      display_name: displayName,
      weight_lbs: selfPersonForm.weight_lbs.trim() ? Number.parseFloat(selfPersonForm.weight_lbs) : null,
    });

    const nextProfile = await updateCurrentProfile(session.user.id, {
      self_person_id: createdPerson.id,
    });

    setProfile(nextProfile);
    setSelfPerson(createdPerson);
    setSelfPersonForm(buildSelfPersonForm(createdPerson, nextProfile, session.user.email));

    return { person: createdPerson, nextProfile };
  }

  function displayNameFromProfile() {
    return displayName.trim() || profile?.display_name || "";
  }

  function updateSelfCertificateForm(field: keyof CertificateForm, value: string | string[] | boolean) {
    setCertificateForm((current) => {
      const nextType = field === "certificate_type" ? value as PersonCertificateType : current.certificate_type;
      const nextRatings =
        field === "ratings"
          ? normalizeRatingsForType(value as string[], nextType)
          : field === "certificate_type"
            ? normalizeRatingsForType(current.ratings, nextType)
            : current.ratings;

      return {
        ...current,
        [field]: field === "last_event_date" ? formatMonthDayYearInput(String(value)) : value,
        certificate_type: nextType,
        level: nextType === "pilot" ? current.level : "",
        ratings: nextRatings,
      };
    });
  }

  function updateSelfCertificateDraft(id: string, field: keyof CertificateForm, value: string | string[] | boolean) {
    setCertificateDrafts((current) => {
      const currentForm = current[id] ?? emptyCertificateForm;
      const nextType = field === "certificate_type" ? value as PersonCertificateType : currentForm.certificate_type;
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
          [field]: field === "last_event_date" ? formatMonthDayYearInput(String(value)) : value,
          certificate_type: nextType,
          level: nextType === "pilot" ? currentForm.level : "",
          ratings: nextRatings,
        },
      };
    });
  }

  async function handleSaveSelfPerson(options?: { closeWeightEditor?: boolean; closeNameEditor?: boolean }) {
    if (!session?.user?.id) {
      setCertificateStatus("You must be signed in to save profile details.");
      return;
    }

    setSavingCertificate(true);
    setCertificateStatus("Saving profile details...");

    try {
      const { person, nextProfile } = await ensureSelfPerson();
      await updateSavedPerson(session.user.id, person.id, {
        display_name:
          selfPersonForm.display_name.trim() ||
          person.display_name ||
          displayNameFromProfile() ||
          session.user.email ||
          "My profile",
        cert_number: person.cert_number ?? "",
        weight_lbs: selfPersonForm.weight_lbs.trim() ? Number.parseFloat(selfPersonForm.weight_lbs) : null,
      });
      await refreshSelfCertificates(nextProfile);
      if (options?.closeWeightEditor) {
        setEditingWeight(false);
      }
      if (options?.closeNameEditor) {
        setEditingSelfPerson(false);
      }
      setCertificateStatus("Profile details saved.");
    } catch (error) {
      console.error(error);
      setCertificateStatus(error instanceof Error ? error.message : "Failed to save profile details.");
    } finally {
      setSavingCertificate(false);
    }
  }

  async function handleCreateSelfCertificate() {
    if (!session?.user?.id) {
      setCertificateStatus("You must be signed in to manage certificates.");
      return;
    }

    setSavingCertificate(true);
    setCertificateStatus("Saving certificate...");

    try {
      const { person, nextProfile } = await ensureSelfPerson();
      await createPersonCertificate({
        userId: session.user.id,
        personId: person.id,
        certificateType: certificateForm.certificate_type,
        certificateNumber: certificateForm.certificate_number,
        ratings: certificateForm.ratings,
        issueDate: null,
        lastEventDate: certificateForm.last_event_date ? convertDisplayDateToIsoDate(certificateForm.last_event_date) : null,
        eventType: certificateForm.certificate_type === "pilot" ? certificateForm.level : null,
        isDefaultForEndorsements: certificateForm.is_default_for_endorsements,
        notes: certificateForm.notes,
      });
      setCertificateForm(emptyCertificateForm);
      setShowCertificateForm(false);
      await refreshSelfCertificates(nextProfile);
      setCertificateStatus("Certificate saved.");
    } catch (error) {
      console.error(error);
      setCertificateStatus(error instanceof Error ? error.message : "Failed to save certificate.");
    } finally {
      setSavingCertificate(false);
    }
  }

  async function handleSaveSelfCertificate(certificate: PersonCertificate) {
    if (!session?.user?.id) {
      setCertificateStatus("You must be signed in to manage certificates.");
      return;
    }

    const draft = certificateDrafts[certificate.id];
    if (!draft) {
      setCertificateStatus("Certificate changes are missing.");
      return;
    }

    setSavingCertificate(true);
    setCertificateStatus("Saving certificate...");

    try {
      await updatePersonCertificate(session.user.id, certificate.id, {
        certificateType: draft.certificate_type,
        certificateNumber: draft.certificate_number,
        ratings: draft.ratings,
        issueDate: null,
        lastEventDate: draft.last_event_date ? convertDisplayDateToIsoDate(draft.last_event_date) : null,
        eventType: draft.certificate_type === "pilot" ? draft.level : null,
        isDefaultForEndorsements: draft.is_default_for_endorsements,
        notes: draft.notes,
      });
      await refreshSelfCertificates();
      setEditingCertificateId(null);
      setCertificateDrafts((current) => {
        const next = { ...current };
        delete next[certificate.id];
        return next;
      });
      setCertificateStatus("Certificate updated.");
    } catch (error) {
      console.error(error);
      setCertificateStatus(error instanceof Error ? error.message : "Failed to save certificate.");
    } finally {
      setSavingCertificate(false);
    }
  }

  async function handleDeleteSelfCertificate(id: string) {
    if (!session?.user?.id) {
      setCertificateStatus("You must be signed in to manage certificates.");
      return;
    }

    setSavingCertificate(true);
    setCertificateStatus("Deleting certificate...");

    try {
      await deletePersonCertificate(session.user.id, id);
      await refreshSelfCertificates();
      setCertificateStatus("Certificate deleted.");
    } catch (error) {
      console.error(error);
      setCertificateStatus(error instanceof Error ? error.message : "Failed to delete certificate.");
    } finally {
      setSavingCertificate(false);
    }
  }

  async function handleSetDefaultSelfCertificate(id: string) {
    if (!session?.user?.id) {
      setCertificateStatus("You must be signed in to manage certificates.");
      return;
    }

    setSavingCertificate(true);
    setCertificateStatus("Saving default instructor...");

    try {
      await setDefaultInstructorCertificate(session.user.id, id);
      await refreshSelfCertificates();
      setCertificateStatus("Default instructor saved.");
    } catch (error) {
      console.error(error);
      setCertificateStatus(error instanceof Error ? error.message : "Failed to save default instructor.");
    } finally {
      setSavingCertificate(false);
    }
  }

  async function handlePasswordSave() {
    if (!session?.user?.id) {
      setPasswordStatus("You must be signed in to change your password.");
      return;
    }

    if (password.length < 8) {
      setPasswordStatus("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setPasswordStatus("Passwords do not match.");
      return;
    }

    setSavingPassword(true);
    setPasswordStatus("Saving password...");

    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        throw error;
      }

      setPassword("");
      setConfirmPassword("");
      setShowPassword(false);
      setPasswordStatus("Password updated.");
    } catch (error) {
      console.error(error);
      setPasswordStatus(error instanceof Error ? error.message : "Failed to update password.");
    } finally {
      setSavingPassword(false);
    }
  }

  const hasMedicalData = Boolean(
    profile?.medical_class || profile?.medical_birth_date || profile?.medical_exam_date || profile?.medical_exp_date
  );
  const medicalPrivileges = getMedicalPrivileges(profile);

  return (
    <div className="dashboard-settings-list">
      {greeting ? <p className="saas-greeting">{greeting}</p> : null}

      <section className="saas-panel dashboard-setting-row">
        <div className="saas-section-toggle">
          <div className="saas-section-toggle-main">
            <p className="saas-subsection-title">Nickname</p>
            <p className="saas-meta-text">{displayName.trim() || "未设置"}</p>
          </div>
          <button
            type="button"
            className="ghost-button icon-button"
            aria-label={showDisplayName ? "Close nickname editor" : "Edit nickname"}
            title={showDisplayName ? "Close" : "Edit"}
            onClick={() => setShowDisplayName((current) => !current)}
          >
            <ActionIcon kind={showDisplayName ? "close" : "edit"} />
          </button>
        </div>
        {showDisplayName ? (
        <div className="saas-inline-form saas-inline-form-plain dashboard-setting-form mt-3">
          <label className="saas-field">
            <span>Nickname shown in the interface</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Optional nickname"
            />
          </label>
          {identityStatus ? <p className="saas-meta-text">{identityStatus}</p> : null}
          {status ? <p className="saas-meta-text">{status}</p> : null}
          <button
            type="button"
            className="primary-button icon-button"
            aria-label={savingIdentity ? "Saving nickname" : "Save nickname"}
            title="Save nickname"
            disabled={savingIdentity || loading}
            onClick={handleIdentitySave}
          >
            <ActionIcon kind="save" />
          </button>
        </div>
        ) : null}
      </section>

      <section className="saas-panel dashboard-setting-row">
        <div className="saas-section-toggle">
          <div className="saas-section-toggle-main">
            <p className="saas-subsection-title">Weight</p>
            <p className="saas-meta-text">
              {selfPersonForm.weight_lbs ? `${selfPersonForm.weight_lbs} lbs` : "No weight saved"}
            </p>
          </div>
          <button
            type="button"
            className="ghost-button icon-button"
            aria-label={editingWeight ? "Close weight editor" : "Edit weight"}
            title={editingWeight ? "Close" : "Edit"}
            disabled={savingCertificate}
            onClick={() => {
              if (editingWeight) {
                setSelfPersonForm(buildSelfPersonForm(selfPerson, profile, session?.user?.email));
                setEditingWeight(false);
                return;
              }

              setEditingWeight(true);
            }}
          >
            <ActionIcon kind={editingWeight ? "close" : "edit"} />
          </button>
        </div>

        {editingWeight ? (
          <div className="saas-inline-form saas-inline-form-plain dashboard-setting-form mt-3">
            <label className="saas-field">
              <span>Weight</span>
              <input
                type="number"
                value={selfPersonForm.weight_lbs}
                onChange={(event) =>
                  setSelfPersonForm((current) => ({ ...current, weight_lbs: event.target.value }))
                }
              />
            </label>
            {certificateStatus ? <p className="saas-meta-text">{certificateStatus}</p> : null}
            <button
              type="button"
              className="primary-button icon-button"
              aria-label="Save weight"
              title="Save"
              disabled={savingCertificate}
              onClick={() => void handleSaveSelfPerson({ closeWeightEditor: true })}
            >
              <ActionIcon kind="save" />
            </button>
          </div>
        ) : null}
      </section>

      <section className="saas-panel dashboard-setting-row">
        <div className="saas-section-toggle">
          <div className="saas-section-toggle-main">
            <p className="saas-subsection-title">Password</p>
          </div>
          <button
            type="button"
            className="ghost-button icon-button"
            aria-label={showPassword ? "Close password editor" : "Edit password"}
            title={showPassword ? "Close" : "Edit"}
            onClick={() => setShowPassword((current) => !current)}
          >
            <ActionIcon kind={showPassword ? "close" : "edit"} />
          </button>
        </div>
        {showPassword ? (
          <div className="saas-inline-form saas-inline-form-plain dashboard-setting-form mt-3">
            <label className="saas-field">
              <span>New password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
              />
            </label>
            <label className="saas-field">
              <span>Confirm password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Repeat new password"
              />
            </label>
            {passwordStatus ? <p className="saas-meta-text">{passwordStatus}</p> : null}
            <button
              type="button"
              className="primary-button icon-button"
              aria-label={savingPassword ? "Saving password" : "Save password"}
              title="Save password"
              disabled={savingPassword || loading}
              onClick={handlePasswordSave}
            >
              <ActionIcon kind="save" />
            </button>
          </div>
        ) : null}
      </section>

      <section className="saas-panel dashboard-setting-row">
        <div className="saas-section-toggle">
          <div className="saas-section-toggle-main">
            <p className="saas-subsection-title">Medical</p>
            <p className="saas-meta-text">{formatMedicalClassLabel(profile?.medical_class)}</p>
          </div>
          {!editingMedical ? (
            <button
              type="button"
              className="ghost-button icon-button"
              aria-label="Edit medical"
              title="Edit medical"
              onClick={() => {
                setShowMedical(true);
                setEditingMedical(true);
                setMedicalStatus("");
              }}
            >
              <ActionIcon kind="edit" />
            </button>
          ) : (
            <button
              type="button"
              className="ghost-button icon-button"
              aria-label="Close medical editor"
              title="Close"
              onClick={() => {
                setEditingMedical(false);
                setShowMedical(false);
                setMedicalStatus("");
              }}
            >
              <ActionIcon kind="close" />
            </button>
          )}
        </div>

        {showMedical && editingMedical ? (
          <div className="saas-inline-form saas-inline-form-plain dashboard-setting-form mt-3">
            <label className="saas-field">
              <span>Medical class</span>
              <select
                value={medicalForm.medicalClass}
                onChange={(event) => handleMedicalInputChange("medicalClass", event.target.value)}
              >
                <option value="">Select class</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </select>
            </label>

            <label className="saas-field">
              <span>Date of birth</span>
              <input
                placeholder="MM/YYYY"
                value={medicalForm.birthDate}
                onChange={(event) => handleMedicalInputChange("birthDate", event.target.value)}
              />
            </label>

            <label className="saas-field">
              <span>Exam date</span>
              <input
                placeholder="MM/YYYY"
                value={medicalForm.examDate}
                onChange={(event) => handleMedicalInputChange("examDate", event.target.value)}
              />
            </label>

            {medicalStatus ? <p className="saas-meta-text">{medicalStatus}</p> : null}

            <div className="saas-inline-actions">
              <button
                type="button"
                className="primary-button icon-button"
                aria-label={savingMedical ? "Saving medical certificate" : "Save medical certificate"}
                title="Save medical certificate"
                disabled={savingMedical}
                onClick={handleMedicalSave}
              >
                <ActionIcon kind="save" />
              </button>
              <button
                type="button"
                className="secondary-button icon-button"
                aria-label="Cancel medical edits"
                title="Cancel"
                disabled={savingMedical}
                onClick={handleMedicalCancel}
              >
                <ActionIcon kind="close" />
              </button>
            </div>
          </div>
        ) : showMedical && hasMedicalData ? (
          <div className="dashboard-setting-subgrid mt-3">
            <article className="saas-quick-link">
              <p className="saas-label">Class</p>
              <p className="saas-value">
                {profile?.medical_class ? `Class ${profile.medical_class}` : "Not available"}
              </p>
            </article>
            <article className="saas-quick-link">
              <p className="saas-label">Date of birth</p>
              <p className="saas-value">
                {formatStoredDateToMonthYear(profile?.medical_birth_date) || "Not available"}
              </p>
            </article>
            <article className="saas-quick-link">
              <p className="saas-label">Exam date</p>
              <p className="saas-value">
                {formatStoredDateToMonthYear(profile?.medical_exam_date) || "Not available"}
              </p>
            </article>
            {medicalPrivileges.length > 0 ? (
              <article className="saas-quick-link md:col-span-2">
                <p className="saas-label">Privileges</p>
                <div className="mt-3 grid gap-3">
                  {medicalPrivileges.map((privilege) => (
                    <div
                      key={privilege.label}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-slate-200 bg-slate-50/80 px-3 py-3"
                    >
                      <div>
                        <p className="saas-card-title">{privilege.label}</p>
                        <p className="saas-meta-text">
                          Until {formatMedicalPrivilegeDate(privilege.expiresAt)}
                        </p>
                      </div>
                      <span
                        className={`saas-pill ${
                          privilege.status === "expired"
                            ? "saas-pill-critical"
                            : privilege.status === "expiring-soon"
                              ? "saas-pill-high"
                              : "saas-pill-normal"
                        }`}
                      >
                        {formatMedicalPrivilegeRemaining(privilege)}
                      </span>
                    </div>
                  ))}
                </div>
              </article>
            ) : (
              <article className="saas-quick-link">
                <p className="saas-label">Privileges</p>
                <p className="saas-value">Add class, birth date, and exam date</p>
              </article>
            )}
          </div>
        ) : showMedical ? (
          <div className="saas-empty-state mt-5">
            <p>No medical certificate saved</p>
          </div>
        ) : null}
      </section>

      <section className="saas-panel dashboard-setting-row">
        <div className="saas-section-toggle">
          <div className="saas-section-toggle-main">
            <p className="saas-subsection-title">My certificates</p>
            <p className="saas-meta-text">
              {selfCertificates.length > 0
                ? `${selfCertificates.length} saved`
                : "No certificate saved"}
            </p>
          </div>
          <div className="saas-inline-actions">
            <button
              type="button"
              className="ghost-button icon-button"
              aria-label={showCertificates ? "Close my certificates" : "View my certificates"}
              title={showCertificates ? "Close" : "View certificates"}
              onClick={() => setShowCertificates((current) => !current)}
            >
              <ActionIcon kind={showCertificates ? "close" : "edit"} />
            </button>
            {showCertificates ? (
              <button
                type="button"
                className="secondary-button icon-button"
                aria-label={showCertificateForm ? "Hide certificate form" : "Add certificate"}
                title={showCertificateForm ? "Hide certificate form" : "Add certificate"}
                disabled={savingCertificate}
                onClick={() => setShowCertificateForm((current) => !current)}
              >
                <ActionIcon kind="add" />
              </button>
            ) : null}
          </div>
        </div>

        {showCertificates ? (
          <div className="mt-3 grid gap-3">
            <div className="dashboard-setting-subgrid">
              <article className="saas-quick-link">
                <p className="saas-label">Certificate name</p>
                {editingSelfPerson ? (
                  <div className="saas-inline-form saas-inline-form-plain dashboard-setting-form mt-3">
                    <label className="saas-field">
                      <span>Name printed with your certificates</span>
                      <input
                        value={selfPersonForm.display_name}
                        onChange={(event) =>
                          setSelfPersonForm((current) => ({
                            ...current,
                            display_name: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="primary-button icon-button"
                      aria-label="Save certificate name"
                      title="Save"
                      disabled={savingCertificate || !selfPersonForm.display_name.trim()}
                      onClick={() => void handleSaveSelfPerson({ closeNameEditor: true })}
                    >
                      <ActionIcon kind="save" />
                    </button>
                    <button
                      type="button"
                      className="ghost-button icon-button"
                      aria-label="Cancel certificate name edit"
                      title="Cancel"
                      disabled={savingCertificate}
                      onClick={() => {
                        setSelfPersonForm(buildSelfPersonForm(selfPerson, profile, session?.user?.email));
                        setEditingSelfPerson(false);
                      }}
                    >
                      <ActionIcon kind="close" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <p className="saas-value">{selfPersonForm.display_name || "My profile"}</p>
                    <button
                      type="button"
                      className="ghost-button icon-button"
                      aria-label="Edit certificate name"
                      title="Edit certificate name"
                      disabled={savingCertificate}
                      onClick={() => setEditingSelfPerson(true)}
                    >
                      <ActionIcon kind="edit" />
                    </button>
                  </div>
                )}
              </article>
            </div>

            {showCertificateForm ? (
              <AccountCertificateForm
                form={certificateForm}
                saving={savingCertificate}
                submitLabel="Add certificate"
                onChange={updateSelfCertificateForm}
                onCancel={() => setShowCertificateForm(false)}
                onSubmit={() => void handleCreateSelfCertificate()}
              />
            ) : null}

            {selfCertificates.length === 0 ? (
              <p className="saas-empty-state">Add your pilot, flight instructor, or ground instructor certificate.</p>
            ) : (
              <div className="people-cert-list">
                {selfCertificates.map((certificate) => {
                  const isEditingCertificate = editingCertificateId === certificate.id;
                  const draft = certificateDrafts[certificate.id] ?? buildCertificateForm(certificate);

                  return (
                    <div key={certificate.id} className="people-cert-row">
                      {isEditingCertificate ? (
                        <AccountCertificateForm
                          form={draft}
                          saving={savingCertificate}
                          submitLabel="Save certificate"
                          onChange={(field, value) => updateSelfCertificateDraft(certificate.id, field, value)}
                          onCancel={() => {
                            setEditingCertificateId(null);
                            setCertificateDrafts((current) => {
                              const next = { ...current };
                              delete next[certificate.id];
                              return next;
                            });
                          }}
                          onSubmit={() => void handleSaveSelfCertificate(certificate)}
                        />
                      ) : (
                        <>
                          <div className="people-cert-main">
                            <div className="people-cert-title">
                              <p className="saas-card-title">
                                {CERTIFICATE_TYPE_LABELS[certificate.certificate_type]}
                              </p>
                              {certificate.is_default_for_endorsements ? (
                                <span className="saas-pill saas-pill-normal">Default</span>
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
                            {(certificate.certificate_type === "flight_instructor" ||
                              certificate.certificate_type === "ground_instructor") &&
                            !certificate.is_default_for_endorsements ? (
                              <button
                                type="button"
                                className="secondary-button icon-button"
                                aria-label="Set default endorsement instructor"
                                title="Set default instructor"
                                disabled={savingCertificate}
                                onClick={() => void handleSetDefaultSelfCertificate(certificate.id)}
                              >
                                <ActionIcon kind="default" />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="secondary-button icon-button"
                              aria-label="Edit certificate"
                              title="Edit certificate"
                              disabled={savingCertificate}
                              onClick={() => {
                                setEditingCertificateId(certificate.id);
                                setCertificateDrafts((current) => ({
                                  ...current,
                                  [certificate.id]: buildCertificateForm(certificate),
                                }));
                              }}
                            >
                              <ActionIcon kind="edit" />
                            </button>
                            <button
                              type="button"
                              className="danger-button icon-button"
                              aria-label="Delete certificate"
                              title="Delete certificate"
                              disabled={savingCertificate}
                              onClick={() => void handleDeleteSelfCertificate(certificate.id)}
                            >
                              <ActionIcon kind="delete" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {certificateStatus ? <p className="saas-meta-text">{certificateStatus}</p> : null}
          </div>
        ) : null}
      </section>

      <section className="saas-panel saas-danger-panel dashboard-setting-row">
        <h3 className="saas-subsection-title">Delete account</h3>
        <p className="saas-meta-text mt-3">
          This action permanently deletes your PilotSeal account and all saved data.
        </p>
        <button
          type="button"
          className="danger-button icon-button mt-3"
          aria-label={deleting ? "Deleting account" : "Delete account"}
          title="Delete account"
          disabled={!session?.user?.id || deleting}
          onClick={handleDeleteAccount}
        >
          <ActionIcon kind="delete" />
        </button>
      </section>
    </div>
  );
}
