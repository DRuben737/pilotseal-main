"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { useOrganization } from "@/components/organizations/OrganizationProvider";
import {
  ASR_RISK_SCORES,
  closeAsrReport,
  completeAsrMaintenanceReview,
  completeAsrTrainingReview,
  configureAsrReview,
  createAsrOption,
  createAsrRevision,
  createEmptyAsrReportData,
  fetchAsrOptions,
  fetchAsrReviewerAssignments,
  fetchOrganizationAsrReports,
  saveAsrDraft,
  setAsrOptionActive,
  setAsrReviewerCapability,
  submitAsrReport,
  type AsrExternalNotification,
  type AsrOption,
  type AsrOptionCategory,
  type AsrReport,
  type AsrReportData,
  type AsrReviewerAssignment,
  type AsrReviewerCapability,
} from "@/lib/asr-reports";
import {
  AIRCRAFT_DISCREPANCY_TYPES,
  fetchOrganizationAircraftReports,
  fetchOrganizationReportPeople,
  type AircraftDiscrepancyReport,
  type AircraftDiscrepancyType,
  type OrganizationReportPerson,
} from "@/lib/aircraft-reports";
import { fetchOrganizationAircraft, type AircraftRecord } from "@/lib/aircraft";
import {
  canManageOrganization,
  fetchOrganizationMembers,
  type OrganizationMember,
} from "@/lib/organizations";
import { downloadAsrPdf } from "@/lib/asr-pdf";

const REVIEWER_CAPABILITIES: Array<{
  value: AsrReviewerCapability;
  label: string;
}> = [
  { value: "training_reviewer", label: "Head of Training" },
  { value: "maintenance_reviewer", label: "Maintenance" },
  { value: "safety_reviewer", label: "Safety Manager" },
];

const OPTION_CATEGORIES: Array<{ value: AsrOptionCategory; label: string }> = [
  { value: "occurrence_type", label: "Occurrence Type" },
  { value: "nature_of_flight", label: "Nature of Flight" },
  { value: "phase_of_flight", label: "Phase of Flight" },
  { value: "maneuver", label: "Maneuver" },
  { value: "training_area", label: "Training Area" },
  { value: "program", label: "Program" },
  { value: "day_night", label: "Day / Night" },
  { value: "flight_conditions", label: "IMC / VMC" },
  { value: "precipitation", label: "Precipitation" },
  { value: "intensity", label: "Intensity" },
  { value: "external_agency", label: "External Agency" },
];

