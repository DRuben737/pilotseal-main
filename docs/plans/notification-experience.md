# Unified notification experience — acceptance record

## Agreed scope

Deliver the complete station-wide experience: source-aware push cards and inbox, full reading, source preferences, interruption control, persisted states, business links and applicable completion, cross-device consistency, organization/platform publication management and local verification. No production deployment was requested.

## Completion evidence

| Requirement | Implementation | Local evidence |
| --- | --- | --- |
| Site-wide signed-in delivery | Root `NotificationExperience` mounts one coordinator; authentication pages suppress it | Final production build; startup/online browser delivery |
| Organization/platform source identity | Source name and organization identity; groups keyed by kind and organization ID | Presentation tests; organization selected-audience UI test |
| Responsive card and full reader | Safe-area placement, reduced motion, hover/focus pause, complete body/action/receipt drawer | Publisher and reader screenshots at 390/768/1024/1440; focus restoration and Escape browser checks |
| Source delivery preferences | Instant / inbox / off, existing category preferences preserved | Mobile preferences save/persistence and timing UI test |
| Deduplication and fatigue control | Source summaries, newest-event suppression, priority ordering, 60-second recipient cooldown | 8 presentation tests; 13 delivery SQL assertions |
| Cross-device presentation | Atomic reservation, 15-second recoverable lease, post-render confirmation | Delivery SQL tests; two browser contexts present only once |
| Read/dismiss/acknowledge/completion separation | Independent persisted fields and reads; only profile business resolution completes applicable task | Reader acknowledgement persistence; cross-device read hides card; completed task in inbox and reader |
| Scheduled delivery/expiry | UTC normalization, eligibility filtering and 15-second fallback for time-only transitions | Timing UI test: scheduled inbox-only message appears and expires without row update |
| Publisher administration | Shared table/drawer, selected/all audience, draft/schedule/expiry, preview, correction, withdrawal, reports | Organization UI: selected recipients, validation, correction, receipts, withdrawal; platform preview/draft UI; 18 publication SQL assertions |
| Authorization and history | Scoped RPCs/RLS, revisioned deliveries, retained latest receipts on withdrawal | Publication SQL permission/target/revision tests; security advisors: no issues |
| Existing schedule/reminder integration | Existing kinds and business URLs retained; stable event IDs supplied by trigger; completed profile reminders retained | 5 event lifecycle SQL assertions; presentation and completed-reminder UI tests |
| Actual online subscription | Unique channel per consumer; required tables enrolled in publication | Direct local Realtime test: both consumers receive; removing one preserves other; online push browser test; 6 publication/RLS assertions |

## Checks and artifacts

- Final production build passed after the last application change (time-based refresh).
- Full repository ESLint completed with 0 errors; existing warnings are in unrelated sky-art code and its generated worker. Targeted lint for changed implementation/scripts passed.
- SQL assertions: delivery 13; publication 18; lifecycle 5; Realtime enrollment/RLS 6.
- UI evidence was gathered incrementally. Earlier failed runs exposed UTC parsing, shared-channel cleanup and accessible-label issues; targeted runs passed after each corresponding fix. Valid evidence was reused for unchanged behavior rather than repeating all earlier checks.
- Screenshots: `artifacts/notification-experience-qa/` (push, responsive publisher/reader, preferences and completed reminder).
- Synthetic fixtures only, local Supabase/Docker only. Four versioned migrations applied locally. No remote schema writes, CI, deployment or release.
- Original unrelated untracked `artifacts/` contents were preserved.
- Operational and verification instructions: `docs/notifications.md`.

## Follow-up: natural publishing and grouped recipients

- Removed the Related page input from manual publishing; new publications/corrections submit no business link. Automatic system-reminder links remain unchanged.
- Reused existing organization teaching/access roles as recipient groups (instructors, students, unassigned members, administrators), plus platform administrator/member groups.
- Added group selection with individual adjustments, search, clear selection, selected count and mixed checkbox states. Recipient IDs remain a deduplicated snapshot and are still validated by the existing publishing RPC.
- Added a scoped audience-groups RPC; 7 local SQL authorization/group assertions passed. Three pure group-selection tests passed.
- Build/type checks and targeted lint passed; local security advisors found no issues.
- Organization browser workflow passed: group selection, individual adjustment, empty selection validation, absence of Related page, publication without an action URL, correction, receipts and withdrawal. Grouped-recipient layout verified at 390/768/1024/1440px; screenshots saved in the QA artifact folder.
- New migration applied locally only; no deployment or remote schema operation.
