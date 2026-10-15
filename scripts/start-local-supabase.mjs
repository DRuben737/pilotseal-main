import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const supabaseBinary = path.join(root, "node_modules", ".bin", "supabase");
const networkName = "pilotseal-local";
const withRealtime = process.argv.includes("--with-realtime");

const networkInspection = spawnSync(
  "docker",
  ["network", "inspect", networkName],
  {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "ignore", "ignore"],
  },
);
if (networkInspection.status !== 0) {
  execFileSync(
    "docker",
    [
      "network",
      "create",
      "-o",
      "com.docker.network.bridge.host_binding_ipv4=127.0.0.1",
      networkName,
    ],
    {
      cwd: root,
      stdio: ["ignore", "ignore", "inherit"],
    },
  );
}

const result = spawnSync(
  supabaseBinary,
  [
    "start",
    "--network-id",
    networkName,
    "-x",
    withRealtime ? "logflare,imgproxy,vector" : "logflare,imgproxy,realtime,vector",
  ],
  {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  },
);

if (result.status !== 0) {
  throw new Error(
    "Local Supabase failed to start. Run Docker Desktop, then retry; use the Supabase CLI directly only when diagnosing locally because its output includes local credentials.",
  );
}

const realtime = spawnSync("docker", ["inspect", "--format", "{{.State.Running}}", "supabase_realtime_pilotseal"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const realtimeRunning = realtime.status === 0 && realtime.stdout.trim() === "true";
if (withRealtime && !realtimeRunning) throw new Error("Realtime is not running. Stop the local stack, then rerun with --with-realtime.");

console.log(
  `Local Supabase is running on the localhost-only pilotseal-local network with Analytics, Vector, and Imgproxy disabled; Storage is enabled; Realtime is ${realtimeRunning ? "enabled" : "disabled"}.`,
);
