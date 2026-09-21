import { FLIGHT_RISK_FACTORS, applicableFlightRiskFactors, isFlightNature } from "./flight-brief-risk-model.mjs";
import { HUMAN_FACTOR_FIELDS } from "./flight-brief-human-factors.mjs";

export const MANEUVER_FACTOR_IDS = [
  "dynamic-full-down-auto-heli", "dynamic-stalls-airplane",
  "dynamic-spins-airplane", "dynamic-single-engine-out-me",
];

export const PAVE_SECTIONS = [
  { id: "pilot", letter: "P", title: "Pilot", detail: "Experience, readiness and planned maneuvers" },
  { id: "aircraft", letter: "A", title: "Aircraft", detail: "Airworthiness, performance and fuel" },
  { id: "environment", letter: "V", title: "enVironment", detail: "Weather, visibility and airspace" },
  { id: "pressure", letter: "E", title: "External pressures", detail: "Schedule, expectations and evaluation pressure" },
];

export const RISK_SECTION_ORDER = [...PAVE_SECTIONS.map(({ id }) => id), "review"];

export function paveSectionForFactor(factor) {
  if (MANEUVER_FACTOR_IDS.includes(factor.id)) return "pilot";
  if (factor.id === "static-last-night-30") return "environment";
  if (factor.group === "mission") return "environment";
  return factor.group;
}

export function riskScoreBreakdown(flightAssessment, humanAssessment, otherLabel = "") {
  const sections = Object.fromEntries(PAVE_SECTIONS.map((section) => [section.id, 0]));
  const contributions = [];

  for (const factor of flightAssessment.factors) {
    if (factor.score <= 0) continue;
    const section = paveSectionForFactor(factor);
    sections[section] += factor.score;
    contributions.push({
      id: factor.id,
      section,
      label: factor.label,
      answer: factor.choices[factor.severity],
      severity: factor.severity,
      score: factor.score,
    });
  }

  for (const driver of humanAssessment.drivers) {
    const score = driver.severity;
    sections.pilot += score;
    contributions.push({
      id: `human-${driver.role}-${driver.field}`,
      section: "pilot",
      label: `${driver.roleLabel}: ${driver.label}`,
      answer: driver.severity === 2 ? "Significant concern" : "Some concern",
      severity: driver.severity,
      score,
    });
  }

  const additional = typeof flightAssessment.otherSeverity === "number"
    ? flightAssessment.otherSeverity * 2
    : 0;
  if (additional > 0) {
    contributions.push({
      id: "additional-risk",
      section: "additional",
      label: String(otherLabel || "Additional risk").trim(),
      answer: flightAssessment.otherSeverity === 2 ? "Significant concern" : "Some concern",
      severity: flightAssessment.otherSeverity,
      score: additional,
    });
  }

  contributions.sort((left, right) => right.score - left.score || right.severity - left.severity || left.label.localeCompare(right.label));
  const subtotal = Object.values(sections).reduce((sum, score) => sum + score, 0) + additional;
  return { sections, additional, contributions, total: flightAssessment.complete ? subtotal : null };
}

export function maneuverScreenAnswer(flightAnswers, flightNature, plannedManeuvers = false) {
  if (flightNature !== "dual_training") return "skip";
  const values = MANEUVER_FACTOR_IDS.map((id) => flightAnswers?.[id]);
  if (values.every((value) => value === 0)) return "none";
  if (plannedManeuvers || values.some((value) => value === 1 || value === 2)) return "planned";
  return null;
}

