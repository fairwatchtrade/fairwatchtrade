import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ContinueRedeem from "@/components/ContinueRedeem";

/* ────────────────────────────────────────────────────────────────────────
   LIST FROM PHONE — redemption landing  (/sell/continue/[token])

   The phone opens this after scanning the QR or following the copied link. The
   token is opaque and non-authoritative: a signed-out visitor is routed through
   the existing sign-in callback flow first, and redemption still requires being
   the same authenticated seller (enforced by the RPC). This route is kept out
   of indexing and public discovery.
   ──────────────────────────────────────────────────────────────────────── */

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function ContinuePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Signed out → sign in first, preserving the scoped handoff as the callback.
  if (!user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/sell/continue/${token}`)}`);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--ink)] px-6">
      <ContinueRedeem token={token} />
    </main>
  );
}
