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
  await context.addInitScript(() => {
    Object.defineProperty(Crypto.prototype, "randomUUID", { value: undefined, configurable: true });
  });
  await context.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;
    return ["localhost", "127.0.0.1"].includes(host) ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${url}/tools/sky-art`);
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll("button")].find((b) => b.textContent === "View on map →");
    return button && !button.disabled;
  });
  await page.getByLabel("More tools").click();
  await page.getByRole("button", { name: "Clear canvas" }).click();
  await page.getByRole("button", { name: "Draw", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Drawing canvas" });
  assert.equal(await dialog.getByRole("button", { name: "Draw", exact: true }).getAttribute("aria-pressed"), "true");
  const box = await page.getByRole("img", { name: "Artwork composition canvas" }).boundingBox();
  assert.ok(box && box.width > 100 && box.height > 100);
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  async function touch(type, x, y, id = 1) {
    await page.evaluate(({ type, x, y, id }) => {
      const svg = document.querySelector('svg[aria-label="Artwork composition canvas"]');
      const point = { identifier: id, target: svg, clientX: x, clientY: y };
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        touches: { value: type === "touchend" || type === "touchcancel" ? [] : [point] },
        targetTouches: { value: type === "touchend" || type === "touchcancel" ? [] : [point] },
        changedTouches: { value: [point] },
      });
      svg.dispatchEvent(event);
    }, { type, x, y, id });
  }
  await touch("touchstart", center.x + 55, center.y);
  for (let i = 1; i <= 32; i++) {
    const angle = i * Math.PI * 2 / 32;
    await touch("touchmove", center.x + 55 * Math.cos(angle), center.y + 55 * Math.sin(angle));
  }
  await page.locator('svg path[stroke="#0891b2"][stroke-width="2.5"]').waitFor({ timeout: 3000 });
  await touch("touchend", center.x + 95, center.y + 30);
  await page.evaluate(({ x, y }) => {
    const svg = document.querySelector('svg[aria-label="Artwork composition canvas"]');
    const emit = (type, px, py) => {
      const point = { identifier: 2, target: svg, clientX: px, clientY: py };
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        touches: { value: type === "touchend" ? [] : [point] },
        targetTouches: { value: type === "touchend" ? [] : [point] },
        changedTouches: { value: [point] },
      });
      svg.dispatchEvent(event);
    };
    emit("touchstart", x - 120, y + 100);
    emit("touchmove", x - 75, y + 50);
    emit("touchmove", x - 25, y + 100);
    emit("touchend", x + 20, y + 50);
  }, center);
  await page.mouse.move(center.x - 125, center.y - 105);
  await page.mouse.down();
  await page.mouse.move(center.x - 65, center.y - 105);
  await page.mouse.up();
  const starCenter = { x: center.x + 95, y: center.y + 85 };
  const starCorners = Array.from({ length: 10 }, (_, i) => {
    const angle = -Math.PI / 2 + i * Math.PI / 5;
    const radius = i % 2 ? 19 : 43;
    return { x: starCenter.x + radius * Math.cos(angle),
      y: starCenter.y + radius * Math.sin(angle) };
  });
  await touch("touchstart", starCorners[0].x, starCorners[0].y, 3);
  for (let side = 0; side < 10; side++) {
    const a = starCorners[side], b = starCorners[(side + 1) % 10];
    for (let step = 1; step <= 6; step++)
      await touch("touchmove", a.x + (b.x - a.x) * step / 6,
        a.y + (b.y - a.y) * step / 6, 3);
  }
  await page.locator('svg path[stroke="#0891b2"][stroke-width="2.5"]').waitFor({ timeout: 3000 });
  await touch("touchmove", starCorners[0].x + 12, starCorners[0].y + 7, 3);
  await touch("touchend", starCorners[0].x, starCorners[0].y, 3);
  const crossCenter = { x: center.x - 95, y: center.y + 85 };
  const crossCorners = Array.from({ length: 5 }, (_, i) => {
    const angle = -Math.PI / 2 + i * Math.PI * 4 / 5;
    return { x: crossCenter.x + 43 * Math.cos(angle),
      y: crossCenter.y + 43 * Math.sin(angle) };
  });
  await touch("touchstart", crossCorners[0].x, crossCorners[0].y, 4);
  for (let side = 0; side < 5; side++) {
    const a = crossCorners[side], b = crossCorners[(side + 1) % 5];
    for (let step = 1; step <= 8; step++)
      await touch("touchmove", a.x + (b.x - a.x) * step / 8,
        a.y + (b.y - a.y) * step / 8, 4);
  }
  await page.locator('svg path[stroke="#0891b2"][stroke-width="2.5"]').waitFor({ timeout: 3000 });
  await touch("touchcancel", crossCorners[0].x, crossCorners[0].y, 4);
  const heartCorners = [
    [0, -21], [-18, -39], [-42, -25], [-39, 0],
    [0, 42], [39, 0], [42, -25], [18, -39],
  ].map(([x, y]) => ({ x: center.x + x, y: center.y - 110 + y }));
  await touch("touchstart", heartCorners[0].x, heartCorners[0].y, 5);
  for (let side = 0; side < heartCorners.length; side++) {
    const a = heartCorners[side], b = heartCorners[(side + 1) % heartCorners.length];
    for (let step = 1; step <= 8; step++)
      await touch("touchmove", a.x + (b.x - a.x) * step / 8,
        a.y + (b.y - a.y) * step / 8, 5);
  }
  await page.locator('svg path[stroke="#0891b2"][stroke-width="2.5"]').waitFor({ timeout: 3000 });
  await touch("touchmove", heartCorners[0].x + 48, heartCorners[0].y + 22, 5);
  await touch("touchend", heartCorners[0].x + 48, heartCorners[0].y + 22, 5);
  const arcCenter = { x: center.x + 5, y: center.y + 105 };
  const arcPoint = (i) => {
    const angle = -Math.PI * 0.85 + i / 48 * Math.PI * 1.35;
    return { x: arcCenter.x + 48 * Math.cos(angle),
      y: arcCenter.y + 48 * Math.sin(angle) };
  };
  const arcStart = arcPoint(0);
  await touch("touchstart", arcStart.x, arcStart.y, 6);
  for (let i = 1; i <= 48; i++) {
    const p = arcPoint(i);
    await touch("touchmove", p.x, p.y, 6);
  }
  await page.locator('svg path[stroke="#0891b2"][stroke-width="2.5"]').waitFor({ timeout: 3000 });
  const arcEnd = arcPoint(48);
  await touch("touchend", arcEnd.x, arcEnd.y, 6);
  const rightAngle = [
    { x: center.x + 55, y: center.y - 135 },
    { x: center.x + 135, y: center.y - 132 },
    { x: center.x + 132, y: center.y - 68 },
  ];
  await touch("touchstart", rightAngle[0].x, rightAngle[0].y, 7);
  for (let side = 0; side < 2; side++) {
    const a = rightAngle[side], b = rightAngle[side + 1];
    for (let step = 1; step <= 12; step++)
      await touch("touchmove", a.x + (b.x - a.x) * step / 12,
        a.y + (b.y - a.y) * step / 12, 7);
  }
  await page.locator('svg path[stroke="#0891b2"][stroke-width="2.5"]').waitFor({ timeout: 3000 });
  await touch("touchend", rightAngle[2].x, rightAngle[2].y, 7);
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Save drawing project" }).click();
  const file = await (await download).path();
  assert.ok(file);
  const saved = JSON.parse(fs.readFileSync(file, "utf8"));
  const sketch = saved.composition.elements.find((e) => e.kind === "sketch");
  assert.equal(sketch?.strokes.length, 8);
  assert.equal(sketch.strokes[0].closed, true);
  assert.equal(sketch.strokes[0].points.length, 64);
  assert.equal(sketch.strokes[1].closed, false);
  assert.deepEqual(sketch.strokes[1].points, sketch.strokes[1].raw);
  assert.equal(sketch.strokes[2].closed, false);
  assert.ok(sketch.strokes[2].raw.length >= 2);
  assert.equal(sketch.strokes[3].closed, true);
  assert.equal(sketch.strokes[3].points.length, 10);
  assert.equal(sketch.strokes[4].closed, true);
  assert.equal(sketch.strokes[4].points.length, 5);
  assert.equal(sketch.strokes[5].closed, true);
  assert.equal(sketch.strokes[5].points.length, 64);
  assert.equal(sketch.strokes[6].closed, false);
  assert.equal(sketch.strokes[6].points.length, 48);
  assert.equal(sketch.strokes[7].closed, false);
  assert.equal(sketch.strokes[7].points.length, 3);
  await dialog.getByRole("button", { name: "Undo drawing" }).click();
  const rawDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Save drawing project" }).click();
  const rawSaved = JSON.parse(fs.readFileSync(await (await rawDownload).path(), "utf8"));
  const rawStroke = rawSaved.composition.elements.find((e) => e.kind === "sketch").strokes[7];
  assert.deepEqual(rawStroke.points, rawStroke.raw);
  await dialog.getByRole("button", { name: "Redo drawing" }).click();
  const snappedDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Save drawing project" }).click();
  const snappedSaved = JSON.parse(fs.readFileSync(await (await snappedDownload).path(), "utf8"));
  assert.equal(snappedSaved.composition.elements.find((e) => e.kind === "sketch").strokes[7].points.length, 3);
  await dialog.getByRole("button", { name: "Select drawing" }).click();
  await page.waitForFunction(() => document.querySelectorAll(
    'svg[aria-label="Artwork composition canvas"] [class*="artElement"] > g',
  ).length === 8);
  const strokePoint = await page.evaluate(() => {
    const path = document.querySelector('svg[aria-label="Artwork composition canvas"] [class*="artElement"] > g:last-child path[stroke="transparent"]');
    const p = path.getPointAtLength(20).matrixTransform(path.getScreenCTM());
    return { x: p.x, y: p.y };
  });
  await page.mouse.move(strokePoint.x, strokePoint.y);
  await page.mouse.down();
  const sketchPathSelector = 'svg[aria-label="Artwork composition canvas"] [class*="artElement"] > g:last-child path:first-child';
  const beforePath = await page.locator(sketchPathSelector).getAttribute("d");
  await page.mouse.move(strokePoint.x + 34, strokePoint.y + 24);
  await page.waitForFunction(({ selector, before }) =>
    document.querySelector(selector)?.getAttribute("d") !== before,
  { selector: sketchPathSelector, before: beforePath }, { timeout: 100, polling: "raf" });
  await page.mouse.up();
  const movedDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Save drawing project" }).click();
  const movedSaved = JSON.parse(fs.readFileSync(await (await movedDownload).path(), "utf8"));
  const beforeStrokes = snappedSaved.composition.elements.find((e) => e.kind === "sketch").strokes;
  const afterStrokes = movedSaved.composition.elements.find((e) => e.kind === "sketch").strokes;
  const changed = afterStrokes.map((stroke, i) =>
    JSON.stringify(stroke) === JSON.stringify(beforeStrokes[i]) ? -1 : i).filter((i) => i >= 0);
  assert.deepEqual(changed, [7]);
  assert.notDeepEqual(afterStrokes[7].points, beforeStrokes[7].points);
  assert.notDeepEqual(afterStrokes[7].raw, beforeStrokes[7].raw);
  const scaleHandle = await page.locator('svg [class*="scaleHandle"]').last().boundingBox();
  const scaleStart = { x: scaleHandle.x + scaleHandle.width / 2,
    y: scaleHandle.y + scaleHandle.height / 2 };
  await page.mouse.move(scaleStart.x, scaleStart.y);
  await page.mouse.down();
  await page.mouse.move(scaleStart.x + 28, scaleStart.y + 28, { steps: 5 });
  await page.mouse.up();
  const scaledDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Save drawing project" }).click();
  const scaledSaved = JSON.parse(fs.readFileSync(await (await scaledDownload).path(), "utf8"));
  const scaledStrokes = scaledSaved.composition.elements.find((e) => e.kind === "sketch").strokes;
  assert.deepEqual(scaledStrokes.slice(0, -1), afterStrokes.slice(0, -1));
  const length = (stroke) => Math.hypot(
    stroke.points[1].x - stroke.points[0].x, stroke.points[1].y - stroke.points[0].y);
  assert.ok(length(scaledStrokes[7]) > length(afterStrokes[7]) * 1.05);
  const rotateHandle = await page.locator('svg [class*="rotateHandle"]').last().boundingBox();
  const rotateStart = { x: rotateHandle.x + rotateHandle.width / 2,
    y: rotateHandle.y + rotateHandle.height / 2 };
  await page.mouse.move(rotateStart.x, rotateStart.y);
  await page.mouse.down();
  await page.mouse.move(rotateStart.x + 35, rotateStart.y + 5, { steps: 5 });
  await page.mouse.up();
  const rotatedDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Save drawing project" }).click();
  const rotatedSaved = JSON.parse(fs.readFileSync(await (await rotatedDownload).path(), "utf8"));
  const rotatedStrokes = rotatedSaved.composition.elements.find((e) => e.kind === "sketch").strokes;
  assert.deepEqual(rotatedStrokes.slice(0, -1), scaledStrokes.slice(0, -1));
  const direction = (stroke) => Math.atan2(stroke.points[1].y - stroke.points[0].y,
    stroke.points[1].x - stroke.points[0].x);
  assert.ok(Math.abs(direction(rotatedStrokes[7]) - direction(scaledStrokes[7])) > 0.15);
  await dialog.getByRole("button", { name: "Delete selected" }).click();
  const deletedDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Save drawing project" }).click();
  const deletedSaved = JSON.parse(fs.readFileSync(await (await deletedDownload).path(), "utf8"));
  const deletedStrokes = deletedSaved.composition.elements.find((e) => e.kind === "sketch").strokes;
  assert.equal(deletedStrokes.length, 7);
  assert.deepEqual(deletedStrokes, rotatedStrokes.slice(0, -1));
  await dialog.getByRole("button", { name: "Draw", exact: true }).click();
  const cloudPoint = (i) => {
    const angle = i * Math.PI * 2 / 96;
    const radius = 51 + 11 * Math.cos(6 * angle) + 2 * Math.cos(2 * angle);
    return { x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle) };
  };
  const cloudStart = cloudPoint(0);
  await touch("touchstart", cloudStart.x, cloudStart.y, 8);
  for (let i = 1; i <= 96; i++) {
    const p = cloudPoint(i);
    await touch("touchmove", p.x, p.y, 8);
  }
  await page.locator('svg path[stroke="#0891b2"][stroke-width="2.5"]').waitFor({ timeout: 3000 });
  await touch("touchend", cloudStart.x, cloudStart.y, 8);
  const cloudDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Save drawing project" }).click();
  const cloudSaved = JSON.parse(fs.readFileSync(await (await cloudDownload).path(), "utf8"));
  const cloudStrokes = cloudSaved.composition.elements.find((e) => e.kind === "sketch").strokes;
  assert.equal(cloudStrokes.length, 8);
  assert.equal(cloudStrokes[7].closed, true);
  assert.equal(cloudStrokes[7].points.length, 64);
  const circleCenter = { x: center.x - 90, y: center.y - 35 };
  const jitterStart = { x: circleCenter.x + 34, y: circleCenter.y };
  await touch("touchstart", jitterStart.x, jitterStart.y, 9);
  for (let i = 1; i <= 40; i++) {
    const angle = i * Math.PI * 2 / 40;
    await touch("touchmove", circleCenter.x + 34 * Math.cos(angle),
      circleCenter.y + 34 * Math.sin(angle), 9);
  }
  for (let i = 1; i <= 8; i++) {
    await page.waitForTimeout(80);
    await touch("touchmove", jitterStart.x + Math.sin(i * 1.7) * 2,
      jitterStart.y + Math.cos(i * 1.7) * 2, 9);
  }
  await page.locator('svg path[stroke="#0891b2"][stroke-width="2.5"]').waitFor({ timeout: 1500 });
  await touch("touchend", jitterStart.x, jitterStart.y, 9);
  const jitterDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Save drawing project" }).click();
  const jitterSaved = JSON.parse(fs.readFileSync(await (await jitterDownload).path(), "utf8"));
  const jitterStrokes = jitterSaved.composition.elements.find((e) => e.kind === "sketch").strokes;
  assert.equal(jitterStrokes.length, 9);
  assert.equal(jitterStrokes[8].points.length, 64);
  assert.deepEqual(errors, []);
  console.log("WebKit iPad-style touch drawing passed");
} finally {
  await browser.close();
}
