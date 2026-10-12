import assert from "node:assert/strict";
import test from "node:test";

import {
  getAircraftFamily,
  groupByAircraftFamily,
} from "../lib/aircraft-family.ts";

test("groups common C172 variants into one display family", () => {
  for (const model of ["C172M", "C172 N", "C172-P", "Cessna 172S", "172R Skyhawk"]) {
    assert.deepEqual(getAircraftFamily(model), { key: "c172", label: "C172" });
  }
});

test("keeps operationally distinct PA-28 and PA-28R families separate", () => {
  assert.equal(getAircraftFamily("Piper PA-28-181").key, "pa-28");
  assert.equal(getAircraftFamily("PA28R-200").key, "pa-28r");
});

test("keeps SR22T separate from SR22", () => {
  assert.equal(getAircraftFamily("Cirrus SR22 G3").key, "sr22");
  assert.equal(getAircraftFamily("SR22T G6").key, "sr22t");
});

test("leaves unknown models in their own normalized group", () => {
  assert.deepEqual(getAircraftFamily("Experimental ZX-9"), {
    key: "experimental-zx-9",
    label: "Experimental ZX-9",
  });
});

test("groups a synthetic fleet without changing its records", () => {
  const fleet = Array.from({ length: 70 }, (_, index) => ({
    id: `aircraft-${index}`,
    model: index < 40 ? `C172${["M", "N", "P", "S"][index % 4]}` : `PA-28-${161 + (index % 2) * 20}`,
  }));
  const groups = groupByAircraftFamily(fleet, (item) => item.model);
  assert.equal(groups.length, 2);
  assert.equal(groups.find((group) => group.key === "c172")?.items.length, 40);
  assert.equal(groups.find((group) => group.key === "pa-28")?.items.length, 30);
  assert.equal(new Set(groups.flatMap((group) => group.items.map((item) => item.id))).size, 70);
});