export function riskQuestions(flightNature, flightAnswers, plannedManeuvers = false) {
  if (!isFlightNature(flightNature)) return [];
  const factors = applicableFlightRiskFactors(flightNature);
  const screen = maneuverScreenAnswer(flightAnswers, flightNature, plannedManeuvers);
  const items = [];
  for (const section of PAVE_SECTIONS) {
    const sectionFactors = factors.filter((item) => paveSectionForFactor(item) === section.id && !MANEUVER_FACTOR_IDS.includes(item.id));
    if (section.id === "environment") sectionFactors.sort((a, b) =>
      (a.id === "dynamic-night-flight" ? -2 : a.id === "static-last-night-30" ? -1 : 0) -
      (b.id === "dynamic-night-flight" ? -2 : b.id === "static-last-night-30" ? -1 : 0)
    );
    for (const factor of sectionFactors) {
      if (factor.id === "static-last-night-30" && ![1, 2].includes(flightAnswers?.["dynamic-night-flight"])) continue;
      items.push({ key: `factor:${factor.id}`, section: section.id, type: "factor", factor });
    }
    if (section.id === "pilot") {
      for (const role of flightNature === "dual_training" ? ["student", "cfi"] : ["student"]) {
        for (const field of HUMAN_FACTOR_FIELDS) {
          items.push({ key: `human:${role}:${field.id}`, section: "pilot", type: "human", role, field });
        }
      }
      if (flightNature === "dual_training") {
        items.push({ key: "maneuver-screen", section: "pilot", type: "screen" });
        if (screen === "planned") {
          for (const id of MANEUVER_FACTOR_IDS) {
            const factor = factors.find((item) => item.id === id);
            if (factor) items.push({ key: `factor:${id}`, section: "pilot", type: "factor", factor });
          }
        }
      }
    }
  }
  return items;
}

export function isRiskQuestionAnswered(question, flightAnswers, humanAnswers, flightNature, plannedManeuvers = false) {
  if (question.type === "screen") return maneuverScreenAnswer(flightAnswers, flightNature, plannedManeuvers) !== null;
  if (question.type === "human") return [0, 1, 2].includes(humanAnswers?.[question.role]?.[question.field.id]);
  const answer = flightAnswers?.[question.factor.id];
  return [0, 1, 2].includes(answer) || (question.factor.id === "static-inspection-under-20" && answer === "na");
}

export function firstIncompleteRiskQuestion(flightAnswers, humanAnswers, flightNature, plannedManeuvers = false) {
  if (!isFlightNature(flightNature)) return "nature";
  return riskQuestions(flightNature, flightAnswers, plannedManeuvers).find((question) =>
    !isRiskQuestionAnswered(question, flightAnswers, humanAnswers, flightNature, plannedManeuvers)
  )?.key ?? "review";
}

export function firstIncompleteRiskSection(flightAnswers, humanAnswers, flightNature = "legacy", plannedManeuvers = false) {
  if (flightNature === "legacy") {
    return ["pilot", "human-student", "human-cfi", "aircraft", "environment", "mission", "pressure", "review"]
      .find((section) => !isRiskSectionComplete(section, flightAnswers, humanAnswers, flightNature)) ?? "review";
  }
  const key = firstIncompleteRiskQuestion(flightAnswers, humanAnswers, flightNature, plannedManeuvers);
  return key === "nature" || key === "review" ? key
    : riskQuestions(flightNature, flightAnswers, plannedManeuvers).find((item) => item.key === key)?.section ?? "review";
}

export function isRiskSectionComplete(section, flightAnswers, humanAnswers, flightNature = "legacy", plannedManeuvers = false) {
  if (section === "nature") return flightNature === "legacy" || isFlightNature(flightNature);
  if (section === "review") return false;
  if (section.startsWith("human-")) {
    const role = section.slice("human-".length);
    if (role === "cfi" && flightNature !== "dual_training" && flightNature !== "legacy") return true;
    return HUMAN_FACTOR_FIELDS.every((field) => [0, 1, 2].includes(humanAnswers?.[role]?.[field.id]));
  }
  if (flightNature === "legacy") {
    return FLIGHT_RISK_FACTORS.filter((factor) => factor.group === section).every((factor) =>
      [0, 1, 2, "na"].includes(flightAnswers?.[factor.id])
    );
  }
  const questions = riskQuestions(flightNature, flightAnswers, plannedManeuvers).filter((item) => item.section === section);
  return questions.length > 0 && questions.every((item) =>
    isRiskQuestionAnswered(item, flightAnswers, humanAnswers, flightNature, plannedManeuvers)
  );
}

export function advanceRiskSection(section, flightAnswers, humanAnswers, flightNature = "legacy", plannedManeuvers = false) {
  if (!isRiskSectionComplete(section, flightAnswers, humanAnswers, flightNature, plannedManeuvers)) return section;
  const order = flightNature === "legacy"
    ? ["pilot", "human-student", "human-cfi", "aircraft", "environment", "mission", "pressure", "review"]
    : RISK_SECTION_ORDER;
  const index = order.indexOf(section);
  return order.slice(index + 1).find((item) =>
    !isRiskSectionComplete(item, flightAnswers, humanAnswers, flightNature, plannedManeuvers)
  ) ?? "review";
}
