import type { AsrOption, AsrOptionCategory } from "./asr-reports";

const defaults: Record<AsrOptionCategory, readonly string[]> = {
  occurrence_type: ["Mechanical", "Training", "Weather", "A/C Documents", "Air Prox", "Precautionary Landing", "Other"],
  nature_of_flight: ["Training", "MX Check", "PAX", "Ferry", "Other"],
  phase_of_flight: ["Parked", "Start", "Taxi", "Hover", "Take-off", "Climb", "Cruise", "Descent", "Approach", "Landing", "Shutdown", "Maneuver Practice", "Other"],
  maneuver: ["Straight and Level", "Take-Off", "Landing", "Pattern/Circuit", "Hovering", "Autorotation", "Instrument Procedures", "Other"],
  training_area: ["Airport", "Other"],
  program: ["FAA", "EASA", "Other"],
  day_night: ["Day", "Evening Twilight", "Night"],
  flight_conditions: ["VMC", "IMC"],
  precipitation: ["Rain", "Snow", "Sleet", "Hail"],
  intensity: ["Light", "Moderate", "Severe"],
  external_agency: ["FAA", "NTSB", "EASA", "Manufacturer"],
};

export function asrOptionValues(options: AsrOption[], category: AsrOptionCategory): string[] {
  const configured = options
    .filter(option => option.category === category && option.is_active && option.value.trim())
    .map(option => option.value);
  // Preserve existing organization choices; a new/empty organization needs no setup.
  return [...new Set(configured.length ? configured : defaults[category])];
}

export function asrFieldOptions(options: string[], currentValue: string): string[] {
  return [...new Set(currentValue ? [currentValue, ...options] : options)];
}

export function asrOptionLabel(value: string): string {
  const labels: Record<string, string> = {
    "A/C Documents": "Aircraft documents",
    "Air Prox": "Aircraft proximity",
    "MX Check": "Maintenance check flight",
    PAX: "Passenger flight",
    "Wildlife Strike Rpt": "Wildlife strike report",
    NA: "Not applicable",
  };
  return Object.hasOwn(labels, value) ? labels[value] : value;
}
