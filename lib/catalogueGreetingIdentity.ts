import type { SupabaseClient } from "@supabase/supabase-js";

/* ────────────────────────────────────────────────────────────────────────
   CATALOGUE GREETING IDENTITY — who, if anyone, the greeting names.

   WHY THIS IS NOT lib/signedInDisplayIdentity.

   That resolver exists and is correct for what it does, and it is
   deliberately NOT called from here. Its chain is:

       display_name → business_name → email → "Collector"

   Both of its tail steps are wrong for a greeting. Falling through to the
   email is what put "Good evening, testingfairwatch@gmail.com." on the page
   — an identifier read back at the reader, and unbounded user data on a
   26px line. Falling through to the literal word "Collector" greets a
   person by their category.

   A greeting has a third honest option those resolvers do not: say nothing.
   "Good morning." is complete. So this resolver is allowed to return null,
   and that is the whole reason it exists separately. Reusing the shared
   chain here would silently reintroduce the raw-email defect the moment a
   collector without a display name loads the page.

   THE NAME IS NEVER CACHED. `greeting_identity` records only the dealer's
   PREFERENCE; the business name itself is read live every time, so renaming
   a business changes the greeting on the next load.

   No `server-only` guard here, unlike its sibling. That is deliberate: the
   resolver below is pure and the reader takes an INJECTED client, so the
   module holds no secret and no privileged path — and leaving it importable
   is what lets the guard test exercise every branch of the battery,
   including the states that are awkward to reach with real data. It is
   still only imported by a server component.
   ──────────────────────────────────────────────────────────────────────── */

export type CatalogueGreetingCandidates = {
  /** profiles.greeting_identity — NULL or 'business'. */
  greetingIdentity?: string | null;
  /** profiles.display_name — the personal name, and the normal answer. */
  displayName?: string | null;
  /** dealer_profiles.business_name, read ONLY when the override is set. */
  businessName?: string | null;
};

function usable(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Resolve the name the greeting should append, or null for a bare greeting.
 *
 * Pure, so every state in the proof battery is testable without a database.
 */
export function resolveCatalogueGreetingIdentity({
  greetingIdentity,
  displayName,
  businessName,
}: CatalogueGreetingCandidates): string | null {
  /* The dealer override, when it can actually be honoured. When it cannot —
     the dealer row is gone, the business name is blank, the override was
     left behind by a profile that is no longer a dealer — this deliberately
     falls THROUGH to normal behaviour rather than failing. An override
     pointing at nothing is a reachable state, not an error state. */
  if (greetingIdentity === "business") {
    const business = usable(businessName);
    if (business) return business;
  }

  /* Normal behaviour: the personal name if there is one. */
  const personal = usable(displayName);
  if (personal) return personal;

  /* And otherwise nobody. Not the email, not the local part, not
     "Collector" — the greeting simply ends after the hour. */
  return null;
}

/**
 * Read the greeting identity for a signed-in collector.
 *
 * `dealer_profiles` is queried ONLY when the override is actually selected,
 * so the ordinary collector's page load costs exactly one row read.
 */
export async function getCatalogueGreetingIdentity(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, greeting_identity")
    .eq("id", userId)
    .maybeSingle();

  const greetingIdentity = profile?.greeting_identity ?? null;

  let businessName: string | null = null;
  if (greetingIdentity === "business") {
    const { data: dealerProfile } = await supabase
      .from("dealer_profiles")
      .select("business_name")
      .eq("seller_id", userId)
      .maybeSingle();
    businessName = dealerProfile?.business_name ?? null;
  }

  return resolveCatalogueGreetingIdentity({
    greetingIdentity,
    displayName: profile?.display_name ?? null,
    businessName,
  });
}
