import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResultsSaleRow } from "@/lib/auction-operations/resultsPresentation";

/* ════════════════════════════════════════════════════════════════════════
   AUCTION RESULTS — SERVER READ MODEL — lib/auction-operations/readModel.ts

   Thin server-only loaders over the two Postgres read functions. All the
   aggregation — including canonical identity-fingerprint freshness — runs
   inside the database, so the room never performs one RPC per lot.
   Callers hand in the trusted client AFTER their own founder gate.
   ════════════════════════════════════════════════════════════════════════ */

export async function fetchResultsReadModel(db: SupabaseClient): Promise<ResultsSaleRow[]> {
  const { data, error } = await db.rpc("auction_operations_results_read_model");
  if (error) throw new Error(`results read model failed: ${error.message}`);
  return (data ?? []) as ResultsSaleRow[];
}

export type SaleDetail = {
  sale: {
    id: string;
    sale_name: string;
    sale_date: string | null;
    location: string | null;
    source_url: string | null;
    house: { name: string; slug: string; website_url: string | null };
  } | null;
  artifacts: Array<{
    id: string;
    source_url: string;
    content_hash: string | null;
    retrieved_at: string;
    intake_method: string;
    permission_status: string;
    automation_status: string;
    publication_status: string;
    public_use_scope: string;
    artifact_retention_scope: string;
    attribution_note: string | null;
    price_basis_statement: string | null;
    omission_statement: string | null;
  }>;
  lots: Array<{
    id: string;
    lot_number: string;
    brand_text: string | null;
    model_text: string | null;
    reference_text: string | null;
    description: string | null;
    result: {
      sale_outcome: string;
      price_realized: number | null;
      currency: string | null;
      price_basis: string | null;
      result_date: string | null;
    } | null;
    identity: {
      outcome: string;
      fingerprint_fresh: boolean;
      reviewed_at: string;
    } | null;
  }>;
};

export async function fetchSaleDetail(db: SupabaseClient, saleId: string): Promise<SaleDetail | null> {
  const { data, error } = await db.rpc("auction_operations_sale_detail", { p_sale_id: saleId });
  if (error) throw new Error(`sale detail failed: ${error.message}`);
  const detail = data as SaleDetail | null;
  if (!detail || !detail.sale) return null;
  return detail;
}
