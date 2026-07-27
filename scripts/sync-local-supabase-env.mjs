import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const statusOutput = execFileSync(
  path.join(root, "node_modules", ".bin", "supabase"),
  ["status", "--network-id", "pilotseal-local", "--output", "env"],
  {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  },
);

const values = {};
for (const rawLine of statusOutput.split(/\r?\n/u)) {
  const match = rawLine.match(/^([A-Z0-9_]+)=(.*)$/u);
  if (!match) continue;
  values[match[1]] = match[2].replace(/^(['"])(.*)\1$/u, "$2");
}

const apiUrl = values.API_URL;
const anonKey = values.ANON_KEY ?? values.PUBLISHABLE_KEY;

if (!apiUrl || !anonKey) {
  throw new Error("Supabase status did not return a local API URL and anon key.");
}

const parsed = new URL(apiUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
  throw new Error(`Refusing to write non-local Supabase URL: ${parsed.hostname}`);
}

const contents = [
  "# Generated from the local Supabase stack. Do not commit.",
  `NEXT_PUBLIC_SUPABASE_URL=${apiUrl}`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY=${anonKey}`,
  "",
].join("\n");

const target = path.join(root, ".env.local");
fs.writeFileSync(target, contents, { encoding: "utf8", mode: 0o600 });
fs.chmodSync(target, 0o600);
console.log("Updated .env.local with local Supabase credentials.");
