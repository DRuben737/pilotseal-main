"use client";

import { useEffect, useMemo, useState } from "react";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { useOrganization } from "@/components/organizations/OrganizationProvider";
import {
  createAircraftModel,
  createOrganizationAircraft,
  deleteAircraftModel,
  deleteOrganizationAircraft,
  fetchAircraftModels,
  fetchOrganizationAircraft,
  updateOrganizationAircraft,
  updateAircraftModel,
  type AircraftModelRecord,
  type AircraftRecord,
  type SavedAircraftDueInput,
} from "@/lib/aircraft";
import {
  addOrganizationMemberByEmail,
  canManageOrganization,
  canManageOrganizationAdmins,
  fetchOrganizationMembers,
  removeOrganizationMember,
  setOrganizationMemberRole,
  setOrganizationMemberTeachingRole,
  transferOrganizationOwnership,
  type OrganizationMember,
} from "@/lib/organizations";
import OrganizationEndorsementRequests from "@/components/dashboard/OrganizationEndorsementRequests";

type ModelForm = {
  name: string;
  category: string;
  avg_fuel_burn_rate: string;
  stationsJson: string;
  envelopeJson: string;
};

const emptyModelForm: ModelForm = {
  name: "",
  category: "Airplane",
  avg_fuel_burn_rate: "",
  stationsJson: "[]",
  envelopeJson: "{}",
};

