import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  /* ──────────────────────────────────────────────────────────────────────
     Bare-root auth-link carve-out — GENERALIZED (was recovery-only).

     CONFIRMED ROOT CAUSE (Auth-Callback-Session-Bug.md): Supabase's
     "Confirm signup" email template uses the generic {{ .ConfirmationURL }}
     with no custom redirect path — the exact same mechanism that sends
     recovery links to bare "/" also sends signup confirmation links there,
     governed by the project's Site URL, not anything template-specific.
     The old recovery-only carve-out below missed that second case entirely:
     a signup code landed on "/", matched nothing, fell through to a normal
     page render, and the code just sat there unconsumed. That explains BOTH
     symptoms in the bug report — the stale session never got replaced
     because the exchange never ran, and ?code= never cleared because
     nothing ever redirected away from it. One root cause, not two.

     Fix: detect ANY leftover `code` or `token_hash` landing on bare "/" —
     not just `type=recovery` — and forward it to /auth/confirm, which
     already correctly handles both the token_hash+type and code shapes
     (v2.0i). Recovery's existing, already-correct behavior (forced to
     /reset-password) is preserved exactly; every other case (signup
     confirm, magiclink, etc.) falls through to /auth/confirm's own default
     redirect (/sell) — unchanged from before for the cases that already
     worked.
     ────────────────────────────────────────────────────────────────────── */
  const { pathname, searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");

  if (pathname === "/" && (code || tokenHash)) {
    const params = new URLSearchParams(searchParams);
    if (searchParams.get("type") === "recovery") {
      params.set("next", "/reset-password");
    }
    return NextResponse.redirect(new URL(`/auth/confirm?${params.toString()}`, request.url));
  }

  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image (build assets)
     * - favicon.ico, and common image/asset extensions
     * - api routes (evaluate / validate-description stay untouched)
     */
    '/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
