import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  // Recovery email redirect — Supabase sends reset emails to bare homepage.
  // Intercept and forward to /auth/confirm with the recovery code.
  const { pathname, searchParams } = new URL(request.url);
  if (pathname === "/" && searchParams.get("type") === "recovery" && searchParams.get("code")) {
    const code = searchParams.get("code");
    return NextResponse.redirect(
      new URL(`/auth/confirm?code=${code}&next=/reset-password`, request.url)
    );
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
