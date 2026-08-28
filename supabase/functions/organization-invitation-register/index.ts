import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: "Server configuration error." }, 500);
  }

  let body: { inviteToken?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid request body." }, 400);
  }
  const inviteToken = body.inviteToken?.trim() || "";
  const password = body.password || "";
  if (inviteToken.length < 20) return jsonResponse({ error: "Invitation is invalid." }, 400);
  if (password.length < 8) return jsonResponse({ error: "Password must be at least 8 characters." }, 400);

  const anonClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: previews, error: previewError } = await anonClient.rpc(
    "get_organization_invitation",
    { p_token: inviteToken },
  );
  const invitation = previews?.[0] as {
    invited_email?: string;
    status?: string;
    expires_at?: string;
  } | undefined;
  if (
    previewError ||
    !invitation?.invited_email ||
    invitation.status !== "pending" ||
    !invitation.expires_at ||
    new Date(invitation.expires_at).getTime() <= Date.now()
  ) {
    return jsonResponse({ error: "Invitation is invalid, expired, or already used." }, 400);
  }

  const email = invitation.invited_email.trim().toLowerCase();
  const { data, error } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { account_type: "personal", invitation_verified: true },
  });
  if (error) {
    const duplicate = /already|registered|exists/i.test(error.message);
    return jsonResponse(
      { error: duplicate ? "This email is already registered. Sign in to accept the invitation." : error.message },
      duplicate ? 409 : 400,
    );
  }

  return jsonResponse({ created: true, userId: data.user.id, email });
});
