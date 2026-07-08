"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import {
  attachAircraftByTail,
  fetchAircraftModels,
  fetchMyAircraft,
  fetchSharedAircraft,
  removeMyAircraft,
  saveCurrentAircraftForUser,
  submitAircraftUpdateRequest,
  updateMyAircraft,
  updateSavedAircraftDue,
  type AircraftModelRecord,
  type AircraftRecord,
  type AttachAircraftConflict,
  type SavedAircraftDueInput,
} from "@/lib/aircraft";

type AircraftFormState = {
  model_id: string;
  tail_number: string;
  empty_weight: string;
  empty_arm: string;
  empty_lat_arm: string;
  hundred_hour_due_hours: string;
  annual_due_date: string;
  static_due_date: string;
  transponder_due_date: string;
  elt_due_date: string;
};

const emptyForm: AircraftFormState = {
  model_id: "",
  tail_number: "",
  empty_weight: "",
  empty_arm: "",
  empty_lat_arm: "",
  hundred_hour_due_hours: "",
  annual_due_date: "",
  static_due_date: "",
  transponder_due_date: "",
  elt_due_date: "",
};

function toNullableNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function toRequiredNumber(value: string, label: string) {
  const parsed = toNullableNumber(value);
  if (parsed === null) {
    throw new Error(`${label} is required.`);
  }

  return parsed;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const parts = [record.message, record.details, record.hint]
      .filter((value) => typeof value === "string" && value.trim())
      .map((value) => String(value).trim());

    if (parts.length > 0) {
      return parts.join(" ");
    }
  }

  return fallback;
}

function scrollEditorIntoView(targetId: string, scrollContainer: HTMLElement | null | undefined) {
  const runScroll = () => {
    const element = document.getElementById(targetId);
    if (!element || !(scrollContainer instanceof HTMLElement)) {
      return;
    }

    const top = element.offsetTop - 24;
    scrollContainer.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  };

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(runScroll);
  });
}

function formatDateLabel(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const [datePart] = value.split("T");
  const [year, month, day] = datePart.split("-");
  if (!year || !month) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day || "1"))));
}

function formatDateInput(value: string | null | undefined) {
  return value ? value.slice(0, 7) : "";
}

function getDueSummary(aircraft: AircraftRecord) {
  const items = [
    aircraft.hundred_hour_due_hours != null ? `100hr ${aircraft.hundred_hour_due_hours}` : "",
    aircraft.annual_due_date ? `Annual ${formatDateLabel(aircraft.annual_due_date)}` : "",
    aircraft.static_due_date ? `91.411 ${formatDateLabel(aircraft.static_due_date)}` : "",
    aircraft.transponder_due_date ? `91.413 ${formatDateLabel(aircraft.transponder_due_date)}` : "",
    aircraft.elt_due_date ? `ELT ${formatDateLabel(aircraft.elt_due_date)}` : "",
  ].filter(Boolean);

  return items.join(" · ");
}

