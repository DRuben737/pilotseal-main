export const HUMAN_FACTOR_MODEL_VERSION = 2;

export const HUMAN_FACTOR_ROLES = [
  { id: "student", label: "Student / Pilot" },
  { id: "cfi", label: "CFI / Co-Pilot" },
];

export const HUMAN_FACTOR_FIELDS = [
  { id: "illness", label: "Illness", prompt: "Are symptoms affecting readiness to fly?", choices: ["No relevant symptoms", "Symptoms raise some concern", "Symptoms significantly affect readiness"] },
  { id: "medication", label: "Medication", prompt: "Could a medication affect alertness or performance?", choices: ["No medication concern", "Medication effects are uncertain", "Effects significantly affect readiness"] },
  { id: "stress", label: "Stress", prompt: "How much is pressure or distraction affecting focus?", choices: ["Focused without unusual pressure", "Some pressure or distraction", "Pressure significantly affects focus"] },
  { id: "alcohol", label: "Alcohol", prompt: "Is recent alcohol use or possible impairment a concern?", choices: ["No alcohol concern", "Recent use or readiness is uncertain", "Possible impairment or limit concern"] },
  { id: "fatigue", label: "Fatigue", prompt: "How rested and alert do you feel for this flight?", choices: ["Rested and alert", "Some tiredness or reduced alertness", "Fatigue significantly affects readiness"] },
  { id: "emotion", label: "Emotion", prompt: "Is your emotional state affecting judgment or attention?", choices: ["Emotionally ready", "Some emotional distraction", "Emotion significantly affects judgment"] },
];

export const HUMAN_FACTOR_CHOICES = [
  { value: 0, label: "No concern" },
  { value: 1, label: "Some concern" },
  { value: 2, label: "Significant concern" },
];

export function emptyHumanFactors() {
  return Object.fromEntries(
    HUMAN_FACTOR_ROLES.map(({ id }) => [
      id,
      Object.fromEntries(HUMAN_FACTOR_FIELDS.map((field) => [field.id, null])),
    ])
  );
}

export function normalizeHumanFactors(value) {
  const normalized = emptyHumanFactors();
  for (const role of HUMAN_FACTOR_ROLES) {
    for (const field of HUMAN_FACTOR_FIELDS) {
      const severity = value?.[role.id]?.[field.id];
      normalized[role.id][field.id] =
        severity === 0 || severity === 1 || severity === 2 ? severity : null;
    }
  }
  return normalized;
}

export function riskCategoryV2(total) {
  if (total === null || !Number.isFinite(total)) {
    return {
      level: "INCOMPLETE",
      color: "#64748b",
      recommendation: "Finish both IMSAFE assessments before relying on the total risk score.",
    };
  }
  if (total <= 12) {
    return {
      level: "LOW RISK",
      color: "#15803d",
      recommendation: "Review the risk drivers and mitigations before making a flight decision.",
    };
  }
  if (total <= 18) {
    return {
      level: "MITIGATION REQUIRED",
      color: "#b45309",
      recommendation: "Reduce the highest risks and discuss the plan before release.",
    };
  }
  return {
    level: "APPROVAL REQUIRED",
    color: "#b91c1c",
    recommendation: "Adjust the plan or seek the appropriate review before release.",
  };
}

export function scoreHumanFactors(value, nonHumanStaticScore = 0, dynamicScore = 0) {
  const answers = normalizeHumanFactors(value);
  const roles = {};
  const drivers = [];

  for (const role of HUMAN_FACTOR_ROLES) {
    const severities = HUMAN_FACTOR_FIELDS.map((field) => {
      const severity = answers[role.id][field.id];
      if (severity > 0) {
        drivers.push({ role: role.id, roleLabel: role.label, field: field.id, label: field.label, severity });
      }
      return severity;
    });
    const answered = severities.filter((severity) => severity !== null).length;
    roles[role.id] = {
      answered,
      affectedCount: severities.filter((severity) => severity > 0).length,
      score: answered === HUMAN_FACTOR_FIELDS.length
        ? severities.reduce((sum, severity) => sum + severity, 0)
        : null,
    };
  }

  drivers.sort((a, b) => b.severity - a.severity);
  const complete = HUMAN_FACTOR_ROLES.every((role) => roles[role.id].score !== null);
  const staticScore = complete
    ? nonHumanStaticScore + roles.student.score + roles.cfi.score
    : null;
  const totalRisk = complete ? staticScore + dynamicScore : null;

  return {
    answers,
    roles,
    drivers,
    complete,
    staticScore,
    totalRisk,
    category: riskCategoryV2(totalRisk),
  };
}

export function persistedHumanFactors(assessment) {
  return {
    version: HUMAN_FACTOR_MODEL_VERSION,
    student: assessment.answers.student,
    cfi: assessment.answers.cfi,
    studentScore: assessment.roles.student.score,
    cfiScore: assessment.roles.cfi.score,
  };
}

export function humanFactorReviewItems(assessment) {
  const items = [];
  if (assessment.roles.cfi.affectedCount > 2) {
    items.push("CFI IMSAFE concerns in more than 2 areas - NO FLIGHT until reviewed and reduced.");
  }
  for (const driver of assessment.drivers.filter((item) => item.severity === 2)) {
    items.push(`${driver.roleLabel}: significant ${driver.label.toLowerCase()} concern - pause and discuss before a flight decision.`);
  }
  return items;
}

export function humanFactorSnapshot(assessment, reviewItems = []) {
  return {
    riskModelVersion: HUMAN_FACTOR_MODEL_VERSION,
    humanFactors: persistedHumanFactors(assessment),
    humanFactorRiskItems: assessment.drivers.map((driver) => ({
      role: driver.role,
      factor: driver.field,
      severity: driver.severity,
    })),
    riskReviewItems: [...reviewItems],
  };
}

export function humanFactorReportLines(assessment) {
  return [
    `Student IMSAFE Score: ${assessment.roles.student.score ?? "Incomplete"}`,
    `CFI IMSAFE Score: ${assessment.roles.cfi.score ?? "Incomplete"}`,
    ...assessment.drivers.map((driver) =>
      `- ${driver.roleLabel}: ${driver.label} (${driver.severity === 2 ? "significant" : "some"} concern) [${driver.severity}]`
    ),
  ];
}

export function loadHumanFactorsForDraft(briefData) {
  const isCurrent = briefData?.riskModelVersion === HUMAN_FACTOR_MODEL_VERSION || briefData?.riskModelVersion === 3;
  return {
    answers: isCurrent ? normalizeHumanFactors(briefData.humanFactors) : emptyHumanFactors(),
    requiresReassessment: !isCurrent,
  };
}
