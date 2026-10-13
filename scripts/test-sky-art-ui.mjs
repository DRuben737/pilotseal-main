import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const modulePath =
  process.env.SKY_ART_PLAYWRIGHT_MODULE ??
  "/Users/ruben/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright";
const { chromium } = require(modulePath);
const url = process.env.SKY_ART_LOCAL_URL ?? "http://127.0.0.1:3100";
assert.ok(
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname),
  "Browser checks must target localhost.",
);
const output = path.resolve("artifacts/sky-art-qa");
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.SKY_ART_CHROME_PATH ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    acceptDownloads: true,
  });
  let sectionalRequests = 0;
  await context.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (
      u.hostname === "tiles.arcgis.com" &&
      u.pathname.includes("VFR_Sectional/MapServer/tile/")
    ) {
      sectionalRequests++;
      return route.fulfill({
        contentType: "image/png",
        body: fs.readFileSync("scripts/fixtures/sky-art-sectional.png"),
      });
    }
    if (u.pathname === "/sky-art/airports.json")
      return route.fulfill({
        json: [["X001", "XXA", "Synthetic Test Airport", 40, -75, "Test Town"]],
      });
    if (
      ["localhost", "127.0.0.1"].includes(u.hostname) ||
      ["data:", "blob:"].includes(u.protocol)
    )
      return route.continue();
    if (u.hostname === "www.googletagmanager.com")
      return route.fulfill({ contentType: "text/javascript", body: "" });
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  console.log("Checking canvas, composition and typography…");
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("Failed to load resource"))
      errors.push(m.text());
  });
  await page.goto(`${url}/tools/sky-art`);
  const ready = async () => {
    await page.waitForFunction(
      () => {
        const b = [...document.querySelectorAll("button")].find(
          (b) => b.textContent === "View on map →",
        );
        return b && !b.disabled;
      },
      {},
      { timeout: 30000 },
    );
  };
  await ready();
  assert.equal(
    await page
      .getByRole("button", { name: "Christmas tree", exact: true })
      .count(),
    1,
  );
  await page.screenshot({
    path: path.join(output, "canvas-desktop.png"),
    fullPage: true,
  });
  // Text edit, undo, unsupported character recovery.
  const text = page.getByRole("textbox", { name: "Text content" });
  await text.fill("生日快乐");
  await ready();
  await page.screenshot({
    path: path.join(output, "canvas-chinese.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "↶ Undo", exact: true }).click();
  assert.equal(await text.inputValue(), "2026");
  await ready();
  await text.fill("🦄");
  await page.getByRole("alert").filter({ hasText: "Unsupported" }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "View on map →" }).isEnabled(),
    false,
  );
  await text.fill("2026");
  await ready();
  // Terminate an expensive job, then verify a fresh Worker can retry that composition.
  await text.fill("B8O".repeat(10));
  await page.waitForFunction(
    () => {
      const button = [...document.querySelectorAll("button")].find(
        (b) => b.textContent === "Cancel",
      );
      if (!button) return false;
      button.click();
      return true;
    },
    {},
    { polling: 10, timeout: 10000 },
  );
  await page
    .getByRole("alert")
    .filter({ hasText: "Generation cancelled" })
    .waitFor();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  try {
    await ready();
  } catch (error) {
    console.log(
      "Retry diagnostic",
      await page.locator("[role=alert]").allTextContents(),
    );
    throw error;
  }
  await text.fill("2026");
  await ready();
  // Drag using canvas coordinates, then undo.
  const canvas = page.locator('svg[aria-label="Artwork composition canvas"]');
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.53, box.y + box.height * 0.34, {
    steps: 5,
  });
  await page.mouse.up();
  await ready();
  await page.getByRole("button", { name: "↶ Undo", exact: true }).click();
  await ready();
  // Select both through element list, group, move as one and undo.
  const elements = page.locator('[class*="elementList"] button');
  await elements.nth(0).click();
  await elements.nth(1).click({ modifiers: ["Shift"] });
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await ready();
  assert.equal(await page.getByText("Grouped", { exact: true }).count(), 2);
  await page.getByRole("button", { name: "Ungroup", exact: true }).click();
  await ready();
  console.log("Checking map controls and playback…");
  await page.getByRole("button", { name: "View on map →" }).click();
  await page.locator(".maplibregl-canvas").waitFor();
  await page.waitForTimeout(1200);
  assert.equal(
    await page.getByText("Map unavailable.", { exact: false }).count(),
    0,
  );
  const countPoints = async () =>
    Number(
      (await page.locator('[class*="metrics"]').innerText()).match(
        /(\d+) waypoints/,
      )[1],
    );
  const balancedCount = await countPoints();
  await page.getByText("Advanced", { exact: true }).click();
  await page.getByLabel("Navigation detail", { exact: true }).selectOption("0");
  const fullCount = await countPoints();
  assert.ok(fullCount > balancedCount, "original detail restores points");
  await page
    .getByLabel("Navigation detail", { exact: true })
    .selectOption("0.1");
  assert.ok(
    (await countPoints()) <= balancedCount,
    "lower detail reduces points",
  );
  await page
    .getByLabel("Navigation detail", { exact: true })
    .selectOption("0.05");
  assert.equal(await countPoints(), balancedCount);
  const original = await page.locator('[class*="metrics"] strong').innerText();
  await page.getByRole("button", { name: "Enlarge artwork" }).click();
  const larger = await page.locator('[class*="metrics"] strong').innerText();
  assert.ok(parseFloat(larger) > parseFloat(original));
  await page.getByRole("button", { name: "Move artwork north" }).click();
  await page.getByRole("button", { name: "Rotate artwork right" }).click();
  await page.getByLabel("Airport", { exact: true }).fill("X001");
  await page
    .getByRole("button", { name: "X001 XXA Synthetic Test Airport" })
    .click();
  assert.ok(await page.getByText("X001 · Synthetic Test Airport").isVisible());
  await page.getByLabel("Include airport return").check();
  await page.getByText("Placement", { exact: true }).click();
  await page.getByLabel("Anchor", { exact: true }).selectOption("start");
  await page.getByRole("button", { name: "▶ Fly track" }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Ⅱ Pause" }).click();
  assert.ok(
    Number(
      await page
        .getByRole("slider", { name: "Flight track playback position" })
        .inputValue(),
    ) > 0,
  );
  await page.screenshot({
    path: path.join(output, "map-desktop.png"),
    fullPage: true,
  });
  await page.getByLabel("Map layer", { exact: true }).selectOption("vfr");
  await page.waitForFunction(
    () =>
      document.querySelector('select[aria-label="Map layer"]')?.value === "vfr",
  );
  await page.waitForTimeout(500);
  assert.ok(
    sectionalRequests > 0,
    "VFR selection requests the official tile template",
  );
  await page.getByLabel("Map layer", { exact: true }).selectOption("base");
  console.log("Checking nav log and all exports…");
  const launchHref = await page
    .getByRole("link", { name: "Open in ForeFlight" })
    .getAttribute("href");
  assert.equal(new URL(launchHref).protocol, "foreflightmobile:");
  assert.ok(new URL(launchHref).searchParams.get("q").split(" ").length > 20);
  await page.getByRole("button", { name: "Details", exact: true }).click();
  const rows = await page.locator("tbody tr").count();
  assert.ok(rows > 20);
  const download = async (name) => {
    const wait = page.waitForEvent("download");
    await page.getByRole("button", { name, exact: true }).click();
    const file = await wait;
    const target = path.join(output, file.suggestedFilename());
    await file.saveAs(target);
    return target;
  };
  const csv = fs.readFileSync(await download("Nav log CSV"), "utf8");
  assert.equal(csv.split("\r\n").length, rows + 1);
  const route = await page
    .getByRole("textbox", { name: "ForeFlight ordered route" })
    .inputValue();
  assert.equal(route.split(" ").length, rows + 1);
  await download("Nav log PDF");
  await download("Track PNG");
  await download("Waypoints KML");
  await download("Track layer KML");
  await download("ForeFlight GPX route");
  await download("Download route");
  await download("Download numbered parts");
  await page.screenshot({
    path: path.join(output, "details-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "View leg 5 on map" }).click();
  assert.ok(
    await page.getByText(`LEG 5 / ${rows}`, { exact: true }).isVisible(),
  );
  const projectFile = await download("Save project");
  await page.reload();
  await page.getByText("Local project restored.").waitFor();
  await ready();
  await page.locator("input[type=file]").setInputFiles(projectFile);
  await page.getByText("Project opened.").waitFor();
  await ready();
  // Responsive canvas and map, no page-level horizontal overflow.
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Select multiple", exact: true })
    .click();
  const mobileElements = page.locator('[class*="elementList"] button');
  await mobileElements.nth(0).click();
  await mobileElements.nth(1).click();
  assert.equal(
    await page
      .locator('[class*="elementList"] button[aria-pressed="true"]')
      .count(),
    2,
  );
  await page.getByRole("button", { name: "Group", exact: true }).click();
  await ready();
  await page.getByRole("button", { name: "Ungroup", exact: true }).click();
  await ready();

  await page.screenshot({
    path: path.join(output, "canvas-mobile.png"),
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  );
  await page.getByRole("button", { name: "View on map →" }).click();
  await page.waitForTimeout(700);
  assert.ok(await page.getByText("X001 · Synthetic Test Airport").isVisible());
  await page.screenshot({
    path: path.join(output, "map-mobile.png"),
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        result: "passed",
        legs: rows,
        downloads: 9,
        screenshots: 7,
        externalConnections: "blocked",
        output,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
