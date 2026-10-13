import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const pkg = require.resolve("maplibre-gl/package.json");
const root = path.dirname(pkg);
const output = path.resolve("public/sky-art");
fs.mkdirSync(output, { recursive: true });
fs.copyFileSync(
  path.join(root, "dist/maplibre-gl-worker.mjs"),
  path.join(output, "maplibre-worker.mjs"),
);
fs.copyFileSync(
  path.join(root, "LICENSE.txt"),
  path.join(output, "maplibre-LICENSE.txt"),
);
console.log("Prepared local MapLibre worker.");
