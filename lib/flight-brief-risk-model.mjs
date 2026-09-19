export const FLIGHT_RISK_MODEL_VERSION = 3;

// Product trial weights, not FAA-validated limits. The legacy point value is the
// middle concern weight; a significant concern receives twice that weight.
export const FLIGHT_RISK_FACTORS = [
  { id: "static-student-under-50-type", group: "pilot", label: "Student experience in this aircraft", weight: 1, choices: ["Experienced and current in type", "Under 50 hours in type, with a familiar plan", "Limited type experience and a demanding or unfamiliar plan"] },
  { id: "static-training-pre-solo", group: "pilot", label: "Pre-solo training", weight: 3, choices: ["Not a pre-solo lesson", "Pre-solo lesson with familiar exercises", "Pre-solo lesson with new or demanding exercises"] },
  { id: "static-cfi-under-100-instruction", group: "pilot", label: "Instructor experience", weight: 3, choices: ["Instructor has at least 100 hours given", "Under 100 hours given, familiar lesson", "Under 100 hours given with an unfamiliar or demanding lesson"] },
  { id: "static-last-dual-30", group: "pilot", label: "Recent dual flight", weight: 1, choices: ["Dual flight within 30 days", "More than 30 days; familiar maneuvers", "More than 30 days and unfamiliar or demanding maneuvers"] },
  { id: "static-last-night-30", group: "pilot", label: "Recent night flight", weight: 1, choices: ["Night-current or no night flight planned", "Over 30 days since night flight with a simple night plan", "Over 30 days since night flight with added complexity"] },
  { id: "static-solo-flight", group: "pilot", label: "Solo operation", weight: 2, choices: ["Dual flight planned", "Solo with familiar aircraft and route", "Solo with unfamiliar route or demanding conditions"] },
  { id: "static-last-solo-30", group: "pilot", label: "Recent solo flight", weight: 2, choices: ["Not solo, or solo flight within 30 days", "Solo after more than 30 days with familiar plan", "Solo after more than 30 days with added complexity"] },
  { id: "static-secondary-aircraft-type", group: "pilot", label: "Aircraft type familiarity this week", weight: 1, choices: ["Primary familiar type", "Secondary type flown this week", "Secondary type and unfamiliar procedures or conditions"] },
  { id: "static-first-different-cfi", group: "pilot", label: "Instructor pairing", weight: 1, choices: ["Established student–CFI pairing", "First flight with a different CFI, standard lesson", "First pairing with a demanding or nonstandard lesson"] },
  { id: "static-stage-check", group: "pressure", label: "Evaluation pressure", weight: 1, choices: ["Routine lesson or flight", "Stage check or checkride with manageable pressure", "Evaluation pressure is affecting preparation or judgment"] },
  { id: "static-prior-mx", group: "aircraft", label: "Recurring maintenance concern", weight: 1, critical: true, choices: ["No unresolved or recurring discrepancy", "Prior issue returned or could not be duplicated; status reviewed", "Issue remains uncertain or affects confidence in airworthiness"] },
  { id: "static-inspection-under-20", group: "aircraft", label: "Inspection margin", weight: 1, choices: ["More than 20 hours to required inspection", "Within 20 hours; flight and return margin checked", "Inspection margin or due status is uncertain"] },
  { id: "dynamic-dusk-ops", group: "environment", label: "Dusk / reduced visual cues", weight: 1, choices: ["Daylight with normal visual cues", "Dusk with familiar route and lighting", "Dusk with reduced cues or unfamiliar area"] },
  { id: "dynamic-svfr-dual", group: "environment", label: "Special VFR possibility", weight: 2, critical: true, choices: ["SVFR not anticipated", "SVFR may be considered in dual flight", "SVFR appears likely or alternatives are limited"] },
  { id: "dynamic-visibility-within-1sm", group: "environment", label: "Visibility margin", weight: 1, critical: true, choices: ["Comfortably above applicable minimums", "Within 1 SM of applicable minimums", "At/below minimums or trend could erase margin"] },
  { id: "dynamic-clouds-within-200", group: "environment", label: "Cloud clearance / ceiling margin", weight: 1, critical: true, choices: ["Comfortably above applicable minimums", "Within 200 ft of applicable minimums", "At/below minimums or trend could erase margin"] },
  { id: "dynamic-wind-gust-personal-min", group: "environment", label: "Wind and gust margin", weight: 2, critical: true, choices: ["Comfortably within personal and school limits", "Within 2 kt of the lower applicable limit", "At/over a limit or gust trend erodes margin"] },
  { id: "dynamic-high-da-gw", group: "aircraft", label: "Density altitude and gross weight", weight: 1, choices: ["Performance margin verified and comfortable", "High DA or weight reduces margin; calculation reviewed", "Performance margin is narrow or unverified"] },
  { id: "dynamic-frontal-passage", group: "environment", label: "Frontal passage", weight: 1, choices: ["No relevant front expected", "Front expected within 6 hours with alternatives", "Passage may affect flight and alternatives are limited"] },
  { id: "dynamic-deteriorating-wx", group: "environment", label: "Weather trend", weight: 2, critical: true, choices: ["Stable or improving conditions", "Deterioration possible; triggers and alternatives identified", "Deterioration likely or escape options unclear"] },
  { id: "dynamic-class-bc-solo", group: "mission", label: "Solo Class B/C airspace", weight: 1, choices: ["Not a solo Class B/C operation", "Solo Class B/C with familiar procedures", "Solo Class B/C with unfamiliar procedures or workload"] },
  { id: "dynamic-night-flight", group: "mission", label: "Night operation", weight: 1, choices: ["Day flight", "Night flight with familiar route and lighting", "Night flight with unfamiliar route or reduced visual cues"] },
  { id: "dynamic-fuel-90", group: "aircraft", label: "Fuel planning margin", weight: 2, critical: true, choices: ["Fuel plan leaves comfortable reserve", "Plan uses about 90% of usable fuel; alternate reviewed", "Reserve, burn, or fuel availability is uncertain"] },
  { id: "dynamic-other-cfis-cancel-wx", group: "environment", label: "Other weather decisions", weight: 2, choices: ["No relevant weather cancellation signal", "Other CFIs cancelled; differences in plan discussed", "Multiple cancellations and no clear reason this plan differs"] },
  { id: "dynamic-full-down-auto-heli", group: "mission", label: "Full-down autorotation", weight: 2, choices: ["Not planned", "Planned with briefed entry and recovery criteria", "Planned with conditions or recovery margin of concern"] },
  { id: "dynamic-stalls-airplane", group: "mission", label: "Stall training", weight: 2, choices: ["Not planned", "Planned with altitude and recovery briefed", "Planned with limited recovery margin or added complexity"] },
  { id: "dynamic-spins-airplane", group: "mission", label: "Spin training", weight: 2, choices: ["Not planned", "Planned with entry and recovery briefed", "Planned with limited recovery margin or added complexity"] },
  { id: "dynamic-single-engine-out-me", group: "mission", label: "Multi-engine single-engine training", weight: 2, choices: ["Not planned", "Planned with recovery criteria briefed", "Planned with limited performance or recovery margin"] },
];