type AircraftForm = {
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

const emptyAircraftForm: AircraftForm = {
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

export default function OrganizationManager() {
  const { session } = useAuthSession();
  const { activeOrganization, loading: organizationsLoading, refreshOrganizations } = useOrganization();
  const role = activeOrganization?.member_role;
  const canManage = canManageOrganization(role);
  const canManageAdmins = canManageOrganizationAdmins(role);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [models, setModels] = useState<AircraftModelRecord[]>([]);
  const [aircraft, setAircraft] = useState<AircraftRecord[]>([]);
  const [editingAircraftId, setEditingAircraftId] = useState("");
  const [showAircraftForm, setShowAircraftForm] = useState(false);
  const [aircraftForm, setAircraftForm] = useState<AircraftForm>(emptyAircraftForm);
  const [editingModelId, setEditingModelId] = useState("");
  const [showModelForm, setShowModelForm] = useState(false);
  const [modelForm, setModelForm] = useState<ModelForm>(emptyModelForm);

  const modelNames = useMemo(
    () => new Map(models.map((model) => [model.id, model.name])),
    [models]
  );

  async function loadOrganizationData() {
    if (!activeOrganization?.id) {
      setMembers([]);
      setAircraft([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setStatus("");
    try {
      const [aircraftList, modelList, memberList] = await Promise.all([
        fetchOrganizationAircraft(activeOrganization.id),
        fetchAircraftModels(activeOrganization.id),
        canManage ? fetchOrganizationMembers(activeOrganization.id) : Promise.resolve([]),
      ]);
      setAircraft(aircraftList);
      setModels(modelList);
      setMembers(memberList);
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to load organization data."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOrganizationData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrganization?.id, canManage]);

  async function handleAddMember(event: React.FormEvent) {
    event.preventDefault();
    if (!activeOrganization?.id || !memberEmail.trim()) return;
    setSaving(true);
    setStatus("");
    try {
      await addOrganizationMemberByEmail(activeOrganization.id, memberEmail);
      setMemberEmail("");
      setMembers(await fetchOrganizationMembers(activeOrganization.id));
      setStatus("Member added.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to add this member."));
    } finally {
      setSaving(false);
    }
  }

  async function handleRoleChange(member: OrganizationMember) {
    if (!activeOrganization?.id) return;
    const nextRole = member.member_role === "organization_admin" ? "member" : "organization_admin";
    setSaving(true);
    setStatus("");
    try {
      await setOrganizationMemberRole(activeOrganization.id, member.user_id, nextRole);
      setMembers(await fetchOrganizationMembers(activeOrganization.id));
      setStatus(nextRole === "organization_admin" ? "Administrator assigned." : "Administrator access removed.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to change this member's role."));
    } finally {
      setSaving(false);
    }
  }

  async function handleTeachingRoleChange(member: OrganizationMember, teachingRole: "instructor" | "student" | null) {
    if (!activeOrganization?.id) return;
    setSaving(true);
    setStatus("");
    try {
      await setOrganizationMemberTeachingRole(activeOrganization.id, member.user_id, teachingRole);
      setMembers(await fetchOrganizationMembers(activeOrganization.id));
      setStatus(teachingRole ? `Teaching role set to ${teachingRole}.` : "Teaching role removed.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to change this teaching role."));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveMember(member: OrganizationMember) {
    if (!activeOrganization?.id || !window.confirm(`Remove ${member.email} from this organization?`)) return;
    setSaving(true);
    setStatus("");
    try {
      await removeOrganizationMember(activeOrganization.id, member.user_id);
      setMembers((current) => current.filter((item) => item.user_id !== member.user_id));
      setStatus("Member removed. Their PilotSeal account was not changed.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to remove this member."));
    } finally {
      setSaving(false);
    }
  }

  async function handleTransferOwnership(member: OrganizationMember) {
    if (!activeOrganization?.id || !window.confirm(`Transfer ownership to ${member.email}?`)) return;
    setSaving(true);
    setStatus("");
    try {
      await transferOrganizationOwnership(activeOrganization.id, member.user_id);
      await refreshOrganizations();
      setMembers(await fetchOrganizationMembers(activeOrganization.id));
      setStatus("Organization ownership transferred.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to transfer ownership."));
    } finally {
      setSaving(false);
    }
  }

  function updateAircraftField<K extends keyof AircraftForm>(key: K, value: AircraftForm[K]) {
    setAircraftForm((current) => ({ ...current, [key]: value }));
  }

  function startCreateAircraft() {
    setEditingAircraftId("");
    setAircraftForm(emptyAircraftForm);
    setShowAircraftForm(true);
  }

  function startEditAircraft(item: AircraftRecord) {
    setEditingAircraftId(item.id);
    setAircraftForm({
      model_id: item.model_id ?? "",
      tail_number: item.tail_number,
      empty_weight: item.empty_weight == null ? "" : String(item.empty_weight),
      empty_arm: item.empty_arm == null ? "" : String(item.empty_arm),
      empty_lat_arm: item.empty_lat_arm == null ? "" : String(item.empty_lat_arm),
      hundred_hour_due_hours:
        item.hundred_hour_due_hours == null ? "" : String(item.hundred_hour_due_hours),
      annual_due_date: item.annual_due_date ?? "",
      static_due_date: item.static_due_date ?? "",
      transponder_due_date: item.transponder_due_date ?? "",
      elt_due_date: item.elt_due_date ?? "",
    });
    setShowAircraftForm(true);
  }

  async function handleSaveAircraft(event: React.FormEvent) {
    event.preventDefault();
    if (!activeOrganization?.id) return;
    setSaving(true);
    setStatus("");
    try {
      const maintenance: SavedAircraftDueInput = {
        hundred_hour_due_hours: optionalNumber(aircraftForm.hundred_hour_due_hours),
        annual_due_date: aircraftForm.annual_due_date || null,
        static_due_date: aircraftForm.static_due_date || null,
        transponder_due_date: aircraftForm.transponder_due_date || null,
        elt_due_date: aircraftForm.elt_due_date || null,
      };
      const input = {
        model_id: aircraftForm.model_id,
        tail_number: aircraftForm.tail_number,
        empty_weight: requiredNumber(aircraftForm.empty_weight, "Empty weight"),
        empty_arm: requiredNumber(aircraftForm.empty_arm, "Empty arm"),
        empty_lat_arm: optionalNumber(aircraftForm.empty_lat_arm),
        maintenance,
      };

      if (!input.model_id) throw new Error("Select an aircraft model.");
      if (editingAircraftId) {
        await updateOrganizationAircraft(activeOrganization.id, editingAircraftId, input);
      } else {
        await createOrganizationAircraft({ organization_id: activeOrganization.id, ...input });
      }

      setAircraft(await fetchOrganizationAircraft(activeOrganization.id));
      setShowAircraftForm(false);
      setEditingAircraftId("");
      setAircraftForm(emptyAircraftForm);
      setStatus(editingAircraftId ? "Organization aircraft updated." : "Organization aircraft created.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to save this aircraft."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAircraft(item: AircraftRecord) {
    if (!activeOrganization?.id || !window.confirm(`Delete ${item.tail_number} from this organization?`)) return;
    setSaving(true);
    setStatus("");
    try {
      await deleteOrganizationAircraft(activeOrganization.id, item.id);
      setAircraft((current) => current.filter((aircraftItem) => aircraftItem.id !== item.id));
      setStatus("Organization aircraft deleted.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to delete this aircraft."));
    } finally {
      setSaving(false);
    }
  }

  function startCreateModel() {
    setEditingModelId("");
    setModelForm(emptyModelForm);
    setShowModelForm(true);
  }

  function startEditModel(model: AircraftModelRecord) {
    setEditingModelId(model.id);
    setModelForm({
      name: model.name,
      category: model.category ?? "Airplane",
      avg_fuel_burn_rate: model.avg_fuel_burn_rate == null ? "" : String(model.avg_fuel_burn_rate),
      stationsJson: JSON.stringify(model.stations ?? [], null, 2),
      envelopeJson: JSON.stringify(model.envelope ?? {}, null, 2),
    });
    setShowModelForm(true);
  }

  async function handleSaveModel(event: React.FormEvent) {
    event.preventDefault();
    if (!activeOrganization?.id) return;
    setSaving(true);
    setStatus("");
    try {
      const stations = JSON.parse(modelForm.stationsJson);
      const envelope = JSON.parse(modelForm.envelopeJson);
      if (!Array.isArray(stations)) throw new Error("Stations must be a JSON array.");
      const input = {
        name: modelForm.name.trim(),
        category: modelForm.category.trim(),
        avg_fuel_burn_rate: optionalNumber(modelForm.avg_fuel_burn_rate),
        stations,
        envelope,
      };
      if (!input.name || !input.category) throw new Error("Model name and category are required.");
      if (editingModelId) {
        await updateAircraftModel(editingModelId, input);
      } else {
        await createAircraftModel({ ...input, organization_id: activeOrganization.id });
      }
      setModels(await fetchAircraftModels(activeOrganization.id));
      setShowModelForm(false);
      setEditingModelId("");
      setStatus(editingModelId ? "Organization model updated." : "Organization model created.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to save this aircraft model."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteModel(model: AircraftModelRecord) {
    if (!activeOrganization?.id || model.organization_id !== activeOrganization.id) return;
    if (!window.confirm(`Delete organization model ${model.name}?`)) return;
    setSaving(true);
    setStatus("");
    try {
      await deleteAircraftModel(model.id);
      setModels((current) => current.filter((item) => item.id !== model.id));
      setStatus("Organization model deleted.");
    } catch (error) {
      setStatus(getErrorMessage(error, "Unable to delete this model. Remove aircraft using it first."));
    } finally {
      setSaving(false);
    }
  }

  if (organizationsLoading || loading) return <div className="saas-panel">Loading organization...</div>;
  if (!activeOrganization) {
    return <div className="saas-panel">This account does not belong to an organization.</div>;
  }
  if (!canManage) {
    return <div className="saas-panel">Organization members can view the fleet from My Aircraft.</div>;
  }

  return (
    <div className="grid gap-5">
      <section className="saas-panel">
        <p className="saas-kicker">Current organization</p>
        <h1 className="tools-child-title">{activeOrganization.name}</h1>
        <p className="saas-meta-text mt-2">Role: {formatRole(role ?? "member")}</p>
        {status ? <p className="mt-3 text-sm text-slate-600">{status}</p> : null}
      </section>

      <section className="saas-panel">
        <div className="people-toolbar">
          <div>
            <h2 className="saas-subsection-title">Aircraft models</h2>
            <p className="saas-meta-text">Create models owned and maintained by {activeOrganization.name}. Global models remain available.</p>
          </div>
          <button className="secondary-button" type="button" onClick={startCreateModel}>Add model</button>
        </div>

        {showModelForm ? (
          <form className="mt-5 grid gap-4 rounded-2xl border border-slate-200 bg-white/80 p-4 md:grid-cols-2" onSubmit={handleSaveModel}>
            <h3 className="text-sm font-semibold text-slate-900 md:col-span-2">{editingModelId ? "Edit organization model" : "New organization model"}</h3>
            <Field label="Model name"><input className="rounded-xl border border-slate-300 px-3 py-2" value={modelForm.name} onChange={(event) => setModelForm((current) => ({ ...current, name: event.target.value }))} required /></Field>
            <Field label="Category"><input className="rounded-xl border border-slate-300 px-3 py-2" value={modelForm.category} onChange={(event) => setModelForm((current) => ({ ...current, category: event.target.value }))} required /></Field>
            <Field label="Average fuel burn"><input type="number" step="any" className="rounded-xl border border-slate-300 px-3 py-2" value={modelForm.avg_fuel_burn_rate} onChange={(event) => setModelForm((current) => ({ ...current, avg_fuel_burn_rate: event.target.value }))} /></Field>
            <div />
            <Field label="Stations (JSON)"><textarea rows={8} className="rounded-xl border border-slate-300 px-3 py-2 font-mono text-xs" value={modelForm.stationsJson} onChange={(event) => setModelForm((current) => ({ ...current, stationsJson: event.target.value }))} /></Field>
            <Field label="Envelope (JSON)"><textarea rows={8} className="rounded-xl border border-slate-300 px-3 py-2 font-mono text-xs" value={modelForm.envelopeJson} onChange={(event) => setModelForm((current) => ({ ...current, envelopeJson: event.target.value }))} /></Field>
            <div className="flex gap-2 md:col-span-2"><button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving..." : "Save model"}</button><button className="ghost-button" type="button" onClick={() => setShowModelForm(false)}>Cancel</button></div>
          </form>
        ) : null}

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {models.filter((model) => model.organization_id === activeOrganization.id).map((model) => (
            <div key={model.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <p className="text-sm font-semibold text-slate-900">{model.name}</p>
              <p className="saas-meta-text">{model.category || "Uncategorized"}</p>
              <div className="mt-3 flex gap-2"><button className="ghost-button" type="button" onClick={() => startEditModel(model)}>Edit</button><button className="danger-button-compact" type="button" onClick={() => void handleDeleteModel(model)}>Delete</button></div>
            </div>
          ))}
        </div>
      </section>

      <section className="saas-panel">
        <div className="people-toolbar">
          <div>
            <h2 className="saas-subsection-title">Members</h2>
            <p className="saas-meta-text">Add an existing PilotSeal account by exact email.</p>
          </div>
        </div>
        <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={handleAddMember}>
          <input
            type="email"
            className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2"
            value={memberEmail}
            onChange={(event) => setMemberEmail(event.target.value)}
            placeholder="member@example.com"
            required
          />
          <button className="primary-button" type="submit" disabled={saving}>Add member</button>
        </form>
        <div className="mt-5 grid gap-3">
          {members.map((member) => {
            const isOwner = member.member_role === "owner";
            const isSelf = member.user_id === session?.user?.id;
            const adminCanRemove = role === "organization_admin" && member.member_role === "member";
            const canRemove = !isOwner && !isSelf && (canManageAdmins || adminCanRemove);
            return (
              <div key={member.user_id} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{member.display_name || member.email}</p>
                    <p className="saas-meta-text">{member.email} · {formatRole(member.member_role)}{member.teaching_role ? ` · ${formatTeachingRole(member.teaching_role)}` : ""}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select
                      className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      value={member.teaching_role ?? ""}
                      disabled={saving}
                      aria-label={`Teaching role for ${member.email}`}
                      onChange={(event) => void handleTeachingRoleChange(member, (event.target.value || null) as "instructor" | "student" | null)}
                    >
                      <option value="">No teaching role</option>
                      <option value="instructor">Instructor</option>
                      <option value="student">Student</option>
                    </select>
                    {canManageAdmins && !isOwner && !isSelf ? (
                      <button className="ghost-button" type="button" disabled={saving} onClick={() => void handleRoleChange(member)}>
                        {member.member_role === "organization_admin" ? "Make member" : "Make admin"}
                      </button>
                    ) : null}
                    {canManageAdmins && !isSelf && !isOwner ? (
                      <button className="ghost-button" type="button" disabled={saving} onClick={() => void handleTransferOwnership(member)}>
                        Transfer ownership
                      </button>
                    ) : null}
                    {canRemove ? (
                      <button className="danger-button-compact" type="button" disabled={saving} onClick={() => void handleRemoveMember(member)}>
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="saas-panel">
        <div className="people-toolbar">
          <div>
            <h2 className="saas-subsection-title">Organization aircraft</h2>
            <p className="saas-meta-text">Visible only to members of {activeOrganization.name}.</p>
          </div>
          <button className="secondary-button" type="button" onClick={startCreateAircraft}>Add aircraft</button>
        </div>

        {showAircraftForm ? (
          <form className="mt-5 grid gap-4 rounded-2xl border border-slate-200 bg-white/80 p-4 md:grid-cols-2" onSubmit={handleSaveAircraft}>
            <h3 className="text-sm font-semibold text-slate-900 md:col-span-2">
              {editingAircraftId ? "Edit organization aircraft" : "New organization aircraft"}
            </h3>
            <Field label="Model">
              <select className="rounded-xl border border-slate-300 px-3 py-2" value={aircraftForm.model_id} onChange={(event) => updateAircraftField("model_id", event.target.value)} required>
                <option value="">Select a model</option>
                {models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
              </select>
            </Field>
            <Field label="Tail number"><input className="rounded-xl border border-slate-300 px-3 py-2" value={aircraftForm.tail_number} onChange={(event) => updateAircraftField("tail_number", event.target.value.toUpperCase())} required /></Field>
            <Field label="Empty weight"><input type="number" step="any" className="rounded-xl border border-slate-300 px-3 py-2" value={aircraftForm.empty_weight} onChange={(event) => updateAircraftField("empty_weight", event.target.value)} required /></Field>
            <Field label="Empty arm"><input type="number" step="any" className="rounded-xl border border-slate-300 px-3 py-2" value={aircraftForm.empty_arm} onChange={(event) => updateAircraftField("empty_arm", event.target.value)} required /></Field>
            <Field label="Lateral arm"><input type="number" step="any" className="rounded-xl border border-slate-300 px-3 py-2" value={aircraftForm.empty_lat_arm} onChange={(event) => updateAircraftField("empty_lat_arm", event.target.value)} /></Field>
            <Field label="100-hour due"><input type="number" step="any" className="rounded-xl border border-slate-300 px-3 py-2" value={aircraftForm.hundred_hour_due_hours} onChange={(event) => updateAircraftField("hundred_hour_due_hours", event.target.value)} /></Field>
            {(["annual_due_date", "static_due_date", "transponder_due_date", "elt_due_date"] as const).map((key) => (
              <Field key={key} label={formatDueLabel(key)}><input type="date" className="rounded-xl border border-slate-300 px-3 py-2" value={aircraftForm[key]} onChange={(event) => updateAircraftField(key, event.target.value)} /></Field>
            ))}
            <div className="flex gap-2 md:col-span-2">
              <button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving..." : "Save aircraft"}</button>
              <button className="ghost-button" type="button" onClick={() => setShowAircraftForm(false)}>Cancel</button>
            </div>
          </form>
        ) : null}

        <div className="mt-5 grid gap-3">
          {aircraft.length === 0 ? <p className="saas-empty-state">No organization aircraft yet.</p> : aircraft.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{item.tail_number}</p>
                  <p className="saas-meta-text">{modelNames.get(item.model_id ?? "") ?? "Unknown model"} · {item.empty_weight ?? "--"} lbs · Arm {item.empty_arm ?? "--"}</p>
                  <p className="saas-meta-text mt-1">{maintenanceSummary(item)}</p>
                </div>
                <div className="flex gap-2">
                  <button className="ghost-button" type="button" disabled={saving} onClick={() => startEditAircraft(item)}>Edit</button>
                  <button className="danger-button-compact" type="button" disabled={saving} onClick={() => void handleDeleteAircraft(item)}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <OrganizationEndorsementRequests organizationId={activeOrganization.id} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-2 text-sm"><span>{label}</span>{children}</label>;
}

function requiredNumber(value: string, label: string) {
  const result = Number.parseFloat(value);
  if (!Number.isFinite(result)) throw new Error(`${label} is required.`);
  return result;
}

function optionalNumber(value: string) {
  if (!value.trim()) return null;
  const result = Number.parseFloat(value);
  if (!Number.isFinite(result)) throw new Error("Enter a valid number.");
  return result;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return fallback;
}

function formatRole(role: string) {
  if (role === "platform_admin") return "Platform administrator";
  if (role === "organization_admin") return "Organization administrator";
  if (role === "owner") return "Owner";
  return "Member";
}

function formatTeachingRole(role: string) {
  return role === "instructor" ? "Instructor" : "Student";
}

function formatDueLabel(key: string) {
  return ({ annual_due_date: "Annual due", static_due_date: "Static due", transponder_due_date: "Transponder due", elt_due_date: "ELT due" } as Record<string, string>)[key] ?? key;
}

function maintenanceSummary(item: AircraftRecord) {
  const values = [
    item.hundred_hour_due_hours == null ? "" : `100-hour ${item.hundred_hour_due_hours}`,
    item.annual_due_date ? `Annual ${item.annual_due_date}` : "",
    item.static_due_date ? `Static ${item.static_due_date}` : "",
    item.transponder_due_date ? `Transponder ${item.transponder_due_date}` : "",
    item.elt_due_date ? `ELT ${item.elt_due_date}` : "",
  ].filter(Boolean);
  return values.length ? values.join(" · ") : "No maintenance due dates recorded";
}
