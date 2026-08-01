"use client";

import { useEffect, useState } from "react";

import { DetailDrawer } from "@/components/admin/AdminConsole";
import type { AircraftModelRecord, AircraftRecord } from "@/lib/aircraft";
import { formatUsDate, formatUsMonthYear } from "@/lib/date-format";
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
  const [inspectionError, setInspectionError] = useState("");
  const [previewType, setPreviewType] = useState<
    "inspections" | "weight-balance" | null
  >(null);

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

  return (
    <div className="grid gap-2">
      {inspectionError ? (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          role="alert"
        >
          {inspectionError}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <ReportCard
          title="Next inspections"
          details={`${aircraft.length} aircraft · ${assignments.length} extra items`}
          disabled={
            aircraft.length === 0 ||
            loadingInspections ||
            Boolean(inspectionError)
          }
          onOpen={() => setPreviewType("inspections")}
        />
        <ReportCard
          title="Weight and balance records"
          details={`${aircraft.length} aircraft`}
          disabled={aircraft.length === 0}
          onOpen={() => setPreviewType("weight-balance")}
        />
      </div>

      {aircraft.length === 0 ? (
        <p className="saas-empty-state">
          Add an aircraft before creating printable aircraft records.
        </p>
      ) : null}
      {loadingInspections ? (
        <p className="text-xs text-slate-600" role="status">Loading records...</p>
      ) : null}

      <DetailDrawer
        open={Boolean(previewType)}
        width="wide"
        title={previewType === "inspections" ? "Next inspections" : "Weight and balance records"}
        onClose={() => setPreviewType(null)}
      >
        <div className="grid gap-2">
          <div className="flex justify-end print:hidden">
            <button className="cursor-pointer rounded-md bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800" type="button" onClick={() => window.print()}>
              Print
            </button>
          </div>
          <FleetReportPreview
            type={previewType ?? "inspections"}
            organizationName={organizationName}
            aircraft={aircraft}
            models={models}
            assignments={assignments}
          />
        </div>
      </DetailDrawer>
    </div>
  );
}

function ReportCard({
  title,
  details,
  disabled,
  onOpen,
}: {
  title: string;
  details: string;
  disabled: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      className="group flex w-full cursor-pointer items-center gap-3 border-b border-slate-200 px-3 py-2.5 text-left last:border-b-0 hover:bg-blue-50/60 disabled:cursor-not-allowed disabled:opacity-50"
      type="button"
      disabled={disabled}
      onClick={onOpen}
    >
      <span aria-hidden="true" className="grid h-9 w-11 shrink-0 grid-cols-3 gap-px rounded border border-slate-300 bg-slate-200 p-1">
        {Array.from({ length: 9 }).map((_, index) => <span key={index} className={index < 3 ? "bg-blue-200" : "bg-white"} />)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        <span className="block text-xs text-slate-500">{details}</span>
      </span>
      <span className="text-xs font-semibold text-blue-700 group-hover:underline">Preview / print →</span>
    </button>
  );
}

function FleetReportPreview({
  type,
  organizationName,
  aircraft,
  models,
  assignments,
}: {
  type: "inspections" | "weight-balance";
  organizationName: string;
  aircraft: AircraftRecord[];
  models: AircraftModelRecord[];
  assignments: AircraftInspectionAssignment[];
}) {
  const modelNames = new Map(models.map((model) => [model.id, model.name]));
  return (
    <div className="fleet-report-print-preview overflow-x-auto rounded-lg border border-slate-300 bg-slate-200 p-2">
      <section className="mx-auto min-w-[820px] bg-white p-4 shadow-sm">
        <div className="border-2 border-slate-900 text-center">
          <h3 className="bg-slate-200 px-3 py-1.5 text-xl font-black tracking-tight text-slate-950">
            {type === "inspections" ? "MX - NEXT INSPECTIONS" : "WEIGHT & BALANCE RECORDS"}
          </h3>
          <div className="flex items-center justify-between border-t-2 border-slate-900 px-3 py-1 text-[10px] font-semibold">
            <span>{organizationName}</span>
            <span>{formatUsDate(new Date().toISOString())}</span>
          </div>
        </div>

        {type === "inspections" ? (
          <table className="mt-3 w-full border-collapse text-[10px]">
            <thead className="bg-blue-100">
              <tr>
                {["Tail", "Model", "100-hour", "Annual", "91.411", "91.413", "ELT", "Other", "Meter", "Status"].map((label) => (
                  <th key={label} className="border border-slate-800 px-1.5 py-1 text-left font-bold">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {aircraft.map((item) => {
                const other = assignments.find((assignment) => assignment.aircraft_id === item.id && assignment.is_active);
                return (
                  <tr key={item.id} className={item.operational_status === "grounded" ? "bg-rose-100" : ""}>
                    <td className="border border-slate-800 px-1.5 py-1 font-bold">{item.tail_number}</td>
                    <td className="border border-slate-800 px-1.5 py-1">{modelNames.get(item.model_id ?? "") ?? "Unknown"}</td>
                    <td className="border border-slate-800 px-1.5 py-1">{formatPreviewValue(item.hundred_hour_due_hours)}</td>
                    <td className="border border-slate-800 px-1.5 py-1">{formatPreviewDate(item.annual_due_date)}</td>
                    <td className="border border-slate-800 px-1.5 py-1">{formatPreviewDate(item.static_due_date)}</td>
                    <td className="border border-slate-800 px-1.5 py-1">{formatPreviewDate(item.transponder_due_date)}</td>
                    <td className="border border-slate-800 px-1.5 py-1">{formatPreviewDate(item.elt_due_date)}</td>
                    <td className="border border-slate-800 px-1.5 py-1">{other ? `${other.definition?.name ?? "Inspection"} ${formatPreviewDate(other.due_date)}` : "—"}</td>
                    <td className="border border-slate-800 px-1.5 py-1">{item.current_meter_type ? `${item.current_meter_type.toUpperCase()} ${formatPreviewValue(item.current_meter_value)}` : "—"}</td>
                    <td className="border border-slate-800 px-1.5 py-1 font-semibold">{formatPreviewStatus(item.operational_status)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className="mt-3 w-full border-collapse text-[10px]">
            <thead className="bg-amber-100">
              <tr>
                {["Tail", "Model", "BEW", "Long. arm", "Long. moment", "Lat. arm", "Lat. moment", "Registration"].map((label) => (
                  <th key={label} className="border border-slate-800 px-1.5 py-1 text-left font-bold">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {aircraft.map((item) => (
                <tr key={item.id}>
                  <td className="border border-slate-800 px-1.5 py-1 font-bold">{item.tail_number}</td>
                  <td className="border border-slate-800 px-1.5 py-1">{modelNames.get(item.model_id ?? "") ?? "Unknown"}</td>
                  <td className="border border-slate-800 px-1.5 py-1">{formatPreviewValue(item.empty_weight)}</td>
                  <td className="border border-slate-800 px-1.5 py-1">{formatPreviewValue(item.empty_arm)}</td>
                  <td className="border border-slate-800 px-1.5 py-1">{formatPreviewValue(multiply(item.empty_weight, item.empty_arm))}</td>
                  <td className="border border-slate-800 px-1.5 py-1">{formatPreviewValue(item.empty_lat_arm)}</td>
                  <td className="border border-slate-800 px-1.5 py-1">{formatPreviewValue(multiply(item.empty_weight, item.empty_lat_arm))}</td>
                  <td className="border border-slate-800 px-1.5 py-1">{formatPreviewDate(item.registration_due_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function multiply(left?: number | null, right?: number | null) {
  return typeof left === "number" && typeof right === "number" ? left * right : null;
}

function formatPreviewValue(value?: number | null) {
  return typeof value === "number"
    ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : "—";
}

function formatPreviewDate(value?: string | null) {
  return formatUsMonthYear(value);
}

function formatPreviewStatus(value?: AircraftRecord["operational_status"]) {
  return ({
    available: "Available",
    away: "Away",
    in_maintenance: "Maintenance",
    grounded: "Grounded",
  } as const)[value ?? "available"];
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return fallback;
}
