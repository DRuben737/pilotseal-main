# PilotSeal Style Redesign Guide

This document is the decision source for the next PilotSeal style pass. Follow these choices unless the user explicitly updates this file.

## Core Direction

- Product feel: practical tool, not marketing landing page.
- Visual model: simple, direct, mobile-first, close to the useful parts of `uitest-main/styles/22-feature-rich.html`.
- Do not restore decorative clutter. Images, previews, or illustrations are allowed only when they help a user choose or use a tool.
- Keep mobile navigation as-is unless there is a functional bug.
- Preserve routes, auth behavior, dashboard data, tool logic, article/legal content, and SEO metadata.

## Final Decisions

| Area | Decision |
| --- | --- |
| Homepage hero | Use a deep blue-gray hero, not pure black. Reduce height by about 40%. |
| Homepage flow block | Delete `Today's flow` from the hero. |
| Homepage tool cards | Show 3 core tool cards only. |
| Tool page previews | Use the current online-version treatment for previews. |
| Mobile spacing | Reduce section and card spacing by about 25%. |
| Card copy | Use title + one natural short line. Rewrite copy to fit naturally instead of truncating. |
| Primary blue | Shift from bright blue toward a calmer slate-blue. |
| Auth pages | Restore the current online desktop layout for login, register, and reset password. Keep mobile as the simple single-column form without illustration. |
| Icons | Use the existing hand-written SVG style. Do not add a new icon dependency for this pass. |

## Page Rules

### Home

- Hero:
  - Deep blue-gray background.
  - Compact height, approximately 40% shorter than the first implemented dark hero.
  - Content only: kicker, title, short body, primary CTA, secondary CTA.
  - Remove `Today's flow`.
- Tool cards:
  - Keep 3 cards.
  - Use small hand-written SVG line icons.
  - Each card has: icon, title, one short line.
  - Recommended cards:
    - Endorsement Generator
    - Flight Brief
    - Flight Computer
- Remove placeholder/resource cards that feel like marketing or roadmap content.

### Tools

- Keep the page practical and scannable.
- Use current online-version preview treatment as the reference.
- If previews are rebuilt:
  - Use a low-height preview strip at the top of each card.
  - Do not use large gallery images.
  - Keep title + one short line + action.
- Prefer 2-column desktop and 1-column mobile unless content naturally supports 3 columns.

### Auth

- Desktop:
  - Restore the online-version layout for login, register, and reset password.
  - The desktop version may include the brand/illustration area.
- Mobile:
  - Keep a single centered form.
  - Do not show illustration or large brand panel.
  - Keep spacing compact.

### Dashboard, Read, Endorsements, Legal Pages

- Keep the simple system:
  - White cards.
  - Small radius.
  - Light border.
  - Low shadow.
  - Slate text.
  - Slate-blue actions.
- Reduce vertical rhythm on mobile by about 25%.
- Do not delete functional data, article text, endorsement/legal references, or dashboard controls.

### Dashboard Admin

- Admin tools should use user-facing words, not implementation words.
  - Prefer labels such as `Endorsement Wording`, `Source details`, `Where it appears`, `Show in the generator`, `Hide for now`, and `Archive`.
  - Avoid visible engineering terms such as database, fallback, seed, JSON shape, or CRUD unless the field itself genuinely needs that format.
- Admin sidebars stay fixed in the viewport on desktop.
  - The collapsed sidebar icons must be centered within the collapsed rail.
  - The sidebar should start near the top of the viewport even after the global header scrolls away.
- Active sidebar state should move like a sliding indicator.
  - Do not switch the active background instantly from one button to another.
  - Use a single moving indicator with spring-like motion.
  - Longer moves should feel fluid, with a slight stretch and settle rather than a hard fixed-duration slide.
- Admin modals should render above the global header.
  - Use a top-level portal when a modal is inside a layout that may create a stacking context.
  - Do not rely on increasing `z-index` alone when the parent container can still trap the modal.

### Endorsement Management

- `/dashboard/admin/endorsements` is the place to maintain generator endorsement wording.
- The management page should only show the endorsement list, search, and top-level actions.
  - Do not show an always-open edit form under the list.
  - Add and edit flows open in modals.
- Categories are shown as collapsible groups.
  - Groups are collapsed by default.
  - Opening one group closes the previously open group.
  - Clicking an endorsement opens a preview first.
  - The preview modal contains the Edit action.
- Do not expose a delete action in the UI.
  - Use `Hide for now` for work-in-progress content.
  - Use `Archive` for content that should stay stored but no longer appear in the generator.
- The generator source text is admin-editable:
  - `Template data`
  - `Source date`
  - `Updated`
  - Store this separately from individual endorsement rows so one global notice feeds the generator.
- Public and signed-in users read the same active endorsement wording from Supabase.
  - If Supabase reads fail, the generator should keep working with local fallback wording.

## Visual Tokens

- Background: light slate, close to `#f8fafc`.
- Surface: white.
- Text: slate/navy, close to `#0f172a`.
- Muted text: slate gray, close to `#64748b`.
- Border: light slate, close to `#e2e8f0`.
- Primary action: slate-blue, calmer than bright `#2563eb`.
- Radius:
  - Cards: small radius, around 10-12px.
  - Buttons: around 8-10px.
  - Avoid large pill shapes except where the existing navigation pattern requires them.
- Shadow:
  - Use minimal shadow.
  - Prefer border over heavy shadow.

## Mobile Rules

- Mobile is the baseline.
- Default layout is one column.
- No horizontal scroll.
- No clipped text or clipped buttons.
- Primary CTAs should fit full width when stacked.
- Bottom nav remains visible and uses the current style.
- Content should start higher and use tighter spacing than the reverted experiment.

## Copy Rules

- Tool cards use one short line only.
- Rewrite long text rather than truncating.
- Avoid marketing phrases.
- Prefer action-oriented utility language:
  - "Generate FAA-style endorsement packets."
  - "Build a preflight briefing from route and weather context."
  - "Run flight math without switching tools."

## Do Not Do

- Do not add a new icon library for this pass.
- Do not bring back large decorative image cards.
- Do not add generic SaaS marketing sections.
- Do not use bright saturated blue for primary actions.
- Do not make the mobile experience taller or more spacious than the reverted experiment.
- Do not change tool calculations, auth flow, dashboard data logic, API routes, or content sources.

## Acceptance Checklist

- `npm run lint` passes.
- `npm run audit:endorsements` passes.
- `npm run build` passes.
- Mobile QA at 390px width:
  - `/`
  - `/tools`
  - `/tools/endorsement-generator`
  - `/login`
  - `/register`
  - `/reset-password`
  - `/dashboard`
- Desktop QA:
  - `/dashboard/admin/endorsements`
  - Sidebar collapsed icons are centered.
  - Sidebar active indicator slides between destinations with spring-like motion.
  - Endorsement categories start collapsed and only one opens at a time.
  - Endorsement preview, edit, add, help, and source detail modals render above the global header.
- For each checked page:
  - `document.documentElement.scrollWidth === window.innerWidth`
  - No clipped headings.
  - No clipped buttons.
  - Bottom nav does not cover primary content.
  - The page feels like a practical tool, not a marketing page.
