"use client";

import { useEffect, useState } from "react";

import type { AircraftModelRecord, AircraftRecord } from "@/lib/aircraft";
import {
  downloadInspectionFleetPdf,
  downloadWeightBalanceFleetPdf,
} from "@/lib/fleet-pdf";
import {
  fetchAircraftInspectionAssignments,
  type AircraftInspectionAssignment,
} from "@/lib/preflight";

type Props = {
  organizationId: string;
  organizationName: string;
  aircraft: AircraftRecord[];
  models: AircraftModelRecord[];
};

export default function FleetReportsPanel({
  organizationId,
  organizationName,
  aircraft,
  models,
}: Props) {
  const [assignments, setAssignments] = useState<AircraftInspectionAssignment[]>(
    []
  );
  const [loadingInspections, setLoadingInspections] = useState(true);
  const [loadingReport, setLoadingReport] = useState<
    "inspections" | "weight-balance" | null
  >(null);
  const [inspectionError, setInspectionError] = useState("");
  const [reportError, setReportError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadAssignments() {
      setLoadingInspections(true);
      setInspectionError("");
      try {
        const groups = await Promise.all(
          aircraft.map((item) =>
            fetchAircraftInspectionAssignments(item.id)
          )
        );
        if (!cancelled) setAssignments(groups.flat());
      } catch (nextError) {
        if (!cancelled) {
          setAssignments([]);
          setInspectionError(
            getErrorMessage(
              nextError,
              "Additional inspection records could not be loaded."
            )
          );
        }
      } finally {
        if (!cancelled) setLoadingInspections(false);
      }
    }

    void loadAssignments();
    return () => {
      cancelled = true;
    };
  }, [aircraft, organizationId]);

  async function downloadInspectionReport() {
    setLoadingReport("inspections");
    setReportError("");
    try {
      await downloadInspectionFleetPdf({
        organizationName,
        aircraft,
        models,
        assignments,
      });
    } catch (nextError) {
      setReportError(
        getErrorMessage(nextError, "The inspection PDF could not be created.")
      );
    } finally {
      setLoadingReport(null);
    }
  }

  async function downloadWeightBalanceReport() {
    setLoadingReport("weight-balance");
    setReportError("");
    try {
      await downloadWeightBalanceFleetPdf({
        organizationName,
        aircraft,
        models,
      });
    } catch (nextError) {
      setReportError(
        getErrorMessage(
          nextError,
          "The weight and balance PDF could not be created."
        )
      );
    } finally {
      setLoadingReport(null);
    }
  }

  return (
    <div className="grid gap-4">
      {inspectionError || reportError ? (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          role="alert"
        >
          {inspectionError || reportError}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <ReportCard
          title="Next inspections"
          description="Aircraft grouped by model with inspection dates, Hobbs limits, remaining time, and grounded or maintenance status."
          details={`${aircraft.length} aircraft · ${assignments.length} additional inspection ${
            assignments.length === 1 ? "item" : "items"
          }`}
          buttonLabel={
            loadingReport === "inspections"
              ? "Creating PDF..."
              : "Download inspection report"
          }
          disabled={
            aircraft.length === 0 ||
            loadingInspections ||
            loadingReport !== null ||
            Boolean(inspectionError)
          }
          onDownload={() => void downloadInspectionReport()}
        />
        <ReportCard
          title="Weight and balance records"
          description="Basic empty weight, longitudinal and lateral arms and moments, record date, and registration expiration."
          details={`${aircraft.length} aircraft · grouped by aircraft model`}
          buttonLabel={
            loadingReport === "weight-balance"
              ? "Creating PDF..."
              : "Download weight and balance records"
          }
          disabled={aircraft.length === 0 || loadingReport !== null}
          onDownload={() => void downloadWeightBalanceReport()}
        />
      </div>

      {aircraft.length === 0 ? (
        <p className="saas-empty-state">
          Add an aircraft before creating fleet reports.
        </p>
      ) : null}
      {loadingInspections ? (
        <p className="text-sm text-slate-600" role="status">
          Loading additional inspection records...
        </p>
      ) : null}
      <p className="text-xs text-slate-600">
        Reports use the current organization records and are formatted for
        landscape printing. Downloading a report does not change any aircraft
        data.
      </p>
    </div>
  );
}

function ReportCard({
  title,
  description,
  details,
  buttonLabel,
  disabled,
  onDownload,
}: {
  title: string;
  description: string;
  details: string;
  buttonLabel: string;
  disabled: boolean;
  onDownload: () => void;
}) {
  return (
    <article className="flex min-h-52 flex-col rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
      <h3 className="text-base font-semibold text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-700">{description}</p>
      <p className="mt-3 text-xs font-medium text-slate-600">{details}</p>
      <button
        className="secondary-button mt-auto cursor-pointer self-start"
        type="button"
        disabled={disabled}
        onClick={onDownload}
      >
        {buttonLabel}
      </button>
    </article>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return fallback;
}
