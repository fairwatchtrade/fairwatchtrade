import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  resolveDisplayIdentityCandidates,
  SIGNED_IN_IDENTITY_FALLBACK,
  type DisplayIdentityCandidates,
} from "@/lib/displayIdentityPrecedence";

type SignedInDisplayIdentityCandidates = DisplayIdentityCandidates;

/* The precedence itself — display_name → business_name → email — now lives
   in lib/displayIdentityPrecedence (pure, importable from any path) so the
   seller-facing buyer-identity route walks the SAME chain (2026-09-11).
   This function is that chain plus the shell's own last resort. */
export function resolveSignedInDisplayIdentity(candidates: SignedInDisplayIdentityCandidates): string {
  return resolveDisplayIdentityCandidates(candidates) ?? SIGNED_IN_IDENTITY_FALLBACK;
}

export async function getSignedInDisplayIdentity(
  supabase: SupabaseClient,
  user: Pick<User, "id" | "email">
): Promise<string> {
  const [{ data: profile }, { data: dealerProfile }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    supabase
      .from("dealer_profiles")
      .select("business_name")
      .eq("seller_id", user.id)
      .maybeSingle(),
  ]);

  return resolveSignedInDisplayIdentity({
    profileDisplayName: profile?.display_name,
    dealerBusinessName: dealerProfile?.business_name,
    email: user.email,
  });
}
