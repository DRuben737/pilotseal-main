"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { ConfirmDialog, DetailDrawer, ManagementDisclosure } from "@/components/admin/AdminConsole";
import { FlatRecordGroups } from "@/components/admin/FlatRecordGroups";
import { ReportActionControls, ReturnAircraftOption, useReportActionContext } from "@/components/dashboard/ReportActionControls";
import { groupAircraftReports } from "@/lib/record-groups";
import { performReportAction } from "@/lib/report-actions";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { useReportOrganization } from "@/components/dashboard/useReportOrganization";
import { UsDateInput } from "@/components/forms/UsDateInput";
import {
  AIRCRAFT_DISCREPANCY_TYPES,
  fetchOrganizationAircraftReports,
  fetchOrganizationReportPeople,
  processAircraftDiscrepancyReport,
  signAircraftDiscrepancyReport,
  submitAircraftDiscrepancyReport,
  type AircraftDiscrepancyReport,
  type AircraftDiscrepancyType,
  type OrganizationReportPerson,
  type OrganizationReportStatus,
  type TriState,
} from "@/lib/aircraft-reports";
import { fetchOrganizationAircraft, type AircraftRecord } from "@/lib/aircraft";
import { compareAircraftLabels, groupByAircraftFamily } from "@/lib/aircraft-family";
import { formatUsDate, formatUsDateTime } from "@/lib/date-format";
import { canManageOrganization } from "@/lib/organizations";
import {
  emptyAircraftReportForm,
  localReportDate,
  optionalReportNumber,
  validateAircraftReportForm,
  type AircraftReportForm as ReportForm,
  type AircraftReportFormErrors as ReportFormErrors,
} from "@/lib/aircraft-report-form";

type ProcessingForm = {
  status: OrganizationReportStatus;
  instructorPersonId: string;
  asrSubmitted: TriState;
  deferrable: TriState;
  aircraftDown: TriState;
  creditApplied: TriState;
  creditAuthorized: boolean;
};

type ReportStatusFilter = "all" | "open" | OrganizationReportStatus;

const emptyReportForm = emptyAircraftReportForm;

