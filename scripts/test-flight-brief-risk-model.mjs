import assert from "node:assert/strict";
import test from "node:test";
import {
  FLIGHT_RISK_FACTORS,
  emptyFlightRiskAnswers,
  flightRiskSnapshot,
  flightRiskCategory,
  normalizeFlightRiskAnswers,
  scoreFlightRisk,
} from "../lib/flight-brief-risk-model.mjs";

const human = { complete: true, roles: { student: { score: 0 }, cfi: { score: 0 } } };
const clear = () => Object.fromEntries(FLIGHT_RISK_FACTORS.map(({ id }) => [id, 0]));

test("all legacy static and dynamic factors have unique graded choices", () => {
  assert.equal(FLIGHT_RISK_FACTORS.length, 28);
  assert.equal(new Set(FLIGHT_RISK_FACTORS.map(({ id }) => id)).size, 28);
  assert.ok(FLIGHT_RISK_FACTORS.every(({ choices, weight }) => choices.length === 3 && weight > 0));
});

test("unanswered is incomplete and not treated as zero", () => {
  const result = scoreFlightRisk(emptyFlightRiskAnswers(), human);
  assert.equal(result.complete, false);
  assert.equal(result.totalRisk, null);
  assert.equal(result.category.level, "INCOMPLETE");
});

test("all clear and not applicable yield zero", () => {
  const answers = clear();
  answers[FLIGHT_RISK_FACTORS[0].id] = "na";
  const result = scoreFlightRisk(answers, human);
  assert.equal(result.complete, true);
  assert.equal(result.totalRisk, 0);
  assert.equal(result.category.level, "LOW RISK");
});

test("significant concerns are independently surfaced", () => {
  const answers = clear();
  answers["dynamic-deteriorating-wx"] = 2;
  const result = scoreFlightRisk(answers, human);
  assert.equal(result.totalRisk, 4);
  assert.equal(result.significant.length, 1);
  assert.equal(result.significant[0].id, "dynamic-deteriorating-wx");
});

test("weighted concerns add across factors, both pilots and other risk", () => {
  const answers = clear();
  answers["static-training-pre-solo"] = 1;
  answers["dynamic-wind-gust-personal-min"] = 2;
  const result = scoreFlightRisk(answers, { complete: true, roles: { student: { score: 2 }, cfi: { score: 3 } } }, { label: "Synthetic hazard", severity: 1 });
  assert.equal(result.staticScore, 8);
  assert.equal(result.dynamicScore, 6);
  assert.equal(result.totalRisk, 14);
});

test("trial band boundaries", () => {
  assert.equal(flightRiskCategory(12).level, "LOW RISK");
  assert.equal(flightRiskCategory(13).level, "MITIGATION REQUIRED");
  assert.equal(flightRiskCategory(24).level, "MITIGATION REQUIRED");
  assert.equal(flightRiskCategory(25).level, "FURTHER REVIEW");
});

test("legacy boolean answers are never silently converted", () => {
  const answers = normalizeFlightRiskAnswers({ "static-solo-flight": true });
  assert.equal(answers["static-solo-flight"], null);
  assert.equal(scoreFlightRisk(answers, human).complete, false);
});

test("additional risk requires graded answer when named", () => {
  const result = scoreFlightRisk(clear(), human, { label: "Synthetic hazard", severity: null });
  assert.equal(result.complete, false);
});

test("v3 snapshot whitelists levels and summary, never free-text context", () => {
  const input = { ...clear(), "static-prior-mx": 1, privateHealthDescription: "synthetic private detail" };
  const snapshot = flightRiskSnapshot(scoreFlightRisk(input, human));
  assert.equal(snapshot.riskModelVersion, 3);
  assert.equal(snapshot.flightRiskAnswers["static-prior-mx"], 1);
  assert.equal(JSON.stringify(snapshot).includes("synthetic private detail"), false);
  assert.equal(Object.keys(snapshot.flightRiskAnswers).length, 28);
  const reopened = scoreFlightRisk(normalizeFlightRiskAnswers(snapshot.flightRiskAnswers), human);
  assert.equal(reopened.complete, true);
  assert.equal(reopened.totalRisk, 1);
});
