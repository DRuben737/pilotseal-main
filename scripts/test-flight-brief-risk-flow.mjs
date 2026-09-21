import assert from "node:assert/strict";
import test from "node:test";
import { FLIGHT_RISK_FACTORS, emptyFlightRiskAnswers } from "../lib/flight-brief-risk-model.mjs";
import { HUMAN_FACTOR_FIELDS, emptyHumanFactors } from "../lib/flight-brief-human-factors.mjs";
import {
  MANEUVER_FACTOR_IDS,
  PAVE_SECTIONS,
  firstIncompleteRiskQuestion,
  isRiskQuestionAnswered,
  isRiskSectionComplete,
  maneuverScreenAnswer,
  paveSectionForFactor,
  riskQuestions,
  riskScoreBreakdown,
} from "../lib/flight-brief-risk-flow.mjs";
import { scoreFlightRisk } from "../lib/flight-brief-risk-model.mjs";
import { scoreHumanFactors } from "../lib/flight-brief-human-factors.mjs";

const clearHuman = () => {
  const answers = emptyHumanFactors();
  for (const role of ["student", "cfi"]) for (const field of HUMAN_FACTOR_FIELDS) answers[role][field.id] = 0;
  return answers;
};

test("PAVE has exactly four ordered boards and keeps maneuvers with Pilot", () => {
  assert.deepEqual(PAVE_SECTIONS.map((section) => section.id), ["pilot", "aircraft", "environment", "pressure"]);
  assert.equal(paveSectionForFactor(FLIGHT_RISK_FACTORS.find((factor) => factor.id === "dynamic-stalls-airplane")), "pilot");
  assert.equal(paveSectionForFactor(FLIGHT_RISK_FACTORS.find((factor) => factor.id === "dynamic-night-flight")), "environment");
});

test("no flight type is incomplete; solo questions appear only on solo flights", () => {
  const answers = emptyFlightRiskAnswers();
  assert.equal(firstIncompleteRiskQuestion(answers, emptyHumanFactors(), ""), "nature");
  const solo = riskQuestions("solo", answers);
  assert.ok(solo.some((question) => question.key === "factor:static-solo-flight"));
  assert.ok(!solo.some((question) => question.key.startsWith("human:cfi:")));
  assert.ok(!solo.some((question) => question.key === "maneuver-screen"));
  assert.ok(!riskQuestions("passenger", answers).some((question) => question.key === "factor:static-solo-flight"));
  assert.ok(riskQuestions("passenger", answers).some((question) => question.key === "factor:dynamic-passenger-pressure"));
  assert.ok(!riskQuestions("dual_training", answers).some((question) => question.key === "factor:static-solo-flight"));
});

test("solo operation cannot be skipped with a generic not-applicable answer", () => {
  const answers = emptyFlightRiskAnswers();
  answers["static-solo-flight"] = "na";
  const question = riskQuestions("solo", answers).find((item) => item.key === "factor:static-solo-flight");
  assert.equal(isRiskQuestionAnswered(question, answers, clearHuman(), "solo"), false);
});

test("student IMSAFE advances one item at a time, then CFI on dual flights", () => {
  const answers = Object.fromEntries(FLIGHT_RISK_FACTORS.map((factor) => [factor.id, 0]));
  const human = emptyHumanFactors();
  assert.equal(firstIncompleteRiskQuestion(answers, human, "dual_training"), "human:student:illness");
  for (const field of HUMAN_FACTOR_FIELDS) {
    assert.equal(firstIncompleteRiskQuestion(answers, human, "dual_training"), `human:student:${field.id}`);
    human.student[field.id] = 0;
  }
  assert.equal(firstIncompleteRiskQuestion(answers, human, "dual_training"), "human:cfi:illness");
  for (const field of HUMAN_FACTOR_FIELDS) human.cfi[field.id] = 0;
  assert.equal(firstIncompleteRiskQuestion(answers, human, "dual_training"), "review");
});

