import assert from "node:assert/strict";
import test from "node:test";

import {
  ENGINE_DIMENSIONS,
  engineFrameAt,
  normalizeCycleAngle,
  sliderCrankAt,
  strokeAt,
} from "../components/learn/piston-engine/model";

test("the four strokes cover one 720 degree cycle", () => {
  assert.equal(strokeAt(0), "intake");
  assert.equal(strokeAt(179.9), "intake");
  assert.equal(strokeAt(180), "compression");
  assert.equal(strokeAt(360), "power");
  assert.equal(strokeAt(540), "exhaust");
  assert.equal(strokeAt(720), "intake");
});

test("cycle angles wrap in both directions", () => {
  assert.equal(normalizeCycleAngle(810), 90);
  assert.equal(normalizeCycleAngle(-90), 630);
});

test("a four-cylinder engine has one power event every 180 degrees", () => {
  for (const angle of [0, 180, 360, 540]) {
    const frame = engineFrameAt(angle + 20);
    assert.equal(
      frame.cylinders.filter((cylinder) => cylinder.combustion > 0).length,
      1,
    );
  }
});

test("piston and valve positions agree with the selected stroke", () => {
  const intake = engineFrameAt(90).cylinders[0]!;
  assert.equal(intake.stroke, "intake");
  assert.ok(intake.piston > 0 && intake.piston < 1);
  assert.ok(intake.intakeLift > 0.9);
  assert.equal(intake.exhaustLift, 0);

  const power = engineFrameAt(450).cylinders[0]!;
  assert.equal(power.stroke, "power");
  assert.ok(power.combustion > 0);
  assert.equal(power.intakeLift, 0);
  assert.equal(power.exhaustLift, 0);
});

test("the slider-crank reaches both dead centers at the published stroke", () => {
  assert.ok(Math.abs(sliderCrankAt(0).pistonTravelInches) < 1e-10);
  assert.ok(
    Math.abs(sliderCrankAt(180).pistonTravelInches - ENGINE_DIMENSIONS.strokeInches) < 1e-10,
  );
  assert.ok(Math.abs(sliderCrankAt(360).pistonTravelInches) < 1e-10);
});

test("dual ignition occurs before the power stroke", () => {
  const beforeTdc = engineFrameAt(335).cylinders[0]!;
  const atTdc = engineFrameAt(360).cylinders[0]!;
  assert.equal(beforeTdc.stroke, "compression");
  assert.equal(beforeTdc.spark, 1);
  assert.equal(atTdc.stroke, "power");
  assert.equal(atTdc.combustion, 1);
});

test("clockwise firing order is 1-3-2-4", () => {
  const firing = [0, 180, 360, 540].map(
    (angle) => engineFrameAt(angle + 375).activeCylinder,
  );
  assert.deepEqual(firing, ["1", "3", "2", "4"]);
});
