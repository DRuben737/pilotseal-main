export const HUMAN_FACTOR_MODEL_VERSION = 2;

export const HUMAN_FACTOR_ROLES = [
  { id: "student", label: "Student / Pilot" },
  { id: "cfi", label: "CFI / Co-Pilot" },
];

export const HUMAN_FACTOR_FIELDS = [
  { id: "illness", label: "Illness", prompt: "Feeling well enough to fly?", choices: ["Feeling well", "Symptoms or unsure", "Symptoms affect flying"] },
  { id: "medication", label: "Medication", prompt: "Medication effects?", choices: ["No effect concerns me", "Unsure about effects", "Effects reduce alertness or performance"] },
  { id: "stress", label: "Stress", prompt: "Able to focus?", choices: ["Focused", "Some stress or distraction", "Stress affects focus or judgment"] },
  { id: "alcohol", label: "Alcohol", prompt: "Alcohol concern?", choices: ["No recent-use concern", "Unsure I'm ready", "Possible impairment"] },
  { id: "fatigue", label: "Fatigue", prompt: "How alert are you?", choices: ["Rested and alert", "Somewhat tired", "Fatigue affects flying"] },
  { id: "emotion", label: "Emotion", prompt: "Mood affecting focus?", choices: ["No distraction", "Some distraction", "Mood affects focus or judgment"] },
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
      recommendation: "Finish both IMSAFE assessments before relying on the risk level.",
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

export function scoreHumanFactors(value, nonHumanStaticScore = 0, dynamicScore = 0, options = {}) {
  const answers = normalizeHumanFactors(value);
  const activeRoles = options.activeRoles ?? HUMAN_FACTOR_ROLES.map((role) => role.id);
  const effectiveAnswers = Object.fromEntries(HUMAN_FACTOR_ROLES.map((role) => [
    role.id,
    activeRoles.includes(role.id) ? answers[role.id] : Object.fromEntries(HUMAN_FACTOR_FIELDS.map((field) => [field.id, null])),
  ]));
  const roles = {};
  const drivers = [];

  for (const role of HUMAN_FACTOR_ROLES) {
    const active = activeRoles.includes(role.id);
    const severities = HUMAN_FACTOR_FIELDS.map((field) => {
      const severity = effectiveAnswers[role.id][field.id];
      if (severity > 0) {
        drivers.push({ role: role.id, roleLabel: options.roleLabels?.[role.id] ?? role.label, field: field.id, label: field.label, severity });
      }
      return severity;
    });
    const answered = severities.filter((severity) => severity !== null).length;
    roles[role.id] = {
      active,
      label: options.roleLabels?.[role.id] ?? role.label,
      answered,
      affectedCount: severities.filter((severity) => severity > 0).length,
      score: active && answered === HUMAN_FACTOR_FIELDS.length
        ? severities.reduce((sum, severity) => sum + severity, 0)
        : null,
    };
  }

  drivers.sort((a, b) => b.severity - a.severity);
  const complete = HUMAN_FACTOR_ROLES.every((role) => !roles[role.id].active || roles[role.id].score !== null);
  const staticScore = complete
    ? nonHumanStaticScore + HUMAN_FACTOR_ROLES.reduce((sum, role) => sum + (roles[role.id].score ?? 0), 0)
    : null;
  const totalRisk = complete ? staticScore + dynamicScore : null;

  return {
    answers: effectiveAnswers,
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
    student: assessment.roles.student.active ? assessment.answers.student : null,
    cfi: assessment.roles.cfi.active ? assessment.answers.cfi : null,
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
    `${assessment.roles.student.label === "Pilot" ? "Pilot" : "Student"} IMSAFE: ${assessment.roles.student.score === null ? "Incomplete" : "Complete"}`,
    `CFI IMSAFE: ${!assessment.roles.cfi.active ? "Not aboard" : assessment.roles.cfi.score === null ? "Incomplete" : "Complete"}`,
    ...assessment.drivers.map((driver) =>
      `- ${driver.roleLabel}: ${driver.label} (${driver.severity === 2 ? "significant" : "some"} concern)`
    ),
  ];
}

export function loadHumanFactorsForDraft(briefData) {
  const isCurrent = [HUMAN_FACTOR_MODEL_VERSION, 3, 4, 5].includes(briefData?.riskModelVersion);
  return {
    answers: isCurrent ? normalizeHumanFactors(briefData.humanFactors) : emptyHumanFactors(),
    requiresReassessment: !isCurrent,
  };
}
