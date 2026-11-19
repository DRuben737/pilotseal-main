import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const playwrightPath = process.env.CONSOLE_PLAYWRIGHT_PATH;
assert(playwrightPath, "Set CONSOLE_PLAYWRIGHT_PATH to a local Playwright installation.");
const { chromium } = await import(playwrightPath);
const appUrl = process.env.CONSOLE_APP_URL ?? "http://127.0.0.1:3000";
const isLocal = (value) => ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(value).hostname);
assert(isLocal(appUrl), "Console UI tests require a local app.");
execFileSync(process.execPath, ["scripts/assert-local-targets.mjs"], { stdio: "pipe" });

const raw = execFileSync(
  "./node_modules/.bin/supabase",
  ["status", "--network-id", "pilotseal-local", "--output", "env"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
);
const env = Object.fromEntries(raw.split(/\r?\n/).flatMap((line) => {
  const match = line.match(/^([A-Z0-9_]+)=["']?(.*?)["']?$/);
  return match ? [[match[1], match[2]]] : [];
}));
assert(isLocal(env.API_URL), "Console fixtures must use the local Supabase API.");

const authOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const authClient = () => createClient(env.API_URL, env.ANON_KEY ?? env.PUBLISHABLE_KEY, authOptions);
const signIn = async (email, password) => {
  const { data, error } = await authClient().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
};

const sessions = {
  personal: await signIn("pilot.one@example.test", "LocalPilot!2026"),
  instructor: await signIn("cfi@example.test", "123456778"),
  platform: await signIn("platform.admin@example.test", "LocalPlatform!2026"),
};

const routes = {
  personal: [
    "/console/personal/training-guide",
    "/console/personal/training-records",
    "/console/personal/people",
    "/console/personal/aircraft",
    "/console/personal/reports",
    "/console/personal/flight-briefs",
    "/console/personal/endorsements",
    "/console/personal/notifications",
    "/console/personal/account",
  ],
  instructor: ["/console/personal/schedule"],
  organization: [
    "/console/organization/training-guide",
    "/console/organization/training-records",
    "/console/organization/people",
    "/console/organization/aircraft",
    "/console/organization/reports",
    "/console/organization/endorsements",
    "/console/organization/notifications",
  ],
  platform: [
    "/console/platform/organizations",
    "/console/platform/aircraft",
    "/console/platform/endorsements",
    "/console/platform/training-guide",
    "/console/platform/notices",
    "/console/platform/activity",
  ],
};

const output = path.resolve("artifacts/console-ui-qa");
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const pageErrors = [];

async function contextFor(session, width) {
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
    timezoneId: "America/New_York",
  });
  await context.route("**/*", (route) => isLocal(route.request().url()) ? route.continue() : route.abort());
  const storageKey = `sb-${new URL(env.API_URL).hostname.split(".")[0]}-auth-token`;
  await context.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: storageKey,
    value: JSON.stringify(session),
  });
  return context;
}

async function visibleMetrics(page) {
  return page.evaluate(() => {
    const visible = (element) => element.getClientRects().length > 0;
    const headings = Array.from(document.querySelectorAll(".dashboard-content h1")).filter(visible);
    const secondaryHeadings = Array.from(document.querySelectorAll(".dashboard-content h2")).filter(visible);
    const tertiaryHeadings = Array.from(document.querySelectorAll(".dashboard-content h3")).filter(visible);
    const copy = Array.from(document.querySelectorAll(".dashboard-content p, .dashboard-content li, .dashboard-content dd")).filter(visible);
    const controls = Array.from(document.querySelectorAll(
      '.dashboard-content input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), .dashboard-content select, .dashboard-content textarea',
    )).filter(visible);
    const checkboxes = Array.from(document.querySelectorAll('.dashboard-content input[type="checkbox"]')).filter(visible);
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      headingSizes: headings.map((heading) => Number.parseFloat(getComputedStyle(heading).fontSize)),
      secondaryHeadingSizes: secondaryHeadings.map((heading) => Number.parseFloat(getComputedStyle(heading).fontSize)),
      tertiaryHeadingSizes: tertiaryHeadings.map((heading) => Number.parseFloat(getComputedStyle(heading).fontSize)),
      copySizes: copy.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
      controlSizes: controls.map((control) => Number.parseFloat(getComputedStyle(control).fontSize)),
      checkboxSizes: checkboxes.map((control) => ({
        width: control.getBoundingClientRect().width,
        height: control.getBoundingClientRect().height,
        outline: getComputedStyle(control).outlineStyle,
      })),
      duplicateHeadings: headings.map((heading) => heading.textContent?.trim()).filter((value, index, all) => value && all.indexOf(value) !== index),
      forbiddenCopy: /Plan clearly\.|Teach precisely\.|Practical tools for endorsements|built for modern teams/i.test(document.body.innerText),
    };
  });
}

