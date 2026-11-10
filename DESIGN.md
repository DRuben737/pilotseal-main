# PilotSeal design system

## 1. Design direction

PilotSeal is calm aviation software: precise enough for regulated training work, quiet enough to use before a flight, and spacious enough to make complex information feel manageable.

The visual language is **editorial aviation**:

- Full bleed natural aviation photography on marketing surfaces.
- Warm ivory canvas, deep green ink, and misty blue green supporting tones.
- Large editorial headlines paired with compact, factual interface copy.
- Interface chrome recedes so the task, data, or landscape carries the page.
- Shape, depth, and motion stay restrained. No decorative dashboard effects.

This document is the source of truth for future UI work. Shared implementation tokens live in `app/design-tokens.css`.

## 2. Product modes

The same language has two volumes.

### Marketing mode

Use for the homepage, public guides, product introductions, and campaign pages.

- Photography first and preferably full bleed.
- One primary action per hero.
- A short eyebrow, a direct benefit headline, one clarifying paragraph, and one CTA.
- Large areas of negative space are intentional.
- Atmospheric depth comes from the image, never from decorative CSS gradients.

### Application mode

Use for tools, dashboards, administration, forms, schedules, and record management.

- Compact information density with the same warm surfaces and quiet ink.
- Four surface layers create hierarchy through 1 to 3 percent lightness changes.
- Cards are flat. Separate them with a surface change or one soft hairline.
- Keep actions close to the records they affect.
- Do not place decorative photography behind dense work surfaces.

## 3. Brand principles

1. **Calm before clever.** The interface must reduce cognitive load.
2. **Exact before expressive.** Aviation facts, validation, and status always outrank decoration.
3. **One obvious next step.** Every surface has one primary action at a time.
4. **Photography supplies atmosphere.** UI components do not imitate depth with heavy shadows or gradients.
5. **State is visible.** Selected, focused, loading, empty, error, and saved states must be explicit.
6. **Mobile is a complete hierarchy.** Menus, sheets, and nested editors return one level at a time.

## 4. Color system

### Core ink

| Token | Value | Use |
|---|---:|---|
| `--ps-ink` | `#20231f` | Primary text and primary action fill |
| `--ps-ink-soft` | `#4f554d` | Secondary headings and strong metadata |
| `--ps-ink-muted` | `#686d65` | Supporting copy and inactive navigation |
| `--ps-ink-faint` | `#858a82` | Placeholders and disabled text |

Do not use `#000`. Deep green ink is the darkest neutral.

### Four light surfaces

| Layer | Token | Value | Use |
|---|---|---:|---|
| Canvas | `--ps-surface-0` | `#f7f3eb` | Page background |
| Raised | `--ps-surface-1` | `#faf7f0` | Tool sections and sidebars |
| Panel | `--ps-surface-2` | `#fdfaf4` | Cards, grouped forms, drawers |
| Strong | `--ps-surface-3` | `#fffdf8` | Inputs, selected content, modal body |

Use adjacent layers together. Do not jump directly from Canvas to Strong unless the element must read as editable.

### Supporting colors

| Token | Value | Use |
|---|---:|---|
| `--ps-sky` | `#dbe7e8` | Quiet informational surfaces |
| `--ps-sky-strong` | `#6f8f94` | Informational text or small indicators |
| `--ps-meadow` | `#dfe8d5` | Positive and completion surfaces |
| `--ps-meadow-strong` | `#52705a` | Positive text and status |
| `--ps-warning` | `#8a642f` | Caution text |
| `--ps-danger` | `#8a3f3b` | Destructive actions and critical errors |

Status colors communicate meaning only. They are not decorative accents.

### Lines and focus

- Standard hairline: `--ps-line`, one pixel.
- Strong separator: `--ps-line-strong`, one pixel.
- Focused fields must not gain a border or outline.
- Use the shared double ring shadow in `--ps-focus-ring`.

## 5. Typography

### Families

- **Editorial display:** `--ps-font-display`, used only for marketing headlines, major empty states, and rare statement copy.
- **Interface sans:** `--ps-font-sans`, used for all navigation, body copy, forms, tables, buttons, and dense product UI.
- **Data mono:** `--ps-font-mono`, used only when fixed width characters improve reading.

