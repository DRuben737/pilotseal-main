export const FLIGHT_RISK_MODEL_VERSION = 5;

export const FLIGHT_NATURES = [
  { id: "dual_training", label: "Dual training" },
  { id: "solo", label: "Solo flight" },
  { id: "passenger", label: "Flight with passengers" },
];

export function isFlightNature(value) {
  return FLIGHT_NATURES.some((nature) => nature.id === value);
}

// Product trial weights, not FAA-validated limits. The legacy point value is the
// middle concern weight; a significant concern receives twice that weight.
const BASE_FLIGHT_RISK_FACTORS = [
  { id: "static-student-under-50-type", group: "pilot", label: "Pilot experience in this aircraft", weight: 1, choices: ["Experienced and current in type", "Under 50 hours in type, with a familiar plan", "Limited type experience and a demanding or unfamiliar plan"] },
  { id: "static-training-pre-solo", group: "pilot", natures: ["dual_training"], label: "Pre-solo training", weight: 3, choices: ["Not a pre-solo lesson", "Pre-solo lesson with familiar exercises", "Pre-solo lesson with new or demanding exercises"] },
  { id: "static-cfi-under-100-instruction", group: "pilot", natures: ["dual_training"], label: "Instructor experience", weight: 3, choices: ["Instructor has at least 100 hours given", "Under 100 hours given, familiar lesson", "Under 100 hours given with an unfamiliar or demanding lesson"] },
  { id: "static-last-dual-30", group: "pilot", natures: ["dual_training"], label: "Recent dual flight", weight: 1, choices: ["Dual flight within 30 days", "More than 30 days; familiar maneuvers", "More than 30 days and unfamiliar or demanding maneuvers"] },
  { id: "static-last-night-30", group: "pilot", label: "Recent night flight", weight: 1, choices: ["Night-current or no night flight planned", "Over 30 days since night flight with a simple night plan", "Over 30 days since night flight with added complexity"] },
  { id: "static-solo-flight", group: "pilot", natures: ["solo"], label: "Solo operation", weight: 2, choices: ["Familiar aircraft and route", "Solo with some new elements", "Unfamiliar route or demanding conditions"] },
  { id: "static-last-solo-30", group: "pilot", natures: ["solo"], label: "Recent solo flight", weight: 2, choices: ["Solo flight within 30 days", "More than 30 days with familiar plan", "More than 30 days with added complexity"] },
  { id: "static-secondary-aircraft-type", group: "pilot", label: "Aircraft type familiarity this week", weight: 1, choices: ["Primary familiar type", "Secondary type flown this week", "Secondary type and unfamiliar procedures or conditions"] },
  { id: "static-first-different-cfi", group: "pilot", natures: ["dual_training"], label: "Instructor pairing", weight: 1, choices: ["Established student–CFI pairing", "First flight with a different CFI, standard lesson", "First pairing with a demanding or nonstandard lesson"] },
  { id: "static-stage-check", group: "pressure", natures: ["dual_training"], label: "Evaluation pressure", weight: 1, choices: ["Routine lesson or flight", "Stage check or checkride with manageable pressure", "Evaluation pressure is affecting preparation or judgment"] },
  { id: "dynamic-schedule-pressure", group: "pressure", label: "Schedule or destination pressure", weight: 1, choices: ["No schedule pressure to complete the flight", "Time pressure exists; delay or cancel options discussed", "Pressure to complete the flight may affect judgment"] },
  { id: "dynamic-passenger-pressure", group: "pressure", natures: ["passenger"], label: "Passenger expectations", weight: 1, choices: ["Passengers accept changes or cancellation", "Passenger plans create some pressure; alternatives discussed", "Passenger expectations may influence the flight decision"] },
  { id: "static-prior-mx", group: "aircraft", label: "Recurring maintenance concern", weight: 1, critical: true, choices: ["No unresolved or recurring discrepancy", "Prior issue returned or could not be duplicated; status reviewed", "Issue remains uncertain or affects confidence in airworthiness"] },
  { id: "static-inspection-under-20", group: "aircraft", label: "Inspection margin", weight: 1, choices: ["More than 20 hours to required inspection", "Within 20 hours; flight and return margin checked", "Inspection margin or due status is uncertain"] },
  { id: "dynamic-dusk-ops", group: "environment", label: "Dusk / reduced visual cues", weight: 1, choices: ["Daylight with normal visual cues", "Dusk with familiar route and lighting", "Dusk with reduced cues or unfamiliar area"] },
  { id: "dynamic-svfr-dual", group: "environment", label: "Special VFR possibility", weight: 2, critical: true, choices: ["SVFR not anticipated", "SVFR may be considered with clear alternatives", "SVFR appears likely or alternatives are limited"] },
  { id: "dynamic-visibility-within-1sm", group: "environment", label: "Visibility margin", weight: 1, critical: true, choices: ["Comfortably above applicable minimums", "Within 1 SM of applicable minimums", "At/below minimums or trend could erase margin"] },
  { id: "dynamic-clouds-within-200", group: "environment", label: "Cloud clearance / ceiling margin", weight: 1, critical: true, choices: ["Comfortably above applicable minimums", "Within 200 ft of applicable minimums", "At/below minimums or trend could erase margin"] },
  { id: "dynamic-wind-gust-personal-min", group: "environment", label: "Wind and gust margin", weight: 2, critical: true, choices: ["Comfortably within personal and school limits", "Within 2 kt of the lower applicable limit", "At/over a limit or gust trend erodes margin"] },
  { id: "dynamic-high-da-gw", group: "aircraft", label: "Density altitude and gross weight", weight: 1, choices: ["Performance margin verified and comfortable", "High DA or weight reduces margin; calculation reviewed", "Performance margin is narrow or unverified"] },
  { id: "dynamic-frontal-passage", group: "environment", label: "Frontal passage", weight: 1, choices: ["No relevant front expected", "Front expected within 6 hours with alternatives", "Passage may affect flight and alternatives are limited"] },
  { id: "dynamic-deteriorating-wx", group: "environment", label: "Weather trend", weight: 2, critical: true, choices: ["Stable or improving conditions", "Deterioration possible; triggers and alternatives identified", "Deterioration likely or escape options unclear"] },
  { id: "dynamic-class-bc-solo", group: "mission", natures: ["solo"], label: "Solo Class B/C airspace", weight: 1, choices: ["No Class B/C operation planned", "Solo Class B/C with familiar procedures", "Solo Class B/C with unfamiliar procedures or workload"] },
  { id: "dynamic-night-flight", group: "mission", label: "Night operation", weight: 1, choices: ["Day flight", "Night flight with familiar route and lighting", "Night flight with unfamiliar route or reduced visual cues"] },
  { id: "dynamic-fuel-90", group: "aircraft", label: "Fuel planning margin", weight: 2, critical: true, choices: ["Fuel plan leaves comfortable reserve", "Plan uses about 90% of usable fuel; alternate reviewed", "Reserve, burn, or fuel availability is uncertain"] },
  { id: "dynamic-other-cfis-cancel-wx", group: "environment", natures: ["dual_training"], label: "Other weather decisions", weight: 2, choices: ["No relevant weather cancellation signal", "Other CFIs cancelled; differences in plan discussed", "Multiple cancellations and no clear reason this plan differs"] },
  { id: "dynamic-full-down-auto-heli", group: "mission", natures: ["dual_training"], label: "Full-down autorotation", weight: 2, choices: ["Not planned", "Planned with briefed entry and recovery criteria", "Planned with conditions or recovery margin of concern"] },
  { id: "dynamic-stalls-airplane", group: "mission", natures: ["dual_training"], label: "Stall training", weight: 2, choices: ["Not planned", "Planned with altitude and recovery briefed", "Planned with limited recovery margin or added complexity"] },
  { id: "dynamic-spins-airplane", group: "mission", natures: ["dual_training"], label: "Spin training", weight: 2, choices: ["Not planned", "Planned with entry and recovery briefed", "Planned with limited recovery margin or added complexity"] },
  { id: "dynamic-single-engine-out-me", group: "mission", natures: ["dual_training"], label: "Multi-engine single-engine training", weight: 2, choices: ["Not planned", "Planned with recovery criteria briefed", "Planned with limited performance or recovery margin"] },
];

