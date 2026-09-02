# Personal CFI scheduling

The optional CFI Schedule feature is enabled from the personal dashboard. Manage
access lists existing student records from People, including students without an
account. There is no separate student creation step and no synthetic login account.
CFIs can fill availability and schedule these students immediately. When a People
account invitation is accepted later, the student sees the same lessons, availability,
and weekly goals; no records are copied. Unlinking or disabling access revokes student
visibility immediately. Students still enable the feature themselves; other students'
lessons and resource blocks stay redacted. No schedule notification is sent before
linking. The student screen defaults to their instructor and offers My lessons and
My availability sections. People-backed students can edit their own weekly goal.

## People identity compatibility

New enrollments use private `cfi_person_*` tables keyed by the existing People ID.
For compatibility with the scheduling algorithm, the DTO's `student_user_id` field
contains that People ID when `storage_kind` is `person`; it is NOT an authentication
identity. `account_user_id` is separately resolved from accepted account links.
All authorization and notification recipients are resolved server-side. Existing
account-backed schedules remain in place. Both stores share publication revisions,
atomic draft publication, and cross-store overlap checks. Direct private-table access
is revoked and RLS is enabled; scoped authenticated RPCs are the only client access.

## Drafts and publication

- Manual additions, edits, cancellations and generated Flight lessons remain in a
  browser-tab draft until **Review & publish → Confirm & notify students**.
- Moving any lesson's start time within its original local day shifts all later
  lessons that day by the same elapsed time. Earlier lessons, other days and resource
  blocks stay in place. Durations and gaps are preserved unless explicitly edited.
  Changing only duration or moving a lesson to another date is an individual edit.
- The editor shows before/after times per affected lesson. Resource, availability,
  start-window, cross-day and eight-hour-span conflicts are warnings. CFI lesson
  overlaps still prevent publication.
- Drafts are local to the current tab, not durable server drafts. Navigation warns
  before discarding them. Undo and explicit discard never change published lessons.
- Publication checks an atomic revision covering schedule, availability, resources
  and access. Stale drafts cannot overwrite newer data. **Load latest & rebuild
  preview** replays edits against the latest lessons, including new later lessons.
  If an edited lesson was removed, discard and rebuild the draft instead.
- One transaction applies all final changes or none. Retries with the same batch ID
  are idempotent. Each affected student receives at most one schedule notification
  per publication, respecting their preference. Intermediate edits send nothing.

## Availability and layout

CFIs can mark aircraft unavailable directly from each calendar day, including
while a lesson draft is open. The date is prefilled; enter the start/end and save.
Click the gray aircraft block to edit or remove it. Resource changes save
immediately, leave lesson drafts intact, invalidate generated previews, and
require re-review of stale drafts before publication. Flight warnings refresh;
Ground lessons are unaffected. Errors stay visible in the block editor.

On phones, primary navigation and dashboard function switches start collapsed.
Pull down on their small handle or tap it to expand; swipe up, press Escape,
tap outside, or choose a destination to collapse. Only the handle captures the
gesture, so page scrolling is unaffected. Navigation stays behind modal editors.

General weekly availability can auto-fill matching weekdays over the next 28 local
calendar dates (today included). Auto-filled dates can be refreshed; individually
edited dates, including empty/unavailable dates, are preserved. Date edits are
marked manual. Availability changes never move or cancel published lessons;
conflicts are shown to the student and CFI, with no notification to the CFI.

Availability periods are at least two hours and support 00:00–24:00. The browser's
time zone is used. Automatic scheduling generates Flight only. Mobile/tablet use a
day selector; desktop shows the week. Editing and publication use existing drawers.

## Local verification

Use isolated synthetic local Supabase fixtures only:

```sh
npm run test:db:local
npm run test:schedule:local
npm run lint
npm run build
```

For browser smoke tests, start the local app on 127.0.0.1:3007 and set
`SCHEDULE_PLAYWRIGHT_PATH` to an installed local Playwright ES module. Then run
`npm run test:schedule-ui:local`. The test rejects non-local targets, blocks external
browser requests, uses synthetic seed accounts, and removes its schedule fixtures.
Screenshots are written to a uniquely named system temporary directory.
