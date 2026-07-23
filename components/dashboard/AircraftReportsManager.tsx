"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { useOrganization } from "@/components/organizations/OrganizationProvider";
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
import { canManageOrganization } from "@/lib/organizations";

type ReportForm = {
  aircraftId: string;
  reportDate: string;
  studentPersonId: string;
  instructorPersonId: string;
  flightHobbsEnd: string;
  maintenanceHobbsEnd: string;
  flightDuration: string;
  discrepancyType: AircraftDiscrepancyType;
  description: string;
};

type ReportFormErrors = Partial<Record<keyof ReportForm, string>>;

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

const emptyReportForm = (): ReportForm => ({
  aircraftId: "",
  reportDate: new Date().toISOString().slice(0, 10),
  studentPersonId: "",
  instructorPersonId: "",
  flightHobbsEnd: "",
  maintenanceHobbsEnd: "",
  flightDuration: "",
  discrepancyType: "Wings",
  description: "",
});

export default function AircraftReportsManager() {
  const searchParams = useSearchParams();
  const requestedReportId = searchParams.get("reportId") ?? "";
  const { session } = useAuthSession();
  const { activeOrganization, loading: organizationsLoading } = useOrganization();
  const canManage = canManageOrganization(activeOrganization?.member_role);
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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const activeReport = reports.find((report) => report.id === activeReportId) ?? null;
  const aircraftById = useMemo(
    () => new Map(aircraft.map((item) => [item.id, item])),
    [aircraft]
  );
  const activeAircraft = activeReport ? aircraftById.get(activeReport.aircraft_id) ?? null : null;
  const selectedReportAircraft = form.aircraftId
    ? aircraftById.get(form.aircraftId) ?? null
    : null;
  const students = people.filter((person) => person.teaching_role === "student");
  const instructors = people.filter((person) => person.teaching_role === "instructor");
  const reportStats = useMemo(
    () => ({
      open: reports.filter((report) => report.status !== "closed").length,
      submitted: reports.filter((report) => report.status === "submitted").length,
      signaturePending: reports.filter(
        (report) =>
          report.status !== "closed" &&
          Boolean(report.instructor_name) &&
          !report.instructor_signed_at
      ).length,
      groundedAircraft: aircraft.filter(
        (item) => item.operational_status === "grounded"
      ).length,
    }),
    [aircraft, reports]
  );

  async function loadData(preferredReportId = "") {
    if (!activeOrganization?.id) {
      setReports([]);
      setAircraft([]);
      setPeople([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [nextReports, nextAircraft, nextPeople] = await Promise.all([
        fetchOrganizationAircraftReports(activeOrganization.id),
        fetchOrganizationAircraft(activeOrganization.id),
        fetchOrganizationReportPeople(activeOrganization.id),
      ]);
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
    } catch (value) {
      setError(getErrorMessage(value, "Unable to load aircraft reports."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setShowForm(false);
    setActiveReportId("");
    setForm(emptyReportForm());
    setFormErrors({});
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrganization?.id, requestedReportId]);

  useEffect(() => {
    if (!activeReport) {
      setProcessingForm(null);
      return;
    }
    setProcessingForm({
      status: activeReport.status,
      instructorPersonId: activeReport.instructor_person_id ?? "",
      asrSubmitted: activeReport.asr_submitted,
      deferrable: activeReport.deferrable,
      aircraftDown: activeReport.aircraft_down,
      creditApplied: activeReport.credit_applied,
      creditAuthorized: Boolean(activeReport.credit_authorized_at),
    });
  }, [activeReport]);

  const filteredReports = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return reports.filter((report) => {
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
        report.submitted_by_name,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [query, reports, statusFilter]);

  const activeReportNextSteps = activeReport
    ? getReportNextSteps(activeReport, activeAircraft, canManage)
    : [];
  const activeAircraftGrounded =
    activeAircraft?.operational_status === "grounded";

  function startReport() {
    const defaultAircraft = aircraft.find((item) => item.operational_status !== "grounded") ?? aircraft[0];
    const currentPerson = people.find((person) => person.user_id === session?.user?.id);
    setForm({
      ...emptyReportForm(),
      aircraftId: defaultAircraft?.id ?? "",
      studentPersonId: currentPerson?.teaching_role === "student" ? currentPerson.person_id : "",
      instructorPersonId:
        currentPerson?.teaching_role === "instructor" ? currentPerson.person_id : "",
    });
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

  async function handleSubmit(groundAircraft: boolean) {
    if (!activeOrganization?.id) return;
    const nextFormErrors = validateReportForm(form);
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
    if (
      groundAircraft &&
      !window.confirm(
        "Ground this aircraft immediately? It will remain grounded until an organization owner or administrator changes its fleet status."
      )
    ) {
      return;
    }

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
        studentPersonId: form.studentPersonId || null,
        instructorPersonId: form.instructorPersonId || null,
        flightHobbsEnd: optionalNonNegativeNumber(form.flightHobbsEnd, "Flight Hobbs End"),
        maintenanceHobbsEnd: optionalNonNegativeNumber(
          form.maintenanceHobbsEnd,
          "Maintenance Hobbs End"
        ),
        flightDuration: optionalNonNegativeNumber(form.flightDuration, "Flight Duration"),
        discrepancyType: form.discrepancyType,
        description: form.description,
        groundAircraft,
      });
      await loadData(reportId);
      setShowForm(false);
      setForm(emptyReportForm());
      setFormErrors({});
      setClientRequestId("");
      setMessage(
        groundAircraft
          ? "Report submitted and aircraft grounded."
          : "Aircraft discrepancy report submitted."
      );
    } catch (value) {
      setError(getErrorMessage(value, "Unable to submit this report."));
    } finally {
      setBusy(false);
    }
  }

  async function handleSign() {
    if (!activeReport) return;
    if (!window.confirm("Confirm your instructor signature for this aircraft report?")) return;
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
      setBusy(false);
    }
  }

  async function handleProcess() {
    if (!activeReport || !processingForm) return;
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
      setMessage(
        processingForm.status === "closed"
          ? "Report processed and closed. Aircraft fleet status was not changed."
          : "Report processing details saved."
      );
    } catch (value) {
      setError(getErrorMessage(value, "Unable to process this report."));
    } finally {
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
      <div className="saas-panel">
        <div className="people-toolbar">
          <div>
            <p className="saas-kicker">{activeOrganization.name}</p>
            <h1 className="saas-subsection-title">Aircraft discrepancy reports</h1>
            <p className="saas-meta-text mt-2">
              Report a discrepancy immediately. Grounded aircraft can only be returned to service by an organization owner or administrator.
            </p>
          </div>
          <button className="primary-button" type="button" onClick={startReport}>
            New aircraft report
          </button>
        </div>

        {message ? (
          <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            {message}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            {error}
          </p>
        ) : null}

        <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ReportStat label="Open reports" value={reportStats.open} />
          <ReportStat label="Waiting for review" value={reportStats.submitted} />
          <ReportStat label="Signatures pending" value={reportStats.signaturePending} />
          <ReportStat
            label="Aircraft grounded now"
            value={reportStats.groundedAircraft}
            tone={reportStats.groundedAircraft > 0 ? "danger" : "neutral"}
          />
        </dl>
      </div>

      {showForm ? (
        <section id="aircraft-report-new-form" className="saas-panel">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="saas-kicker">New report</p>
              <h2 className="saas-subsection-title">Aircraft Discrepancy Report</h2>
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

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field
              label="Aircraft"
              required
              error={formErrors.aircraftId}
              errorId="report-aircraft-error"
              hint={
                selectedReportAircraft
                  ? `Current fleet status: ${formatAircraftStatus(selectedReportAircraft.operational_status)}`
                  : "Choose the aircraft with the discrepancy."
              }
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
                {aircraft.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.tail_number} · {formatAircraftStatus(item.operational_status)}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Report date"
              required
              error={formErrors.reportDate}
              errorId="report-date-error"
            >
              <input
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={form.reportDate}
                onChange={(event) =>
                  updateReportField("reportDate", event.target.value)
                }
                aria-invalid={Boolean(formErrors.reportDate)}
                aria-describedby={
                  formErrors.reportDate ? "report-date-error" : undefined
                }
              />
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
              label="Flight Hobbs ending value"
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
              label="Maintenance Hobbs ending value"
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
              label="Flight time (hours)"
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
            <Field label="Affected system" required>
              <select
                value={form.discrepancyType}
                onChange={(event) =>
                  updateReportField(
                    "discrepancyType",
                    event.target.value as AircraftDiscrepancyType
                  )
                }
              >
                {AIRCRAFT_DISCREPANCY_TYPES.map((type) => <option key={type}>{type}</option>)}
              </select>
            </Field>
            <div className="md:col-span-2">
              <Field
                label="What happened?"
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
                  placeholder="Describe the problem, when it happened, and anything you already tried."
                  aria-invalid={Boolean(formErrors.description)}
                  aria-describedby={
                    formErrors.description
                      ? "report-description-error"
                      : undefined
                  }
                />
              </Field>
            </div>
          </div>

          {selectedReportAircraft?.operational_status === "grounded" ? (
            <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              This aircraft is already grounded. You can still submit another
              report, but its fleet status will not change.
            </p>
          ) : null}

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-950">
                Submit report
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Records the discrepancy without changing the aircraft&apos;s
                Fleet &amp; MX status.
              </p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
              <p className="text-sm font-semibold text-rose-900">
                Submit and ground immediately
              </p>
              <p className="mt-1 text-sm text-rose-800">
                Sets the aircraft to Grounded and blocks dispatch until an owner
                or administrator returns it to service.
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button className="secondary-button" type="button" disabled={busy} onClick={() => void handleSubmit(false)}>
              {busy ? "Submitting…" : "Submit report"}
            </button>
            <button className="min-h-11 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60" type="button" disabled={busy} onClick={() => void handleSubmit(true)}>
              {busy ? "Submitting…" : "Submit and ground immediately"}
            </button>
          </div>
        </section>
      ) : null}

      <section className="saas-panel">
        <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search aircraft, person, type, or description" />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
            <option value="open">Open reports</option>
            <option value="all">All statuses</option>
            <option value="submitted">Submitted</option>
            <option value="in_review">In review</option>
            <option value="closed">Closed</option>
          </select>
        </div>

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
        <div className="mt-5 grid gap-3">
          {filteredReports.map((report) => {
            const reportAircraft = aircraftById.get(report.aircraft_id) ?? null;
            const fleetGrounded = reportAircraft?.operational_status === "grounded";
            return (
              <button
                key={report.id}
                type="button"
                onClick={() => setActiveReportId(report.id)}
                aria-pressed={activeReportId === report.id}
                className={`w-full rounded-2xl border p-4 text-left transition-colors duration-200 ${
                  activeReportId === report.id
                    ? "border-blue-400 bg-blue-50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">
                      {report.aircraft_tail_number} · {report.discrepancy_type}
                    </p>
                    <p className="saas-meta-text mt-1">
                      {report.report_date} · Submitted by {report.submitted_by_name}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm text-slate-700">{report.description}</p>
                    <p className="mt-3 text-xs font-semibold text-slate-600">
                      Next: {getReportListNextStep(report, canManage)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {fleetGrounded ? <Badge tone="danger">Grounded in fleet</Badge> : null}
                    {report.aircraft_down === true && !fleetGrounded ? (
                      <Badge tone="warning">Report says aircraft down</Badge>
                    ) : null}
                    {!report.instructor_signed_at && report.instructor_name ? <Badge tone="warning">Signature pending</Badge> : null}
                    <Badge tone={report.status === "closed" ? "neutral" : report.status === "in_review" ? "warning" : "info"}>
                      {formatReportStatus(report.status)}
                    </Badge>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {activeReport ? (
        <section className="saas-panel">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="saas-kicker">Report detail</p>
              <h2 className="saas-subsection-title">{activeReport.aircraft_tail_number} · {activeReport.discrepancy_type}</h2>
              <p className="saas-meta-text mt-2">Submitted {formatDateTime(activeReport.created_at)} by {activeReport.submitted_by_name}</p>
            </div>
            <button className="ghost-button" type="button" onClick={() => setActiveReportId("")}>Close detail</button>
          </div>

          <div
            className={`mt-5 rounded-2xl border p-4 ${
              activeAircraftGrounded ||
              (activeReport.aircraft_down === true && !activeAircraftGrounded)
                ? "border-rose-200 bg-rose-50 text-rose-950"
                : "border-blue-200 bg-blue-50 text-blue-950"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">What happens next</h3>
              <Badge
                tone={
                  activeAircraftGrounded ? "danger" : "neutral"
                }
              >
                Fleet status:{" "}
                {activeAircraft
                  ? formatAircraftStatus(activeAircraft.operational_status)
                  : "Unavailable"}
              </Badge>
            </div>
            <ul className="mt-3 grid gap-2 text-sm">
              {activeReportNextSteps.map((step) => (
                <li key={step} className="flex gap-2">
                  <span aria-hidden="true">•</span>
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>

          <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Detail label="Report date" value={activeReport.report_date} />
            <Detail label="Student" value={activeReport.student_name ?? "Not specified"} />
            <Detail label="Instructor" value={activeReport.instructor_name ?? "Not specified"} />
            <Detail label="Status" value={formatReportStatus(activeReport.status)} />
            <Detail label="Flight Hobbs End" value={formatNumber(activeReport.flight_hobbs_end)} />
            <Detail label="Maintenance Hobbs End" value={formatNumber(activeReport.maintenance_hobbs_end)} />
            <Detail label="Flight Duration" value={formatNumber(activeReport.flight_duration)} />
            <Detail label="Instructor signature" value={activeReport.instructor_signed_at ? `${activeReport.instructor_signed_name} · ${formatDateTime(activeReport.instructor_signed_at)}` : "Pending"} />
          </dl>
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Description</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{activeReport.description}</p>
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Detail label="ASR Submitted" value={formatTriState(activeReport.asr_submitted)} />
            <Detail label="Deferrable" value={formatTriState(activeReport.deferrable)} />
            <Detail label="Report says aircraft down" value={formatTriState(activeReport.aircraft_down)} />
            <Detail label="Credit Applied" value={formatTriState(activeReport.credit_applied)} />
            <Detail label="Processed By" value={activeReport.processed_by_name ?? "Not processed"} />
            <Detail
              label="Credit Authorized"
              value={
                activeReport.credit_authorized_at
                  ? `${activeReport.credit_authorized_name} · ${formatDateTime(activeReport.credit_authorized_at)}`
                  : "Not authorized"
              }
            />
          </dl>

          {canCurrentUserSign ? (
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm text-blue-900">You are the selected instructor. Confirming records your account identity and the server time as the Instructor’s Signature.</p>
              <button className="primary-button mt-3" type="button" disabled={busy} onClick={() => void handleSign()}>
                Confirm Instructor Signature
              </button>
            </div>
          ) : null}

          {canManage && processingForm ? (
            <div className="mt-5 rounded-2xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-950">Organization processing</h3>
              {activeReport.status === "closed" ? (
                <p className="saas-meta-text mt-2">This report is closed and immutable.</p>
              ) : (
                <>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Workflow status">
                      <select value={processingForm.status} onChange={(event) => setProcessingForm({ ...processingForm, status: event.target.value as OrganizationReportStatus })}>
                        <option value="submitted">Submitted</option>
                        <option value="in_review">In review</option>
                        <option value="closed">Closed</option>
                      </select>
                    </Field>
                    <Field label="Assigned instructor">
                      <select disabled={Boolean(activeReport.instructor_signed_at)} value={processingForm.instructorPersonId} onChange={(event) => setProcessingForm({ ...processingForm, instructorPersonId: event.target.value })}>
                        <option value="">Not specified</option>
                        {instructors.map((person) => <option key={person.person_id} value={person.person_id}>{person.display_name}{person.status === "pending" ? " · account not linked" : ""}</option>)}
                      </select>
                    </Field>
                    <TriStateField label="ASR Submitted" value={processingForm.asrSubmitted} onChange={(value) => setProcessingForm({ ...processingForm, asrSubmitted: value })} />
                    <TriStateField label="Deferrable" value={processingForm.deferrable} onChange={(value) => setProcessingForm({ ...processingForm, deferrable: value })} />
                    <TriStateField label="Report assessment: Aircraft down" value={processingForm.aircraftDown} onChange={(value) => setProcessingForm({ ...processingForm, aircraftDown: value })} />
                    <TriStateField label="Credit Applied" value={processingForm.creditApplied} onChange={(value) => setProcessingForm({ ...processingForm, creditApplied: value })} />
                  </div>
                  <label className="mt-4 flex items-center gap-3 text-sm text-slate-800">
                    <input type="checkbox" checked={processingForm.creditAuthorized} onChange={(event) => setProcessingForm({ ...processingForm, creditAuthorized: event.target.checked })} />
                    Authorize credit as the current administrator
                  </label>
                  <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    This Aircraft Down field documents the report only. To ground or
                    return the aircraft to service, update its operational status in
                    Fleet &amp; MX.
                  </p>
                  <button className="primary-button mt-4" type="button" disabled={busy} onClick={() => void handleProcess()}>
                    {busy ? "Saving…" : processingForm.status === "closed" ? "Save & Close Report" : "Save Processing"}
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
        </section>
      ) : null}
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
  return <div className="rounded-xl border border-slate-200 bg-white p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 text-sm text-slate-800">{value}</dd></div>;
}

function ReportStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "danger";
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        tone === "danger"
          ? "border-rose-200 bg-rose-50"
          : "border-slate-200 bg-white"
      }`}
    >
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd
        className={`mt-1 text-2xl font-semibold ${
          tone === "danger" ? "text-rose-800" : "text-slate-950"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function Badge({ tone, children }: { tone: "danger" | "warning" | "neutral" | "info"; children: React.ReactNode }) {
  const className = tone === "danger" ? "bg-rose-100 text-rose-800" : tone === "warning" ? "bg-amber-100 text-amber-800" : tone === "info" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-700";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>{children}</span>;
}

function getReportListNextStep(
  report: AircraftDiscrepancyReport,
  canManage: boolean
) {
  if (report.status === "closed") return "No report action remains";
  if (!report.instructor_person_id) {
    return canManage
      ? "Assign an instructor"
      : "Waiting for an instructor assignment";
  }
  if (!report.instructor_signed_at) {
    return `Waiting for ${report.instructor_name ?? "the instructor"} to sign`;
  }
  if (report.status === "submitted") {
    return canManage
      ? "Review the report and record the disposition"
      : "Waiting for organization review";
  }
  return canManage
    ? "Finish the disposition and close the report"
    : "Organization review is in progress";
}

function getReportNextSteps(
  report: AircraftDiscrepancyReport,
  aircraft: AircraftRecord | null,
  canManage: boolean
) {
  const steps: string[] = [];
  const fleetStatus = aircraft
    ? formatAircraftStatus(aircraft.operational_status)
    : "unavailable";
  const fleetGrounded = aircraft?.operational_status === "grounded";

  if (fleetGrounded) {
    steps.push(
      "This aircraft is grounded in Fleet & MX. Only an organization owner or administrator should return it to service after the discrepancy is resolved."
    );
  } else if (report.aircraft_down === true) {
    steps.push(
      `This report is marked Aircraft Down, but the current Fleet & MX status is ${fleetStatus}. Update Fleet & MX separately if the aircraft must not be dispatched.`
    );
  }

  if (report.status === "closed") {
    steps.push(
      "This report is closed. Closing a report does not change the aircraft's Fleet & MX operational status."
    );
    return steps;
  }

  if (!report.instructor_person_id) {
    steps.push(
      canManage
        ? "Assign an instructor if an instructor signature is required."
        : "An organization owner or administrator must assign an instructor before a signature can be collected."
    );
  } else if (!report.instructor_signed_at) {
    steps.push(
      `Waiting for ${report.instructor_name ?? "the assigned instructor"} to confirm the instructor signature.`
    );
  } else {
    steps.push("The instructor signature has been recorded.");
  }

  if (report.status === "submitted") {
    steps.push(
      canManage
        ? "Review the discrepancy, record the disposition fields, and move the report to In review."
        : "Waiting for an organization owner or administrator to review the discrepancy."
    );
  } else {
    steps.push(
      canManage
        ? "Finish the disposition, confirm any credit decision, and close the report when the record is complete."
        : "The organization is reviewing the discrepancy and will close the report when the record is complete."
    );
  }

  return steps;
}

function validateReportForm(form: ReportForm): ReportFormErrors {
  const errors: ReportFormErrors = {};
  const today = new Date().toISOString().slice(0, 10);

  if (!form.aircraftId) {
    errors.aircraftId = "Select the aircraft this report is about.";
  }
  if (!form.reportDate) {
    errors.reportDate = "Enter the report date.";
  } else if (
    !/^\d{4}-\d{2}-\d{2}$/.test(form.reportDate) ||
    Number.isNaN(new Date(`${form.reportDate}T00:00:00Z`).getTime())
  ) {
    errors.reportDate = "Enter a valid report date.";
  } else if (form.reportDate > today) {
    errors.reportDate = "The report date cannot be in the future.";
  }
  if (!form.description.trim()) {
    errors.description = "Describe what happened.";
  }

  const flightHobbsError = validateOptionalNonNegativeNumber(
    form.flightHobbsEnd
  );
  if (flightHobbsError) {
    errors.flightHobbsEnd = flightHobbsError;
  }
  const maintenanceHobbsError = validateOptionalNonNegativeNumber(
    form.maintenanceHobbsEnd
  );
  if (maintenanceHobbsError) {
    errors.maintenanceHobbsEnd = maintenanceHobbsError;
  }
  const flightDurationError = validateOptionalNonNegativeNumber(
    form.flightDuration
  );
  if (flightDurationError) {
    errors.flightDuration = flightDurationError;
  }

  return errors;
}

function validateOptionalNonNegativeNumber(value: string) {
  if (!value.trim()) return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0
    ? ""
    : "Enter zero or a positive number.";
}

function optionalNonNegativeNumber(value: string, label: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be a non-negative number.`);
  return parsed;
}

function formatNumber(value: number | null) {
  return value === null ? "—" : String(value);
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
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function getErrorMessage(value: unknown, fallback: string) {
  if (value instanceof Error && value.message) return value.message;
  if (typeof value === "object" && value && "message" in value) {
    return String((value as { message?: unknown }).message ?? fallback);
  }
  return fallback;
}
