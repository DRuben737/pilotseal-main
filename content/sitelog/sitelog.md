---
title: "Site Log"
summary: "Ongoing development notes and history of PilotSeal."
updated: "2026-05-08"
---


This page is mostly a running record of how PilotSeal evolved over time.

<details>
<summary>2023 — Initial Idea</summary>

While working at [USATS](https://usatsflighttraining.com/) as a helicopter CFI, endorsements constantly became a workflow problem.

Most available logbook systems still required handwritten helicopter endorsements or manually edited templates before printing.

Stephane Rebeix, the company’s Chief Flight Instructor, had an internal Excel-based automation tool that solved many of those problems internally. A lot of PilotSeal’s original workflow ideas were influenced by that system.

Because of operational and data security limitations, that tool could not become public.

Toward the end of 2023, I started thinking about building a separate independent version.

- Reduce repetitive typing
- Avoid handwriting endorsements
- Speed up instructor workflow
- Keep the workflow practical during instruction

</details>

<details>
<summary>February 2024 — First Local Build</summary>

Started actively learning and building the first local versions.

Everything was rough at this stage.

The site was basically just forms and print output.

</details>

<details>
<summary>May 2024 — First Usable Version</summary>

The first usable local version started being used during day-to-day instruction.

The workflow was simple:

- Enter instructor information
- Enter student information
- Enter certificate expiration dates
- Generate endorsement text
- Print directly from the browser

</details>

<details>
<summary>August 2024 — PilotSeal Goes Online</summary>

PilotSeal officially went online using the original pilotsla.com domain.

At this point, the site was still mostly just an endorsement generator.

Pretty quickly, I started feeling that only having a single endorsement tool was too limited.

The idea slowly shifted toward building a broader aviation workflow website.

</details>

<details>
<summary>November 2024 — Multi-Template Endorsements & Flight Brief</summary>

Optimized the endorsement generator to support selecting multiple templates at once.

Around the same time, I started experimenting with a Flight Brief system.

The original idea came from an internal workflow we used during instruction. The paper briefing process included:

- Dispatcher information
- PIC briefing information
- Risk assessment
- Operational notes

At the time, the direction of the project was still unclear. A lot of features were partially built, abandoned, rewritten later, or left unfinished.

Around the same period, the open-source EASA Logbook project appeared on GitHub and influenced some ideas around aviation workflow tooling.

</details>

<details>
<summary>Early 2025 — Slowdown</summary>

Some features were temporarily shut down because I could not realistically sustain server costs at the time.

Development slowed down during this period.

</details>

<details>
<summary>April 2025 — Netlify Redeploy</summary>

The project was redeployed using Netlify infrastructure.

The domain structure also changed around this time.

For a while, the project lived under tool.pilotseal.com before eventually being merged back into the main PilotSeal structure.

Spent a lot of time improving the endorsement generator for day-to-day usability.

Changes included:

- Better print formatting for physical logbooks
- Online signature support
- More flexible endorsement text extraction
- Cleaner template workflows

</details>

<details>
<summary>Mid 2025 — More Tools</summary>

Started expanding the site beyond endorsements.

Added and tested tools including:

- METAR / TAF / NOTAM decoder
- Night time calculator
- Weight & balance tools
- Flight Brief workflows

The decoder eventually evolved into interpreting larger blocks of aviation weather and NOTAM text instead of only decoding abbreviations individually.

Flight Brief development also became more serious during this period.

The general workflow became:

- Record flight information
- Pull weather information
- Complete risk assessments
- Generate printable briefing sheets

</details>

<details>
<summary>Late 2025 — Workflow Integration & UI Redesign</summary>

Development shifted away from standalone tools and more toward workflow integration.

This period included:

- Login functionality
- Saved instructor and student information
- Certificate expiration reminders
- Site-wide notification systems
- Aircraft presets
- Better weather sourcing through AWC
- Embedded weight & balance inside Flight Brief
- Mobile usability improvements
- Large UI redesigns

There was also a long stretch of modifying UI and site structure without a completely clear direction.

</details>

<details>
<summary>February–March 2026 — Main Site Rebuild</summary>

Started building a separate project for aviation articles, FAA references, tool explanations, and SEO-related content.

In March, the older React project and the newer Next.js project were merged.

The merge was messy for a while.

The old project had grown organically, so consolidating it into a more structured site took time.

By March 10, the merge was complete.

The site was reorganized into multiple sections instead of a single tool page.

</details>

<details>
<summary>March–April 2026 — Accounts, Reminders, and Smarter Tools</summary>

Added user login and internal site notifications.

Added saved certificate expiration reminders.

The endorsement generator became smarter about filling information that previously required manual entry.

Additional updates included:

- Smart NOTAM functionality
- Weather sourcing moved to AWC
- Saved CFI and student profiles
- Saved certificate, medical, and weight information
- Improved weight & balance calculations
- Aircraft presets including C152, PA28, R44, and S300CBi
- Admin-managed site notifications
- Flight Brief integration with weight & balance
- Improved night time calculator display and logic
- Site-wide UI redesign

</details>

<details>
<summary>May 2026 — Decoder, Reading, Flight Computer, User Functions, and Signature Pad</summary>

Improved the decoder system.

Added smarter decoding support for larger METAR, TAF, and NOTAM text blocks.

Removed the old endorsement explanation section and replaced it with a broader Reading section.

Added a Flight Computer section for common aviation calculations.

Updated the signature pad with a flexible mobile layout, allowing users to use the full screen as a signature pad.

Added a reset password function.

Improved the Flight Brief function. Logged-in users with saved weight data can now quickly autofill weight, aircraft type, and other built-in information. Added automatic fuel time calculation and alerts for low remaining MX time.

</details>

## Thanks

<details>
<summary>People who helped shape PilotSeal</summary>

### Stephane Rebeix

Much of the original workflow design and overall philosophy behind PilotSeal was inspired by internal tools created by Stephane Rebeix during my time instructing at [USATS](https://usatsflighttraining.com/).

### John Worth

John Worth provided a large amount of practical feedback throughout development and helped improve many parts of the workflow and usability of the site.

### Nicholas Burleson

Nicholas Burleson was the first real user of PilotSeal outside of my own local workflow testing.

Early feedback, bug reports, and general usage helped validate that the project could be useful beyond personal internal use.

</details>