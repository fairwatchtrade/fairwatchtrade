import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCanonicalReference } from "@/lib/identity/canonicalReferenceResolver";

/* ════════════════════════════════════════════════════════════════════════
   CANONICAL REFERENCE RESOLUTION (SellFlow · Step 1)

   Sibling in TIMING to /api/validate-reference, and deliberately nothing
   like it in AUTHORITY.

   /api/validate-reference   advisory · model-mediated · an opinion about
                             whether a reference looks plausible
   THIS ROUTE                deterministic · Vault-backed · an answer about
                             which governed reference this identity IS

   They share the same moment in the seller's flow and are otherwise
   separate systems. A plausibility verdict can never mint a canonical link,
   and a canonical link is never evidence that a reference is "valid". The
   day those two collapse into one call is the day an opinion starts
   writing identity.

   The answer here is ADVISORY TO THE CLIENT TOO. Whatever this returns, the
   publication path re-resolves server-side from the submitted identity text
   and writes its own answer. This route exists so the seller and the
   founder can see the canonical state before submission, not so the browser
   can assert one.

   Authenticated: this is a seller tool, and an unauthenticated identity
   oracle over the whole Vault is a corpus-shaped thing we have no reason to
   hand out. The Vault's public surfaces remain exactly as they were.

   PFC274 = 62 — the evaluate route is untouched; nothing here calls it.
   ════════════════════════════════════════════════════════════════════════ */

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }

  let brand = "";
  let model = "";
  let reference = "";
  try {
    const body = await req.json();
    brand = typeof body.brand === "string" ? body.brand.trim().slice(0, 120) : "";
    model = typeof body.model === "string" ? body.model.trim().slice(0, 120) : "";
    reference =
      typeof body.reference === "string" ? body.reference.trim().slice(0, 120) : "";
  } catch {
    return NextResponse.json(
      { error: "bad_request", detail: "Could not read the request." },
      { status: 400 }
    );
  }

  if (!brand || !reference) {
    /* Not an error state — an incomplete identity context simply has no
       canonical answer yet, and saying so is more useful than a 400 the
       client would have to translate back into "no_match". */
    return NextResponse.json({ status: "no_match", vaultReferenceId: null, key: "" });
  }

  try {
    const resolution = await resolveCanonicalReference({ brand, model, reference });
    return NextResponse.json(resolution);
  } catch {
    /* Fail closed on IDENTITY, open on FLOW: a Vault read failure yields no
       canonical link and never blocks or alarms the seller. */
    return NextResponse.json({ status: "no_match", vaultReferenceId: null, key: "" });
  }
}