const FACTOR_COPY = {
  "static-student-under-50-type": {
    prompt: "How familiar is this aircraft?",
    choices: ["Familiar and recently flown", "Under 50 hours; familiar route and exercises", "Limited experience; unfamiliar route or exercises"],
  },
  "static-training-pre-solo": {
    prompt: "Pre-solo lesson?",
    choices: ["No", "Yes; familiar exercises", "Yes; new or demanding exercises"],
  },
  "static-cfi-under-100-instruction": {
    prompt: "Instructor's teaching experience?",
    choices: ["100+ hours given", "Under 100 hours; familiar lesson", "Under 100 hours; new or demanding lesson"],
  },
  "static-last-dual-30": {
    prompt: "Last flight with an instructor?",
    choices: ["Within 30 days", "Over 30 days; familiar exercises", "Over 30 days; new or demanding exercises"],
  },
  "static-last-night-30": {
    prompt: "Last night flight?",
    choices: ["Within 30 days", "Over 30 days; familiar route and airports", "Over 30 days; unfamiliar route or conditions"],
  },
  "static-solo-flight": {
    label: "Solo route and conditions",
    prompt: "How familiar is this solo flight?",
    choices: ["Familiar aircraft, route and conditions", "Some new elements", "Unfamiliar route or demanding conditions"],
  },
  "static-last-solo-30": {
    prompt: "Last solo flight?",
    choices: ["Within 30 days", "Over 30 days; familiar route and aircraft", "Over 30 days; added difficulty"],
  },
  "static-secondary-aircraft-type": {
    prompt: "Aircraft type this week?",
    choices: ["My regular type", "Second type flown this week", "Type or procedures unfamiliar this week"],
  },
  "static-first-different-cfi": {
    prompt: "Flown with this instructor before?",
    choices: ["Yes", "No; familiar lesson", "No; new or demanding lesson"],
  },
  "static-stage-check": {
    prompt: "Evaluation pressure today?",
    choices: ["None", "Checkride or stage check; prepared", "Pressure affects preparation or judgment"],
  },
  "dynamic-schedule-pressure": {
    prompt: "Pressure to stay on schedule?",
    choices: ["No pressure", "Some; alternatives discussed", "May affect the flight decision"],
  },
  "dynamic-passenger-pressure": {
    prompt: "Passenger pressure?",
    choices: ["They accept changes or cancellation", "Some; alternatives discussed", "May affect the flight decision"],
  },
  "static-prior-mx": {
    prompt: "Recurring aircraft issue?",
    choices: ["None known", "Returned or unconfirmed; reviewed", "Airworthiness remains uncertain"],
  },
  "static-inspection-under-20": {
    prompt: "Hours to required inspection?",
    choices: ["Over 20 hours", "Within 20 hours; return margin checked", "Due status or margin unclear"],
  },
  "dynamic-dusk-ops": {
    prompt: "Reduced light at dusk?",
    choices: ["Daylight; normal visual cues", "Dusk; familiar route and lighting", "Dusk; reduced cues or unfamiliar area"],
  },
  "dynamic-svfr-dual": {
    prompt: "Special VFR possible?",
    choices: ["Not expected", "Possible; clear alternatives", "Likely or few alternatives"],
  },
  "dynamic-visibility-within-1sm": {
    prompt: "Visibility margin?",
    choices: ["Well above minimums", "Within 1 SM of minimums", "At or below minimums, or worsening"],
  },
  "dynamic-clouds-within-200": {
    prompt: "Ceiling and cloud margin?",
    choices: ["Well above minimums", "Within 200 ft of minimums", "At or below minimums, or worsening"],
  },
  "dynamic-wind-gust-personal-min": {
    prompt: "Wind and gust margin?",
    choices: ["Well within personal and school limits", "Within 2 kt of the lower limit", "At or above a limit, or worsening"],
  },
  "dynamic-high-da-gw": {
    prompt: "Aircraft performance margin?",
    choices: ["Calculated; comfortable", "Reduced by density altitude or weight; checked", "Narrow or unverified"],
  },
  "dynamic-frontal-passage": {
    prompt: "Weather front affecting the flight?",
    choices: ["No relevant front", "Within 6 hours; alternatives ready", "May affect flight; few alternatives"],
  },
  "dynamic-deteriorating-wx": {
    prompt: "Weather trend?",
    choices: ["Stable or improving", "May worsen; change triggers set", "Likely to worsen or no clear escape"],
  },
  "dynamic-class-bc-solo": {
    prompt: "Solo in Class B or C?",
    choices: ["Not planned", "Planned; familiar procedures", "Planned; unfamiliar procedures or workload"],
  },
  "dynamic-night-flight": {
    prompt: "Night flying?",
    choices: ["Not planned", "Familiar route and lighting", "Unfamiliar route or reduced visual cues"],
  },
  "dynamic-fuel-90": {
    prompt: "Fuel reserve?",
    choices: ["Comfortable reserve", "About 90% of usable fuel; alternate checked", "Burn, reserve or availability uncertain"],
  },
  "dynamic-other-cfis-cancel-wx": {
    prompt: "Other CFIs cancel for weather?",
    choices: ["No relevant cancellations", "Yes; differences discussed", "Several; no clear difference"],
  },
  "dynamic-full-down-auto-heli": {
    prompt: "Full-down autorotation?",
    choices: ["Not planned", "Planned; entry and recovery briefed", "Planned; conditions or recovery concern"],
  },
  "dynamic-stalls-airplane": {
    prompt: "Stall training?",
    choices: ["Not planned", "Planned; altitude and recovery briefed", "Planned; limited recovery margin or added workload"],
  },
  "dynamic-spins-airplane": {
    prompt: "Spin training?",
    choices: ["Not planned", "Planned; entry and recovery briefed", "Planned; limited recovery margin or added workload"],
  },
  "dynamic-single-engine-out-me": {
    prompt: "Multi-engine, one-engine training?",
    choices: ["Not planned", "Planned; recovery briefed", "Planned; limited performance or recovery margin"],
  },
};

