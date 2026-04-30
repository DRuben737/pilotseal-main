export function getFlightCategory(visibilitySm, ceilingFt) {
  if (Number.isFinite(visibilitySm) && Number.isFinite(ceilingFt)) {
    if (visibilitySm >= 5 && ceilingFt >= 3000) return "VFR";
    if (visibilitySm >= 3 && ceilingFt >= 1000) return "MVFR";
    if (visibilitySm >= 1 && ceilingFt >= 500) return "IFR";
    return "LIFR";
  }

  if (Number.isFinite(visibilitySm)) {
    if (visibilitySm >= 5) return "VFR";
    if (visibilitySm >= 3) return "MVFR";
    if (visibilitySm >= 1) return "IFR";
    return "LIFR";
  }

  if (Number.isFinite(ceilingFt)) {
    if (ceilingFt >= 3000) return "VFR";
    if (ceilingFt >= 1000) return "MVFR";
    if (ceilingFt >= 500) return "IFR";
    return "LIFR";
  }

  return null;
}

export function compareFlightCategory(a, b) {
  const rank = {
    VFR: 0,
    MVFR: 1,
    IFR: 2,
    LIFR: 3,
  };

  return (rank[b] ?? -1) - (rank[a] ?? -1);
}