async function auditRoute(page, route, width) {
  console.log(`Auditing ${route} at ${width}px`);
  await page.goto(`${appUrl}${route}`, { waitUntil: "domcontentloaded" });
  try {
    await page.locator(".dashboard-content").waitFor();
  } catch (error) {
    console.error(`Route failed at ${page.url()}:`, (await page.locator("body").innerText()).slice(0, 1200));
    throw error;
  }
  // Authentication, organization permissions, and table data settle through
  // separate local requests after the shell is visible.
  await page.waitForTimeout(700);
  const metrics = await visibleMetrics(page);
  assert(metrics.documentWidth <= metrics.viewportWidth + 1, `${route} has no page overflow at ${width}px`);
  assert(metrics.headingSizes.every((size) => size <= 24), `${route} keeps application headings compact`);
  assert.equal(metrics.duplicateHeadings.length, 0, `${route} has no duplicate visible page title`);
  assert.equal(metrics.forbiddenCopy, false, `${route} contains no marketing copy`);
  assert(metrics.checkboxSizes.every(({ width: boxWidth, height }) => boxWidth <= 20 && height <= 20), `${route} checkboxes stay compact`);
  assert(metrics.checkboxSizes.every(({ outline }) => outline === "none"), `${route} checkboxes do not use an outer outline`);
  if (width === 390) {
    assert(metrics.headingSizes.every((size) => size <= 20), `${route} keeps mobile page titles at 20px or below`);
    assert(metrics.secondaryHeadingSizes.every((size) => size <= 16), `${route} keeps mobile section titles at 16px or below`);
    assert(metrics.tertiaryHeadingSizes.every((size) => size <= 15), `${route} keeps mobile subsection titles at 15px or below`);
    assert(metrics.copySizes.every((size) => size <= 15), `${route} keeps mobile interface copy at 15px or below`);
    assert(metrics.controlSizes.every((size) => size >= 16), `${route} fields avoid mobile focus zoom`);
  }
}

async function auditRole(label, session, roleRoutes) {
  for (const width of [390, 768, 1024, 1440]) {
    const context = await contextFor(session, width);
    const page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(`${label}: ${error.message}`));
    for (const route of roleRoutes) await auditRoute(page, route, width);
    await page.screenshot({ path: path.join(output, `${label}-${width}.png`), fullPage: true });
    await context.close();
  }
}

async function auditDrawerDismissal(session, route, triggerName, dialogName) {
  const context = await contextFor(session, 1440);
  const page = await context.newPage();
  await page.goto(`${appUrl}${route}`);
  const trigger = page.getByRole("button", { name: triggerName, exact: true });
  await trigger.waitFor();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: dialogName, exact: true });
  await dialog.waitFor();
  assert.equal(await dialog.getAttribute("aria-modal"), "true", `${dialogName} is modal`);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert(await trigger.evaluate((element) => element === document.activeElement), `${dialogName} restores focus`);
  await context.close();
}

try {
  await auditRole("personal", sessions.personal, routes.personal);
  await auditRole("instructor", sessions.instructor, routes.instructor);
  await auditRole("organization", sessions.personal, routes.organization);
  await auditRole("platform", sessions.platform, routes.platform);
  await auditDrawerDismissal(sessions.personal, "/console/personal/people", "Create profile", "Create profile");
  await auditDrawerDismissal(sessions.platform, "/console/platform/organizations", "Add organization", "Add organization");

  const redirectContext = await contextFor(sessions.personal, 1024);
  const redirectPage = await redirectContext.newPage();
  await redirectPage.goto(`${appUrl}/dashboard/people`);
  await redirectPage.waitForURL("**/console/personal/people");
  await redirectContext.close();

  assert.deepEqual(pageErrors, [], `No page errors are emitted:\n${pageErrors.join("\n")}`);
  console.log(`Console UI QA passed. Screenshots: ${output}`);
} finally {
  await browser.close();
}
