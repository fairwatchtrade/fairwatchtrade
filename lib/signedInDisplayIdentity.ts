import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

type SignedInDisplayIdentityCandidates = {
  profileDisplayName?: string | null;
  dealerBusinessName?: string | null;
  email?: string | null;
};

export function resolveSignedInDisplayIdentity({
  profileDisplayName,
  dealerBusinessName,
  email,
}: SignedInDisplayIdentityCandidates): string {
  for (const candidate of [profileDisplayName, dealerBusinessName, email]) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }

  return "Collector";
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
