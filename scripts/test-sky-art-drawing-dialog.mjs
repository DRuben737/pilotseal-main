import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { webkit, devices } = require(
  "/Users/ruben/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const url = process.env.SKY_ART_LOCAL_URL ?? "http://localhost:3000";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname));
const browser = await webkit.launch({ headless: true });
try {
  const context = await browser.newContext({ ...devices["iPad Pro 11"], acceptDownloads: true });
  await context.route("**/*", (route) =>
    ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname)
      ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${url}/tools/sky-art`);
  await page.getByRole("button", { name: "View on map →" }).waitFor();
  await page.getByLabel("More tools").click();
  await page.getByRole("button", { name: "Clear canvas" }).click();
  await page.getByRole("button", { name: "Draw", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Drawing canvas" });
  assert.equal(await dialog.isVisible(), true);
  await dialog.screenshot({ path: "artifacts/sky-art-qa/drawing-dialog-ipad.png" });
  assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden");
  assert.equal(await dialog.getByRole("button", { name: "Draw", exact: true }).getAttribute("aria-pressed"), "true");
  const canvas = dialog.getByRole("img", { name: "Artwork composition canvas" });
  const box = await canvas.boundingBox();
  assert.ok(box && box.width > 500 && box.height > 500);
  const point = (x, y) => ({ x: box.x + x, y: box.y + y });
  const start = point(120, 160);
  const touch = async (type, p) => page.evaluate(({ type, p }) => {
    const svg = document.querySelector('[role="dialog"] svg[aria-label="Artwork composition canvas"]');
    const contact = { identifier: 1, target: svg, clientX: p.x, clientY: p.y };
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
      touches: { value: type === "touchend" ? [] : [contact] },
      targetTouches: { value: type === "touchend" ? [] : [contact] },
      changedTouches: { value: [contact] },
    });
    svg.dispatchEvent(event);
  }, { type, p });
  await touch("touchstart", start);
  for (let i = 1; i <= 15; i++) await touch("touchmove", point(120 + i * 12, 160 + i * 3));
  await dialog.locator('svg path[stroke="#f97316"][stroke-width="2.5"]').waitFor();
  await touch("touchend", point(300, 205));
  await dialog.getByRole("button", { name: "Close drawing canvas" }).click();
  assert.equal(await dialog.count(), 0);
  assert.equal(await page.evaluate(() => document.body.style.overflow), "");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project" }).click();
  const project = JSON.parse(fs.readFileSync(await (await download).path(), "utf8"));
  assert.equal(project.composition.elements.length, 1);
  assert.equal(project.composition.elements[0].kind, "sketch");
  assert.ok(project.composition.elements[0].strokes[0].points.length > 1);
  assert.equal(await page.getByRole("img", { name: "Artwork composition canvas" }).isVisible(), true);
  assert.deepEqual(errors, []);
  console.log("iPad WebKit drawing dialog passed");
} finally {
  await browser.close();
}
