import assert from "node:assert/strict";
import test from "node:test";

import { scheduleTaskPresentation } from "../lib/dashboard-tasks";

test("student solo task keeps the solo type, aircraft, instructor, and subjects", () => {
  const presentation = scheduleTaskPresentation({
    lesson_kind: "solo",
    student_name: "Student Pilot",
    aircraft_tail_number: "N5520X",
    aircraft_status: "grounded",
    assigned_instructor_name: "Alex Instructor",
    start_at: "2026-10-26T14:30:00.000Z",
    end_at: "2026-10-26T16:30:00.000Z",
    training_subjects: [{ subject_snapshot: { title: "Traffic pattern" } }],
  }, {
    instructor: false,
    cfiName: "Fallback Instructor",
    locale: "en-US",
  });

  assert.equal(presentation.title, "Solo · N5520X");
  assert.match(presentation.detail, /Instructor: Alex Instructor/);
  assert.match(presentation.detail, /Aircraft grounded/);
  assert.match(presentation.detail, /Traffic pattern/);
  assert.doesNotMatch(presentation.detail, /Student Pilot/);
});

test("ground task never receives an aircraft or solo label", () => {
  const presentation = scheduleTaskPresentation({
    lesson_kind: "ground",
    student_name: "Student Pilot",
    aircraft_tail_number: null,
    start_at: "2026-10-26T14:30:00.000Z",
    end_at: "2026-10-26T16:30:00.000Z",
  }, {
    instructor: true,
    locale: "en-US",
  });

  assert.equal(presentation.title, "Ground");
  assert.match(presentation.detail, /Student: Student Pilot/);
});
