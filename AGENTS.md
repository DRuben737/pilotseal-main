# Project Agent Instructions

## Nested UI navigation

Treat menus, drawers, sheets, dialogs, popovers, and full-screen mobile panels as a navigation hierarchy rather than unrelated open/closed states.

- When a child surface is opened from a parent surface, closing the child must return to the immediate parent. It must not close the entire hierarchy.
- `Close`, `Cancel`, the header `X`, `Escape`, and an allowed backdrop click must follow the same one-level-back behavior.
- After a child save or apply action, return to the immediate parent unless the action explicitly completes the entire workflow.
- Preserve the parent's useful state when returning, including the selected record, active tab, filters, scroll position, and unsaved parent-level choices.
- Close the whole hierarchy only for an explicit top-level dismissal, route change, or clearly labeled completion action.
- Do not implement nested surfaces with one shared boolean or a single `setOpen(false)` path. Keep an explicit parent/return target or a surface stack.

When auditing the application, test every multi-step path in both desktop and mobile layouts. At minimum, cover:

1. Open a top-level menu or surface.
2. Open a record or action inside it.
3. Open one more nested editor when available.
4. Exercise every dismissal method without saving.
5. Exercise save/apply and validation-error paths.
6. Verify that each action returns exactly one level, with the parent state intact.

Regression example: `Schedule options -> Students -> Availability`. Closing Availability must return to Students; it must not close both panels.
