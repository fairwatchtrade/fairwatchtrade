import { createClient } from "@/lib/supabase/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/* ════════════════════════════════════════════════════════════════════════
   GET /auth/confirm — lands here from Supabase email links.  (v2.0i)

   Supabase can arrive here with EITHER of two shapes depending on the flow:

     1. token_hash + type   (email confirm / recovery / magiclink)
        → verify with supabase.auth.verifyOtp({ token_hash, type })
     2. code                (OAuth / PKCE code-exchange)
        → supabase.auth.exchangeCodeForSession(code)

   The earlier version only handled `code`, so recovery links that arrive as
   `?token_hash=pkce_...&type=recovery` fell straight through to the error
   redirect — which is exactly why password-reset landed on /login?error=confirm.
   This handles BOTH, so confirm AND recovery work.

   On success we set the session cookies, upsert the profile row (safe if it
   already exists), then forward to `next` (default /sell). On failure →
   /login?error=confirm.
   ════════════════════════════════════════════════════════════════════════ */

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/sell";

  const supabase = await createClient();
  let userId: string | undefined;
  let userEmail: string | null | undefined;

  // ── Flow 1: token_hash + type (email confirm, recovery, magiclink) ──
  if (token_hash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (!error && data.session) {
      userId = data.session.user.id;
      userEmail = data.session.user.email;
    }
  }

  // ── Flow 2: code (PKCE / OAuth code-exchange) ──
  if (!userId && code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.session) {
      userId = data.session.user.id;
      userEmail = data.session.user.email;
    }
  }

  // ── Success: session established → upsert profile, forward to next ──
  if (userId) {
    await supabase.from("profiles").upsert(
      {
        id: userId,
        email: userEmail,
        display_name: userEmail?.split("@")[0],
      },
      { onConflict: "id", ignoreDuplicates: true }
    );

    return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?error=confirm`);
}
