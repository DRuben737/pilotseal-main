"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { getDeterministicGreeting } from "@/lib/greetings";
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

const emptyMedicalForm: MedicalForm = {
  medicalClass: "",
  birthDate: "",
  examDate: "",
};

function formatMonthYearInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 6);
  if (digits.length <= 2) {
    return digits;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
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

function ActionIcon({ kind }: { kind: "edit" | "close" | "save" | "delete" }) {
  const common = "h-4 w-4";

  switch (kind) {
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
  }
}

export default function AccountSettingsPanel() {
  const router = useRouter();
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

        if (!cancelled) {
          setProfile(nextProfile);
          setDisplayName(nextProfile?.display_name ?? "");
          setMedicalForm(buildMedicalForm(nextProfile));
          setStatus("");
        }
      } catch (error) {
        console.error(error);

        if (!cancelled) {
          setProfile(null);
          setStatus("Unable to load account settings right now.");
        }
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (session?.user?.id) {
      setGreeting(getDeterministicGreeting(session.user.id));
      return;
    }

    setGreeting("");
  }, [session?.user?.id]);

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
    setIdentityStatus(displayName.trim() ? "Saving display name..." : "Clearing display name...");

    try {
      const nextProfile = await updateCurrentProfile(session.user.id, {
        display_name: displayName,
      });

      setProfile(nextProfile);
      setDisplayName(nextProfile.display_name ?? "");
      setIdentityStatus("Display name saved.");
    } catch (error) {
      console.error(error);
      setIdentityStatus(error instanceof Error ? error.message : "Failed to save display name.");
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
            <p className="saas-subsection-title">Display name</p>
            <p className="saas-meta-text">{displayName.trim() || "未设置"}</p>
          </div>
          <button
            type="button"
            className="ghost-button icon-button"
            aria-label={showDisplayName ? "Close display name editor" : "Edit display name"}
            title={showDisplayName ? "Close" : "Edit"}
            onClick={() => setShowDisplayName((current) => !current)}
          >
            <ActionIcon kind={showDisplayName ? "close" : "edit"} />
          </button>
        </div>
        {showDisplayName ? (
        <div className="saas-inline-form saas-inline-form-plain dashboard-setting-form mt-3">
          <label className="saas-field">
            <span>Name shown in the interface</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Optional display name"
            />
          </label>
          {identityStatus ? <p className="saas-meta-text">{identityStatus}</p> : null}
          {status ? <p className="saas-meta-text">{status}</p> : null}
          <button
            type="button"
            className="primary-button icon-button"
            aria-label={savingIdentity ? "Saving display name" : "Save display name"}
            title="Save display name"
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
