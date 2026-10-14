import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium, devices } = require(
  process.env.SKY_ART_PLAYWRIGHT_MODULE ??
    "/Users/ruben/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const url = process.env.SKY_ART_LOCAL_URL ?? "http://localhost:3101";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname));
const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
try {
  const context = await browser.newContext({ ...devices["iPad Pro 11"], acceptDownloads: true });
  await context.addInitScript(() => {
    Object.defineProperty(Crypto.prototype, "randomUUID", { value: undefined, configurable: true });
  });
  await context.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (["localhost", "127.0.0.1"].includes(u.hostname)) return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${url}/tools/sky-art`);
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll("button")].find((b) => b.textContent === "View on map →");
    return button && !button.disabled;
  });
  await page.getByLabel("More tools").tap();
  await page.getByRole("button", { name: "Clear canvas" }).tap();
  await page.getByRole("button", { name: "Fit artwork in canvas" }).tap();
  await page.getByRole("button", { name: "Heart", exact: true }).tap();
  await page.waitForFunction(() => document.querySelectorAll('svg[aria-label="Artwork composition canvas"] [class*="artElement"]').length === 1);
  const visibleArtwork = await page.getByRole("img", { name: "Artwork composition canvas" }).evaluate((node) => {
    const svg = node.getBoundingClientRect();
    const path = node.querySelector('[class*="artElement"] path').getBoundingClientRect();
    return path.right > svg.left && path.left < svg.right && path.bottom > svg.top && path.top < svg.bottom;
  });
  assert.ok(visibleArtwork, "A new preset must remain in the canvas viewport after fitting an empty canvas");
  await page.getByRole("button", { name: "Draw", exact: true }).tap();
  const dialog = page.getByRole("dialog", { name: "Drawing canvas" });
  assert.equal(await dialog.getByRole("button", { name: "Draw", exact: true }).getAttribute("aria-pressed"), "true");
  const svg = page.getByRole("img", { name: "Artwork composition canvas" });
  const center = await svg.evaluate((node) => {
    // Start on the selected object's resize handle, which must not swallow pen input.
    const handle = node.querySelector('[class*="scaleHandle"]');
    if (!handle) throw new Error("Expected selected artwork handle");
    const box = handle.getBBox();
    const p = node.createSVGPoint();
    p.x = box.x + box.width / 2;
    p.y = box.y + box.height / 2;
    const screen = p.matrixTransform(node.getScreenCTM());
    return { x: screen.x, y: screen.y };
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: center.x, y: center.y }] });
  for (let i = 1; i <= 12; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: center.x + i * 5, y: center.y + i * 2 }],
    });
  }
  await page.locator('svg path[stroke="#f97316"][stroke-width="2.5"]').waitFor();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForFunction(() => !!document.querySelector('button[aria-label="Close last stroke"]:not(:disabled)'));
  const canvas = await svg.boundingBox();
  const circleCenter = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 };
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: circleCenter.x + 50, y: circleCenter.y }] });
  for (let i = 1; i <= 32; i++) {
    const angle = i * Math.PI * 2 / 32;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{
      x: circleCenter.x + 50 * Math.cos(angle), y: circleCenter.y + 50 * Math.sin(angle),
    }] });
  }
  await page.locator('svg path[stroke="#0891b2"][stroke-width="2.5"]').waitFor({ timeout: 3000 });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: circleCenter.x + 53, y: circleCenter.y + 2 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const angle = 0.35;
  const rectangle = [{ x: -70, y: -38 }, { x: 70, y: -38 },
    { x: 70, y: 38 }, { x: -70, y: 38 }].map((p) => ({
    x: circleCenter.x + p.x * Math.cos(angle) - p.y * Math.sin(angle),
    y: circleCenter.y + p.x * Math.sin(angle) + p.y * Math.cos(angle),
  }));
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [rectangle[0]] });
  for (let edge = 0; edge < 4; edge++) {
    const a = rectangle[edge], b = rectangle[(edge + 1) % 4];
    for (let step = 1; step <= 12; step++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{
        x: a.x + (b.x - a.x) * step / 12,
        y: a.y + (b.y - a.y) * step / 12,
      }] });
    }
  }
  await page.locator('svg path[stroke="#0891b2"][stroke-width="2.5"]').waitFor({ timeout: 3000 });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const penY = circleCenter.y + 110;
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed",
    x: circleCenter.x - 75, y: penY, button: "left", buttons: 1, pointerType: "pen" });
  for (let i = 1; i <= 12; i++)
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved",
      x: circleCenter.x - 75 + i * 12, y: penY + Math.sin(i) * 0.9,
      button: "left", buttons: 1, pointerType: "pen" });
  await page.locator('svg path[stroke="#0891b2"][stroke-width="2.5"]').waitFor({ timeout: 3000 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased",
    x: circleCenter.x + 69, y: penY, button: "left", buttons: 0, pointerType: "pen" });
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Save drawing project" }).tap();
  const saved = JSON.parse(fs.readFileSync(await (await downloadPromise).path(), "utf8"));
  const sketch = saved.composition.elements.find((element) => element.kind === "sketch");
  assert.equal(sketch.strokes.length, 4);
  assert.equal(sketch.strokes[1].closed, true);
  assert.equal(sketch.strokes[1].points.length, 64);
  assert.equal(sketch.strokes[2].closed, true);
  assert.equal(sketch.strokes[2].points.length, 4);
  assert.equal(sketch.strokes[3].closed, false);
  assert.equal(sketch.strokes[3].points.length, 2);
  await dialog.getByRole("button", { name: "Select drawing" }).tap();
  await page.waitForFunction(() => document.querySelectorAll(
    'svg[aria-label="Artwork composition canvas"] [class*="artElement"] > g',
  ).length === 4);
  const strokePoint = await page.evaluate(() => {
    const path = document.querySelector('svg[aria-label="Artwork composition canvas"] [class*="artElement"] > g:last-child path[stroke="transparent"]');
    const p = path.getPointAtLength(20).matrixTransform(path.getScreenCTM());
    return { x: p.x, y: p.y };
  });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart",
    touchPoints: [{ x: strokePoint.x, y: strokePoint.y }] });
  for (let i = 1; i <= 6; i++)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove",
      touchPoints: [{ x: strokePoint.x + i * 5, y: strokePoint.y + i * 4 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const movedDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Save drawing project" }).tap();
  const movedSaved = JSON.parse(fs.readFileSync(await (await movedDownload).path(), "utf8"));
  const moved = movedSaved.composition.elements.find((element) => element.kind === "sketch").strokes;
  assert.deepEqual(moved.slice(0, -1), sketch.strokes.slice(0, -1));
  assert.notDeepEqual(moved[3].points, sketch.strokes[3].points);
  const handlePoint = async (className) => page.evaluate((name) => {
    const node = document.querySelector(`svg[aria-label="Artwork composition canvas"] [class*="${name}"]`);
    if (!node) throw new Error(`Missing ${name}`);
    const box = node.getBBox();
    const p = node.ownerSVGElement.createSVGPoint();
    p.x = box.x + box.width / 2;
    p.y = box.y + box.height / 2;
    const screen = p.matrixTransform(node.getScreenCTM());
    return { x: screen.x, y: screen.y };
  }, className);
  const scalePoint = await handlePoint("scaleHandle");
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [scalePoint] });
  for (let i = 1; i <= 8; i++)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{
      x: scalePoint.x + i * 5, y: scalePoint.y + i * 5,
    }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const scaledDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Save drawing project" }).tap();
  const scaledSaved = JSON.parse(fs.readFileSync(await (await scaledDownload).path(), "utf8"));
  const scaled = scaledSaved.composition.elements.find((element) => element.kind === "sketch").strokes;
  assert.deepEqual(scaled.slice(0, -1), moved.slice(0, -1));
  const span = (stroke) => Math.hypot(
    stroke.points.at(-1).x - stroke.points[0].x,
    stroke.points.at(-1).y - stroke.points[0].y,
  );
  assert.ok(span(scaled[3]) > span(moved[3]) * 1.1, "Touch resize must grow only the selected stroke");
  const rotatePoint = await handlePoint("rotateHandle");
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [rotatePoint] });
  for (let i = 1; i <= 8; i++)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{
      x: rotatePoint.x + i * 6, y: rotatePoint.y + i * 2,
    }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const rotatedDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Save drawing project" }).tap();
  const rotatedSaved = JSON.parse(fs.readFileSync(await (await rotatedDownload).path(), "utf8"));
  const rotated = rotatedSaved.composition.elements.find((element) => element.kind === "sketch").strokes;
  assert.deepEqual(rotated.slice(0, -1), scaled.slice(0, -1));
  assert.notDeepEqual(rotated[3].points, scaled[3].points);
  assert.ok(Math.abs(span(rotated[3]) - span(scaled[3])) < 0.01,
    "Touch rotation must preserve selected stroke length");
  assert.deepEqual(errors, []);
  console.log("iPad touch and pen drawing plus touch move, scale, and rotate passed");
} finally {
  await browser.close();
}
