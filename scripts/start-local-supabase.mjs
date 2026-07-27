import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const supabaseBinary = path.join(root, "node_modules", ".bin", "supabase");
const networkName = "pilotseal-local";

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
    "logflare,imgproxy,realtime,storage-api,vector",
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

console.log(
  "Local Supabase is running on the localhost-only pilotseal-local network with Analytics, Vector, Realtime, Storage, and Imgproxy disabled.",
);