export const FLIGHT_RISK_FACTORS = BASE_FLIGHT_RISK_FACTORS.map((factor) => ({
  ...factor,
  ...FACTOR_COPY[factor.id],
}));

export const FLIGHT_RISK_GROUPS = [
  { id: "pilot", label: "Pilot & proficiency" },
  { id: "aircraft", label: "Aircraft & performance" },
  { id: "environment", label: "Weather & environment" },
  { id: "mission", label: "Mission & maneuvers" },
  { id: "pressure", label: "External pressure" },
];

export function applicableFlightRiskFactors(flightNature) {
  if (flightNature === "legacy") return FLIGHT_RISK_FACTORS;
  if (!isFlightNature(flightNature)) return [];
  return FLIGHT_RISK_FACTORS.filter((factor) => !factor.natures || factor.natures.includes(flightNature));
}

export function answersForFlightNature(answersValue, flightNature) {
  const normalized = normalizeFlightRiskAnswers(answersValue);
  const applicableIds = new Set(applicableFlightRiskFactors(flightNature).map((factor) => factor.id));
  return Object.fromEntries(FLIGHT_RISK_FACTORS.map((factor) => [
    factor.id,
    applicableIds.has(factor.id)
      ? normalized[factor.id] === "na" && factor.id !== "static-inspection-under-20" ? null : normalized[factor.id]
      : null,
  ]));
}