The serif and sans pairing is intentional because it is a defining part of the approved template. Do not introduce a third family.

### Scale

| Style | Size / line height | Weight | Use |
|---|---|---:|---|
| Display 1 | 60 / 60 | 400 | Marketing hero |
| Display 2 | 48 / 48 | 400 | Marketing section statement |
| Heading 1 | 36 / 40 | 600 | Application page title |
| Heading 2 | 30 / 36 | 600 | Major section title |
| Heading 3 | 24 / 32 | 600 | Panel title |
| Title | 18 / 28 | 500 | Card and list title |
| Body | 16 / 24 | 400 | Default copy and inputs |
| Body small | 14 / 20 | 400 | Supporting copy |
| Label | 12 / 16 | 600 | Eyebrows, field labels, metadata |

Rules:

- Use sentence case.
- Apply `text-wrap: balance` to headings and `text-wrap: pretty` to body copy.
- Avoid orphaned last words.
- Use weight 600 instead of heavy or black weights.
- Use `font-variant-numeric: tabular-nums` for dates, times, measurements, and changing values.
- Inline icons sit `0.125em` lower than the text baseline.

## 6. Spacing

Only use this scale:

`2, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96px`

Common patterns:

- Button padding: 8px vertical and 12px horizontal.
- Dense row padding: 8px to 12px.
- Card padding: 16px or 24px.
- Page gutter: 16px mobile, 24px tablet, 32px desktop.
- Marketing section rhythm: 64px to 96px.
- Application section rhythm: 24px to 48px.

## 7. Shape

All rounded elements use continuous curvature. Apply `corner-shape: squircle` when supported and keep the radius fallback.

| Token | Value | Use |
|---|---:|---|
| Small | 8px | Inline controls and compact imagery |
| Medium | 12px | Inputs and compact panels |
| Large | 16px | Cards and drawers |
| Extra large | 24px | Large marketing or empty state panels |
| Pill | 999px | Primary actions, filters, and segmented controls |

Nested radii follow: `inner radius = outer radius minus the internal gap`, when the result is above 2px.

Do not use rounded frames around full bleed hero photography.

## 8. Depth

Depth comes from four sources, in order:

1. Surface lightness change.
2. One pixel hairline.
3. Backdrop blur for sticky navigation or overlays.
4. A restrained shadow only for a floating modal, drawer, or photographic object.

Never apply harsh black outlines. Do not add default card shadows to create hierarchy.

## 9. Imagery

Photography should feel real, calm, and operationally relevant.

- Preferred subjects: flight training, aircraft, runways, sky, terrain, weather, navigation, and human preparation.
- Use natural light, restrained saturation, and believable aircraft details.
- Compose hero images with clean negative space designed for copy.
- Keep the aircraft secondary unless the page is specifically about an aircraft.
- Avoid stock photo smiles, dramatic HDR, fantasy skies, fake cockpit instruments, and visible AI artifacts.
- Serve responsive JPEG, WebP, or AVIF. Do not animate large raster images continuously.

## 10. Components

### Navigation

- Marketing navigation is quiet and transparent over light photography.
- Application navigation uses Surface 1 with a soft hairline.
- Current location is visible without a heavy filled tab.
- Mobile navigation is a full height panel with a clear close action and Escape support.

### Buttons

**Primary:** deep ink pill, white label. One primary action per surface.

**Secondary:** Surface 3 pill or text action. It must be visually quieter than Primary.

**Tertiary:** text only, used for navigation and low commitment actions.

**Destructive:** danger text or muted danger surface. Never reuse Primary styling.

All buttons require hover, active, focus, disabled, and loading states. Active feedback uses `scale(0.98)`.

### Inputs

- Surface 3 background, 12px continuous radius.
- Resting hairline is optional when the surrounding surface already separates the field.
- Focus uses a deeper double ring shadow, never a new border or outline.
- Labels remain visible above the field. Placeholder text is not a label.
- Errors appear inline, identify the problem, and tell the user what to do.

### Cards and panels

- Cards use Surface 2 and either a complete hairline or no line.
- Do not use a border on only one side of a card.
- Application cards may be dense; marketing cards remain spacious.
- Selected cards use a surface shift and ring, not a thick border.

