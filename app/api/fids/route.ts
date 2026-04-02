import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getServerSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getServerSupabase();
    void request;

    const { data, error } = await supabase
      .from("flights")
      .select("*");

    if (error) {
      return NextResponse.json({ error: "Unable to fetch flights." }, { status: 500 });
    }

    return NextResponse.json({ flights: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Data sync failed." }, { status: 500 });
  }
}
