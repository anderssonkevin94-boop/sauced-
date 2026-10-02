import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// Google sends people back here with a one-time code; swap it for a session cookie.
// New people then land on /join (requireMe) to enter their name and the kitchen code.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  if (code) {
    const sb = await supabaseServer();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/`);
    console.error("auth callback:", error.message);
  }
  return NextResponse.redirect(`${origin}/login?error=google`);
}
