"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { fetchPersonCertificates } from "@/lib/person-certificates";
import { fetchCurrentProfile, updateCurrentProfile, type UserProfile } from "@/lib/profile";
import {
  createSavedPerson,
  fetchSavedPersonById,
  updateSavedPerson,
  type SavedPerson,
} from "@/lib/saved-people";
import { getSupabaseClient } from "@/lib/supabase";

function getNotInstructorStorageKey(userId: string) {
  return `pilotseal:not-instructor:${userId}`;
}

export default function AuthOnboardingGate() {
  const { loading, session } = useAuthSession();
  const pathname = usePathname();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [selfPerson, setSelfPerson] = useState<SavedPerson | null>(null);
  const [nickname, setNickname] = useState("");
  const [weight, setWeight] = useState("");
  const [hasInstructorCertificate, setHasInstructorCertificate] = useState(true);
  const [dismissedCfiPrompt, setDismissedCfiPrompt] = useState(false);
  const [notInstructor, setNotInstructor] = useState(false);
  const [skippedWeight, setSkippedWeight] = useState(false);
  const [onboardingLoaded, setOnboardingLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const isAuthRoute =
    pathname === "/login" || pathname === "/register" || pathname === "/reset-password";
  const shouldLoad = !loading && Boolean(session?.user?.id) && !isAuthRoute;

  useEffect(() => {
    let cancelled = false;

    async function loadOnboardingState() {
      if (!shouldLoad || !session?.user?.id) {
        setOnboardingLoaded(false);
        setProfile(null);
        setSelfPerson(null);
        setNickname("");
        setWeight("");
        setNotInstructor(false);
        setSkippedWeight(false);
        setStatus("");
        return;
      }

      try {
        setOnboardingLoaded(false);
        const [nextProfile, certificates] = await Promise.all([
          fetchCurrentProfile(session.user.id),
          fetchPersonCertificates(session.user.id).catch(() => []),
        ]);
        const nextSelfPerson = await fetchSavedPersonById(
          session.user.id,
          nextProfile?.self_person_id
        );

        if (cancelled) {
          return;
        }

        if (!nextProfile) {
          const supabase = getSupabaseClient();
          await supabase.auth.signOut();
          setProfile(null);
          setSelfPerson(null);
          setNickname("");
          setWeight("");
          setStatus("");
          return;
        }

        setProfile(nextProfile);
        setSelfPerson(nextSelfPerson);
        setNickname(nextProfile?.display_name ?? "");
        setWeight(
          typeof nextSelfPerson?.weight_lbs === "number" ? String(nextSelfPerson.weight_lbs) : ""
        );
        setNotInstructor(
          window.localStorage.getItem(getNotInstructorStorageKey(session.user.id)) === "true"
        );
        setSkippedWeight(false);
        setHasInstructorCertificate(
          certificates.some(
            (certificate) =>
              certificate.person_id === nextProfile?.self_person_id &&
              (certificate.certificate_type === "flight_instructor" ||
                certificate.certificate_type === "ground_instructor")
          )
        );
        setOnboardingLoaded(true);
        setStatus("");
      } catch (error) {
        if (!cancelled) {
          console.error(error);
          setOnboardingLoaded(false);
          setStatus("Unable to load onboarding details right now.");
        }
      }
    }

    void loadOnboardingState();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, shouldLoad]);

  const needsNickname = shouldLoad && onboardingLoaded && !profile?.display_name?.trim();
  const needsWeightPrompt =
    shouldLoad &&
    onboardingLoaded &&
    !needsNickname &&
    !skippedWeight &&
    typeof selfPerson?.weight_lbs !== "number";
  const showCfiPrompt = useMemo(
    () =>
      shouldLoad &&
      onboardingLoaded &&
      !needsNickname &&
      !needsWeightPrompt &&
      !hasInstructorCertificate &&
      !notInstructor &&
      !dismissedCfiPrompt,
    [
      dismissedCfiPrompt,
      hasInstructorCertificate,
      needsNickname,
      needsWeightPrompt,
      notInstructor,
      onboardingLoaded,
      shouldLoad,
    ]
  );

  function handleNotInstructor() {
    if (session?.user?.id) {
      window.localStorage.setItem(getNotInstructorStorageKey(session.user.id), "true");
    }
    setNotInstructor(true);
    setDismissedCfiPrompt(true);
  }

  async function handleSaveNickname() {
    if (!session?.user?.id || !nickname.trim()) {
      setStatus("Enter a nickname to continue.");
      return;
    }

    setSaving(true);
    setStatus("Saving nickname...");

    try {
      const nextProfile = await updateCurrentProfile(session.user.id, {
        display_name: nickname,
      });
      setProfile(nextProfile);
      setNickname(nextProfile.display_name ?? "");
      setStatus("");
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Failed to save nickname.");
    } finally {
      setSaving(false);
    }
  }

  async function ensureSelfPerson(nextWeight?: number | null) {
    if (!session?.user?.id || !profile) {
      throw new Error("You must be signed in to save weight.");
    }

    if (profile.self_person_id && selfPerson) {
      const updatedPerson = await updateSavedPerson(session.user.id, selfPerson.id, {
        display_name: selfPerson.display_name || profile.display_name || session.user.email || "My profile",
        cert_number: selfPerson.cert_number ?? "",
        weight_lbs: nextWeight,
      });
      setSelfPerson(updatedPerson);
      return updatedPerson;
    }

    const createdPerson = await createSavedPerson({
      userId: session.user.id,
      role: "self",
      display_name: profile.display_name || session.user.email || "My profile",
      weight_lbs: nextWeight,
    });
    const nextProfile = await updateCurrentProfile(session.user.id, {
      self_person_id: createdPerson.id,
    });

    setProfile(nextProfile);
    setSelfPerson(createdPerson);
    return createdPerson;
  }

  async function handleSaveWeight() {
    if (!weight.trim()) {
      handleSkipWeight();
      return;
    }

    const nextWeight = Number.parseFloat(weight);
    if (!Number.isFinite(nextWeight) || nextWeight <= 0) {
      setStatus("Enter a valid weight, or skip this step.");
      return;
    }

    setSaving(true);
    setStatus("Saving weight...");

    try {
      await ensureSelfPerson(nextWeight);
      setStatus("");
      setSkippedWeight(true);
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Failed to save weight.");
    } finally {
      setSaving(false);
    }
  }

  function handleSkipWeight() {
    setSkippedWeight(true);
    setStatus("");
  }

  if (!shouldLoad || !onboardingLoaded) {
    return null;
  }

  if (needsNickname) {
    return (
      <div className="Overlay auth-onboarding-overlay">
        <div className="auth-onboarding-modal">
          <div className="auth-onboarding-content">
            <div className="auth-onboarding-head">
              <p className="saas-kicker">Profile setup</p>
              <h2 className="tools-child-title">Choose a nickname</h2>
              <p className="auth-onboarding-copy">
                This nickname is used inside PilotSeal. Your certificate name can stay with your certificate records.
              </p>
            </div>
            <label className="saas-field">
              <span>Nickname</span>
              <input
                autoFocus
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void handleSaveNickname();
                  }
                }}
                placeholder="Nickname"
              />
            </label>
            {status ? <p className="saas-meta-text">{status}</p> : null}
            <button
              type="button"
              className="primary-button auth-onboarding-primary"
              disabled={saving || !nickname.trim()}
              onClick={() => void handleSaveNickname()}
            >
              {saving ? "Saving..." : "Save nickname"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (needsWeightPrompt) {
    return (
      <div className="Overlay auth-onboarding-overlay">
        <div className="auth-onboarding-modal">
          <div className="auth-onboarding-content">
            <div className="auth-onboarding-head">
              <p className="saas-kicker">Optional setup</p>
              <h2 className="tools-child-title">Add your weight</h2>
              <p className="auth-onboarding-copy">
                Weight helps Flight Brief prefill weight and balance. You can skip this and add it later in Account Settings.
              </p>
            </div>
            <label className="saas-field">
              <span>Weight</span>
              <input
                autoFocus
                type="number"
                min="1"
                inputMode="decimal"
                value={weight}
                onChange={(event) => setWeight(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void handleSaveWeight();
                  }
                }}
                placeholder="lbs"
              />
            </label>
            {status ? <p className="saas-meta-text">{status}</p> : null}
            <div className="auth-onboarding-actions">
              <button type="button" className="ghost-button" onClick={handleSkipWeight}>
                Skip
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={saving}
                onClick={() => void handleSaveWeight()}
              >
                {saving ? "Saving..." : "Save weight"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (showCfiPrompt) {
    return (
      <div className="Overlay auth-onboarding-overlay">
        <div className="auth-onboarding-modal">
          <div className="auth-onboarding-content">
            <div className="auth-onboarding-head">
              <p className="saas-kicker">Endorsement setup</p>
              <h2 className="tools-child-title">Add your CFI certificate</h2>
              <p className="auth-onboarding-copy">
                Save your flight instructor or ground instructor certificate so endorsements can auto-fill your instructor details.
              </p>
            </div>
            <div className="auth-onboarding-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={handleNotInstructor}
              >
                I&apos;m not an instructor
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setDismissedCfiPrompt(true)}
              >
                Later
              </button>
              <Link
                className="primary-button"
                href="/dashboard/account-settings?onboarding=certificates"
                onClick={() => setDismissedCfiPrompt(true)}
              >
                Add certificate
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