export default function MyAircraftManager() {
  const { session } = useAuthSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [models, setModels] = useState<AircraftModelRecord[]>([]);
  const [myAircraft, setMyAircraft] = useState<AircraftRecord[]>([]);
  const [sharedAircraft, setSharedAircraft] = useState<AircraftRecord[]>([]);
  const [form, setForm] = useState<AircraftFormState>(emptyForm);
  const [editingAircraftId, setEditingAircraftId] = useState("");
  const [conflict, setConflict] = useState<AttachAircraftConflict | null>(null);
  const [showManager, setShowManager] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setPortalRoot(document.body);
  }, []);

  useEffect(() => {
    if (!showManager) {
      return;
    }

    const scrollY = window.scrollY;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousOverflow = document.body.style.overflow;
    const previousPosition = document.body.style.position;
    const previousTop = document.body.style.top;
    const previousWidth = document.body.style.width;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousOverflow;
      document.body.style.position = previousPosition;
      document.body.style.top = previousTop;
      document.body.style.width = previousWidth;
      window.scrollTo({ top: scrollY, behavior: "auto" });
    };
  }, [showManager]);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      if (!session?.user?.id) {
        if (!cancelled) {
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setStatus("");

      try {
        const [modelList, sharedList, attachedList] = await Promise.all([
          fetchAircraftModels(),
          fetchSharedAircraft(),
          fetchMyAircraft(session.user.id),
        ]);

        if (!cancelled) {
          setModels(modelList);
          setSharedAircraft(sharedList);
          setMyAircraft(attachedList);
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(getErrorMessage(error, "Unable to load your aircraft right now."));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (showManager && showForm) {
      scrollEditorIntoView("my-aircraft-editor", scrollRef.current);
    }
  }, [showForm, showManager]);

  useEffect(() => {
    if (showManager && showForm && conflict) {
      scrollEditorIntoView("my-aircraft-conflict", scrollRef.current);
    }
  }, [conflict, showForm, showManager]);

  const modelNameById = useMemo(
    () => new Map(models.map((model) => [model.id, model.name])),
    [models]
  );

  async function reloadAircraftLists() {
    if (!session?.user?.id) {
      return;
    }

    const [sharedList, attachedList] = await Promise.all([
      fetchSharedAircraft(),
      fetchMyAircraft(session.user.id),
    ]);

    setSharedAircraft(sharedList);
    setMyAircraft(attachedList);
  }

  function updateField<K extends keyof AircraftFormState>(key: K, value: AircraftFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function getDueInputFromForm(): SavedAircraftDueInput {
    const toStoredMonthEnd = (value: string) => {
      const [year, month] = value.split("-").map(Number);
      if (!year || !month) {
        return null;
      }

      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    };

    return {
      hundred_hour_due_hours: toNullableNumber(form.hundred_hour_due_hours),
      annual_due_date: toStoredMonthEnd(form.annual_due_date),
      static_due_date: toStoredMonthEnd(form.static_due_date),
      transponder_due_date: toStoredMonthEnd(form.transponder_due_date),
      elt_due_date: toStoredMonthEnd(form.elt_due_date),
    };
  }

  function hasAircraftInfoChanges(aircraft: AircraftRecord, proposed: {
    model_id: string;
    tail_number: string;
    empty_weight: number;
    empty_arm: number;
    empty_lat_arm: number | null;
  }) {
    return (
      String(aircraft.model_id ?? "") !== proposed.model_id ||
      String(aircraft.tail_number ?? "").toUpperCase() !== proposed.tail_number ||
      aircraft.empty_weight !== proposed.empty_weight ||
      aircraft.empty_arm !== proposed.empty_arm ||
      (aircraft.empty_lat_arm ?? null) !== proposed.empty_lat_arm
    );
  }

  function openAddForm() {
    setForm(emptyForm);
    setEditingAircraftId("");
    setConflict(null);
    setShowForm(true);
    setShowManager(true);
  }

  function openEditForm(aircraft: AircraftRecord) {
    setForm({
      model_id: aircraft.model_id ?? "",
      tail_number: aircraft.tail_number ?? aircraft.name ?? "",
      empty_weight: aircraft.empty_weight != null ? String(aircraft.empty_weight) : "",
      empty_arm: aircraft.empty_arm != null ? String(aircraft.empty_arm) : "",
      empty_lat_arm: aircraft.empty_lat_arm != null ? String(aircraft.empty_lat_arm) : "",
      hundred_hour_due_hours:
        aircraft.hundred_hour_due_hours != null ? String(aircraft.hundred_hour_due_hours) : "",
      annual_due_date: formatDateInput(aircraft.annual_due_date),
      static_due_date: formatDateInput(aircraft.static_due_date),
      transponder_due_date: formatDateInput(aircraft.transponder_due_date),
      elt_due_date: formatDateInput(aircraft.elt_due_date),
    });
    setEditingAircraftId(aircraft.id);
    setConflict(null);
    setShowForm(true);
    setShowManager(true);
  }

  function closeForm() {
    setForm(emptyForm);
    setEditingAircraftId("");
    setConflict(null);
    setShowForm(false);
  }

  async function handleAttach() {
    if (!session?.user?.id) {
      return;
    }

    if (!form.model_id) {
      setStatus("Select a model.");
      return;
    }

    if (!form.tail_number.trim()) {
      setStatus("Tail number is required.");
      return;
    }

    setSaving(true);
    setStatus("");
    setConflict(null);

    try {
      if (editingAircraftId) {
        const currentAircraft = myAircraft.find((aircraft) => aircraft.id === editingAircraftId);

        if (!currentAircraft) {
          throw new Error("Unable to find this aircraft.");
        }

        const proposed = {
          model_id: form.model_id,
          tail_number: form.tail_number.trim().toUpperCase(),
          empty_weight: toRequiredNumber(form.empty_weight, "Empty weight"),
          empty_arm: toRequiredNumber(form.empty_arm, "Empty arm"),
          empty_lat_arm: toNullableNumber(form.empty_lat_arm),
        };
        const dueInput = getDueInputFromForm();

        if (currentAircraft.visibility === "private" && currentAircraft.owner_user_id === session.user.id) {
          await updateMyAircraft(session.user.id, editingAircraftId, {
            model_id: proposed.model_id,
            name: proposed.tail_number,
            empty_weight: proposed.empty_weight,
            empty_arm: proposed.empty_arm,
            empty_lat_arm: proposed.empty_lat_arm,
          });
          await updateSavedAircraftDue(session.user.id, editingAircraftId, dueInput);
          await reloadAircraftLists();
          closeForm();
          setStatus("Aircraft updated.");
          return;
        }

        if (!hasAircraftInfoChanges(currentAircraft, proposed)) {
          await updateSavedAircraftDue(session.user.id, editingAircraftId, dueInput);
          await reloadAircraftLists();
          closeForm();
          setStatus("Aircraft due info saved.");
          return;
        }

        setConflict({
          kind: "conflict",
          aircraft: currentAircraft,
          proposed,
        });
        setStatus("This shared aircraft needs an update request for W&B changes.");
        return;
      }

      const dueInput = getDueInputFromForm();
      const result = await attachAircraftByTail({
        userId: session.user.id,
        model_id: form.model_id,
        tail_number: form.tail_number,
        empty_weight: toRequiredNumber(form.empty_weight, "Empty weight"),
        empty_arm: toRequiredNumber(form.empty_arm, "Empty arm"),
        empty_lat_arm: toNullableNumber(form.empty_lat_arm),
      });

      if (result.kind === "conflict") {
        setConflict(result);
        setStatus("This tail number already exists with different W&B numbers.");
        return;
      }

      await updateSavedAircraftDue(session.user.id, result.aircraft.id, dueInput);
      await reloadAircraftLists();
      closeForm();
      setStatus(
        result.kind === "created"
          ? "Aircraft created and added to My Aircraft."
          : "Aircraft added to My Aircraft."
      );
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to add aircraft right now."));
    } finally {
      setSaving(false);
    }
  }

  async function handleUseCurrentAircraft() {
    if (!session?.user?.id || !conflict) {
      return;
    }

    setSaving(true);
    setStatus("");

    try {
      await saveCurrentAircraftForUser(session.user.id, conflict.aircraft.id);
      await updateSavedAircraftDue(session.user.id, conflict.aircraft.id, getDueInputFromForm());
      await reloadAircraftLists();
      closeForm();
      setStatus("Current shared aircraft added to My Aircraft.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to attach current aircraft."));
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitUpdateRequest() {
    if (!session?.user?.id || !conflict) {
      return;
    }

    setSaving(true);
    setStatus("");

    try {
      if (editingAircraftId) {
        await updateSavedAircraftDue(session.user.id, editingAircraftId, getDueInputFromForm());
      }

      await submitAircraftUpdateRequest({
        aircraft_id: conflict.aircraft.id,
        submitted_by: session.user.id,
        proposed_empty_weight: conflict.proposed.empty_weight,
        proposed_empty_arm: conflict.proposed.empty_arm,
        proposed_empty_lat_arm: conflict.proposed.empty_lat_arm,
        note: `Submitted from My Aircraft for ${conflict.proposed.tail_number}.`,
      });
      closeForm();
      setStatus("Update request submitted for admin review.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to submit an aircraft update request."));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(aircraftId: string) {
    if (!session?.user?.id) {
      return;
    }

    const confirmed = window.confirm("Remove this aircraft from My Aircraft?");
    if (!confirmed) {
      return;
    }

    setSaving(true);
    setStatus("");

    try {
      await removeMyAircraft(session.user.id, aircraftId);
      setMyAircraft((current) => current.filter((aircraft) => aircraft.id !== aircraftId));
      setStatus("Aircraft removed from My Aircraft.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to remove this aircraft right now."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="saas-panel">Loading aircraft...</div>;
  }

  return (
    <>
      <section className="saas-panel people-list-panel">
        <div className="people-toolbar">
          <div>
            <h3 className="saas-subsection-title">My Aircraft</h3>
            <p className="saas-meta-text">{myAircraft.length} attached</p>
          </div>
          <div className="rounded-[14px] border border-slate-200/80 bg-white px-3 py-2 text-right shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-slate-400">
              Shared registry
            </p>
            <p className="mt-1 text-sm font-medium text-slate-700">{sharedAircraft.length} aircraft</p>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setShowManager(true)}
          >
            Manage
          </button>
        </div>

        {status ? <p className="saas-meta-text mt-3">{status}</p> : null}

        <div className="my-aircraft-table mt-4">
          <div className="my-aircraft-table-head">
            <span>Tail number</span>
            <span>Model</span>
            <span>W&B</span>
            <span>Action</span>
          </div>

          {myAircraft.length === 0 ? (
            <p className="saas-empty-state">No aircraft attached yet.</p>
          ) : (
            myAircraft.map((aircraft) => (
              <div key={aircraft.id} className="my-aircraft-row">
                <div className="my-aircraft-cell my-aircraft-tail">
                  <p className="my-aircraft-primary">{aircraft.tail_number}</p>
                </div>
                <div className="my-aircraft-cell my-aircraft-model">
                  <p className="my-aircraft-secondary">
                    {modelNameById.get(aircraft.model_id ?? "") ?? aircraft.model?.name ?? "Unknown model"}
                  </p>
                </div>
                <div className="my-aircraft-cell my-aircraft-wb">
                  <p className="my-aircraft-secondary">
                    {aircraft.empty_weight ?? "--"} lbs · Arm {aircraft.empty_arm ?? "--"}
                    {aircraft.empty_lat_arm != null ? ` · Lat ${aircraft.empty_lat_arm}` : ""}
                  </p>
                  <p className="my-aircraft-secondary my-aircraft-muted-line">
                    Updated {formatDateLabel(aircraft.updated_at) || "--"}
                    {getDueSummary(aircraft) ? ` · ${getDueSummary(aircraft)}` : ""}
                  </p>
                </div>
                <div className="my-aircraft-cell my-aircraft-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={saving}
                    onClick={() => openEditForm(aircraft)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="danger-button-compact"
                    disabled={saving}
                    onClick={() => void handleRemove(aircraft.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {showManager && portalRoot
        ? createPortal(
            <div className="Overlay" onClick={() => setShowManager(false)}>
              <div className="Modal" onClick={(event) => event.stopPropagation()}>
                <div className="tools-child-shell flex h-full min-h-0 flex-col">
                  <div className="tools-child-header">
                    <div>
                      <p className="saas-kicker">Aircraft</p>
                      <h2 className="tools-child-title">My Aircraft</h2>
                    </div>
                    <div className="tools-child-actions">
                      <button type="button" className="ghost-button" onClick={openAddForm}>
                        Add aircraft
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => {
                          setShowManager(false);
                          closeForm();
                        }}
                      >
                        Close
                      </button>
                    </div>
                  </div>

                  <div
                    ref={scrollRef}
                    className="mt-5 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [-webkit-overflow-scrolling:touch]"
                  >
                    <div className="grid gap-3">
                      {myAircraft.map((aircraft) => (
                        <div
                          key={aircraft.id}
                          className="rounded-2xl border border-[var(--border)] bg-white/80 px-4 py-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{aircraft.tail_number}</p>
                              <p className="saas-meta-text">
                                {modelNameById.get(aircraft.model_id ?? "") ?? aircraft.model?.name ?? "Unknown model"}
                              </p>
                              <p className="saas-meta-text mt-2">
                                Empty {aircraft.empty_weight ?? "--"} lbs · Arm {aircraft.empty_arm ?? "--"}
                                {aircraft.empty_lat_arm != null ? ` · Lat ${aircraft.empty_lat_arm}` : ""}
                              </p>
                              <p className="saas-meta-text mt-1">
                                Updated {formatDateLabel(aircraft.updated_at) || "--"}
                                {getDueSummary(aircraft) ? ` · ${getDueSummary(aircraft)}` : ""}
                              </p>
                            </div>
                            <div className="flex flex-wrap justify-end gap-2">
                              <button
                                type="button"
                                className="ghost-button"
                                disabled={saving}
                                onClick={() => openEditForm(aircraft)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="danger-button-compact"
                                disabled={saving}
                                onClick={() => void handleRemove(aircraft.id)}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}

                      {showForm ? (
                        <div
                          id="my-aircraft-editor"
                          className="mt-3 rounded-2xl border border-[var(--border)] bg-white/85 p-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <h3 className="text-sm font-semibold text-slate-900">
                              {editingAircraftId ? "Edit aircraft" : "Add aircraft"}
                            </h3>
                            <button type="button" className="ghost-button" onClick={closeForm}>
                              Close
                            </button>
                          </div>

                          <p className="saas-meta-text mt-3">
                            {editingAircraftId
                              ? "Update this aircraft. Private aircraft save directly; shared aircraft changes submit an update request."
                              : "Add a tail number to your aircraft list or attach an existing shared aircraft."}
                          </p>

                          <div className="mt-4 grid gap-4 md:grid-cols-2">
                            <label className="grid gap-2 text-sm md:col-span-2">
                              <span>Model</span>
                              <select
                                className="rounded-xl border border-slate-300 px-3 py-2"
                                value={form.model_id}
                                onChange={(event) => updateField("model_id", event.target.value)}
                              >
                                <option value="">Select a model</option>
                                {models.map((model) => (
                                  <option key={model.id} value={model.id}>
                                    {model.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="grid gap-2 text-sm md:col-span-2">
                              <span>Tail number</span>
                              <input
                                className="rounded-xl border border-slate-300 px-3 py-2"
                                value={form.tail_number}
                                onChange={(event) =>
                                  updateField("tail_number", event.target.value.toUpperCase())
                                }
                              />
                            </label>
                            <label className="grid gap-2 text-sm">
                              <span>Empty weight</span>
                              <input
                                className="rounded-xl border border-slate-300 px-3 py-2"
                                type="number"
                                value={form.empty_weight}
                                onChange={(event) => updateField("empty_weight", event.target.value)}
                              />
                            </label>
                            <label className="grid gap-2 text-sm">
                              <span>Empty arm</span>
                              <input
                                className="rounded-xl border border-slate-300 px-3 py-2"
                                type="number"
                                value={form.empty_arm}
                                onChange={(event) => updateField("empty_arm", event.target.value)}
                              />
                            </label>
                            <label className="grid gap-2 text-sm">
                              <span>Empty lat arm</span>
                              <input
                                className="rounded-xl border border-slate-300 px-3 py-2"
                                type="number"
                                value={form.empty_lat_arm}
                                onChange={(event) => updateField("empty_lat_arm", event.target.value)}
                              />
                            </label>
                          </div>

                          <div className="mt-5 border-t border-slate-200/80 pt-4">
                            <div className="flex flex-wrap items-end justify-between gap-2">
                              <div>
                                <h4 className="text-sm font-semibold text-slate-900">Personal due info</h4>
                                <p className="saas-meta-text mt-1">
                                  These values stay on your saved aircraft record.
                                </p>
                              </div>
                              {editingAircraftId ? (
                                <p className="saas-meta-text">
                                  Updated{" "}
                                  {formatDateLabel(
                                    myAircraft.find((aircraft) => aircraft.id === editingAircraftId)?.updated_at
                                  ) || "--"}
                                </p>
                              ) : null}
                            </div>

                            <div className="mt-4 grid gap-3 md:grid-cols-5">
                              <label className="grid gap-2 text-sm">
                                <span>100hr due</span>
                                <input
                                  className="rounded-xl border border-slate-300 px-3 py-2"
                                  type="number"
                                  step="0.1"
                                  value={form.hundred_hour_due_hours}
                                  onChange={(event) =>
                                    updateField("hundred_hour_due_hours", event.target.value)
                                  }
                                />
                              </label>
                              <label className="grid gap-2 text-sm">
                                <span>Annual</span>
                                <input
                                  className="rounded-xl border border-slate-300 px-3 py-2"
                                  type="month"
                                  value={form.annual_due_date}
                                  onChange={(event) => updateField("annual_due_date", event.target.value)}
                                />
                              </label>
                              <label className="grid gap-2 text-sm">
                                <span>91.411 (PS)</span>
                                <input
                                  className="rounded-xl border border-slate-300 px-3 py-2"
                                  type="month"
                                  value={form.static_due_date}
                                  onChange={(event) => updateField("static_due_date", event.target.value)}
                                />
                              </label>
                              <label className="grid gap-2 text-sm">
                                <span>91.413 (TX)</span>
                                <input
                                  className="rounded-xl border border-slate-300 px-3 py-2"
                                  type="month"
                                  value={form.transponder_due_date}
                                  onChange={(event) => updateField("transponder_due_date", event.target.value)}
                                />
                              </label>
                              <label className="grid gap-2 text-sm">
                                <span>ELT</span>
                                <input
                                  className="rounded-xl border border-slate-300 px-3 py-2"
                                  type="month"
                                  value={form.elt_due_date}
                                  onChange={(event) => updateField("elt_due_date", event.target.value)}
                                />
                              </label>
                            </div>
                          </div>

                          <div className="mt-6 flex items-center justify-end gap-3">
                            <button
                              type="button"
                              className="primary-button"
                              disabled={saving}
                              onClick={() => void handleAttach()}
                            >
                              {saving ? "Working..." : editingAircraftId ? "Save aircraft" : "Add to My Aircraft"}
                            </button>
                          </div>

                          {conflict ? (
                            <div
                              id="my-aircraft-conflict"
                              className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/80 p-4"
                            >
                              <h2 className="text-sm font-semibold text-slate-950">Existing aircraft found</h2>
                              <p className="saas-meta-text mt-2">
                                The tail number already exists, but your W&B numbers do not match the current shared
                                record.
                              </p>

                              <div className="mt-4 grid gap-4 md:grid-cols-2">
                                <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
                                  <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                    Current shared record
                                  </p>
                                  <div className="mt-3 space-y-2 text-sm text-slate-700">
                                    <p>Tail: {conflict.aircraft.tail_number}</p>
                                    <p>
                                      Model: {modelNameById.get(conflict.aircraft.model_id ?? "") ?? "Unknown"}
                                    </p>
                                    <p>Empty weight: {conflict.aircraft.empty_weight ?? "--"}</p>
                                    <p>Empty arm: {conflict.aircraft.empty_arm ?? "--"}</p>
                                    <p>Empty lat arm: {conflict.aircraft.empty_lat_arm ?? "--"}</p>
                                  </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
                                  <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                    Your submitted values
                                  </p>
                                  <div className="mt-3 space-y-2 text-sm text-slate-700">
                                    <p>Tail: {conflict.proposed.tail_number}</p>
                                    <p>Model: {modelNameById.get(conflict.proposed.model_id) ?? "Unknown"}</p>
                                    <p>Empty weight: {conflict.proposed.empty_weight}</p>
                                    <p>Empty arm: {conflict.proposed.empty_arm}</p>
                                    <p>Empty lat arm: {conflict.proposed.empty_lat_arm ?? "--"}</p>
                                  </div>
                                </div>
                              </div>

                              <div className="mt-5 flex flex-wrap items-center gap-3">
                                <button
                                  type="button"
                                  className="secondary-button"
                                  disabled={saving}
                                  onClick={() => void handleUseCurrentAircraft()}
                                >
                                  Use current aircraft
                                </button>
                                <button
                                  type="button"
                                  className="primary-button"
                                  disabled={saving}
                                  onClick={() => void handleSubmitUpdateRequest()}
                                >
                                  Submit updated W&B
                                </button>
                                <button
                                  type="button"
                                  className="ghost-button"
                                  disabled={saving}
                                  onClick={() => setConflict(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>,
            portalRoot
          )
        : null}
    </>
  );
}
