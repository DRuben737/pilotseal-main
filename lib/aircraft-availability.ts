type OperationalAircraft = { id: string; operational_status?: string | null };

export function isAircraftAvailable(aircraft: { operational_status?: string | null } | null | undefined) {
  return Boolean(aircraft) && (!aircraft?.operational_status || aircraft.operational_status === "available");
}

// A saved copy must never override the operational status of the same aircraft.
export function filterAvailableAircraft<T extends OperationalAircraft>(aircraft: T[]): T[] {
  const unavailableIds = new Set(aircraft.filter((item) => !isAircraftAvailable(item)).map((item) => item.id));
  return aircraft.filter((item) => !unavailableIds.has(item.id));
}
