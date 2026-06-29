import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/* ════════════════════════════════════════════════════════════════════════
   GET /auth/confirm — lands here from the email-confirmation link.  (v1.69)

   PKCE flow (confirmed: the project issues pkce_ tokens). The confirmation
   link routes through Supabase's /auth/v1/verify, which redirects here with a
   `code` param. We exchange that code for a session (sets the auth cookies),
   create the profile row if it doesn't exist, then send the seller on to the
   `next` destination (default /sell). On failure → /login?error=confirm.

   Replaces the earlier token_hash + verifyOtp version — that was the wrong
   flow for this PKCE-configured project and would have failed every confirm.

   Profile upsert: confirmation-path counterpart to signup's session-path
   insert. ignoreDuplicates makes it safe if the row already exists.

   NOTE: depends on `@/lib/supabase/server` createClient() being the
   cookie-writing SSR client (exchangeCodeForSession persists the session via
   cookies). And the Supabase redirect must point at /auth/confirm — see Fix 2.
   ════════════════════════════════════════════════════════════════════════ */

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/sell";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.session) {
      // Create the profile row on confirmation (counterpart to signup's
      // insert). id = auth user id. Safe if it already exists.
      await supabase.from("profiles").upsert(
        {
          id: data.session.user.id,
          email: data.session.user.email,
          display_name: data.session.user.email?.split("@")[0],
        },
        { onConflict: "id", ignoreDuplicates: true }
      );

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=confirm`);
}