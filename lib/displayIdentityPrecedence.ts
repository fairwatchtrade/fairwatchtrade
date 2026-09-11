/* ────────────────────────────────────────────────────────────────────────
   DISPLAY IDENTITY PRECEDENCE — the one chain, pure
   (Purchase Request Buyer Identity Correction, 2026-09-11)

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "Each surface can pick its own order for what to call a person."

   It cannot. The governed precedence for a FairWatchTrade account's display
   identity is

       profiles.display_name → dealer_profiles.business_name → email

   and it lived, correctly, inside lib/signedInDisplayIdentity — which is
   `server-only` and therefore unreachable from the Communications room's
   client path. The room grew a second chain (public view display_name →
   generic label) that stopped at step one, so every buyer without a
   personal display name became "FairWatchTrade Member". This module lifts
   the precedence out so the server resolver and the buyer-identity route
   consume the SAME function, and neither can drift.

   The chain answers with null when nothing usable exists. What a surface
   says at that point is the surface's own governed last resort:
     · the signed-in shell greets its own person as "Collector";
     · a seller's Purchase Request / Correspondence surfaces name an
       unresolvable buyer "FairWatchTrade Member".
   Those two words are the ONLY place the surfaces differ.

   Whitespace is absence: "   " is not a name and never renders blank.
   ──────────────────────────────────────────────────────────────────────── */

export type DisplayIdentityCandidates = {
  profileDisplayName?: string | null;
  dealerBusinessName?: string | null;
  email?: string | null;
};

/** A trimmed non-empty string, or null. Whitespace-only is absent. */
export function usableIdentity(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * The governed chain. Returns the first usable candidate in precedence
 * order, or null when every candidate is absent or unusable.
 */
export function resolveDisplayIdentityCandidates({
  profileDisplayName,
  dealerBusinessName,
  email,
}: DisplayIdentityCandidates): string | null {
  for (const candidate of [profileDisplayName, dealerBusinessName, email]) {
    const usable = usableIdentity(candidate);
    if (usable) return usable;
  }
  return null;
}

/** The signed-in shell's last resort for its own person. */
export const SIGNED_IN_IDENTITY_FALLBACK = "Collector";

/** A seller-facing surface's last resort for a buyer with no usable identity. */
export const BUYER_IDENTITY_FALLBACK = "FairWatchTrade Member";

/* ── Client-side identity STATE, so loading, failure and absence never
      collapse into one permanent label ─────────────────────────────── */

export type BuyerIdentityState =
  | { state: "loading" }
  | { state: "resolved"; name: string }
  | { state: "unavailable" }
  | { state: "absent" };

export const BUYER_IDENTITY_LOADING_LABEL = "Resolving buyer…";
export const BUYER_IDENTITY_UNAVAILABLE_LABEL = "Buyer identity unavailable";

/** What a seller-facing surface prints for a buyer in each state. */
export function buyerIdentityLabel(s: BuyerIdentityState | undefined): string {
  if (!s || s.state === "loading") return BUYER_IDENTITY_LOADING_LABEL;
  if (s.state === "resolved") return s.name;
  if (s.state === "unavailable") return BUYER_IDENTITY_UNAVAILABLE_LABEL;
  return BUYER_IDENTITY_FALLBACK;
}
