import assert from "node:assert/strict";
import test from "node:test";
import {
  FLIGHT_RISK_FACTORS,
  answersForFlightNature,
  applicableFlightRiskFactors,
  emptyFlightRiskAnswers,
  flightRiskSnapshot,
  flightRiskCategory,
  loadFlightRiskAnswersForDraft,
  normalizeFlightRiskAnswers,
  scoreFlightRisk,
} from "../lib/flight-brief-risk-model.mjs";

const human = { complete: true, roles: { student: { score: 0 }, cfi: { score: 0 } } };
const clear = () => Object.fromEntries(FLIGHT_RISK_FACTORS.map(({ id }) => [id, 0]));

test("all legacy static and dynamic factors have unique graded choices", () => {
  assert.equal(FLIGHT_RISK_FACTORS.length, 30);
  assert.equal(new Set(FLIGHT_RISK_FACTORS.map(({ id }) => id)).size, 30);
  assert.ok(FLIGHT_RISK_FACTORS.every(({ choices, prompt, weight }) => choices.length === 3 && prompt && weight > 0));
  assert.ok(FLIGHT_RISK_FACTORS.every(({ choices }) => choices.every((choice) => !/with familiar plan/i.test(choice))));
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

test("v5 snapshot whitelists levels and summary, never free-text context", () => {
  const input = { ...clear(), "static-prior-mx": 1, privateHealthDescription: "synthetic private detail" };
  const snapshot = flightRiskSnapshot(scoreFlightRisk(input, human));
  assert.equal(snapshot.riskModelVersion, 5);
  assert.equal(snapshot.flightRiskAnswers["static-prior-mx"], 1);
  assert.equal(JSON.stringify(snapshot).includes("synthetic private detail"), false);
  assert.equal(Object.keys(snapshot.flightRiskAnswers).length, 30);
  const reopened = scoreFlightRisk(normalizeFlightRiskAnswers(snapshot.flightRiskAnswers), human);
  assert.equal(reopened.complete, true);
  assert.equal(reopened.totalRisk, 1);
});

test("v5 does not count a generic not-applicable answer as a clear solo operation", () => {
  const answers = clear();
  answers["static-solo-flight"] = "na";
  const result = scoreFlightRisk(answers, human, {}, "solo");
  assert.equal(result.complete, false);
  assert.equal(result.totalRisk, null);
  answers["static-solo-flight"] = 0;
  answers["static-inspection-under-20"] = "na";
  assert.equal(scoreFlightRisk(answers, human, {}, "solo").complete, true);
});

test("v4 draft keeps valid levels but reopens generic not-applicable as unanswered", () => {
  const source = clear();
  source["static-solo-flight"] = "na";
  source["static-prior-mx"] = 2;
  const loaded = loadFlightRiskAnswersForDraft({ riskModelVersion: 4, flightNature: "solo", flightRiskAnswers: source });
  assert.equal(loaded.requiresReassessment, true);
  assert.equal(loaded.answers["static-solo-flight"], null);
  assert.equal(loaded.answers["static-prior-mx"], 2);
  assert.equal(source["static-solo-flight"], "na");
});

test("explicit no-night answer restores zero night recency without inferring from clock time", () => {
  const source = clear();
  source["static-last-night-30"] = null;
  source["dynamic-night-flight"] = 0;
  const loaded = loadFlightRiskAnswersForDraft({ riskModelVersion: 5, flightNature: "solo", flightRiskAnswers: source });
  assert.equal(loaded.answers["static-last-night-30"], 0);
});

test("v5 solo snapshot reopens with the same level and no private context", () => {
  const answers = clear();
  answers["static-solo-flight"] = 1;
  const original = scoreFlightRisk(answers, human, {}, "solo");
  const saved = JSON.parse(JSON.stringify({
    flightNature: "solo",
    ...flightRiskSnapshot(original),
    syntheticSleepHours: undefined,
  }));
  const reopened = loadFlightRiskAnswersForDraft(saved);
  const result = scoreFlightRisk(reopened.answers, human, {}, "solo");
  assert.equal(reopened.requiresReassessment, false);
  assert.equal(result.totalRisk, original.totalRisk);
  assert.equal(result.category.level, original.category.level);
  assert.equal(JSON.stringify(saved).includes("sleepHours"), false);
});

test("flight nature is required before a current risk result can be complete", () => {
  assert.equal(scoreFlightRisk(clear(), human, {}, "").complete, false);
  assert.equal(applicableFlightRiskFactors("").length, 0);
});

test("dual training excludes solo-only factors even if stale answers were severe", () => {
  const answers = clear();
  answers["static-solo-flight"] = 2;
  answers["static-last-solo-30"] = 2;
  answers["dynamic-class-bc-solo"] = 2;
  const result = scoreFlightRisk(answers, human, {}, "dual_training");
  assert.equal(result.complete, true);
  assert.equal(result.totalRisk, 0);
  assert.equal(result.answers["static-solo-flight"], "na");
  assert.equal(result.drivers.length, 0);
  assert.equal(flightRiskSnapshot(result).flightRiskAnswers["dynamic-class-bc-solo"], "na");
});

test("solo and passenger flights omit training maneuvers and CFI-only factors", () => {
  const answers = clear();
  answers["dynamic-stalls-airplane"] = 2;
  answers["static-cfi-under-100-instruction"] = 2;
  for (const nature of ["solo", "passenger"]) {
    const result = scoreFlightRisk(answers, human, {}, nature);
    assert.equal(result.complete, true);
    assert.equal(result.totalRisk, 0);
    assert.equal(result.answers["dynamic-stalls-airplane"], "na");
    assert.equal(result.answers["static-cfi-under-100-instruction"], "na");
  }
  assert.ok(applicableFlightRiskFactors("passenger").some((factor) => factor.id === "dynamic-passenger-pressure"));
  assert.ok(!applicableFlightRiskFactors("solo").some((factor) => factor.id === "dynamic-passenger-pressure"));
});

test("changing nature clears prior answers that are no longer applicable", () => {
  const answers = clear();
  answers["static-training-pre-solo"] = 2;
  answers["dynamic-full-down-auto-heli"] = 1;
  const solo = answersForFlightNature(answers, "solo");
  assert.equal(solo["static-training-pre-solo"], null);
  assert.equal(solo["dynamic-full-down-auto-heli"], null);
  assert.equal(solo["static-solo-flight"], 0);
});
