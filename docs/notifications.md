# Notifications

Signed-in users receive organization, platform, schedule and personal reminders through one site-wide presentation layer. Organization and platform sources default to instant delivery. Personal reminders default to inbox-only. Authentication pages suppress pushes; the notification center shows messages directly rather than repeating them as pushes. Open dialogs postpone new pushes.

## Delivery and state

- Preferences offer instant, inbox-only and off for each source. Existing category permissions and critical-notice inbox behavior remain enforced.
- Pushes group messages by kind and organization. Repeated business events collapse to the newest active version. Older versions do not resurface after the newest was read or displayed.
- Database reservations serialize competing devices. Reservations expire after 15 seconds if presentation is abandoned; visible cards confirm delivery. A recipient-wide 60-second cooldown limits interruptions.
- Displayed, dismissed, read, acknowledged and completed are separate states. Reading or following a link does not complete a business task. Existing profile-reminder resolution records actual completion. Completed reminders remain available in the inbox and do not increase the unread count.
- Full messages appear in a keyboard-accessible drawer. Withdrawal makes an open message unavailable. Related links accept site-relative destinations only.
- Legacy timestamp-without-time-zone notification columns store UTC. The client adds the timezone suffix before browser parsing.

## Publishing

Organization publishers require the existing `notifications` permission; platform publishers require the platform administrator role. Platform administration does not grant an organization workspace membership.

The shared publisher supports drafts, current or scheduled publication, expiration, selected or all recipients, acknowledgement requirements, previews, corrections, withdrawal and receipt reports. Human publishers enter the announcement and choose recipients; the form does not request a related-page URL. Business reminders keep their automatic action links. Organization recipients can be selected by existing instructor, student, unassigned and administrator groups, then adjusted individually. Overlapping groups never duplicate recipients; edits restore group checkbox state from the saved recipient snapshot. Platform groups distinguish administrators and other members. Audiences are snapshots of eligible members at publication creation/update. A scheduled message becomes eligible at its scheduled timestamp without depending on a dispatch cron job.

Corrections create fresh recipient deliveries and withdraw previous versions. Withdrawal retains the latest version's receipt report. All management RPCs authorize the current user; recipients cannot read management history or other recipients' receipts.

## Local verification

Use synthetic local seed accounts only. Start the local stack with Realtime for online-delivery checks:

```sh
npm run db:local:stop
npm run db:local:start -- --with-realtime
npm run test:notifications
npm run test:notifications:realtime:local
```

Apply pending migrations locally before testing. The normal local-start command continues to exclude Realtime unless the flag is passed.

Browser checks require `NOTIFICATIONS_PLAYWRIGHT_PATH` pointing to an installed local Playwright ES module and `NOTIFICATIONS_APP_URL` pointing to the local app server. Run the browser scripts sequentially because they use the deterministic local seed accounts:

```sh
npm run test:notifications:ui:local
npm run test:notifications:sync:local
npm run test:notifications:timing:local
```

The UI suite covers 390, 768, 1024 and 1440px layouts, preview, focus restoration, drafts, full reading, persistent receipts, online delivery, selected organization audiences, validation, correction, withdrawal and reporting. The synchronization suite covers competing browser contexts, cross-device read updates and completed-task presentation. The timing suite changes preferences through the mobile UI and verifies scheduled appearance and expiry without a row update. Fixtures are removed in cleanup. Screenshots are written to `artifacts/notification-experience-qa/`.

Database tests `050`–`053` cover state isolation, reservation recovery, permission checks, scheduled publications, revision history, business-event identity and Realtime enrollment. No remote testing or deployment is part of these commands.
