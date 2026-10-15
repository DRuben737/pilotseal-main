import assert from "node:assert/strict";
import test from "node:test";
import { filterVisibleAircraft, isAircraftVisible } from "../lib/aircraft-availability.ts";

test("hides Away while retaining maintenance and grounded aircraft", () => {
  const fleet = ["available", "away", "in_maintenance", "grounded"].map((operational_status) => ({ id: operational_status, operational_status }));
  assert.deepEqual(filterVisibleAircraft(fleet), [fleet[0], fleet[2], fleet[3]]);
  assert.equal(isAircraftVisible(null), false);
  assert.equal(isAircraftVisible({ id: "personal" }), true);
});

test("saved and shared copies cannot reintroduce an unavailable aircraft", () => {
  const saved = { id: "synthetic-plane" };
  const organization = { id: saved.id, operational_status: "away" };
  assert.deepEqual(filterVisibleAircraft([saved, organization]), []);
  assert.deepEqual(filterVisibleAircraft([organization, saved]), []);
  assert.deepEqual(filterVisibleAircraft([saved, { ...organization, operational_status: "available" }]).length, 2);
});