export default function AircraftReportsManager() {
  const searchParams = useSearchParams();
  const requestedReportId = searchParams.get("reportId") ?? "";
  const { session } = useAuthSession();
  const { activeOrganization, organizations, setActiveOrganizationId, loading: organizationsLoading, canSubmit, error: organizationError } = useReportOrganization();
  const canManage = canManageOrganization(activeOrganization?.member_role);
  const isPlatformAdmin = activeOrganization?.member_role === "platform_admin";
  const [reports, setReports] = useState<AircraftDiscrepancyReport[]>([]);
  const [aircraft, setAircraft] = useState<AircraftRecord[]>([]);
  const [people, setPeople] = useState<OrganizationReportPerson[]>([]);
  const [activeReportId, setActiveReportId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ReportForm>(emptyReportForm);
  const [formErrors, setFormErrors] = useState<ReportFormErrors>({});
  const [clientRequestId, setClientRequestId] = useState("");
  const [processingForm, setProcessingForm] = useState<ProcessingForm | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReportStatusFilter>("open");
  const [showHidden, setShowHidden] = useState(false);
  const [returnToService, setReturnToService] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingSubmission, setPendingSubmission] = useState<boolean | null>(null);
  const [pendingClose, setPendingClose] = useState(false);
  const [closeChoice, setCloseChoice] = useState<"save" | "discard" | "">("");
  const [closeError, setCloseError] = useState("");
  const busyRef = useRef(false);
  const loadVersion = useRef(0);
  const reviewToRestore = useRef<ProcessingForm | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const activeReport = reports.find((report) => report.id === activeReportId) ?? null;
  const closeContext = useReportActionContext(activeReportId, pendingClose);
  const aircraftById = useMemo(
    () => new Map(aircraft.map((item) => [item.id, item])),
    [aircraft]
  );
  const aircraftOptionGroups = useMemo(() =>
    groupByAircraftFamily(aircraft, (item) => item.model?.name)
      .map((group) => ({
        ...group,
        items: [...group.items].sort((left, right) => compareAircraftLabels(left.tail_number, right.tail_number)),
      })),
  [aircraft]);
  const activeAircraft = activeReport ? aircraftById.get(activeReport.aircraft_id) ?? null : null;
  const selectedReportAircraft = form.aircraftId
    ? aircraftById.get(form.aircraftId) ?? null
    : null;
  const students = people.filter((person) => person.teaching_role === "student");
  const instructors = people.filter((person) => person.teaching_role === "instructor");
  async function loadData(preferredReportId = "") {
    const version = ++loadVersion.current;
    if (!activeOrganization?.id) {
      setReports([]);
      setAircraft([]);
      setPeople([]);
      setLoading(false);
      return false;
    }
    setLoading(true);
    setError("");
    try {
      const [nextReports, nextAircraft, nextPeople] = await Promise.all([
        fetchOrganizationAircraftReports(activeOrganization.id),
        fetchOrganizationAircraft(activeOrganization.id),
        fetchOrganizationReportPeople(activeOrganization.id),
      ]);
      if (version !== loadVersion.current) return false;
      setReports(nextReports);
      setAircraft(nextAircraft);
      setPeople(nextPeople);
      const nextActiveId = preferredReportId || requestedReportId;
      if (nextActiveId && nextReports.some((report) => report.id === nextActiveId)) {
        setActiveReportId(nextActiveId);
      } else {
        setActiveReportId((current) =>
          nextReports.some((report) => report.id === current) ? current : ""
        );
      }
      return true;
    } catch (value) {
      if (version !== loadVersion.current) return false;
      setError(getErrorMessage(value, "Unable to load aircraft reports."));
      return false;
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }

  useEffect(() => {
    setShowForm(false);
    setActiveReportId("");
    setForm(emptyReportForm());
    setFormErrors({});
    setPendingSubmission(null);
    setPendingClose(false);
    setShowHidden(false);
    setReturnToService(false);
    setCloseError("");
    setReports([]);
    setAircraft([]);
    setPeople([]);
    void loadData();
    return () => { loadVersion.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrganization?.id, requestedReportId]);

  useEffect(() => {
    if (!activeReport) {
      setProcessingForm(null);
      return;
    }
    setProcessingForm(reviewToRestore.current ?? reviewFromReport(activeReport));
    reviewToRestore.current = null;
  }, [activeReport]);

  const filteredReports = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return reports.filter((report) => {
      if (report.hidden_at && !showHidden) return false;
      if (statusFilter === "open") {
        if (report.status === "closed") return false;
      } else if (statusFilter !== "all" && report.status !== statusFilter) {
        return false;
      }
      if (!needle) return true;
      return [
        report.aircraft_tail_number,
        report.discrepancy_type,
        report.description,
        report.student_name ?? "",
        report.instructor_name ?? "",
        report.found_by_name ?? "",
        report.submitted_by_name,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [query, reports, statusFilter, showHidden]);
  const reportGroups = useMemo(() => groupAircraftReports(filteredReports).map(group => {
    const plane = aircraftById.get(group.records[0].aircraft_id);
    return { ...group, statusLabel: plane ? formatAircraftStatus(plane.operational_status) : undefined };
  }), [filteredReports, aircraftById]);

  const reviewDirty = Boolean(activeReport && processingForm &&
    JSON.stringify(processingForm) !== JSON.stringify(reviewFromReport(activeReport)));

  function startReport() {
    if (busyRef.current || loading) return;
    setActiveReportId("");
    setForm(emptyReportForm());
    setClientRequestId(crypto.randomUUID());
    setFormErrors({});
    setMessage("");
    setError("");
    setShowForm(true);
  }

  function updateReportField<Key extends keyof ReportForm>(
    key: Key,
    value: ReportForm[Key]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setFormErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function requestSubmit(groundAircraft: boolean) {
    if (!activeOrganization?.id || busyRef.current || pendingSubmission !== null) return;
    const nextFormErrors = validateAircraftReportForm(form, aircraft.map(item => item.id), people.map(person => person.person_id));
    if (Object.keys(nextFormErrors).length > 0) {
      setFormErrors(nextFormErrors);
      setError("Review the highlighted report fields.");
      requestAnimationFrame(() => {
        document
          .querySelector<HTMLElement>(
            "#aircraft-report-new-form [aria-invalid='true']"
          )
          ?.focus();
      });
      return;
    }

    setError("");
    setPendingSubmission(groundAircraft);
  }

  async function handleSubmit() {
    if (!activeOrganization?.id || pendingSubmission === null || busyRef.current) return;
    const groundAircraft = pendingSubmission;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const requestId = clientRequestId || crypto.randomUUID();
      if (!clientRequestId) setClientRequestId(requestId);
      const reportId = await submitAircraftDiscrepancyReport({
        organizationId: activeOrganization.id,
        clientRequestId: requestId,
        aircraftId: form.aircraftId,
        reportDate: form.reportDate,
        foundByPersonId: form.foundByPersonId,
        reportTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        studentPersonId: form.studentPersonId || null,
        instructorPersonId: form.instructorPersonId || null,
        flightHobbsEnd: optionalReportNumber(form.flightHobbsEnd),
        maintenanceHobbsEnd: optionalReportNumber(form.maintenanceHobbsEnd),
        flightDuration: optionalReportNumber(form.flightDuration),
        discrepancyType: form.discrepancyType as AircraftDiscrepancyType,
        description: form.description,
        groundAircraft,
      });
      await loadData(reportId);
      setPendingSubmission(null);
      setShowForm(false);
      setForm(emptyReportForm());
      setFormErrors({});
      setClientRequestId("");
      setMessage(
        groundAircraft
          ? "Report submitted and aircraft grounded."
          : "Report submitted."
      );
    } catch (value) {
      setPendingSubmission(null);
      setError(getErrorMessage(value, "Unable to submit this report."));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function handleSign() {
    if (!activeReport || busyRef.current) return;
    if (!window.confirm("Confirm your instructor signature for this aircraft report?")) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await signAircraftDiscrepancyReport(activeReport.id);
      await loadData(activeReport.id);
      setMessage("Instructor signature recorded.");
    } catch (value) {
      setError(getErrorMessage(value, "Unable to sign this report."));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function handleProcess() {
    if (!activeReport || !processingForm || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await processAircraftDiscrepancyReport({
        reportId: activeReport.id,
        ...processingForm,
        instructorPersonId: processingForm.instructorPersonId || null,
      });
      await loadData(activeReport.id);
      setMessage("Changes saved.");
    } catch (value) {
      setError(getErrorMessage(value, "Unable to process this report."));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function handleCloseReport() {
    if (!activeReport || !processingForm || busyRef.current || (reviewDirty && !closeChoice)) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    setCloseError("");
    try {
      await performReportAction({ report: activeReport, action: "close", returnToService: returnToService && closeContext.context?.aircraft_status === "grounded",
        contextToken: closeContext.context?.token, review: reviewDirty && closeChoice === "save" ? {
          ...processingForm,
          instructorPersonId: processingForm.instructorPersonId || null,
        } : null });
      setPendingClose(false);
      await loadData(activeReport.id);
      setMessage("Report closed.");
    } catch (value) {
      setCloseError(getErrorMessage(value, "Unable to close this report. Try again."));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function handleReloadForClose() {
    if (!activeReport || !processingForm || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    reviewToRestore.current = processingForm;
    try {
      if (await loadData(activeReport.id)) setCloseError("");
      else {
        reviewToRestore.current = null;
        setCloseError("Unable to reload this report. Try again.");
      }
    } finally {
      closeContext.reload();
      busyRef.current = false;
      setBusy(false);
    }
  }

  const selectedInstructor = people.find(
    (person) => person.person_id === activeReport?.instructor_person_id
  );
  const canCurrentUserSign =
    Boolean(activeReport) &&
    !activeReport?.instructor_signed_at &&
    activeReport?.status !== "closed" &&
    selectedInstructor?.user_id === session?.user?.id &&
    selectedInstructor?.teaching_role === "instructor" &&
    selectedInstructor?.status === "linked";

  if (organizationsLoading) {
    return <section className="saas-panel"><p className="saas-empty-state">Loading organization…</p></section>;
  }

  if (!activeOrganization) {
    return (
      <section className="saas-panel">
        <p className="saas-kicker">Reports</p>
        <h1 className="saas-subsection-title">Aircraft discrepancy reports</h1>
        <p className="saas-empty-state mt-5">
          Join or select an organization before submitting an aircraft report.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
        {organizations.length > 1 ? (
          <label className="flex min-w-0 items-center gap-2">
            <span>Organization</span>
            <select className="min-w-0 max-w-full" aria-label="Organization" value={activeOrganization.id} disabled={busy || showForm || Boolean(activeReport)} onChange={event => setActiveOrganizationId(event.target.value)}>
              {organizations.map(organization => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
            </select>
          </label>
        ) : <p className="break-words text-slate-600">Organization: {activeOrganization.name}</p>}
      </div>
      {!showForm && !activeReport ? <Feedback message={message} error={error || organizationError} /> : null}
      <DetailDrawer open={showForm} title="New aircraft report" description={activeOrganization.name} width="wide" onClose={() => { if (!busyRef.current) { setShowForm(false); setFormErrors({}); } }}>
        <div id="aircraft-report-new-form">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="saas-kicker">New report</p>
              <h2 className="saas-subsection-title">Aircraft report</h2>
            </div>
            <button
              className="ghost-button"
              type="button"
              onClick={() => {
                setShowForm(false);
                setFormErrors({});
                setError("");
              }}
              disabled={busy}
            >
              Cancel
            </button>
          </div>

          <Feedback message="" error={error} />
          <fieldset disabled={busy || pendingSubmission !== null} className="mt-5 grid min-w-0 gap-4 md:grid-cols-2">
            <Field
              label="Aircraft"
              required
              error={formErrors.aircraftId}
              errorId="report-aircraft-error"
            >
              <select
                value={form.aircraftId}
                onChange={(event) =>
                  updateReportField("aircraftId", event.target.value)
                }
                aria-invalid={Boolean(formErrors.aircraftId)}
                aria-describedby={
                  formErrors.aircraftId ? "report-aircraft-error" : undefined
                }
              >
                <option value="">Select aircraft</option>
                {aircraftOptionGroups.map((group) => (
                  <optgroup key={group.key} label={group.label}>
                    {group.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.tail_number} · {formatAircraftStatus(item.operational_status)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Field>
            <Field
              label="Report date"
              required
              error={formErrors.reportDate}
              errorId="report-date-error"
            >
              <UsDateInput
                max={localReportDate()}
                value={form.reportDate}
                onChange={(value) => updateReportField("reportDate", value)}
                aria-invalid={Boolean(formErrors.reportDate)}
                aria-describedby={
                  formErrors.reportDate ? "report-date-error" : undefined
                }
              />
            </Field>
            <Field label="Found by" required error={formErrors.foundByPersonId} errorId="report-found-by-error">
              <select value={form.foundByPersonId} onChange={event => updateReportField("foundByPersonId", event.target.value)} aria-invalid={Boolean(formErrors.foundByPersonId)} aria-describedby={formErrors.foundByPersonId ? "report-found-by-error" : undefined}>
                <option value="">Select person</option>
                {people.map(person => <option key={person.person_id} value={person.person_id}>{person.display_name}</option>)}
              </select>
            </Field>
            <Field label="Affected area" required error={formErrors.discrepancyType} errorId="report-discrepancy-type-error">
              <select value={form.discrepancyType} onChange={event => updateReportField("discrepancyType", event.target.value as ReportForm["discrepancyType"])} aria-invalid={Boolean(formErrors.discrepancyType)} aria-describedby={formErrors.discrepancyType ? "report-discrepancy-type-error" : undefined}>
                <option value="">Select area</option>
                {AIRCRAFT_DISCREPANCY_TYPES.map(type => <option key={type} value={type}>{formatDiscrepancyType(type)}</option>)}
              </select>
            </Field>
            <Field label="Student">
              <select
                value={form.studentPersonId}
                onChange={(event) =>
                  updateReportField("studentPersonId", event.target.value)
                }
              >
                <option value="">Not specified</option>
                {students.map((person) => <option key={person.person_id} value={person.person_id}>{person.display_name}</option>)}
              </select>
            </Field>
            <Field label="Instructor">
              <select
                value={form.instructorPersonId}
                onChange={(event) =>
                  updateReportField("instructorPersonId", event.target.value)
                }
              >
                <option value="">Not specified</option>
                {instructors.map((person) => (
                  <option key={person.person_id} value={person.person_id}>
                    {person.display_name}{person.status === "pending" ? " · account not linked" : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Ending Hobbs"
              error={formErrors.flightHobbsEnd}
              errorId="report-flight-hobbs-error"
            >
              <NumberInput
                value={form.flightHobbsEnd}
                onChange={(value) => updateReportField("flightHobbsEnd", value)}
                invalid={Boolean(formErrors.flightHobbsEnd)}
                describedBy={
                  formErrors.flightHobbsEnd
                    ? "report-flight-hobbs-error"
                    : undefined
                }
              />
            </Field>
            <Field
              label="Maintenance Hobbs"
              error={formErrors.maintenanceHobbsEnd}
              errorId="report-maintenance-hobbs-error"
            >
              <NumberInput
                value={form.maintenanceHobbsEnd}
                onChange={(value) =>
                  updateReportField("maintenanceHobbsEnd", value)
                }
                invalid={Boolean(formErrors.maintenanceHobbsEnd)}
                describedBy={
                  formErrors.maintenanceHobbsEnd
                    ? "report-maintenance-hobbs-error"
                    : undefined
                }
              />
            </Field>
            <Field
              label="Flight duration (hrs)"
              error={formErrors.flightDuration}
              errorId="report-flight-duration-error"
            >
              <NumberInput
                value={form.flightDuration}
                onChange={(value) => updateReportField("flightDuration", value)}
                invalid={Boolean(formErrors.flightDuration)}
                describedBy={
                  formErrors.flightDuration
                    ? "report-flight-duration-error"
                    : undefined
                }
              />
            </Field>
            {selectedReportAircraft ? (
              <div className="self-center text-xs text-slate-600">
                <p>Status: {formatAircraftStatus(selectedReportAircraft.operational_status)}</p>
                {selectedReportAircraft.current_meter_type && selectedReportAircraft.current_meter_value !== null && selectedReportAircraft.current_meter_value !== undefined ? (
                  <p className="mt-1">Current {selectedReportAircraft.current_meter_type === "tach" ? "Tach" : "Hobbs"}: {selectedReportAircraft.current_meter_value} hrs · {selectedReportAircraft.meter_observed_at ? formatDateTime(selectedReportAircraft.meter_observed_at) : "Observation time not recorded"}</p>
                ) : null}
              </div>
            ) : null}
            <div className="md:col-span-2">
              <Field
                label="Description"
                required
                error={formErrors.description}
                errorId="report-description-error"
                hint={`${form.description.length}/5000 characters`}
              >
                <textarea
                  rows={6}
                  maxLength={5000}
                  value={form.description}
                  onChange={(event) =>
                    updateReportField("description", event.target.value)
                  }
                  placeholder="Describe the issue and when it occurred."
                  aria-invalid={Boolean(formErrors.description)}
                  aria-describedby={
                    formErrors.description
                      ? "report-description-error"
                      : undefined
                  }
                />
              </Field>
            </div>
          </fieldset>

          {selectedReportAircraft?.operational_status === "grounded" ? (
            <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Aircraft already grounded.
            </p>
          ) : null}

          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button className="secondary-button" type="button" disabled={busy || pendingSubmission !== null} onClick={() => requestSubmit(false)}>
              {busy ? "Submitting…" : "Submit report"}
            </button>
            <button className="min-h-11 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60" type="button" disabled={busy || pendingSubmission !== null} onClick={() => requestSubmit(true)}>
              {busy ? "Submitting…" : "Submit and ground aircraft"}
            </button>
          </div>
        </div>
      </DetailDrawer>

      <ManagementDisclosure
        id="aircraft-report-activity"
        title="Report activity"
        summary={loading ? "Loading…" : `${filteredReports.length}`}
        actions={<button className="primary-button" type="button" disabled={loading || busy || !canSubmit} onClick={startReport}>New report</button>}
        className="dashboard-data-workspace"
        defaultOpen
      >
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]">
          <input aria-label="Search reports" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reports" />
          <select aria-label="Report status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
            <option value="open">Open reports</option>
            <option value="all">All statuses</option>
            <option value="submitted">Submitted</option>
            <option value="in_review">In review</option>
            <option value="closed">Closed</option>
          </select>
          {query || statusFilter !== "open" ? (
            <button className="ghost-button" type="button" onClick={() => { setQuery(""); setStatusFilter("open"); }}>
              Clear filters
            </button>
          ) : null}
        </div>

        <label className="mt-3 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={showHidden} onChange={event => { setShowHidden(event.target.checked); if (event.target.checked) setStatusFilter("all"); }} />Show hidden</label>
        {loading ? <p className="saas-empty-state mt-5">Loading reports…</p> : null}
        {!loading && filteredReports.length === 0 ? (
          <div className="saas-empty-state mt-5">
            <p>
              {statusFilter === "open" && !query.trim()
                ? "No open aircraft reports."
                : "No aircraft reports match these filters."}
            </p>
            {statusFilter !== "all" ? (
              <button
                className="ghost-button mt-3"
                type="button"
                onClick={() => setStatusFilter("all")}
              >
                Show all reports
              </button>
            ) : null}
          </div>
        ) : null}
        <FlatRecordGroups groups={reportGroups} searching={query.trim()} renderRecord={(report) => {
            const reportAircraft = aircraftById.get(report.aircraft_id) ?? null;
            const fleetGrounded = reportAircraft?.operational_status === "grounded";
            return (
              <article
                key={report.id}
                className={`w-full px-3 py-2.5 text-left transition-colors duration-200 ${
                  activeReportId === report.id
                    ? "bg-blue-50"
                    : "bg-white hover:bg-slate-50"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setActiveReportId(report.id)} aria-pressed={activeReportId === report.id}>
                    <p className="line-clamp-1 text-sm font-medium text-slate-900">
                      {report.description}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatUsDate(report.report_date)} · {formatDiscrepancyType(report.discrepancy_type)} · Found by: {report.found_by_name ?? "Not recorded"} · Submitted by: {report.submitted_by_name}
                    </p>
                  </button>
                  <div className="flex flex-wrap gap-2">
                    {report.hidden_at ? <Badge tone="neutral">Hidden</Badge> : null}
                    {report.status !== "closed" && report.aircraft_down === true && !fleetGrounded ? (
                      <Badge tone="warning">Reported aircraft down</Badge>
                    ) : null}
                    {!report.instructor_signed_at && report.instructor_name ? <Badge tone="warning">Signature pending</Badge> : null}
                    <Badge tone={report.status === "closed" ? "neutral" : report.status === "in_review" ? "warning" : "info"}>
                      {formatReportStatus(report.status)}
                    </Badge>
                  </div>
                  <ReportActionControls report={report} canManage={canManage} isPlatformAdmin={isPlatformAdmin} disabled={busy} onChanged={async deleted => {
                    if (deleted && activeReportId === report.id) setActiveReportId("");
                    await loadData(deleted ? "" : activeReportId);
                  }} />
                </div>
              </article>
            );
          }} />
      </ManagementDisclosure>

      <DetailDrawer
        open={Boolean(activeReport)}
        title={activeReport ? activeReport.aircraft_tail_number : "Aircraft report"}
        description={activeOrganization.name}
        width="wide"
        onClose={() => { if (!busyRef.current) setActiveReportId(""); }}
      >
        {activeReport ? (
        <div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="saas-kicker">Report detail</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canManage && activeReport.status !== "closed" ? (
                <button
                  className="secondary-button"
                  type="button"
                  disabled={busy}
                  onClick={() => { setCloseChoice(""); setCloseError(""); setReturnToService(false); setPendingClose(true); }}
                >
                  Close report
                </button>
              ) : null}
              <button className="ghost-button" type="button" disabled={busy} onClick={() => setActiveReportId("")}>Done</button>
            </div>
          </div>

          <Feedback message={message} error={error} />
          <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Detail label="Report date" value={formatUsDate(activeReport.report_date)} />
            <Detail label="Found by" value={activeReport.found_by_name ?? "Not recorded"} />
            <Detail label="Submitted by" value={activeReport.submitted_by_name} />
            <Detail label="Submitted" value={formatDateTime(activeReport.created_at)} />
            <Detail label="Student" value={activeReport.student_name ?? "Not specified"} />
            <Detail label="Instructor" value={activeReport.instructor_name ?? "Not specified"} />
            <Detail label="Affected area" value={formatDiscrepancyType(activeReport.discrepancy_type)} />
            <Detail label="Status" value={formatReportStatus(activeReport.status)} />
            <Detail label="Aircraft status" value={activeAircraft ? formatAircraftStatus(activeAircraft.operational_status) : "Unavailable"} />
            <Detail label="Ending Hobbs" value={formatHours(activeReport.flight_hobbs_end)} />
            <Detail label="Maintenance Hobbs" value={formatHours(activeReport.maintenance_hobbs_end)} />
            <Detail label="Flight duration (hrs)" value={formatNumber(activeReport.flight_duration)} />
            {activeReport.closed_at ? <Detail label="Closed" value={formatDateTime(activeReport.closed_at)} /> : null}
            <Detail label="Instructor signature" value={activeReport.instructor_signed_at ? `${activeReport.instructor_signed_name} · ${formatDateTime(activeReport.instructor_signed_at)}` : "Pending"} />
          </dl>
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Description</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{activeReport.description}</p>
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Detail label="ASR submitted" value={formatTriState(activeReport.asr_submitted)} />
            <Detail label="Deferrable" value={formatTriState(activeReport.deferrable)} />
            <Detail label="Aircraft down" value={formatTriState(activeReport.aircraft_down)} />
            <Detail label="Credit applied" value={formatTriState(activeReport.credit_applied)} />
            <Detail label="Reviewed by" value={activeReport.processed_by_name ?? "Not reviewed"} />
            <Detail
              label="Credit authorization"
              value={
                activeReport.credit_authorized_at
                  ? `${activeReport.credit_authorized_name} · ${formatDateTime(activeReport.credit_authorized_at)}`
                  : "Not authorized"
              }
            />
          </dl>

          {canCurrentUserSign ? (
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
              <button className="primary-button mt-3" type="button" disabled={busy} onClick={() => void handleSign()}>
                Sign report
              </button>
            </div>
          ) : null}

          {canManage && processingForm ? (
            <div className="mt-5 rounded-2xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-950">Review</h3>
              {activeReport.status === "closed" ? (
                <p className="saas-meta-text mt-2">Report closed.</p>
              ) : (
                <>
                  <fieldset disabled={busy} className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Status">
                      <select value={processingForm.status} onChange={(event) => setProcessingForm({ ...processingForm, status: event.target.value as OrganizationReportStatus })}>
                        <option value="submitted">Submitted</option>
                        <option value="in_review">In review</option>
                      </select>
                    </Field>
                    <Field label="Instructor">
                      <select disabled={Boolean(activeReport.instructor_signed_at)} value={processingForm.instructorPersonId} onChange={(event) => setProcessingForm({ ...processingForm, instructorPersonId: event.target.value })}>
                        <option value="">Not specified</option>
                        {instructors.map((person) => <option key={person.person_id} value={person.person_id}>{person.display_name}{person.status === "pending" ? " · account not linked" : ""}</option>)}
                      </select>
                    </Field>
                    <TriStateField label="ASR submitted" value={processingForm.asrSubmitted} onChange={(value) => setProcessingForm({ ...processingForm, asrSubmitted: value })} />
                    <TriStateField label="Deferrable" value={processingForm.deferrable} onChange={(value) => setProcessingForm({ ...processingForm, deferrable: value })} />
                    <TriStateField label="Aircraft down" value={processingForm.aircraftDown} onChange={(value) => setProcessingForm({ ...processingForm, aircraftDown: value })} />
                    <TriStateField label="Flight credit" value={processingForm.creditApplied} onChange={(value) => setProcessingForm({ ...processingForm, creditApplied: value })} />
                  </fieldset>
                  <label className="mt-4 flex items-center gap-3 text-sm text-slate-800">
                    <input type="checkbox" disabled={busy || Boolean(activeReport.credit_authorized_at)} checked={processingForm.creditAuthorized} onChange={(event) => setProcessingForm({ ...processingForm, creditAuthorized: event.target.checked })} />
                    Authorize flight credit
                  </label>
                  <button className="primary-button mt-4" type="button" disabled={busy} onClick={() => void handleProcess()}>
                    {busy ? "Saving…" : "Save changes"}
                  </button>
                </>
              )}
            </div>
          ) : null}

          <div className="mt-5">
            <h3 className="font-semibold text-slate-950">Activity</h3>
            <ol className="mt-3 grid gap-3">
              {activeReport.events.map((event) => (
                <li key={event.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                  <p className="font-semibold text-slate-900">{formatEvent(event.event_type)}</p>
                  <p className="saas-meta-text mt-1">{event.actor_name} · {formatDateTime(event.created_at)}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
        ) : null}
      </DetailDrawer>

      <ConfirmDialog
        open={pendingSubmission !== null}
        title={pendingSubmission ? "Submit and ground aircraft?" : "Submit report?"}
        description={
          pendingSubmission
            ? "The aircraft will be marked Grounded and unavailable for dispatch."
            : `${selectedReportAircraft?.tail_number ?? "Aircraft"} · ${activeOrganization.name}`
        }
        confirmLabel={pendingSubmission ? "Submit and ground aircraft" : "Submit report"}
        busy={busy}
        destructive={pendingSubmission === true}
        onCancel={() => setPendingSubmission(null)}
        onConfirm={() => void handleSubmit()}
      />
      <ConfirmDialog
        open={pendingClose}
        title="Close this report?"
        description="The report will become read-only."
        confirmLabel="Close report"
        busy={busy}
        confirmDisabled={(reviewDirty && !closeChoice) || closeContext.loading || !closeContext.context}
        onCancel={() => { setPendingClose(false); setCloseError(""); }}
        onConfirm={() => void handleCloseReport()}
      >
        <ReturnAircraftOption context={closeContext.context} checked={returnToService} onChange={setReturnToService} disabled={busy} />
        {closeContext.loading ? <p className="mt-3 text-xs">Loading aircraft status…</p> : null}
        {closeContext.error ? <p className="mt-3 text-xs text-rose-700" role="alert">{closeContext.error}<button type="button" className="ml-2 underline" onClick={closeContext.reload}>Retry</button></p> : null}
        {reviewDirty ? (
          <fieldset disabled={busy} className="mt-4 grid gap-2 text-sm">
            <legend className="mb-2 font-medium">Unsaved changes</legend>
            <label className="flex items-center gap-2"><input type="radio" name="close-choice" value="save" checked={closeChoice === "save"} onChange={() => setCloseChoice("save")} />Save changes</label>
            <label className="flex items-center gap-2"><input type="radio" name="close-choice" value="discard" checked={closeChoice === "discard"} onChange={() => setCloseChoice("discard")} />Discard changes</label>
          </fieldset>
        ) : null}
        <Feedback message="" error={closeError} />
        {closeError.startsWith("This report changed.") || closeError.startsWith("Unable to reload") ? (
          <button className="ghost-button mt-3" type="button" disabled={busy} onClick={() => void handleReloadForClose()}>Reload report</button>
        ) : null}
        {closeError.startsWith("Aircraft status") ? <button type="button" className="ghost-button mt-3" disabled={busy} onClick={() => { closeContext.reload(); setCloseError(""); }}>Reload confirmation</button> : null}
      </ConfirmDialog>
    </section>
  );
}

function Field({
  label,
  required = false,
  error,
  errorId,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  errorId?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-slate-700">
      <span>
        {label}
        {required ? (
          <span className="font-normal text-slate-500"> (required)</span>
        ) : null}
      </span>
      {children}
      {error ? (
        <span id={errorId} className="text-sm font-normal text-rose-700">
          {error}
        </span>
      ) : hint ? (
        <span className="text-xs font-normal text-slate-500">{hint}</span>
      ) : null}
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  invalid = false,
  describedBy,
}: {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <input
      type="number"
      min="0"
      step="0.1"
      inputMode="decimal"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-invalid={invalid}
      aria-describedby={describedBy}
    />
  );
}

function TriStateField({ label, value, onChange }: { label: string; value: TriState; onChange: (value: TriState) => void }) {
  return <Field label={label}><select value={value === null ? "" : String(value)} onChange={(event) => onChange(event.target.value === "" ? null : event.target.value === "true")}><option value="">Not reviewed</option><option value="true">Yes</option><option value="false">No</option></select></Field>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 break-words text-sm text-slate-800">{value}</dd></div>;
}

function Feedback({ message, error }: { message: string; error: string }) {
  return <>
    {message ? <p role="status" className="mt-3 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}
    {error ? <p role="alert" className="mt-3 rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
  </>;
}

function reviewFromReport(report: AircraftDiscrepancyReport): ProcessingForm {
  return {
    status: report.status,
    instructorPersonId: report.instructor_person_id ?? "",
    asrSubmitted: report.asr_submitted,
    deferrable: report.deferrable,
    aircraftDown: report.aircraft_down,
    creditApplied: report.credit_applied,
    creditAuthorized: Boolean(report.credit_authorized_at),
  };
}

function Badge({ tone, children }: { tone: "danger" | "warning" | "neutral" | "info"; children: React.ReactNode }) {
  const className = tone === "danger" ? "bg-rose-100 text-rose-800" : tone === "warning" ? "bg-amber-100 text-amber-800" : tone === "info" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-700";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>{children}</span>;
}


function formatNumber(value: number | null) {
  return value === null ? "—" : String(value);
}

function formatHours(value: number | null) {
  return value === null ? "—" : `${value} hrs`;
}

function formatTriState(value: TriState) {
  if (value === null) return "Not reviewed";
  return value ? "Yes" : "No";
}

function formatAircraftStatus(value: AircraftRecord["operational_status"]) {
  if (value === "in_maintenance") return "In maintenance";
  if (value === "grounded") return "Grounded";
  if (value === "away") return "Away";
  return "Available";
}

function formatDiscrepancyType(value: AircraftDiscrepancyType) {
  if (value === "Electrical/Lighting") return "Electrical or lighting";
  if (value === "Flight Instrument") return "Flight instruments";
  if (value === "Pitot Static") return "Pitot-static system";
  if (value === "Auto Pilot") return "Autopilot";
  return value || "Not recorded";
}

function formatReportStatus(value: OrganizationReportStatus) {
  if (value === "in_review") return "In review";
  if (value === "closed") return "Closed";
  return "Submitted";
}

function formatEvent(value: AircraftDiscrepancyReport["events"][number]["event_type"]) {
  if (value === "instructor_signed") return "Instructor signed";
  if (value === "grounded") return "Aircraft grounded";
  if (value === "reviewed") return "Processing updated";
  if (value === "closed") return "Report closed";
  return "Report submitted";
}

function formatDateTime(value: string) {
  return formatUsDateTime(value);
}

function getErrorMessage(value: unknown, fallback: string) {
  if (value instanceof Error && value.message) return value.message;
  if (typeof value === "object" && value && "message" in value) {
    return String((value as { message?: unknown }).message ?? fallback);
  }
  return fallback;
}