export const FLIGHT_RISK_GROUPS = [
  { id: "pilot", label: "Pilot & proficiency" },
  { id: "aircraft", label: "Aircraft & performance" },
  { id: "environment", label: "Weather & environment" },
  { id: "mission", label: "Mission & maneuvers" },
  { id: "pressure", label: "External pressure" },
];

export function emptyFlightRiskAnswers() {
  return Object.fromEntries(FLIGHT_RISK_FACTORS.map((factor) => [factor.id, null]));
}

export function normalizeFlightRiskAnswers(value) {
  return Object.fromEntries(FLIGHT_RISK_FACTORS.map((factor) => {
    const answer = value?.[factor.id];
    return [factor.id, answer === 0 || answer === 1 || answer === 2 || answer === "na" ? answer : null];
  }));
}

export function flightRiskCategory(total) {
  if (total === null || !Number.isFinite(total)) return { level: "INCOMPLETE", color: "#64748b", recommendation: "Complete every applicable factor before relying on the total score." };
  if (total <= 12) return { level: "LOW RISK", color: "#15803d", recommendation: "Review risk drivers and mitigations before deciding to fly." };
  if (total <= 24) return { level: "MITIGATION REQUIRED", color: "#b45309", recommendation: "Reduce the highest risks and discuss the plan before release." };
  return { level: "FURTHER REVIEW", color: "#b91c1c", recommendation: "Adjust the plan or seek appropriate review before release." };
}

export function scoreFlightRisk(answersValue, humanAssessment, other = {}) {
  const answers = normalizeFlightRiskAnswers(answersValue);
  const factors = FLIGHT_RISK_FACTORS.map((factor) => {
    const severity = answers[factor.id];
    return { ...factor, severity, score: typeof severity === "number" ? severity * factor.weight : 0 };
  });
  const otherSeverity = other.label?.trim() ? other.severity : "na";
  const otherValid = otherSeverity === "na" || otherSeverity === 0 || otherSeverity === 1 || otherSeverity === 2;
  const complete = humanAssessment.complete && factors.every((factor) => factor.severity !== null) && otherValid;
  const staticScore = complete ? humanAssessment.roles.student.score + humanAssessment.roles.cfi.score + factors.filter((factor) => factor.id.startsWith("static-")).reduce((sum, factor) => sum + factor.score, 0) : null;
  const dynamicScore = complete ? factors.filter((factor) => factor.id.startsWith("dynamic-")).reduce((sum, factor) => sum + factor.score, 0) + (typeof otherSeverity === "number" ? otherSeverity * 2 : 0) : null;
  const totalRisk = complete ? staticScore + dynamicScore : null;
  const drivers = factors.filter((factor) => factor.score > 0).sort((a, b) => b.score - a.score || b.severity - a.severity);
  const significant = factors.filter((factor) => factor.severity === 2);
  return { answers, factors, drivers, significant, answered: factors.filter((factor) => factor.severity !== null).length, complete, staticScore, dynamicScore, totalRisk, category: flightRiskCategory(totalRisk), otherSeverity };
}

export function flightRiskSnapshot(assessment) {
  return {
    riskModelVersion: FLIGHT_RISK_MODEL_VERSION,
    flightRiskAnswers: assessment.answers,
    flightRiskDrivers: assessment.drivers.map((factor) => ({ id: factor.id, severity: factor.severity, score: factor.score })),
  };
}
