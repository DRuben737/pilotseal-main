import { execFileSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const supabaseBinary = path.join(root, "node_modules", ".bin", "supabase");
const output = execFileSync(
  supabaseBinary,
  ["status", "--network-id", "pilotseal-local", "--output", "env"],
  {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  },
);

const safeNames = new Set([
  "API_URL",
  "DB_URL",
  "FUNCTIONS_URL",
  "INBUCKET_URL",
  "STUDIO_URL",
]);

for (const rawLine of output.split(/\r?\n/u)) {
  const match = rawLine.match(/^([A-Z0-9_]+)=(.*)$/u);
  if (!match || !safeNames.has(match[1])) continue;
  const value = match[2].replace(/^(['"])(.*)\1$/u, "$2");
  const parsed = new URL(value);
  if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    throw new Error(`Refusing to display non-local ${match[1]}.`);
  }
  if (match[1] === "DB_URL") {
    console.log(`${match[1]}=${parsed.protocol}//${parsed.hostname}:${parsed.port}`);
  } else {
    console.log(`${match[1]}=${value}`);
  }
}
