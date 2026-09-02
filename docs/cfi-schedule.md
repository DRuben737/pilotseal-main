# Personal CFI scheduling

The optional CFI Schedule feature is enabled from the personal dashboard. Existing
student account links are explicitly granted schedule access. Students must enable
the feature themselves; other students' lessons and resource blocks stay redacted.

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
