import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type InvitationResult = {
  invitation_id: string;
  organization_person_id: string;
  invited_email: string;
  invite_token: string;
  expires_at: string;
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function singleLine(value: string, fallback: string) {
  const normalized = value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function formatExpiration(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).format(date);
}

function invitationEmailHtml(input: {
  organizationName: string;
  inviterName: string;
  inviteUrl: string;
  expiresAt: string;
}) {
  const organizationName = escapeHtml(input.organizationName);
  const inviterName = escapeHtml(input.inviterName);
  const inviteUrl = escapeHtml(input.inviteUrl);
  const expiresAt = escapeHtml(formatExpiration(input.expiresAt));

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
</head>
<body style="margin:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:100%;background-color:#f1f5f9;">
    <tr>
      <td align="center" bgcolor="#f1f5f9" style="padding-top:32px;padding-right:16px;padding-bottom:32px;padding-left:16px;background-color:#f1f5f9;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:16px;">
          <tr>
            <td bgcolor="#0f2747" style="padding-top:24px;padding-right:28px;padding-bottom:24px;padding-left:28px;background-color:#0f2747;border-radius:16px 16px 0 0;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:28px;color:#ffffff;font-weight:700;">PilotSeal</p>
            </td>
          </tr>
          <tr>
            <td bgcolor="#ffffff" style="padding-top:32px;padding-right:28px;padding-bottom:32px;padding-left:28px;background-color:#ffffff;">
              <h1 style="margin-top:0;margin-right:0;margin-bottom:16px;margin-left:0;font-family:Arial,Helvetica,sans-serif;font-size:26px;line-height:34px;color:#0f172a;font-weight:700;">You’re invited to ${organizationName}</h1>
              <p style="margin-top:0;margin-right:0;margin-bottom:20px;margin-left:0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:25px;color:#475569;">${inviterName} invited you to join their organization on PilotSeal.</p>
              <table cellpadding="0" cellspacing="0" border="0" role="presentation">
                <tr>
                  <td bgcolor="#1d4ed8" style="background-color:#1d4ed8;border-radius:8px;">
                    <a href="${inviteUrl}" style="display:inline-block;padding-top:12px;padding-right:22px;padding-bottom:12px;padding-left:22px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;color:#ffffff;font-weight:700;text-decoration:none;">Accept invitation</a>
                  </td>
                </tr>
              </table>
              <p style="margin-top:24px;margin-right:0;margin-bottom:8px;margin-left:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#64748b;">This one-time invitation expires ${expiresAt}. Sign in if you already have an account, or register with this email address.</p>
              <p style="margin-top:0;margin-right:0;margin-bottom:0;margin-left:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#94a3b8;">If you were not expecting this invitation, you can ignore this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const siteUrl = Deno.env.get("SITE_URL") || "https://pilotseal.com";
  const fromAddress = Deno.env.get("ORGANIZATION_INVITATION_FROM")
    || "PilotSeal <invitations@pilotseal.com>";

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: "Server configuration error." }, 500);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.match(/^Bearer\s+\S+$/i)) {
    return jsonResponse({ error: "You must be signed in." }, 401);
  }

  let body: { organizationId?: string; email?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid request body." }, 400);
  }

  const organizationId = body.organizationId?.trim() || "";
  const email = body.email?.trim().toLowerCase() || "";
  if (!organizationId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
    return jsonResponse({ error: "A valid organization is required." }, 400);
  }
  if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    return jsonResponse({ error: "Enter a valid email address." }, 400);
  }

  const authenticatedClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userResult, error: userError } = await authenticatedClient.auth.getUser();
  if (userError || !userResult.user) {
    return jsonResponse({ error: "Your session is not valid." }, 401);
  }

  const { data: invitationRows, error: invitationError } = await authenticatedClient.rpc(
    "create_organization_member_invitation",
    {
      p_organization_id: organizationId,
      p_email: email,
      p_display_name: null,
      p_teaching_role: null,
      p_internal_id: null,
      p_notes: null,
    },
  );
  if (invitationError) {
    return jsonResponse({ error: invitationError.message }, 400);
  }

  const invitation = (invitationRows?.[0] ?? null) as InvitationResult | null;
  if (!invitation) {
    return jsonResponse({ error: "Invitation could not be created." }, 500);
  }

  const [{ data: organization }, { data: inviter }] = await Promise.all([
    serviceClient.from("organizations").select("name").eq("id", organizationId).maybeSingle(),
    serviceClient.from("profiles").select("display_name,email").eq("id", userResult.user.id).maybeSingle(),
  ]);
  const organizationName = singleLine(organization?.name || "", "an organization");
  const inviterName = singleLine(
    inviter?.display_name || inviter?.email || "",
    "An organization administrator",
  );
  const inviteUrl = new URL("/register", siteUrl);
  inviteUrl.searchParams.set("invite", invitation.invite_token);
  inviteUrl.searchParams.set("next", "/dashboard/organization/overview");

  let emailSent = false;
  let providerMessageId: string | null = null;
  let errorCode: string | null = null;

  if (!resendApiKey) {
    errorCode = "resend_not_configured";
  } else {
    try {
      const resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `organization-invitation-${invitation.invitation_id}`,
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [invitation.invited_email],
          subject: `You’re invited to join ${organizationName} on PilotSeal`,
          html: invitationEmailHtml({
            organizationName,
            inviterName,
            inviteUrl: inviteUrl.toString(),
            expiresAt: invitation.expires_at,
          }),
          text: `${inviterName} invited you to join ${organizationName} on PilotSeal.\n\nAccept the invitation: ${inviteUrl.toString()}\n\nThis one-time invitation expires ${formatExpiration(invitation.expires_at)}. If you were not expecting this invitation, you can ignore this email.`,
          tags: [
            { name: "category", value: "organization-invitation" },
            { name: "invitation_id", value: invitation.invitation_id },
          ],
        }),
      });
      const resendPayload = await resendResponse.json().catch(() => ({})) as { id?: string };
      if (resendResponse.ok && resendPayload.id) {
        emailSent = true;
        providerMessageId = resendPayload.id;
      } else {
        errorCode = `resend_${resendResponse.status}`;
      }
    } catch {
      errorCode = "resend_network_error";
    }
  }

  const attemptedAt = new Date().toISOString();
  const { error: auditError } = await serviceClient
    .from("organization_member_invitations")
    .update({
      email_status: emailSent ? "sent" : "failed",
      email_attempt_count: 1,
      email_last_attempt_at: attemptedAt,
      email_sent_at: emailSent ? attemptedAt : null,
      email_provider_message_id: providerMessageId,
      email_last_error_code: errorCode,
    })
    .eq("id", invitation.invitation_id);

  if (auditError) {
    console.error("Organization invitation email audit update failed.");
  }

  return jsonResponse({
    invitation,
    email_sent: emailSent,
    email_error_code: errorCode,
  });
});
