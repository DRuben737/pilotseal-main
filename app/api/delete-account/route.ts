import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(request: Request) {
  try {
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error("Delete account route missing Supabase environment variables.");
      return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!accessToken) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const { data: userResult, error: userError } = await adminClient.auth.getUser(accessToken);
    if (userError || !userResult.user) {
      return NextResponse.json({ error: "Your session is not valid." }, { status: 401 });
    }

    const userId = userResult.user.id;
    const { data: ownedOrganizations, error: ownershipError } = await adminClient
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId)
      .eq("role", "owner")
      .limit(1);

    if (ownershipError && ownershipError.code !== "42P01") {
      console.error("Delete account ownership check failed:", ownershipError);
      return NextResponse.json({ error: "Unable to verify organization ownership." }, { status: 500 });
    }

    if ((ownedOrganizations ?? []).length > 0) {
      return NextResponse.json(
        { error: "Transfer organization ownership before deleting this account." },
        { status: 409 }
      );
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error("Delete account failed:", deleteError);
      return NextResponse.json({ error: "Unable to delete account." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete account route failed:", error);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