test("maneuver screen skips all four when none are planned and reveals details when planned", () => {
  const answers = emptyFlightRiskAnswers();
  assert.equal(maneuverScreenAnswer(answers, "dual_training"), null);
  assert.ok(riskQuestions("dual_training", answers).some((question) => question.key === "maneuver-screen"));
  assert.ok(!riskQuestions("dual_training", answers).some((question) => question.key === "factor:dynamic-stalls-airplane"));
  const planned = riskQuestions("dual_training", answers, true);
  assert.equal(planned.filter((question) => MANEUVER_FACTOR_IDS.some((id) => question.key === `factor:${id}`)).length, 4);
  for (const id of MANEUVER_FACTOR_IDS) answers[id] = 0;
  assert.equal(maneuverScreenAnswer(answers, "dual_training"), "none");
  assert.ok(!riskQuestions("dual_training", answers).some((question) => question.key === "factor:dynamic-stalls-airplane"));
});

test("night recency appears only after an explicit planned-night answer", () => {
  const answers = emptyFlightRiskAnswers();
  assert.ok(!riskQuestions("solo", answers).some((question) => question.key === "factor:static-last-night-30"));
  answers["dynamic-night-flight"] = 0;
  assert.ok(!riskQuestions("solo", answers).some((question) => question.key === "factor:static-last-night-30"));
  answers["dynamic-night-flight"] = 1;
  const questions = riskQuestions("solo", answers);
  const nightIndex = questions.findIndex((question) => question.key === "factor:dynamic-night-flight");
  assert.equal(questions[nightIndex + 1].key, "factor:static-last-night-30");
});

test("inspection is the sole explicitly not-applicable question", () => {
  const answers = emptyFlightRiskAnswers();
  answers["static-inspection-under-20"] = "na";
  const question = riskQuestions("solo", answers).find((item) => item.key === "factor:static-inspection-under-20");
  assert.equal(isRiskQuestionAnswered(question, answers, clearHuman(), "solo"), true);
  assert.equal(isRiskSectionComplete("aircraft", answers, clearHuman(), "solo"), false);
});

test("solo, dual and passenger answers each progress to review without a hidden required group", () => {
  for (const nature of ["solo", "dual_training", "passenger"]) {
    const answers = Object.fromEntries(FLIGHT_RISK_FACTORS.map((factor) => [factor.id, 0]));
    const human = clearHuman();
    assert.equal(firstIncompleteRiskQuestion(answers, human, nature), "review");
    assert.equal(isRiskSectionComplete("pilot", answers, human, nature), true);
    assert.equal(isRiskSectionComplete("aircraft", answers, human, nature), true);
    assert.equal(isRiskSectionComplete("environment", answers, human, nature), true);
    assert.equal(isRiskSectionComplete("pressure", answers, human, nature), true);
  }
});

test("PAVE and additional subtotals equal the deterministic total", () => {
  const answers = Object.fromEntries(FLIGHT_RISK_FACTORS.map((factor) => [factor.id, 0]));
  answers["static-solo-flight"] = 2;
  answers["dynamic-wind-gust-personal-min"] = 1;
  const human = clearHuman();
  human.student.fatigue = 1;
  const humanAssessment = scoreHumanFactors(human, 0, 0, { activeRoles: ["student"], roleLabels: { student: "Pilot" } });
  const assessment = scoreFlightRisk(answers, humanAssessment, { label: "Busy ramp", severity: 1 }, "solo");
  const breakdown = riskScoreBreakdown(assessment, humanAssessment, "Busy ramp");
  assert.equal(breakdown.total, assessment.totalRisk);
  assert.equal(Object.values(breakdown.sections).reduce((sum, value) => sum + value, 0) + breakdown.additional, assessment.totalRisk);
  assert.ok(breakdown.contributions.every((item) => item.score > 0));
});
