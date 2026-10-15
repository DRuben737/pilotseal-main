import assert from "node:assert/strict";
import test from "node:test";
import { filterAvailableAircraft, isAircraftAvailable } from "../lib/aircraft-availability.ts";

test("hides every unavailable operational status", () => {
  const fleet = ["available", "away", "in_maintenance", "grounded"].map((operational_status) => ({ id: operational_status, operational_status }));
  assert.deepEqual(filterAvailableAircraft(fleet), [fleet[0]]);
  assert.equal(isAircraftAvailable(null), false);
  assert.equal(isAircraftAvailable({ id: "personal" }), true);
});

test("saved and shared copies cannot reintroduce an unavailable aircraft", () => {
  const saved = { id: "synthetic-plane" };
  const organization = { id: saved.id, operational_status: "away" };
  assert.deepEqual(filterAvailableAircraft([saved, organization]), []);
  assert.deepEqual(filterAvailableAircraft([organization, saved]), []);
  assert.deepEqual(filterAvailableAircraft([saved, { ...organization, operational_status: "available" }]).length, 2);
});
