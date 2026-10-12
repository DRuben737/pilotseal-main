import { AIRCRAFT_DISCREPANCY_TYPES, type AircraftDiscrepancyType } from "./aircraft-report-types";
import { parseUsDate } from "./date-format";

export type AircraftReportForm = {
  aircraftId: string;
  foundByPersonId: string;
  reportDate: string;
  studentPersonId: string;
  instructorPersonId: string;
  flightHobbsEnd: string;
  maintenanceHobbsEnd: string;
  flightDuration: string;
  discrepancyType: AircraftDiscrepancyType | "";
  description: string;
};

export type AircraftReportFormErrors = Partial<Record<keyof AircraftReportForm, string>>;

export function localReportDate(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

export function emptyAircraftReportForm(): AircraftReportForm {
  return {
    aircraftId: "", foundByPersonId: "", reportDate: localReportDate(),
    studentPersonId: "", instructorPersonId: "", flightHobbsEnd: "",
    maintenanceHobbsEnd: "", flightDuration: "", discrepancyType: "", description: "",
  };
}

export function optionalReportNumber(value: string) {
  if (!value.trim()) return null;
  if (!/^\d+(?:\.\d+)?$/.test(value.trim())) throw new Error("Enter zero or a positive decimal number.");
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("Enter a valid number.");
  return parsed;
}

export function validateAircraftReportForm(
  form: AircraftReportForm,
  aircraftIds: readonly string[],
  peopleIds: readonly string[],
  today = localReportDate(),
): AircraftReportFormErrors {
  const errors: AircraftReportFormErrors = {};
  if (!aircraftIds.includes(form.aircraftId)) errors.aircraftId = "Select an aircraft.";
  if (!peopleIds.includes(form.foundByPersonId)) errors.foundByPersonId = "Select who found the issue.";
  if (!AIRCRAFT_DISCREPANCY_TYPES.some(type => type === form.discrepancyType)) errors.discrepancyType = "Select an affected area.";
  const match = form.reportDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match || parseUsDate(`${match[2]}/${match[3]}/${match[1]}`) !== form.reportDate) {
    errors.reportDate = "Enter a valid report date.";
  } else if (form.reportDate > today) errors.reportDate = "The report date cannot be in the future.";
  const length = form.description.trim().length;
  if (length < 3 || length > 5000) errors.description = "Enter a description between 3 and 5000 characters.";
  for (const key of ["flightHobbsEnd", "maintenanceHobbsEnd", "flightDuration"] as const) {
    try { optionalReportNumber(form[key]); } catch (error) { errors[key] = (error as Error).message; }
  }
  return errors;
}
