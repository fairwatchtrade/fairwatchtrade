import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveDisplayIdentityCandidates } from "@/lib/displayIdentityPrecedence";

/* ────────────────────────────────────────────────────────────────────────
   BUYER DISPLAY IDENTITY — server-side batch resolution through the one
   governed chain (Purchase Request Buyer Identity Correction, 2026-09-11)

   The seller's Purchase Request and Correspondence surfaces need a name for
   the BUYER. The buyer's own profile row is select-own under RLS and the
   public view carries display_name only, so the governed chain

       profiles.display_name → dealer_profiles.business_name → email

   can only be walked on the server with the service role. This helper
   walks it for a batch of ids and answers, per id:
     · a usable name (the first usable candidate), or
     · null — TRUE ABSENCE after every candidate — so the surface may use
       its last-resort label.
   A read failure THROWS. It is the caller's job to render "unavailable",
   never to convert could-not-look into the generic label.

   Authorization is NOT here. The route that calls this must first prove
   the caller is entitled to name these people (a seller naming the buyers
   of their own purchase requests; a participant naming the counterpart of
   their own thread). This helper only turns ids it is handed into names.

   Nothing beyond the governed identity leaves: no phone, no strikes, no
   preferences. Email is a candidate ONLY as the chain's third step and only
   for a person who has made a commercial offer to, or corresponded with,
   the caller — and even then only its LOCAL PART (before "@") is rendered;
   the domain never leaves the server (privacy correction, 2026-09-11).
   ──────────────────────────────────────────────────────────────────────── */

export async function resolveBuyerIdentities(db: SupabaseClient, ids: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return out;

  const [{ data: profiles, error: pErr }, { data: dealers, error: dErr }] = await Promise.all([
    db.from("profiles").select("id, display_name, email").in("id", unique),
    db.from("dealer_profiles").select("seller_id, business_name").in("seller_id", unique),
  ]);
  if (pErr) throw new Error(`profiles read failed: ${pErr.message}`);
  if (dErr) throw new Error(`dealer_profiles read failed: ${dErr.message}`);

  const profileById = new Map((profiles ?? []).map((p) => [p.id as string, p as { display_name: string | null; email: string | null }]));
  const businessById = new Map((dealers ?? []).map((d) => [d.seller_id as string, (d as { business_name: string | null }).business_name]));

  for (const id of unique) {
    const p = profileById.get(id);
    out.set(
      id,
      resolveDisplayIdentityCandidates(
        {
          profileDisplayName: p?.display_name ?? null,
          dealerBusinessName: businessById.get(id) ?? null,
          email: p?.email ?? null,
        },
        /* Privacy correction (2026-09-11): on a seller-facing surface the
           email step renders its local part only; the domain never leaves. */
        { emailAs: "local-part" }
      )
    );
  }
  return out;
}
