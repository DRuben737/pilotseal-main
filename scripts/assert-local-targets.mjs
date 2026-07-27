import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const envPath = path.join(root, ".env.local");
const allowConfirmedProduction = process.argv.includes(
  "--allow-confirmed-production",
);

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Missing ${filePath}. Start the local Supabase stack and run npm run env:local:sync.`,
    );
  }

  const values = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator < 1) continue;

    const key = line.slice(0, separator).trim();
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/u, "$2");
    values[key] = value;
  }
  return values;
}

function isLocalHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "host.docker.internal"
  );
}

function assertLocalUrl(name, value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }

  if (!isLocalHostname(parsed.hostname)) {
    throw new Error(
      `${name} targets non-local host ${parsed.hostname}. Local development, tests, and seeds are blocked.`,
    );
  }
}

const fileEnv = parseEnvFile(envPath);
const effectiveEnv = { ...fileEnv, ...process.env };
const supabaseUrl = effectiveEnv.NEXT_PUBLIC_SUPABASE_URL;

if (!supabaseUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is required.");
}

const remoteProductionConfirmed =
  allowConfirmedProduction &&
  effectiveEnv.PRODUCTION_DEPLOY_CONFIRMED === "yes";

if (!remoteProductionConfirmed) {
  assertLocalUrl("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl);

  for (const name of [
    "SUPABASE_URL",
    "DATABASE_URL",
    "POSTGRES_URL",
    "POSTGRES_PRISMA_URL",
    "POSTGRES_URL_NON_POOLING",
  ]) {
    if (effectiveEnv[name]) assertLocalUrl(name, effectiveEnv[name]);
  }

  for (const name of ["SUPABASE_PROJECT_ID", "SUPABASE_PROJECT_REF"]) {
    if (effectiveEnv[name]) {
      throw new Error(
        `${name} is set. Local development, tests, and seeds must not target a linked project.`,
      );
    }
  }
}

console.log(
  remoteProductionConfirmed
    ? "Confirmed production build target accepted."
    : "Verified local-only Supabase targets.",
);