export function loadFlightRiskAnswersForDraft(briefData) {
  const version = Number(briefData?.riskModelVersion ?? 0);
  if (version < 3) return { answers: emptyFlightRiskAnswers(), requiresReassessment: true };
  const answers = answersForFlightNature(briefData.flightRiskAnswers, briefData.flightNature);
  if (answers["dynamic-night-flight"] === 0) answers["static-last-night-30"] = 0;
  const removedGenericNa = applicableFlightRiskFactors(briefData.flightNature).some((factor) =>
    factor.id !== "static-inspection-under-20" && briefData.flightRiskAnswers?.[factor.id] === "na"
  );
  return { answers, requiresReassessment: version !== FLIGHT_RISK_MODEL_VERSION || removedGenericNa };
}

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
  if (total === null || !Number.isFinite(total)) return { level: "INCOMPLETE", color: "#64748b", recommendation: "Complete every applicable factor before relying on the risk level." };
  if (total <= 12) return { level: "LOW RISK", color: "#15803d", recommendation: "Review risk drivers and mitigations before deciding to fly." };
  if (total <= 24) return { level: "MITIGATION REQUIRED", color: "#b45309", recommendation: "Reduce the highest risks and discuss the plan before release." };
  return { level: "FURTHER REVIEW", color: "#b91c1c", recommendation: "Adjust the plan or seek appropriate review before release." };
}

export function scoreFlightRisk(answersValue, humanAssessment, other = {}, flightNature = "legacy") {
  const activeFactors = applicableFlightRiskFactors(flightNature);
  const applicableIds = new Set(activeFactors.map((factor) => factor.id));
  const normalizedAnswers = normalizeFlightRiskAnswers(answersValue);
  const answers = Object.fromEntries(FLIGHT_RISK_FACTORS.map((factor) => [factor.id, applicableIds.has(factor.id) ? normalizedAnswers[factor.id] : "na"]));
  const factors = activeFactors.map((factor) => {
    const severity = answers[factor.id];
    return { ...factor, severity, score: typeof severity === "number" ? severity * factor.weight : 0 };
  });
  const otherSeverity = other.label?.trim() ? other.severity : "na";
  const otherValid = otherSeverity === "na" || otherSeverity === 0 || otherSeverity === 1 || otherSeverity === 2;
  const complete = (flightNature === "legacy" || isFlightNature(flightNature)) && humanAssessment.complete && factors.every((factor) =>
    [0, 1, 2].includes(factor.severity) ||
    (factor.severity === "na" && (flightNature === "legacy" || factor.id === "static-inspection-under-20"))
  ) && otherValid;
  const staticScore = complete ? (humanAssessment.roles.student.score ?? 0) + (humanAssessment.roles.cfi.score ?? 0) + factors.filter((factor) => factor.id.startsWith("static-")).reduce((sum, factor) => sum + factor.score, 0) : null;
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