### Tables and lists

- Prefer aligned rows over a collection of cards for repeated data.
- Use tabular numbers.
- Keep column headers quiet and sticky only when it materially helps scanning.
- Row actions remain near the row and do not become a second global toolbar.

### Dialogs, drawers, and sheets

- Every nested surface has an explicit parent or return target.
- Close, Cancel, header X, Escape, and backdrop dismissal all return one level.
- Save and Apply return to the immediate parent unless the workflow is complete.
- Preserve parent selection, filters, scroll position, and unsaved parent choices.

### Feedback

- Success is calm and specific.
- Copy actions replace the copy icon with a checkmark for 2.5 seconds.
- Loading uses skeletons shaped like the final content.
- Empty states explain the next useful action without implementation prose.

## 11. Motion

Motion is brief, weighted, and purposeful.

- Base curve: `cubic-bezier(0.22, 1, 0.36, 1)`.
- Hover feedback: 220 to 300ms.
- Page entrance: 420ms, with no more than 60ms between items.
- Section reveal: 600 to 800ms, once per section.
- Animate only opacity and transform.
- Never animate a full bleed raster continuously.
- Respect `prefers-reduced-motion` and show the completed state immediately.
- Scrolling, paging, and settling use a critically damped spring with damping ratio 1 and the release gesture velocity.
- Drag interactions use a 1200 / 80 spring with zero bounce.
- Like or favorite reactions use a 380 / 18 spring with subtle bounce.
- Expand and collapse use CSS Grid interpolation from `0fr` to `1fr`.
- Boundary scrolling and swiping get a small elastic response.

## 12. Copy voice

PilotSeal copy is precise, plain, and encouraging.

- Lead with the outcome, then name the tool or requirement.
- Prefer concrete aviation language over generic SaaS phrases.
- Avoid hype, exclamation marks, and implementation explanations.
- Do not invent customer counts, time savings, compliance claims, testimonials, or guarantees.
- Buttons use a verb plus the result: `Create an endorsement`, `Prepare a flight brief`, `Add an aircraft`.
- Errors say what failed and the next action: `The report could not be saved. Check the required aircraft fields and try again.`

Marketing hero pattern:

1. Audience or category eyebrow.
2. Outcome focused headline.
3. One sentence naming the actual tools.
4. One primary CTA.

## 13. Responsive behavior

### Up to 760px

- Single column by default.
- Full height mobile navigation.
- Page gutter 16px.
- Primary actions remain visible in the first screen.
- Dense tables may use horizontal scrolling only when a stacked row would destroy comparison.

### 761px to 1023px

- Page gutter 24px.
- Two column layouts only when both columns remain readable.
- Drawers may replace centered dialogs for complex editing.

### 1024px and above

- Page gutter 32px.
- Marketing copy caps at 680px.
- Application content caps according to task density, not a universal narrow container.

## 14. Accessibility

- WCAG AA contrast is the minimum.
- Every meaningful image has alt text; atmospheric backgrounds use empty alt text.
- All controls work by keyboard.
- Focus is always visible through the shared double ring.
- Touch targets are at least 44 by 44px.
- Do not encode status through color alone.
- Reduced motion must not remove information.

## 15. Migration contract

Future redesign work follows this order:

1. Replace page specific colors, spacing, and timing with `--ps-*` tokens.
2. Migrate shared primitives: Button, PillButton, Panel, Badge, Stat, inputs.
3. Migrate public pages and guides.
4. Migrate tools and dashboard shells.
5. Migrate dense management screens one workflow at a time.
6. Audit nested navigation on desktop and mobile after every workflow migration.

Do not perform a global class rename or bulk visual rewrite. Each migrated surface must remain functional and locally verified before moving to the next.

## 16. Definition of done

A redesigned surface is complete only when:

- It uses shared design tokens.
- It has one clear primary action.
- Typography and spacing come from this system.
- Focus, hover, active, disabled, loading, empty, and error states are covered where applicable.
- Numbers use tabular figures.
- Mobile and desktop navigation return one level at a time.
- Motion is smooth under normal load and removed under reduced motion.
- No explanatory development copy appears in the product UI.
