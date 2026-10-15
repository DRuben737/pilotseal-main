type OperationalAircraft = { id: string; operational_status?: string | null };

export function isAircraftVisible(aircraft: { operational_status?: string | null } | null | undefined) {
  return Boolean(aircraft) && aircraft?.operational_status !== "away";
}

// A saved copy must never override the Away status of the same aircraft.
export function filterVisibleAircraft<T extends OperationalAircraft>(aircraft: T[]): T[] {
  const awayIds = new Set(aircraft.filter((item) => !isAircraftVisible(item)).map((item) => item.id));
  return aircraft.filter((item) => !awayIds.has(item.id));
}
