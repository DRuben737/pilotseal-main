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
const anonKey = status.ANON_KEY ?? status.PUBLISHABLE_KEY;
const mailpitUrl = status.INBUCKET_URL;
if (!apiUrl || !anonKey || !mailpitUrl) {
  throw new Error(
    "The local Supabase API URL, anonymous key, and mail URL are required.",
  );
}

const parsedUrl = new URL(apiUrl);
const parsedMailUrl = new URL(mailpitUrl);
const localHosts = ["localhost", "127.0.0.1", "::1"];
if (
  !localHosts.includes(parsedUrl.hostname) ||
  !localHosts.includes(parsedMailUrl.hostname)
) {
  throw new Error(`Refusing to smoke-test non-local host ${parsedUrl.hostname}.`);
}

const client = createClient(apiUrl, anonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const { data: signIn, error: signInError } =
  await client.auth.signInWithPassword({
    email: "pilot.one@example.test",
    password: "LocalPilot!2026",
  });
if (signInError || !signIn.user || !signIn.session) {
  throw signInError ?? new Error("Local sign-in returned no session.");
}

const { data: profile, error: readError } = await client
  .from("profiles")
  .select("id, display_name")
  .eq("id", signIn.user.id)
  .single();
if (readError || !profile) {
  throw readError ?? new Error("The synthetic profile could not be read.");
}

const smokeName = "Avery Local Smoke";
const { error: updateError } = await client
  .from("profiles")
  .update({ display_name: smokeName })
  .eq("id", signIn.user.id);
if (updateError) throw updateError;

const { data: updatedProfile, error: verifyError } = await client
  .from("profiles")
  .select("display_name")
  .eq("id", signIn.user.id)
  .single();
if (verifyError || updatedProfile?.display_name !== smokeName) {
  throw verifyError ?? new Error("The synthetic profile update was not visible.");
}

const { error: restoreError } = await client
  .from("profiles")
  .update({ display_name: profile.display_name })
  .eq("id", signIn.user.id);
if (restoreError) throw restoreError;

const functionResponse = await fetch(
  new URL("/functions/v1/certificate-reminders", apiUrl),
  {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${signIn.session.access_token}`,
      "content-type": "application/json",
    },
    body: "{}",
  },
);
const functionBody = await functionResponse.json();
if (!functionResponse.ok || functionBody.success !== true) {
  throw new Error(
    `Local certificate-reminders smoke test failed with status ${functionResponse.status}.`,
  );
}

const syntheticEmail = "pilot.one@example.test";
const { error: recoveryError } = await client.auth.resetPasswordForEmail(
  syntheticEmail,
  { redirectTo: "http://127.0.0.1:3000/reset-password" },
);
if (recoveryError) throw recoveryError;

let capturedRecoveryEmail = false;
for (let attempt = 0; attempt < 20; attempt += 1) {
  const messagesResponse = await fetch(
    new URL("/api/v1/messages", mailpitUrl),
  );
  if (!messagesResponse.ok) {
    throw new Error(
      `Local mail capture API returned status ${messagesResponse.status}.`,
    );
  }
  const messages = await messagesResponse.json();
  capturedRecoveryEmail = (messages.messages ?? []).some((message) =>
    (message.To ?? []).some(
      (recipient) => recipient.Address?.toLowerCase() === syntheticEmail,
    ),
  );
  if (capturedRecoveryEmail) break;
  await new Promise((resolve) => setTimeout(resolve, 250));
}
if (!capturedRecoveryEmail) {
  throw new Error("Local password recovery email was not captured by Mailpit.");
}

const { error: signOutError } = await client.auth.signOut();
if (signOutError) throw signOutError;

console.log(
  "Local Auth, RLS-protected profile CRUD, mail capture, and certificate-reminders smoke tests passed.",
);
