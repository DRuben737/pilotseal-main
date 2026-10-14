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
    if (u.pathname === "/api/sky-art-refine") {
      const body = route.request().postDataJSON();
      return route.fulfill({ json: { strokes: body.strokes } });
    }
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
  const moreTool = async (name) => {
    const menu = page.locator('details[class*="toolMore"]');
    if ((await menu.getAttribute("open")) === null) await page.getByLabel("More tools").click();
    await menu.getByRole("button", { name, exact: true }).click();
  };
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
  assert.equal(await page.locator('[class*="presets"] button').count(), 12);
  assert.equal(await page.getByLabel("Pattern category").count(), 0);
  await page.screenshot({
    path: path.join(output, "canvas-desktop.png"),
    fullPage: true,
  });
  assert.equal(await page.getByLabel("X", { exact: true }).count(), 0);
  assert.equal(await page.getByLabel("Y", { exact: true }).count(), 0);
  assert.equal(await page.getByLabel("Rotation °", { exact: true }).count(), 0);
  assert.equal(
    await page.getByLabel("Project name", { exact: true }).count(),
    0,
  );
  await moreTool("Clear canvas");
  await page.waitForFunction(
    () =>
      document.querySelectorAll('[class*="elementList"] button').length === 0,
  );
  assert.equal(
    await page.getByRole("button", { name: "View on map →" }).isEnabled(),
    false,
  );
  assert.equal(
    await page.locator('[class*="toolMenu"] button[aria-label="Clear canvas"]').isDisabled(),
    true,
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await ready();
  const startDrawing = page.getByLabel("Start drawing", { exact: true });
  await startDrawing.selectOption({ label: "2026 · 2 (1)" });
  await ready();
  await startDrawing.selectOption("");
  await ready();
  await page.getByText("Layers", { exact: true }).click();
  await page
    .locator('[class*="elementList"] button')
    .filter({ hasText: "2026" })
    .click();
  await page.getByText("Layers", { exact: true }).click();
  // Text edit, undo, unsupported character recovery.
  const text = page.getByRole("textbox", { name: "Text content" });
  await text.fill("生日快乐");
  await ready();
  await page.screenshot({
    path: path.join(output, "canvas-chinese.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Undo", exact: true }).click();
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
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await ready();
  // Select both through element list, group, move as one and undo.
  await page.getByText("Layers", { exact: true }).click();
  const elements = page.locator('[class*="elementList"] button');
  await elements.nth(0).click();
  await elements.nth(1).click({ modifiers: ["Shift"] });
  await moreTool("Group selected");
  await ready();
  assert.equal(await page.getByText("Grouped", { exact: true }).count(), 2);
  await moreTool("Ungroup selected");
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
  const radius = page.getByLabel("Turn radius NM", { exact: true });
  assert.ok(await radius.isVisible());
  await radius.fill("0.1");
  assert.equal(await radius.inputValue(), "0.1");
  await radius.fill("0");
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
  await moreTool("Select multiple");
  await page.getByText("Layers", { exact: true }).click();
  const mobileElements = page.locator('[class*="elementList"] button');
  await mobileElements.nth(0).click();
  await mobileElements.nth(1).click();
  assert.equal(
    await page
      .locator('[class*="elementList"] button[aria-pressed="true"]')
      .count(),
    2,
  );
  await moreTool("Group selected");
  await ready();
  await moreTool("Ungroup selected");
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
  // Hand drawing shares the same saved project, planner and map flow.
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await moreTool("Clear canvas");
  await page.getByRole("button", { name: "Draw", exact: true }).click();
  const drawingDialog = page.getByRole("dialog", { name: "Drawing canvas" });
  assert.equal(await drawingDialog.isVisible(), true);
  const svg = page.getByRole("img", { name: "Artwork composition canvas" });
  const drawBox = await svg.boundingBox();
  const canvasPoint = (x, y) => ({
    x: drawBox.x + (drawBox.width * x) / 800,
    y: drawBox.y + (drawBox.height * y) / 600,
  });
  for (const [index, [x, y]] of [
    [330, 280], [300, 240], [260, 260], [275, 320], [400, 420],
    [525, 320], [540, 260], [500, 240], [470, 280],
  ].entries()) {
    const p = canvasPoint(x, y);
    await page.mouse.move(p.x, p.y, { steps: 3 });
    if (index === 0) await page.mouse.down();
  }
  await page.mouse.up();
  await drawingDialog.getByRole("button", { name: "Close drawing canvas" }).click();
  await moreTool("Close last stroke");
  await moreTool("Refine lines");
  await page.getByLabel("More tools").click();
  assert.ok(await page.getByRole("button", { name: "Apply refinement" }).isVisible());
  await moreTool("Apply refinement");
  await moreTool("AI adjust");
  await moreTool("Discard preview");
  const sketchFile = await download("Save project");
  const sketchProject = JSON.parse(fs.readFileSync(sketchFile, "utf8"));
  assert.equal(sketchProject.version, 2);
  assert.equal(sketchProject.composition.elements[0].kind, "sketch");
  assert.ok(sketchProject.composition.elements[0].strokes[0].raw.length > 2);
  await page.getByRole("button", { name: "Generate route" }).click();
  await ready();
  await page.screenshot({ path: path.join(output, "handdraw-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "View on map →" }).click();
  await page.getByRole("heading", { name: "Position" }).waitFor();
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
