import assert from "node:assert/strict";
import test from "node:test";
import {
  HUMAN_FACTOR_FIELDS,
  emptyHumanFactors,
  humanFactorReportLines,
  humanFactorReviewItems,
  humanFactorSnapshot,
  loadHumanFactorsForDraft,
  persistedHumanFactors,
  riskCategoryV2,
  scoreHumanFactors,
} from "../lib/flight-brief-human-factors.mjs";

function completeAnswers(student = {}, cfi = {}) {
  const clear = Object.fromEntries(HUMAN_FACTOR_FIELDS.map((field) => [field.id, 0]));
  return { student: { ...clear, ...student }, cfi: { ...clear, ...cfi } };
}

test("all clear produces a complete low-risk score", () => {
  const assessment = scoreHumanFactors(completeAnswers(), 2, 3);
  assert.equal(assessment.complete, true);
  assert.equal(assessment.roles.student.score, 0);
  assert.equal(assessment.roles.cfi.score, 0);
  assert.equal(assessment.totalRisk, 5);
  assert.equal(assessment.category.level, "LOW RISK");
});

test("a significant concern remains a driver even with a low total", () => {
  const assessment = scoreHumanFactors(completeAnswers({ fatigue: 2 }));
  assert.equal(assessment.totalRisk, 2);
  assert.deepEqual(assessment.drivers.map(({ role, field, severity }) => ({ role, field, severity })), [
    { role: "student", field: "fatigue", severity: 2 },
  ]);
  assert.match(humanFactorReviewItems(assessment).join(" "), /significant fatigue concern/);
});

test("mild concerns and two-person scores add without changing other risks", () => {
  const assessment = scoreHumanFactors(
    completeAnswers({ illness: 1, stress: 1 }, { fatigue: 1, emotion: 2 }),
    4,
    3
  );
  assert.equal(assessment.roles.student.score, 2);
  assert.equal(assessment.roles.cfi.score, 3);
  assert.equal(assessment.roles.cfi.affectedCount, 2);
  assert.equal(assessment.staticScore, 9);
  assert.equal(assessment.totalRisk, 12);
});

test("missing or invalid answers never count as zero", () => {
  const incomplete = scoreHumanFactors(emptyHumanFactors(), 4, 3);
  assert.equal(incomplete.complete, false);
  assert.equal(incomplete.staticScore, null);
  assert.equal(incomplete.totalRisk, null);
  assert.equal(incomplete.category.level, "INCOMPLETE");
  assert.equal(scoreHumanFactors(completeAnswers({ fatigue: "0" })).complete, false);
});

test("trial category boundaries are explicit", () => {
  assert.equal(riskCategoryV2(12).level, "LOW RISK");
  assert.equal(riskCategoryV2(13).level, "MITIGATION REQUIRED");
  assert.equal(riskCategoryV2(18).level, "MITIGATION REQUIRED");
  assert.equal(riskCategoryV2(19).level, "APPROVAL REQUIRED");
});

test("more than two CFI concern areas retain the NO FLIGHT warning", () => {
  const assessment = scoreHumanFactors(completeAnswers({}, { illness: 1, stress: 1, fatigue: 1 }));
  assert.equal(assessment.roles.cfi.affectedCount, 3);
  assert.match(humanFactorReviewItems(assessment).join(" "), /NO FLIGHT/);
});

test("legacy drafts require a fresh assessment and old snapshot is untouched", () => {
  const oldBriefData = { imsafe: 3, cfiStress: 1, totalRisk: 14, riskLevel: "MITIGATION REQUIRED" };
  const loaded = loadHumanFactorsForDraft(oldBriefData);
  assert.equal(loaded.requiresReassessment, true);
  assert.equal(loaded.answers.student.illness, null);
  assert.equal(oldBriefData.totalRisk, 14);
  assert.equal(oldBriefData.riskLevel, "MITIGATION REQUIRED");
});

test("saved assessment contains only severity categories and scores", () => {
  const assessment = scoreHumanFactors(completeAnswers({ fatigue: 1 }, { stress: 2 }));
  const saved = persistedHumanFactors({
    ...assessment,
    sleepHours: 4,
    awakeHours: 19,
    timePressure: "high",
    medicationDetails: "synthetic private text",
  });
  assert.equal(saved.version, 2);
  assert.equal(saved.studentScore, 1);
  assert.equal(saved.cfiScore, 2);
  assert.equal(saved.student.fatigue, 1);
  assert.equal(JSON.stringify(saved).includes("synthetic private text"), false);
  assert.equal(JSON.stringify(saved).includes("sleepHours"), false);
  assert.equal(JSON.stringify(saved).includes("timePressure"), false);
  const snapshot = humanFactorSnapshot(assessment, humanFactorReviewItems(assessment));
  assert.equal(snapshot.riskModelVersion, 2);
  assert.deepEqual(snapshot.humanFactorRiskItems, [
    { role: "cfi", factor: "stress", severity: 2 },
    { role: "student", factor: "fatigue", severity: 1 },
  ]);
  assert.equal(JSON.stringify(snapshot).includes("sleepHours"), false);
});

test("report lines explain the score and identify the leading human factor", () => {
  const assessment = scoreHumanFactors(completeAnswers({ fatigue: 2 }, { stress: 1 }));
  const report = humanFactorReportLines(assessment).join("\n");
  assert.match(report, /Student IMSAFE Score: 2/);
  assert.match(report, /CFI IMSAFE Score: 1/);
  assert.match(report, /Student \/ Pilot: Fatigue \(significant concern\) \[2\]/);
});

test("a saved v2 assessment can be reopened without storing context details", () => {
  const assessment = scoreHumanFactors(completeAnswers({ emotion: 1 }, { illness: 2 }));
  const snapshot = JSON.parse(JSON.stringify({
    riskModelVersion: 2,
    humanFactors: persistedHumanFactors(assessment),
  }));
  const loaded = loadHumanFactorsForDraft(snapshot);
  assert.equal(loaded.requiresReassessment, false);
  assert.equal(loaded.answers.student.emotion, 1);
  assert.equal(loaded.answers.cfi.illness, 2);
  assert.equal(scoreHumanFactors(loaded.answers).totalRisk, 3);
});

test("a saved v3 draft keeps its IMSAFE levels while reopening", () => {
  const answers = completeAnswers({ fatigue: 1 });
  const restored = loadHumanFactorsForDraft({ riskModelVersion: 3, humanFactors: answers });
  assert.equal(restored.requiresReassessment, false);
  assert.equal(restored.answers.student.fatigue, 1);
});
