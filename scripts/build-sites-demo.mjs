import { cpSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const source = resolve(root, "sites-demo");
const output = resolve(root, "dist");
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
for (const file of ["index.html", "styles.css", "refinements.css", "app.js"]) cpSync(resolve(source, file), resolve(output, file));
console.log("Built private PilotSeal dashboard demo in dist/.");
