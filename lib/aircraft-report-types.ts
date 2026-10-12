export const AIRCRAFT_DISCREPANCY_TYPES = [
  "Wings", "Fuselage", "Main Rotor", "Tail Rotor", "Propeller",
  "Flight Controls", "Engine", "Fuel", "Landing Gear", "Electrical/Lighting",
  "Flight Instrument", "Hobbs", "Pitot Static", "Radio", "Navigation", "EFIS",
  "Transponder/ADS-B", "Auto Pilot",
] as const;

export type AircraftDiscrepancyType = (typeof AIRCRAFT_DISCREPANCY_TYPES)[number];
