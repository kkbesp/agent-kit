---
name: ui-qa
description: Exhaustive acceptance of a web UI in a real browser the way a strict designer-QA would — every page state, every dropdown, select, popover, tooltip, modal, drawer, tab and menu opened and checked at desktop and mobile width, with screenshots looked at and a scripted layout audit. Use before saying any UI, admin panel, landing, mini app or PWA change is done, and when the owner reports visual bugs. Triggers: проверь интерфейс, UI, вёрстка, кабинет, админка, дропдаун, попап, модалка, отступы, выглядит плохо, баги UI.
---

# UI QA in a real browser

Build, HTTP 200 and passing tests say nothing about how the screen looks. The owner checks every dropdown and popup personally; find the defects before they do. This skill is the QA procedure; drive the browser with whatever automation is available: Playwright MCP, Chrome DevTools MCP, a Playwright script (`npx playwright`), or another browser skill installed by the owner. Examples below use Playwright-style `page` API.

## Setup

- Start the app from the project's own scripts (skill `terminal-ops` for background processes). Note the URL and the test account from the project docs; never invent fixtures.
- One browser session/tab for the whole check; close what you opened at the end. Do not touch the owner's own tabs or logged-in profile unless asked.
- Save evidence to the project's ignored artifacts dir (`.artifacts/qa/<feature>/`) with absolute paths, and open every screenshot as an image and look at it — a screenshot you did not look at is not a check.

## Procedure per screen

Do it at **1440×900** and at **390×844** (mobile). Switch width with `page.setViewportSize({ width: 390, height: 844 })` or the tool's resize/emulate command.

1. **Load and audit.** Navigate, wait for a real readiness condition (`waitForFunction` on content, not a timeout), then run the bundled audit and take a full-page screenshot:
   ```js
   const fs = await import("node:fs/promises");
   const audit = await fs.readFile("<this skill dir>/scripts/layout-audit.js", "utf8");
   const report = await page.evaluate(audit);   // byType, issues, popupTriggers, openOverlays
   await page.screenshot({ path: "/abs/.artifacts/qa/x/list-desktop.png", fullPage: true });
   ```
   The audit flags page horizontal scroll, elements overflowing the viewport, truncated or spilling text, broken images, overlapping controls, small tap targets and unnamed controls. Treat visual defects first; unnamed controls are accessibility debt to list, not to ignore.
2. **Open every overlay.** For each entry in `popupTriggers` and every visible button that opens something (selects, date pickers, dropdown menus, popovers, tooltips via `hover`, modals, drawers, tabs, accordions, row actions):
   - one script per trigger: click or hover → `waitForFunction` for the overlay → run the audit again → screenshot of the overlay → close with `Escape` or its close button → confirm it closed;
   - check: overlay fully inside the viewport, not clipped by a parent, aligned to its trigger, options readable without truncation, scroll inside long lists works, selected state is visible, focus returns to the trigger.
3. **States.** Empty data, loading (skeleton or the project's loader), error (stop the API or use the app's error path), long text and long numbers, many rows (pagination or virtual scroll), disabled and read-only controls, validation messages on every form field.
4. **Interaction.** Fill and submit each form with valid and invalid data, keyboard-only pass (`Tab`, `Enter`, `Escape`), hover and focus styles, sticky headers on scroll.
5. **Console and network.** Collect console messages and network requests during the actions (Playwright `page.on("console")`/`page.on("response")`, or the MCP's console/network tools); any uncaught error, 4xx/5xx on app requests or failed asset is a defect.
6. **Design system.** Compare spacing, radius, colors, type scale and component choice with the project's design tokens and library (design tokens, component library, brand README). A custom-styled clone of a library component is a defect.

## Automation gotchas

- Strict locators need exactly one match; for "some element exists" use `waitForFunction(() => !!document.querySelector(sel))`, and to pick one of many use `nth(N)` or a snapshot ref.
- Snapshot refs die after the page changes; take a new snapshot before acting on new content.
- Popups that open a new tab: arm `page.waitForEvent("popup")` before the click.
- Do the whole step (action → wait → audit → screenshot) inside one script call; one call per click is what made earlier sessions slow.

## Report

A table per screen: state/overlay → viewport → defect → screenshot path → fixed? Fix what is in scope, re-run the same steps for the fixed items, and only then report done. If something could not be checked (no test data, external service), say so explicitly.