export default function AsrReportsManager() {
  const searchParams = useSearchParams();
  const requestedReportId = searchParams.get("reportId") ?? "";
  const { session } = useAuthSession();
  const { activeOrganization, loading: organizationsLoading } = useOrganization();
  const canManage = canManageOrganization(activeOrganization?.member_role);
  const [reports, setReports] = useState<AsrReport[]>([]);
  const [aircraft, setAircraft] = useState<AircraftRecord[]>([]);
  const [people, setPeople] = useState<OrganizationReportPerson[]>([]);
  const [discrepancies, setDiscrepancies] = useState<AircraftDiscrepancyReport[]>([]);
  const [options, setOptions] = useState<AsrOption[]>([]);
  const [assignments, setAssignments] = useState<AsrReviewerAssignment[]>([]);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [activeReportId, setActiveReportId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editingReportId, setEditingReportId] = useState("");
  const [draftRequestId, setDraftRequestId] = useState("");
  const [draftData, setDraftData] = useState<AsrReportData>(createEmptyAsrReportData);
  const [draftState, setDraftState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [createDiscrepancy, setCreateDiscrepancy] = useState(false);
  const [discrepancyType, setDiscrepancyType] =
    useState<AircraftDiscrepancyType>("Wings");
  const [discrepancyDescription, setDiscrepancyDescription] = useState("");
  const [groundAircraft, setGroundAircraft] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const activeReport = reports.find((report) => report.id === activeReportId) ?? null;
  const currentCapabilities = assignments
    .filter((assignment) => assignment.user_id === session?.user?.id)
    .map((assignment) => assignment.capability);
  const isSafetyReviewer = currentCapabilities.includes("safety_reviewer");
  const isTrainingReviewer = currentCapabilities.includes("training_reviewer");
  const isMaintenanceReviewer = currentCapabilities.includes("maintenance_reviewer");

  async function loadData(preferredReportId = "") {
    if (!activeOrganization?.id) {
      setReports([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [
        nextReports,
        nextAircraft,
        nextPeople,
        nextDiscrepancies,
        nextOptions,
        nextAssignments,
        nextMembers,
      ] = await Promise.all([
        fetchOrganizationAsrReports(activeOrganization.id),
        fetchOrganizationAircraft(activeOrganization.id),
        fetchOrganizationReportPeople(activeOrganization.id),
        fetchOrganizationAircraftReports(activeOrganization.id),
        fetchAsrOptions(activeOrganization.id),
        fetchAsrReviewerAssignments(activeOrganization.id),
        canManage ? fetchOrganizationMembers(activeOrganization.id) : Promise.resolve([]),
      ]);
      setReports(nextReports);
      setAircraft(nextAircraft);
      setPeople(nextPeople);
      setDiscrepancies(nextDiscrepancies);
      setOptions(nextOptions);
      setAssignments(nextAssignments);
      setMembers(nextMembers);
      const nextId = preferredReportId || requestedReportId;
      if (nextId && nextReports.some((report) => report.id === nextId)) {
        setActiveReportId(nextId);
      }
    } catch (value) {
      setError(getErrorMessage(value, "Unable to load ASR reports."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setShowForm(false);
    setEditingReportId("");
    setActiveReportId("");
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrganization?.id, canManage, requestedReportId]);

  useEffect(() => {
    if (!showForm || !activeOrganization?.id || !draftRequestId) return;
    setDraftState("saving");
    const timeoutId = window.setTimeout(async () => {
      try {
        const reportId = await saveAsrDraft({
          organizationId: activeOrganization.id,
          reportId: editingReportId || null,
          clientRequestId: draftRequestId,
          reportData: draftData,
        });
        setEditingReportId(reportId);
        setDraftState("saved");
      } catch (value) {
        setDraftState("error");
        setError(getErrorMessage(value, "Unable to save ASR draft."));
      }
    }, 800);
    return () => window.clearTimeout(timeoutId);
  }, [activeOrganization?.id, draftData, draftRequestId, editingReportId, showForm]);

  const filteredReports = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return reports;
    return reports.filter((report) =>
      [
        report.reference_number ?? "",
        report.aircraft_tail_number ?? "",
        report.type_of_occurrence ?? "",
        report.description ?? "",
        report.submitted_by_name,
        report.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [query, reports]);

  function optionValues(category: AsrOptionCategory) {
    return options
      .filter((option) => option.category === category && option.is_active)
      .map((option) => option.value);
  }

  function startNewReport() {
    const currentPerson = people.find((person) => person.user_id === session?.user?.id);
    const initial = createEmptyAsrReportData();
    if (currentPerson) {
      if (currentPerson.teaching_role === "student") {
        initial.student_person_id = currentPerson.person_id;
      }
      if (currentPerson.teaching_role === "instructor") {
        initial.instructor_person_id = currentPerson.person_id;
      }
      initial.aircraft_commander_person_id = currentPerson.person_id;
      initial.aircraft_commander_name = currentPerson.display_name;
      initial.reporter_title =
        currentPerson.teaching_role === "instructor" ? "Flight Instructor" : "Student Pilot";
    }
    setDraftData(initial);
    setDraftRequestId(crypto.randomUUID());
    setEditingReportId("");
    setCreateDiscrepancy(false);
    setGroundAircraft(false);
    setDiscrepancyDescription("");
    setShowForm(true);
    setDraftState("idle");
    setError("");
    setMessage("");
  }

  function editDraft(report: AsrReport) {
    setDraftData(report.report_data);
    setDraftRequestId(crypto.randomUUID());
    setEditingReportId(report.id);
    setCreateDiscrepancy(false);
    setGroundAircraft(false);
    setDiscrepancyDescription(report.description ?? "");
    setShowForm(true);
    setDraftState("saved");
    setError("");
  }

  function updateDraft<K extends keyof AsrReportData>(key: K, value: AsrReportData[K]) {
    setDraftData((current) => ({ ...current, [key]: value }));
  }

  function selectAircraft(aircraftId: string) {
    const item = aircraft.find((candidate) => candidate.id === aircraftId);
    setDraftData((current) => ({
      ...current,
      aircraft_id: aircraftId,
      aircraft_registration: item?.tail_number ?? "",
      aircraft_type: item?.model?.name ?? "",
      no_aircraft: false,
    }));
  }

  function selectPerson(
    role: "commander" | "put_sic",
    personId: string
  ) {
    const person = people.find((candidate) => candidate.person_id === personId);
    setDraftData((current) => ({
      ...current,
      ...(role === "commander"
        ? {
            aircraft_commander_person_id: personId,
            aircraft_commander_name: person?.display_name ?? "",
          }
        : {
            put_sic_person_id: personId,
            put_sic_name: person?.display_name ?? "",
          }),
    }));
  }

  function linkSourceDiscrepancy(reportId: string) {
    const report = discrepancies.find((item) => item.id === reportId);
    const linkedAircraft = aircraft.find((item) => item.id === report?.aircraft_id);
    setDraftData((current) => ({
      ...current,
      source_discrepancy_report_id: reportId,
      aircraft_id: report?.aircraft_id ?? current.aircraft_id,
      aircraft_registration: report?.aircraft_tail_number ?? current.aircraft_registration,
      aircraft_type: linkedAircraft?.model?.name ?? current.aircraft_type,
      occurrence_date: report?.report_date ?? current.occurrence_date,
      description: report?.description ?? current.description,
      student_person_id: report?.student_person_id ?? current.student_person_id,
      instructor_person_id: report?.instructor_person_id ?? current.instructor_person_id,
    }));
  }

  async function handleSubmit() {
    if (!activeOrganization?.id) return;
    setBusy(true);
    setError("");
    try {
      const reportId = await saveAsrDraft({
        organizationId: activeOrganization.id,
        reportId: editingReportId || null,
        clientRequestId: draftRequestId || crypto.randomUUID(),
        reportData: draftData,
      });
      if (
        groundAircraft &&
        !window.confirm(
          "This will create a linked Aircraft Discrepancy Report and ground the aircraft. Continue?"
        )
      ) {
        return;
      }
      await submitAsrReport({
        reportId,
        createDiscrepancy,
        discrepancyType: createDiscrepancy ? discrepancyType : null,
        discrepancyDescription: createDiscrepancy
          ? discrepancyDescription || draftData.description
          : null,
        groundAircraft,
      });
      setShowForm(false);
      await loadData(reportId);
      setActiveReportId(reportId);
      setMessage(
        groundAircraft
          ? "ASR submitted, linked discrepancy created, and aircraft grounded."
          : "ASR submitted."
      );
    } catch (value) {
      setError(getErrorMessage(value, "Unable to submit ASR."));
    } finally {
      setBusy(false);
    }
  }

  if (organizationsLoading) {
    return <section className="saas-panel"><p className="saas-empty-state">Loading organization…</p></section>;
  }
  if (!activeOrganization) {
    return <section className="saas-panel"><p className="saas-empty-state">Select an organization before creating an ASR.</p></section>;
  }

  return (
    <section className="space-y-5">
      <div className="saas-panel">
        <div className="people-toolbar">
          <div>
            <p className="saas-kicker">{activeOrganization.name}</p>
            <h1 className="saas-subsection-title">Air Safety Event Reports</h1>
            <p className="saas-meta-text mt-2">
              Internal safety event reporting with Training, Maintenance, and Safety review.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canManage ? (
              <button className="secondary-button" type="button" onClick={() => setShowSettings((current) => !current)}>
                Reviewer & option settings
              </button>
            ) : null}
            <button className="primary-button" type="button" onClick={startNewReport}>New ASR</button>
          </div>
        </div>
        {message ? <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}
        {error ? <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
      </div>

      {showSettings && canManage ? (
        <AsrSettings
          organizationId={activeOrganization.id}
          members={members}
          assignments={assignments}
          options={options}
          onChanged={() => loadData(activeReportId)}
          onError={(value) => setError(getErrorMessage(value, "Unable to update ASR settings."))}
        />
      ) : null}

      {showForm ? (
        <section className="saas-panel">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="saas-kicker">{editingReportId ? "ASR draft" : "New ASR"}</p>
              <h2 className="saas-subsection-title">Air Safety Event Report</h2>
              <p className="saas-meta-text mt-2">
                {draftState === "saving" ? "Saving draft…" : draftState === "saved" ? "Draft saved" : draftState === "error" ? "Draft save failed" : "Draft will save automatically"}
              </p>
            </div>
            <button className="ghost-button" type="button" onClick={() => setShowForm(false)} disabled={busy}>Close draft</button>
          </div>

          <FormSection title="Section 1 - Occurrence">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Field label="Linked Aircraft Discrepancy">
                <select value={draftData.source_discrepancy_report_id} onChange={(event) => linkSourceDiscrepancy(event.target.value)}>
                  <option value="">None / standalone ASR</option>
                  {discrepancies.map((report) => <option key={report.id} value={report.id}>{report.aircraft_tail_number} · {report.report_date} · {report.discrepancy_type}</option>)}
                </select>
              </Field>
              <Field label="Date of Occurrence" required><input type="date" value={draftData.occurrence_date} onChange={(event) => updateDraft("occurrence_date", event.target.value)} /></Field>
              <Field label="LCL Time" required><input type="time" value={draftData.occurrence_local_time} onChange={(event) => updateDraft("occurrence_local_time", event.target.value)} /></Field>
              <Field label="Aircraft">
                <select value={draftData.aircraft_id} onChange={(event) => selectAircraft(event.target.value)} disabled={draftData.no_aircraft}>
                  <option value="">External / not selected</option>
                  {aircraft.map((item) => <option key={item.id} value={item.id}>{item.tail_number} · {item.model?.name ?? "Unknown type"}</option>)}
                </select>
              </Field>
              <Field label="External Aircraft Type"><input value={draftData.aircraft_type} disabled={Boolean(draftData.aircraft_id) || draftData.no_aircraft} onChange={(event) => updateDraft("aircraft_type", event.target.value)} /></Field>
              <Field label="External Registration"><input value={draftData.aircraft_registration} disabled={Boolean(draftData.aircraft_id) || draftData.no_aircraft} onChange={(event) => updateDraft("aircraft_registration", event.target.value)} /></Field>
              <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={draftData.no_aircraft} onChange={(event) => updateDraft("no_aircraft", event.target.checked)} />Aircraft not applicable</label>
              <OptionField label="Type of Occurrence" required value={draftData.type_of_occurrence} options={optionValues("occurrence_type")} onChange={(value) => updateDraft("type_of_occurrence", value)} />
              <OptionField label="Nature of Flight" required value={draftData.nature_of_flight} options={optionValues("nature_of_flight")} onChange={(value) => updateDraft("nature_of_flight", value)} />
              <Field label="Route From"><input value={draftData.route_from} onChange={(event) => updateDraft("route_from", event.target.value.toUpperCase())} /></Field>
              <Field label="Route To"><input value={draftData.route_to} onChange={(event) => updateDraft("route_to", event.target.value.toUpperCase())} /></Field>
              <OptionField label="Training Area" value={draftData.training_area} options={optionValues("training_area")} onChange={(value) => updateDraft("training_area", value)} />
              <OptionField label="Phase of Flight" required value={draftData.phase_of_flight} options={optionValues("phase_of_flight")} onChange={(value) => updateDraft("phase_of_flight", value)} />
              <OptionField label="Training Maneuver" value={draftData.training_maneuver} options={optionValues("maneuver")} onChange={(value) => updateDraft("training_maneuver", value)} />
            </div>
          </FormSection>

          <FormSection title="Section 2 - Crew Information">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Field label="Aircraft Commander" required><select value={draftData.aircraft_commander_person_id} onChange={(event) => selectPerson("commander", event.target.value)}><option value="">Select person</option>{people.map((person) => <option key={person.person_id} value={person.person_id}>{person.display_name}</option>)}</select></Field>
              <Field label="Commander Name"><input value={draftData.aircraft_commander_name} onChange={(event) => updateDraft("aircraft_commander_name", event.target.value)} /></Field>
              <Field label="PUT/SIC"><select value={draftData.put_sic_person_id} onChange={(event) => selectPerson("put_sic", event.target.value)}><option value="">Not specified</option>{people.map((person) => <option key={person.person_id} value={person.person_id}>{person.display_name}</option>)}</select></Field>
              <Field label="PUT/SIC Name"><input value={draftData.put_sic_name} onChange={(event) => updateDraft("put_sic_name", event.target.value)} /></Field>
              <Field label="Other Crew"><input value={draftData.other_crew} onChange={(event) => updateDraft("other_crew", event.target.value)} /></Field>
              <Field label="Passengers"><input value={draftData.passengers} onChange={(event) => updateDraft("passengers", event.target.value)} /></Field>
              <OptionField label="Program" value={draftData.program} options={optionValues("program")} onChange={(value) => updateDraft("program", value)} />
            </div>
          </FormSection>

          <FormSection title="Section 3 - Environmental Information">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Field label="Wind"><input value={draftData.wind} onChange={(event) => updateDraft("wind", event.target.value)} /></Field>
              <OptionField label="Turbulence" value={draftData.turbulence} options={optionValues("intensity")} onChange={(value) => updateDraft("turbulence", value)} />
              <OptionField label="Day or Night" value={draftData.day_night} options={optionValues("day_night")} onChange={(value) => updateDraft("day_night", value)} />
              <Field label="Visibility (SM)"><input type="number" min="0" step="0.1" value={draftData.visibility_sm} onChange={(event) => updateDraft("visibility_sm", event.target.value)} /></Field>
              <OptionField label="IMC or VMC" value={draftData.flight_conditions} options={optionValues("flight_conditions")} onChange={(value) => updateDraft("flight_conditions", value)} />
              <OptionField label="Precipitation" value={draftData.precipitation} options={optionValues("precipitation")} onChange={(value) => updateDraft("precipitation", value)} />
              <Field label="OAT (°C)"><input type="number" step="1" value={draftData.oat_c} onChange={(event) => updateDraft("oat_c", event.target.value)} /></Field>
              <OptionField label="Icing" value={draftData.icing} options={optionValues("intensity")} onChange={(value) => updateDraft("icing", value)} />
              <OptionField label="Precip. Intensity" value={draftData.precipitation_intensity} options={optionValues("intensity")} onChange={(value) => updateDraft("precipitation_intensity", value)} />
            </div>
          </FormSection>

          <FormSection title="Section 4 - Aircraft Information">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <ValueWithUnit label="Fuel State" value={draftData.fuel_state_value} unit={draftData.fuel_state_unit} units={["Gal","Lbs","Kg"]} onValue={(value) => updateDraft("fuel_state_value", value)} onUnit={(value) => updateDraft("fuel_state_unit", value as AsrReportData["fuel_state_unit"])} />
              <ValueWithUnit label="Gross Weight" value={draftData.gross_weight_value} unit={draftData.gross_weight_unit} units={["Lbs","Kg"]} onValue={(value) => updateDraft("gross_weight_value", value)} onUnit={(value) => updateDraft("gross_weight_unit", value as AsrReportData["gross_weight_unit"])} />
              <ValueWithUnit label="Speed" value={draftData.speed_value} unit={draftData.speed_unit} units={["KIAS","KTAS","MPH"]} onValue={(value) => updateDraft("speed_value", value)} onUnit={(value) => updateDraft("speed_unit", value as AsrReportData["speed_unit"])} />
              <ValueWithUnit label="Altitude" value={draftData.altitude_value} unit={draftData.altitude_unit} units={["ft","m"]} onValue={(value) => updateDraft("altitude_value", value)} onUnit={(value) => updateDraft("altitude_unit", value as AsrReportData["altitude_unit"])} />
            </div>
          </FormSection>

          <FormSection title="Section 5 - Description of Occurrence">
            <Field label="Description" required><textarea rows={8} maxLength={10000} value={draftData.description} onChange={(event) => updateDraft("description", event.target.value)} /></Field>
            <div className="mt-4 max-w-md"><Field label="Your Title" required><input value={draftData.reporter_title} onChange={(event) => updateDraft("reporter_title", event.target.value)} placeholder="Flight Instructor, Student Pilot, etc." /></Field></div>
          </FormSection>

          {!draftData.source_discrepancy_report_id ? (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <label className="flex items-center gap-3 text-sm font-semibold text-amber-950"><input type="checkbox" checked={createDiscrepancy} onChange={(event) => { setCreateDiscrepancy(event.target.checked); if (!event.target.checked) setGroundAircraft(false); }} />Also create a linked Aircraft Discrepancy Report</label>
              {createDiscrepancy ? <div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Discrepancy Type"><select value={discrepancyType} onChange={(event) => setDiscrepancyType(event.target.value as AircraftDiscrepancyType)}>{AIRCRAFT_DISCREPANCY_TYPES.map((type) => <option key={type}>{type}</option>)}</select></Field><Field label="Discrepancy Description"><textarea rows={3} value={discrepancyDescription} onChange={(event) => setDiscrepancyDescription(event.target.value)} placeholder="Defaults to the ASR occurrence description" /></Field><label className="flex items-center gap-3 text-sm font-semibold text-rose-800"><input type="checkbox" checked={groundAircraft} onChange={(event) => setGroundAircraft(event.target.checked)} />Ground the aircraft when submitted</label></div> : null}
            </div>
          ) : null}

          <div className="mt-5 flex justify-end">
            <button className="primary-button" type="button" disabled={busy || draftState === "saving"} onClick={() => void handleSubmit()}>{busy ? "Submitting…" : "Sign & Submit ASR"}</button>
          </div>
        </section>
      ) : null}

      <section className="saas-panel">
        <input className="w-full" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reference, aircraft, occurrence, description, or reporter" />
        {loading ? <p className="saas-empty-state mt-5">Loading ASR reports…</p> : null}
        {!loading && filteredReports.length === 0 ? <p className="saas-empty-state mt-5">No matching ASR reports.</p> : null}
        <div className="mt-5 grid gap-3">
          {filteredReports.map((report) => (
            <article key={report.id} className={`rounded-2xl border p-4 ${activeReportId === report.id ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setActiveReportId(report.id)}>
                  <p className="font-semibold text-slate-950">{report.reference_number ?? "ASR Draft"} · {report.aircraft_tail_number ?? "No aircraft"}</p>
                  <p className="saas-meta-text mt-1">{report.occurrence_date ?? "No date"} · {report.type_of_occurrence ?? "Occurrence not selected"} · {formatStatus(report.status)}</p>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-700">{report.description ?? "Draft has no description yet."}</p>
                </button>
                <div className="flex gap-2">
                  {report.risk_score ? <RiskBadge score={report.risk_score} /> : null}
                  {report.status === "draft" && report.submitted_by === session?.user?.id ? <button className="ghost-button" type="button" onClick={() => editDraft(report)}>Edit draft</button> : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {activeReport ? (
        <AsrReportDetail
          key={`${activeReport.id}:${activeReport.updated_at}`}
          report={activeReport}
          isSafetyReviewer={isSafetyReviewer}
          isTrainingReviewer={isTrainingReviewer}
          isMaintenanceReviewer={isMaintenanceReviewer}
          agencyOptions={optionValues("external_agency")}
          busy={busy}
          onBusy={setBusy}
          onError={(value) => setError(getErrorMessage(value, "Unable to update ASR."))}
          onChanged={async (text, preferredReportId) => {
            await loadData(preferredReportId || activeReport.id);
            setMessage(text);
          }}
          onEditDraft={() => editDraft(activeReport)}
        />
      ) : null}
    </section>
  );
}

function AsrReportDetail({
  report,
  isSafetyReviewer,
  isTrainingReviewer,
  isMaintenanceReviewer,
  agencyOptions,
  busy,
  onBusy,
  onError,
  onChanged,
  onEditDraft,
}: {
  report: AsrReport;
  isSafetyReviewer: boolean;
  isTrainingReviewer: boolean;
  isMaintenanceReviewer: boolean;
  agencyOptions: string[];
  busy: boolean;
  onBusy: (value: boolean) => void;
  onError: (value: unknown) => void;
  onChanged: (message: string, preferredReportId?: string) => Promise<void>;
  onEditDraft: () => void;
}) {
  const [riskScore, setRiskScore] = useState(String(report.risk_score ?? ""));
  const [trainingRequired, setTrainingRequired] = useState(report.training_review_required);
  const [maintenanceRequired, setMaintenanceRequired] = useState(report.maintenance_review_required);
  const [trainingComments, setTrainingComments] = useState(report.training_comments ?? "");
  const [trainingTitle, setTrainingTitle] = useState(report.training_signed_title ?? "Head of Training");
  const [maintenanceComments, setMaintenanceComments] = useState(report.maintenance_comments ?? "");
  const [maintenanceTitle, setMaintenanceTitle] = useState(report.maintenance_signed_title ?? "Director of Maintenance");
  const [maintenanceAction, setMaintenanceAction] = useState({
    work_order_number: String(report.maintenance_action.work_order_number ?? ""),
    ata: String(report.maintenance_action.ata ?? ""),
    ttaf: String(report.maintenance_action.ttaf ?? ""),
    last_inspection: String(report.maintenance_action.last_inspection ?? ""),
    hours_date: String(report.maintenance_action.hours_date ?? ""),
  });
  const [safetyComments, setSafetyComments] = useState(report.safety_comments ?? "");
  const [hazardReference, setHazardReference] = useState(report.hazard_log_reference ?? "");
  const [investigationReference, setInvestigationReference] = useState(report.internal_investigation_reference ?? "");
  const [safetyTitle, setSafetyTitle] = useState(report.safety_signed_title ?? "Safety Manager");
  const [notifications, setNotifications] = useState<AsrExternalNotification[]>(report.external_notifications);

  async function run(
    action: () => Promise<void | string>,
    successMessage: string
  ) {
    onBusy(true);
    try {
      const preferredReportId = await action();
      await onChanged(successMessage, preferredReportId || undefined);
    } catch (value) {
      onError(value);
    } finally {
      onBusy(false);
    }
  }

  return (
    <section className="saas-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="saas-kicker">ASR detail</p>
          <h2 className="saas-subsection-title">{report.reference_number ?? "ASR Draft"}</h2>
          <p className="saas-meta-text mt-2">Revision {report.revision_number} · {formatStatus(report.status)} · Submitted by {report.submitted_by_name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {report.status === "draft" ? <button className="secondary-button" type="button" onClick={onEditDraft}>Continue draft</button> : null}
          {report.status !== "draft" ? <button className="secondary-button" type="button" onClick={() => downloadAsrPdf(report)}>Download PDF</button> : null}
          {report.status === "closed" ? <button className="ghost-button" type="button" disabled={busy} onClick={() => { const reason = window.prompt("Reason for ASR revision:"); if (reason) void run(() => createAsrRevision(report.id, reason), "ASR revision draft created."); }}>Create revision</button> : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Detail label="Occurrence" value={`${report.occurrence_date ?? "—"} ${report.occurrence_local_time ?? ""}`} />
        <Detail label="Aircraft" value={`${report.aircraft_tail_number ?? "N/A"} · ${report.aircraft_type ?? "N/A"}`} />
        <Detail label="Type" value={report.type_of_occurrence ?? "—"} />
        <Detail label="Risk" value={report.risk_score ? `${report.risk_score} · ${riskBand(report.risk_score)}` : "Not rated"} />
        <Detail label="Commander" value={report.report_data.aircraft_commander_name || "—"} />
        <Detail label="PUT/SIC" value={report.report_data.put_sic_name || "—"} />
        <Detail label="Phase" value={report.report_data.phase_of_flight || "—"} />
        <Detail label="Program" value={report.report_data.program || "—"} />
      </div>
      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Description of Occurrence</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{report.description}</p></div>
      <p className="saas-meta-text mt-3">Reporter signature: {report.reporter_signed_at ? `${report.reporter_signed_name} · ${report.reporter_title} · ${formatDateTime(report.reporter_signed_at)}` : "Pending"}</p>

      {isSafetyReviewer && report.status !== "draft" && report.status !== "closed" && report.status !== "superseded" ? (
        <ReviewPanel title="Safety triage">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Event Risk Rating"><select value={riskScore} onChange={(event) => setRiskScore(event.target.value)}><option value="">Select score</option>{ASR_RISK_SCORES.map((score) => <option key={score} value={score}>{score} · {riskBand(score)}</option>)}</select></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={trainingRequired} onChange={(event) => setTrainingRequired(event.target.checked)} />Request Head of Training review</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={maintenanceRequired} onChange={(event) => setMaintenanceRequired(event.target.checked)} />Request Maintenance review</label>
          </div>
          <button className="primary-button mt-4" disabled={busy || !riskScore} type="button" onClick={() => void run(() => configureAsrReview({ reportId: report.id, riskScore: Number(riskScore), trainingRequired, maintenanceRequired }), "ASR review requirements saved.")}>Set Risk & Request Reviews</button>
        </ReviewPanel>
      ) : null}

      {report.training_review_required ? (
        <ReviewPanel title="Section 6 - Head of Training or Designee Comments">
          {report.training_signed_at ? <SignedReview comments={report.training_comments} name={report.training_signed_name} title={report.training_signed_title} signedAt={report.training_signed_at} /> : isTrainingReviewer ? <><Field label="Comments"><textarea rows={5} value={trainingComments} onChange={(event) => setTrainingComments(event.target.value)} /></Field><div className="mt-3 max-w-sm"><Field label="Title"><input value={trainingTitle} onChange={(event) => setTrainingTitle(event.target.value)} /></Field></div><button className="primary-button mt-4" disabled={busy} type="button" onClick={() => void run(() => completeAsrTrainingReview({ reportId: report.id, comments: trainingComments, title: trainingTitle }), "Head of Training review signed.")}>Sign Training Review</button></> : <p className="saas-meta-text">Training review requested and pending.</p>}
        </ReviewPanel>
      ) : null}

      {report.maintenance_review_required ? (
        <ReviewPanel title="Section 7 - Director of Maintenance or Designee">
          {report.maintenance_signed_at ? <SignedReview comments={report.maintenance_comments} name={report.maintenance_signed_name} title={report.maintenance_signed_title} signedAt={report.maintenance_signed_at} /> : isMaintenanceReviewer ? <><Field label="Comments / Maintenance Action"><textarea rows={5} value={maintenanceComments} onChange={(event) => setMaintenanceComments(event.target.value)} /></Field><div className="mt-3 grid gap-3 md:grid-cols-3">{Object.entries(maintenanceAction).map(([key, value]) => <Field key={key} label={formatMaintenanceLabel(key)}><input value={value} onChange={(event) => setMaintenanceAction((current) => ({ ...current, [key]: event.target.value }))} /></Field>)}<Field label="Title"><input value={maintenanceTitle} onChange={(event) => setMaintenanceTitle(event.target.value)} /></Field></div><button className="primary-button mt-4" disabled={busy} type="button" onClick={() => void run(() => completeAsrMaintenanceReview({ reportId: report.id, comments: maintenanceComments, title: maintenanceTitle, maintenanceAction }), "Maintenance review signed.")}>Sign Maintenance Review</button></> : <p className="saas-meta-text">Maintenance review requested and pending.</p>}
        </ReviewPanel>
      ) : null}

      {isSafetyReviewer && report.status === "in_review" ? (
        <ReviewPanel title="Section 8–9 - Safety Review & External Notifications">
          <Field label="Safety Manager Comments"><textarea rows={6} value={safetyComments} onChange={(event) => setSafetyComments(event.target.value)} /></Field>
          <div className="mt-3 grid gap-3 md:grid-cols-3"><Field label="Hazard Log Reference"><input value={hazardReference} onChange={(event) => setHazardReference(event.target.value)} /></Field><Field label="Internal Investigation Reference"><input value={investigationReference} onChange={(event) => setInvestigationReference(event.target.value)} /></Field><Field label="Title"><input value={safetyTitle} onChange={(event) => setSafetyTitle(event.target.value)} /></Field></div>
          <div className="mt-4"><div className="flex items-center justify-between"><h4 className="font-semibold text-slate-900">External Notifications</h4><button className="ghost-button" type="button" onClick={() => setNotifications((current) => [...current, { agency: "", notified_on: "", contact_information: "" }])}>Add agency</button></div><div className="mt-3 grid gap-3">{notifications.map((notification, index) => <div key={index} className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-[180px_160px_1fr_auto]"><Field label="Agency"><select value={notification.agency} onChange={(event) => updateNotification(setNotifications, index, "agency", event.target.value)}><option value="">Select agency</option>{agencyOptions.map((agency) => <option key={agency}>{agency}</option>)}</select></Field><Field label="Date Notified"><input type="date" value={notification.notified_on} onChange={(event) => updateNotification(setNotifications, index, "notified_on", event.target.value)} /></Field><Field label="Contact Information"><input value={notification.contact_information} onChange={(event) => updateNotification(setNotifications, index, "contact_information", event.target.value)} /></Field><button className="ghost-button self-end" type="button" onClick={() => setNotifications((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button></div>)}</div></div>
          <button className="primary-button mt-4" disabled={busy} type="button" onClick={() => void run(() => closeAsrReport({ reportId: report.id, safetyComments, hazardLogReference: hazardReference, internalInvestigationReference: investigationReference, title: safetyTitle, externalNotifications: notifications }), "Safety review signed and ASR closed.")}>Sign Safety Review & Close ASR</button>
        </ReviewPanel>
      ) : null}

      {report.safety_signed_at ? <ReviewPanel title="Section 8 - Safety Manager or Designee"><SignedReview comments={report.safety_comments} name={report.safety_signed_name} title={report.safety_signed_title} signedAt={report.safety_signed_at} /><p className="saas-meta-text mt-2">Hazard Log: {report.hazard_log_reference ?? "—"} · Investigation: {report.internal_investigation_reference ?? "—"}</p></ReviewPanel> : null}
    </section>
  );
}

function AsrSettings({ organizationId, members, assignments, options, onChanged, onError }: { organizationId: string; members: OrganizationMember[]; assignments: AsrReviewerAssignment[]; options: AsrOption[]; onChanged: () => Promise<void>; onError: (value: unknown) => void }) {
  const [category, setCategory] = useState<AsrOptionCategory>("occurrence_type");
  const [newValue, setNewValue] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<void>) { setBusy(true); try { await action(); await onChanged(); } catch (value) { onError(value); } finally { setBusy(false); } }
  return <section className="saas-panel"><h2 className="saas-subsection-title">ASR reviewer and option settings</h2><div className="mt-5 overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="border-b text-left text-slate-500"><th className="p-2">Member</th>{REVIEWER_CAPABILITIES.map((capability) => <th className="p-2" key={capability.value}>{capability.label}</th>)}</tr></thead><tbody>{members.map((member) => <tr className="border-b border-slate-100" key={member.user_id}><td className="p-2">{member.display_name || member.email}</td>{REVIEWER_CAPABILITIES.map((capability) => { const enabled = assignments.some((assignment) => assignment.user_id === member.user_id && assignment.capability === capability.value); return <td className="p-2" key={capability.value}><input type="checkbox" checked={enabled} disabled={busy} onChange={(event) => void run(() => setAsrReviewerCapability({ organizationId, userId: member.user_id, capability: capability.value, enabled: event.target.checked }))} /></td>; })}</tr>)}</tbody></table></div><div className="mt-6 border-t border-slate-200 pt-5"><h3 className="font-semibold text-slate-950">Organization ASR options</h3><div className="mt-3 flex flex-wrap gap-2"><select value={category} onChange={(event) => setCategory(event.target.value as AsrOptionCategory)}>{OPTION_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><input value={newValue} onChange={(event) => setNewValue(event.target.value)} placeholder="New option" /><button className="secondary-button" type="button" disabled={busy || !newValue.trim()} onClick={() => void run(async () => { await createAsrOption({ organizationId, category, value: newValue }); setNewValue(""); })}>Add</button></div><div className="mt-3 flex flex-wrap gap-2">{options.filter((option) => option.category === category).map((option) => <button key={option.id} type="button" disabled={busy} onClick={() => void run(() => setAsrOptionActive(option.id, !option.is_active))} className={`rounded-full border px-3 py-1 text-xs ${option.is_active ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-100 text-slate-500 line-through"}`}>{option.value}</button>)}</div></div></section>;
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) { return <fieldset className="mt-5 rounded-2xl border border-slate-200 p-4"><legend className="px-2 text-sm font-semibold text-slate-900">{title}</legend>{children}</fieldset>; }
function ReviewPanel({ title, children }: { title: string; children: React.ReactNode }) { return <div className="mt-5 rounded-2xl border border-slate-200 p-4"><h3 className="font-semibold text-slate-950">{title}</h3><div className="mt-4">{children}</div></div>; }
function Field({ label, required = false, children }: { label: string; required?: boolean; children: React.ReactNode }) { return <label className="grid gap-1.5 text-sm font-medium text-slate-700"><span>{label}{required ? " *" : ""}</span>{children}</label>; }
function OptionField({ label, required = false, value, options, onChange }: { label: string; required?: boolean; value: string; options: string[]; onChange: (value: string) => void }) { return <Field label={label} required={required}><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">Not specified</option>{options.map((option) => <option key={option}>{option}</option>)}</select></Field>; }
function ValueWithUnit({ label, value, unit, units, onValue, onUnit }: { label: string; value: string; unit: string; units: string[]; onValue: (value: string) => void; onUnit: (value: string) => void }) { return <Field label={label}><div className="grid grid-cols-[1fr_90px] gap-2"><input type="number" min="0" step="0.1" value={value} onChange={(event) => onValue(event.target.value)} /><select value={unit} onChange={(event) => onUnit(event.target.value)}>{units.map((item) => <option key={item}>{item}</option>)}</select></div></Field>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-200 bg-white p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 text-sm text-slate-800">{value}</dd></div>; }
function RiskBadge({ score }: { score: number }) { const band = riskBand(score); const className = band === "High" ? "bg-rose-100 text-rose-800" : band === "Medium" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"; return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>{score} · {band}</span>; }
function SignedReview({ comments, name, title, signedAt }: { comments: string | null; name: string | null; title: string | null; signedAt: string }) { return <div><p className="whitespace-pre-wrap text-sm text-slate-800">{comments}</p><p className="saas-meta-text mt-3">Signed by {name} · {title} · {formatDateTime(signedAt)}</p></div>; }
function riskBand(score: number) { if (score <= 6) return "Low"; if (score <= 12) return "Medium"; return "High"; }
function formatStatus(status: AsrReport["status"]) { if (status === "in_review") return "In review"; if (status === "closed") return "Closed"; if (status === "superseded") return "Superseded"; if (status === "draft") return "Draft"; return "Submitted"; }
function formatDateTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString(); }
function formatMaintenanceLabel(key: string) { return key.split("_").map((part) => part.toUpperCase() === "ATA" || part.toUpperCase() === "TTAF" ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)).join(" "); }
function updateNotification(setter: React.Dispatch<React.SetStateAction<AsrExternalNotification[]>>, index: number, key: keyof AsrExternalNotification, value: string) { setter((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item)); }
function getErrorMessage(value: unknown, fallback: string) { if (value instanceof Error && value.message) return value.message; if (typeof value === "object" && value && "message" in value) return String((value as { message?: unknown }).message ?? fallback); return fallback; }
