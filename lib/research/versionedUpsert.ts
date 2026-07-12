import type { SupabaseClient } from "@supabase/supabase-js";

/* ════════════════════════════════════════════════════════════════════════
   VERSIONED UPSERT — lib/research/versionedUpsert.ts

   One shared home for the idempotent refresh behavior both Research Reports
   compilers need, so the version-bump / generated_at / last_refreshed_at
   logic can't drift between reference_knowledge and listing_addenda. Read
   existing version (if any) → write payload with version+1 and fresh
   timestamps. Never partial-writes: the read and the upsert are the only two
   round trips, and a read failure aborts before any write is attempted — it
   never silently corrupts or loses the prior row.

   Used by both compileReferenceKnowledge.ts and compileListingAddendum.ts.
   Neither compiler writes a composite/combined report object — each owns
   only its own durable entity, per the compose-on-read architecture.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export type VersionedTable = "reference_knowledge" | "listing_addenda";
export type VersionedKeyColumn = "vault_reference_id" | "listing_id";

export type VersionedUpsertResult = { id: string; version: number };

/**
 * Idempotent refresh: reads the existing row's version (if any), writes the
 * new payload with version+1 and fresh generated_at/last_refreshed_at.
 * Returns null (and logs) on any read/write failure — callers must NOT treat
 * null as "compiled successfully with empty content."
 */
export async function upsertVersioned(
  service: SupabaseClient,
  table: VersionedTable,
  keyColumn: VersionedKeyColumn,
  keyValue: string,
  payload: Record<string, unknown>,
  sectionFreshness: Record<string, unknown>
): Promise<VersionedUpsertResult | null> {
  const { data: existing, error: readErr } = await service
    .from(table)
    .select("id, version")
    .eq(keyColumn, keyValue)
    .maybeSingle();

  if (readErr) {
    console.error(`[research] ${table} version read failed for ${keyColumn}=${keyValue}:`, readErr.message);
    return null;
  }

  const nextVersion = (existing?.version ?? 0) + 1;
  const nowIso = new Date().toISOString();

  const row: Record<string, unknown> = {
    [keyColumn]: keyValue,
    version: nextVersion,
    generated_at: nowIso,
    last_refreshed_at: nowIso,
    section_freshness: sectionFreshness,
    payload,
  };

  const { data, error } = await service
    .from(table)
    .upsert(row, { onConflict: keyColumn })
    .select("id, version")
    .single();

  if (error) {
    console.error(`[research] ${table} upsert failed for ${keyColumn}=${keyValue}:`, error.message);
    return null;
  }

  return data;
}
