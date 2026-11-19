import assert from "node:assert/strict";
import test from "node:test";

import { getInstructorCertificateDateLabel } from "../lib/endorsement-wording.js";

test("uses the latest certificate activity date when choosing RE or Exp.", () => {
  assert.equal(
    getInstructorCertificateDateLabel({
      issue_date: "2024-10-15",
      last_event_date: "2026-10-15",
    }),
    "RE"
  );
  assert.equal(
    getInstructorCertificateDateLabel({
      issue_date: "2026-10-15",
      last_event_date: "2024-10-15",
    }),
    "RE"
  );
});

test("keeps Exp. only when every recorded issuance date predates the rule", () => {
  assert.equal(
    getInstructorCertificateDateLabel({
      issue_date: "2024-10-15",
      last_event_date: "2024-11-30",
    }),
    "Exp."
  );
});

test("treats the effective date and missing legacy dates as RE", () => {
  assert.equal(
    getInstructorCertificateDateLabel({ issue_date: "2024-12-01" }),
    "RE"
  );
  assert.equal(getInstructorCertificateDateLabel({}), "RE");
});
