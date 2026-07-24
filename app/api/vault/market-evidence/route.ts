import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

/* ════════════════════════════════════════════════════════════════════════
   MARKET EVIDENCE — public read  (app/api/vault/market-evidence/route.ts)

   GET /api/vault/market-evidence?variantId=<uuid>

   Returns reviewed Market Evidence for the Vault references of one variant —
   and ONLY when every eligibility law holds live (Identity Resolution
   Architecture §9). Nothing is stored pre-computed; nothing is trusted from
   the client; auction facts are never duplicated into Vault rows or UI code.

   A record is returned only when ALL of:
     · the identity decision is current and outcome = 'exact';
     · human review is present (reviewer UID + time — RPC-guaranteed);
     · the server-recomputed claim fingerprint still matches;
     · the selected target is a Vault reference of the requested variant
       and still exists;
     · the Auction Evidence result is current and sold;
     · the result's source artifact is not publication-blocked (takedown).

   Returned fields are the public set only: house, sale title/code, date,
   location, lot number, price, currency, basis, and the PUBLIC lot-page URL
   (the artifact whose source_url is a public Phillips page). Internal-only
   storage paths are never exposed — the results PDF is identified as the
   result authority by NAME, never by link.

   Non-exact, stale, unresolved, related, probable, ambiguous, rejected,
   passed, withdrawn, or takedown-blocked evidence never appears here.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export type MarketEvidenceRecord = {
  referenceId: string;
  reference: string;
  house: string;
  saleTitle: string;
  saleCode: string | null;
  saleDate: string | null;
  location: string | null;
  lotNumber: string;
  priceRealized: number;
  currency: string;
  priceBasis: string;
  lotPageUrl: string | null;
  identitySourceLabel: string;
  resultSourceLabel: string;
  reviewedExact: true;
};

const SALE_CODE = /\/auction\/([A-Z0-9]+)/;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const variantId = url.searchParams.get("variantId");
  if (!variantId || !/^[0-9a-f-]{36}$/i.test(variantId)) {
    return NextResponse.json({ evidence: [] });
  }

  const db = createServiceClient();
  const out: MarketEvidenceRecord[] = [];

  // References of this variant — the only identities this surface may speak for.
  const { data: refs } = await db
    .from("vault_references")
    .select("id,reference")
    .eq("variant_id", variantId);
  if (!refs?.length) return NextResponse.json({ evidence: [] });
  const refIds = refs.map((r) => r.id);
  const refById = new Map(refs.map((r) => [r.id, r.reference]));

  // Current EXACT decisions whose selected target is one of those references.
  const { data: candidates } = await db
    .from("identity_resolution_candidate")
    .select("decision_id,vault_reference_id")
    .in("vault_reference_id", refIds)
    .eq("candidate_role", "selected");
  if (!candidates?.length) return NextResponse.json({ evidence: [] });

  for (const cand of candidates) {
    const { data: decision } = await db
      .from("identity_resolution_decision")
      .select("id,case_id,outcome,is_current,claim_fingerprint,reviewed_by,reviewed_at")
      .eq("id", cand.decision_id)
      .maybeSingle();
    if (!decision?.is_current || decision.outcome !== "exact") continue;
    if (!decision.reviewed_by || !decision.reviewed_at) continue;

    const { data: kase } = await db
      .from("identity_resolution_case")
      .select("subject_type,auction_lot_id")
      .eq("id", decision.case_id)
      .maybeSingle();
    if (kase?.subject_type !== "auction_lot" || !kase.auction_lot_id) continue;

    // Staleness: the ONE canonical fingerprint implementation, recomputed live.
    const { data: liveFp, error: fpErr } = await db.rpc(
      "identity_resolution_claim_fingerprint",
      { p_subject_type: "auction_lot", p_subject_id: kase.auction_lot_id }
    );
    if (fpErr || liveFp !== decision.claim_fingerprint) continue;

    // The lot, its sale + house, and its CURRENT sold result.
    const { data: lot } = await db
      .from("auction_evidence_lot")
      .select("id,lot_number,sale_id")
      .eq("id", kase.auction_lot_id)
      .maybeSingle();
    if (!lot) continue;

    const { data: result } = await db
      .from("auction_evidence_result")
      .select("sale_outcome,price_realized,currency,price_basis,source_artifact_id,is_current")
      .eq("lot_id", lot.id)
      .eq("is_current", true)
      .maybeSingle();
    if (!result || result.sale_outcome !== "sold") continue;
    if (result.price_realized == null || !result.currency || !result.price_basis) continue;

    // Takedown law: a publication-blocked result artifact suppresses the record.
    if (result.source_artifact_id) {
      const { data: resultArtifact } = await db
        .from("auction_evidence_source_artifact")
        .select("publication_status")
        .eq("id", result.source_artifact_id)
        .maybeSingle();
      if (resultArtifact?.publication_status === "blocked") continue;
    }

    const { data: sale } = await db
      .from("auction_evidence_sale")
      .select("sale_name,sale_date,location,source_url,house_id")
      .eq("id", lot.sale_id)
      .maybeSingle();
    if (!sale) continue;
    const { data: house } = await db
      .from("auction_evidence_house")
      .select("name")
      .eq("id", sale.house_id)
      .maybeSingle();
    if (!house) continue;

    // Public lot-page URL: the lot's own identity artifact, only when its
    // source_url is a public web page and it is not publication-blocked.
    let lotPageUrl: string | null = null;
    const { data: lotRow } = await db
      .from("auction_evidence_lot")
      .select("source_artifact_id")
      .eq("id", lot.id)
      .maybeSingle();
    if (lotRow?.source_artifact_id) {
      const { data: identityArtifact } = await db
        .from("auction_evidence_source_artifact")
        .select("source_url,publication_status")
        .eq("id", lotRow.source_artifact_id)
        .maybeSingle();
      if (
        identityArtifact &&
        identityArtifact.publication_status !== "blocked" &&
        /^https:\/\/www\.phillips\.com\/detail\//.test(identityArtifact.source_url ?? "")
      ) {
        lotPageUrl = identityArtifact.source_url;
      }
    }

    out.push({
      referenceId: cand.vault_reference_id!,
      reference: refById.get(cand.vault_reference_id!) ?? "",
      house: house.name,
      saleTitle: sale.sale_name,
      saleCode: sale.source_url?.match(SALE_CODE)?.[1] ?? null,
      saleDate: sale.sale_date,
      location: sale.location,
      lotNumber: lot.lot_number,
      priceRealized: Number(result.price_realized),
      currency: result.currency,
      priceBasis: result.price_basis,
      lotPageUrl,
      identitySourceLabel: `Phillips Lot ${lot.lot_number} page`,
      resultSourceLabel: "Official Phillips results PDF",
      reviewedExact: true,
    });
  }

  return NextResponse.json({ evidence: out });
}
