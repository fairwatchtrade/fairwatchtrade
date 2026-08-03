import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* ════════════════════════════════════════════════════════════════════════
   MARKET EVIDENCE — public read  (app/api/vault/market-evidence/route.ts)

   GET /api/vault/market-evidence?referenceId=<uuid>
   → { evidence: MarketEvidenceRecord | null }

   v5 (Public Rights Gate + Exact Reference Scope). This route no longer reads
   the protected Auction Evidence / Identity Resolution tables with a
   service-role client. It calls ONE narrow read-only database function,
   public.market_evidence_for_reference(uuid), through the ordinary
   cookie-bound anon/authenticated SSR client. The input is the EXACT
   vault_references.id being rendered — never a variant — so a reference never
   inherits a sibling reference's evidence. That function:

     · runs security-definer with a fixed empty search_path and no dynamic SQL;
     · enforces the FULL eligibility + rights law server-side — in particular
       it fails CLOSED unless every supporting artifact's publication_status is
       'allowed' with a permitting permission_status (the prior route let
       merely 'internal_only' artifacts through, which is the leak v5 closes);
     · returns at most ONE deterministically selected row;
     · returns ONLY public fields — no database ids, storage paths, signed
       URLs, reviewer identity, notes, or credentials.

   The browser never queries the protected tables directly, and execute on the
   function is granted only to anon and authenticated. A reference with no
   eligible, rights-cleared evidence yields null and renders nothing — so while
   the Phillips artifacts remain 'internal_only', no card appears.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export type MarketEvidenceRecord = {
  reference: string;
  house: string;
  saleTitle: string;
  saleCode: string | null;
  saleDate: string | null;
  location: string | null;
  lotNumber: string;
  priceRealized: number | null;
  currency: string | null;
  priceBasis: string | null;
  lotPageUrl: string | null;
  salePageUrl: string | null;
  identitySourceLabel: string;
  resultSourceLabel: string;
  reviewedExact: true;
};

type Row = {
  reference: string;
  house: string;
  sale_title: string;
  sale_code: string | null;
  sale_date: string | null;
  location: string | null;
  lot_number: string;
  price_realized: number | string | null;
  currency: string | null;
  price_basis: string | null;
  lot_page_url: string | null;
  sale_page_url: string | null;
  identity_source_label: string;
  result_source_label: string;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const referenceId = url.searchParams.get("referenceId");
  if (!referenceId || !/^[0-9a-f-]{36}$/i.test(referenceId)) {
    return NextResponse.json({ evidence: null });
  }

  const supabase = await createClient();

  /* Galaxy publication gate (v3.26). This is a Galaxy-owned route — the
     card it feeds is rendered inside the Vault detail surface — so the
     direct-route law applies: knowing a reference UUID must not surface
     Galaxy content for a reference that is unpublished or sits beneath a
     hidden ancestor. The ancestor-closed view answers both in one read.
     Checked BEFORE the evidence RPC, so nothing is assembled for a
     reference the Galaxy does not acknowledge. */
  const { data: live, error: gateError } = await supabase
    .from("vault_galaxy_references")
    .select("id")
    .eq("id", referenceId)
    .maybeSingle();
  if (gateError || !live) return NextResponse.json({ evidence: null });

  const { data, error } = await supabase.rpc("market_evidence_for_reference", {
    p_reference_id: referenceId,
  });
  if (error) {
    // Fail closed: never fabricate or leak on error.
    return NextResponse.json({ evidence: null });
  }

  const row = (Array.isArray(data) ? data[0] : null) as Row | null;
  if (!row) return NextResponse.json({ evidence: null });

  const evidence: MarketEvidenceRecord = {
    reference: row.reference,
    house: row.house,
    saleTitle: row.sale_title,
    saleCode: row.sale_code,
    saleDate: row.sale_date,
    location: row.location,
    lotNumber: row.lot_number,
    priceRealized: row.price_realized == null ? null : Number(row.price_realized),
    currency: row.currency,
    priceBasis: row.price_basis,
    lotPageUrl: row.lot_page_url,
    salePageUrl: row.sale_page_url,
    identitySourceLabel: row.identity_source_label,
    resultSourceLabel: row.result_source_label,
    reviewedExact: true,
  };

  return NextResponse.json({ evidence });
}
