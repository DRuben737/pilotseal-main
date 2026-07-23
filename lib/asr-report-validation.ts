import type { AsrReportData } from "@/lib/asr-reports";

export type AsrRequiredField =
  | "occurrence_date"
  | "occurrence_local_time"
  | "type_of_occurrence"
  | "nature_of_flight"
  | "phase_of_flight"
  | "aircraft_commander_name"
  | "description"
  | "reporter_title"
  | "aircraft";

export type AsrFormErrors = Partial<Record<AsrRequiredField, string>>;

export function validateAsrDraft(data: AsrReportData): AsrFormErrors {
  const errors: AsrFormErrors = {};
  if (!data.occurrence_date) {
    errors.occurrence_date = "Enter the date when the event occurred.";
  }
  if (!data.occurrence_local_time) {
    errors.occurrence_local_time = "Enter the local time of the event.";
  }
  if (!data.type_of_occurrence.trim()) {
    errors.type_of_occurrence = "Select the type of occurrence.";
  }
  if (!data.nature_of_flight.trim()) {
    errors.nature_of_flight = "Select the nature of the flight.";
  }
  if (!data.phase_of_flight.trim()) {
    errors.phase_of_flight = "Select the phase of flight.";
  }
  if (!data.aircraft_commander_name.trim()) {
    errors.aircraft_commander_name =
      "Select a saved person or enter the name of the person in command.";
  }
  if (data.description.trim().length < 3) {
    errors.description = "Describe what happened using at least 3 characters.";
  }
  if (!data.reporter_title.trim()) {
    errors.reporter_title = "Enter your role or title.";
  }
  if (
    !data.no_aircraft &&
    !data.aircraft_id &&
    (!data.aircraft_registration.trim() || !data.aircraft_type.trim())
  ) {
    errors.aircraft =
      "Select an organization aircraft, enter its type and registration, or mark aircraft not applicable.";
  }
  return errors;
}
