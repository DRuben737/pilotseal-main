import { execFileSync } from "node:child_process";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = process.cwd();
const supabaseBinary = path.join(root, "node_modules", ".bin", "supabase");
const statusOutput = execFileSync(
  supabaseBinary,
  ["status", "--network-id", "pilotseal-local", "--output", "env"],
  {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  },
);

const status = {};
for (const rawLine of statusOutput.split(/\r?\n/u)) {
  const match = rawLine.match(/^([A-Z0-9_]+)=(.*)$/u);
  if (!match) continue;
  status[match[1]] = match[2].replace(/^(['"])(.*)\1$/u, "$2");
}

const apiUrl = status.API_URL;
const serviceKey = status.SERVICE_ROLE_KEY ?? status.SECRET_KEY;

if (!apiUrl || !serviceKey) {
  throw new Error("The local Supabase API URL and service key are required.");
}

const parsedUrl = new URL(apiUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname)) {
  throw new Error(`Refusing to seed non-local host ${parsedUrl.hostname}.`);
}

const admin = createClient(apiUrl, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function waitForLocalAuth() {
  const healthUrl = new URL("/auth/v1/health", apiUrl);
  let lastStatus = "unreachable";

  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(healthUrl, {
        headers: { apikey: serviceKey },
      });
      lastStatus = String(response.status);
      if (response.ok) return;
    } catch {
      lastStatus = "unreachable";
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `Local Auth did not become healthy; last status was ${lastStatus}.`,
  );
}

await waitForLocalAuth();

const syntheticUsers = [
  {
    email: "pilot.one@example.test",
    password: "LocalPilot!2026",
    displayName: "Avery Testpilot",
  },
  {
    email: "instructor.one@example.test",
    password: "LocalInstructor!2026",
    displayName: "Morgan Testflight",
  },
];

const { data: existingUsers, error: listError } =
  await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) throw listError;

const usersByEmail = new Map(
  existingUsers.users.map((user) => [user.email?.toLowerCase(), user]),
);
const seededUsers = [];

for (const fixture of syntheticUsers) {
  let user = usersByEmail.get(fixture.email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: fixture.email,
      password: fixture.password,
      email_confirm: true,
      user_metadata: {
        account_type: "personal",
        display_name: fixture.displayName,
        fixture: "local-only",
      },
      app_metadata: {
        fixture: "local-only",
      },
    });
    if (error) throw error;
    user = data.user;
  }

  seededUsers.push({ ...fixture, id: user.id });
}

const [owner, instructor] = seededUsers;
const organizationId = "10000000-0000-4000-8000-000000000001";
const modelId = "20000000-0000-4000-8000-000000000001";
const aircraftId = "30000000-0000-4000-8000-000000000001";

const operations = [
  admin
    .from("profiles")
    .upsert(
      seededUsers.map((user) => ({
        id: user.id,
        email: user.email,
        display_name: user.displayName,
        role: "user",
      })),
      { onConflict: "id" },
    ),
  admin.from("organizations").upsert(
    {
      id: organizationId,
      name: "PilotSeal Local Test School",
      created_by: owner.id,
    },
    { onConflict: "id" },
  ),
  admin.from("aircraft_models").upsert(
    {
      id: modelId,
      name: "Local Test Trainer",
      category: "airplane",
      stations: [
        { name: "Front Seats", arm: 37 },
        { name: "Fuel", arm: 48 },
      ],
      envelope: [
        { weight: 1500, forward: 35, aft: 47 },
        { weight: 2300, forward: 39, aft: 47 },
      ],
      chart_type: "standard",
      avg_fuel_burn_rate: 8.5,
      max_weight: 2300,
    },
    { onConflict: "id" },
  ),
];

for (const operation of operations) {
  const { error } = await operation;
  if (error) throw error;
}

const dependentOperations = [
  admin.from("organization_members").upsert(
    [
      {
        organization_id: organizationId,
        user_id: owner.id,
        role: "owner",
        teaching_role: "student",
        added_by: owner.id,
      },
      {
        organization_id: organizationId,
        user_id: instructor.id,
        role: "member",
        teaching_role: "instructor",
        added_by: owner.id,
      },
    ],
    { onConflict: "organization_id,user_id" },
  ),
  admin.from("aircraft").upsert(
    {
      id: aircraftId,
      model_id: modelId,
      tail_number: "N000PS",
      name: "Local Trainer",
      empty_weight: 1450,
      empty_arm: 39.2,
      visibility: "organization",
      organization_id: organizationId,
      created_by: owner.id,
      updated_by: owner.id,
    },
    { onConflict: "id" },
  ),
];

for (const operation of dependentOperations) {
  const { error } = await operation;
  if (error) throw error;
}

const { error: assignmentError } = await admin
  .from("aircraft_organization_assignments")
  .upsert(
    {
      aircraft_id: aircraftId,
      organization_id: organizationId,
      assigned_by: owner.id,
    },
    { onConflict: "aircraft_id,organization_id" },
  );
if (assignmentError) throw assignmentError;

console.log(
  "Seeded 2 synthetic local users, 1 organization, 1 model, and 1 aircraft.",
);
