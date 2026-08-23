import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PROVIDER_IDENTITY_CONSISTENCY,
  PROVIDER_IMAGE_AUTHENTICITY,
  buildPromotedEvidenceRows,
} from "@/lib/integrity";
import {
  executeIdentityConsistencyCheck,
  identityConsistencyEnabled,
} from "@/lib/identityConsistency";
import { executeImageAuthenticityCheck } from "@/lib/imageAuthenticity";

/* ════════════════════════════════════════════════════════════════════════
   INTEGRITY PROVIDER PASS — the one governed re-execution of the providers

   Lifted verbatim out of the founder recheck route so a SECOND caller — the
   collector's "Double-check this listing" request — runs the identical
   machinery instead of growing a parallel one. Same providers, same attempt
   numbering, same deactivate-then-insert discipline, same Dial-only routing
   law for identity, same provider-agnostic evidence promotion.

   ── IT CANNOT PUBLISH, BY CONSTRUCTION ─────────────────────────────────
   There is NO listing-status write anywhere in this function, and there
   must never be one. Publication has exactly one door — the governed
   approval route (v6.34) — and status reconciliation stays in the founder
   recheck route where a founder is present. A collector-triggered pass
   gathers evidence and changes no lifecycle state. If a future caller needs
   a status change, it belongs in that caller, never here.

   Authorization belongs to the CALLER. This function assumes its caller has
   already proven who is asking and what they may ask for; it takes a
   trusted client and does the work.
   ════════════════════════════════════════════════════════════════════════ */

export type ProviderPassMedia = {
  id: string;
  storage_path: string | null;
  capture_session_id: string | null;
  category: string | null;
  capture_source: string | null;
};

export type ProviderPassResult = {
  /** Authenticity attempts written. */
  ran: number;
  mediaIds: string[];
  error?: string;
};

export async function runIntegrityProviderPass(params: {
  service: SupabaseClient;
  listingId: string;
  claimedBrand: string;
  /** The listing's own photos array — carries storage_path → public URL. */
  photos: unknown;
  targets: ProviderPassMedia[];
  triggeredBy: string;
}): Promise<ProviderPassResult> {
  const { service, listingId, claimedBrand, photos, targets, triggeredBy } = params;

  // storage_path → public URL, from the listing's own photos array.
  const urlByPath = new Map<string, string>();
  for (const p of ((photos ?? []) as { photo?: { url?: unknown; pathname?: unknown } }[])) {
    const url = typeof p?.photo?.url === "string" ? p.photo.url : "";
    const pathname = typeof p?.photo?.pathname === "string" ? p.photo.pathname : "";
    if (url && pathname) urlByPath.set(pathname, url);
  }

  let rechecked = 0;
  // 4 · per media row: deactivate the prior active-completed Aubrey row
  //     (both correlation states), then insert the new attempt media-keyed.
  const mediaIds = targets.map((m) => m.id);
  const { data: prior, error: priorErr } = await service
    .from("listing_integrity_provider_results")
    .select("id, media_id, capture_session_id, storage_path, attempt_number, execution_status, is_active")
    .eq("provider", PROVIDER_IMAGE_AUTHENTICITY)
    .or(
      `media_id.in.(${mediaIds.join(",")}),and(media_id.is.null,storage_path.in.(${targets
        .map((m) => `"${m.storage_path}"`)
        .join(",")}))`
    );
  if (priorErr) {
    return { ran: 0, mediaIds, error: priorErr.message };
  }

  const maxAttemptByMedia = new Map<string, number>();
  const toDeactivate: string[] = [];
  for (const row of prior ?? []) {
    const target = targets.find(
      (m) =>
        row.media_id === m.id ||
        (row.media_id === null &&
          row.capture_session_id === m.capture_session_id &&
          row.storage_path === m.storage_path)
    );
    if (!target) continue;
    maxAttemptByMedia.set(
      target.id,
      Math.max(maxAttemptByMedia.get(target.id) ?? 0, row.attempt_number ?? 0)
    );
    if (row.execution_status === "completed" && row.is_active === true) {
      toDeactivate.push(row.id);
    }
  }

  if (toDeactivate.length > 0) {
    const { error: deactErr } = await service
      .from("listing_integrity_provider_results")
      .update({ is_active: false })
      .in("id", toDeactivate);
    if (deactErr) {
      return { ran: 0, mediaIds, error: deactErr.message };
    }
  }
  await Promise.allSettled(
    targets.map(async (m) => {
      const url = m.storage_path ? urlByPath.get(m.storage_path) : undefined;
      const core = url
        ? await executeImageAuthenticityCheck(url)
        : {
            execution_status: "unavailable" as const,
            classification: null,
            is_active: true,
            completed_at: null,
            reason: null,
            detail: { note: "photo_url_missing" },
          };
      const { error: insErr } = await service.from("listing_integrity_provider_results").insert({
        provider: PROVIDER_IMAGE_AUTHENTICITY,
        attempt_number: (maxAttemptByMedia.get(m.id) ?? 0) + 1,
        triggered_by: triggeredBy,
        capture_session_id: m.capture_session_id,
        storage_path: m.storage_path,
        category: m.category ?? null,
        media_id: m.id,
        ...core,
      });
      if (insErr && (insErr as { code?: string }).code !== "23505") {
        console.error("[aubrey] recheck insert failed:", insErr.message);
      } else {
        rechecked += 1;
      }
    })
  );

  /* ── 4b · Identity Consistency recheck — same deactivate-then-attempt
        shape as the Aubrey pass above, scoped to its own provider rows and
        to Dial-tagged media only (the packet's routing law). Gated on its
        own flag: while off, a founder recheck re-runs provenance exactly as
        before and identity writes nothing. Promotion in step 5 is already
        provider-agnostic, so a contradiction recorded here promotes with no
        further wiring. ── */
  if (identityConsistencyEnabled()) {
    const idTargets = targets.filter((m) => m.category === "Dial");
    if (claimedBrand && idTargets.length > 0) {
      const idIds = idTargets.map((m) => m.id);
      const { data: idPrior, error: idPriorErr } = await service
        .from("listing_integrity_provider_results")
        .select("id, media_id, capture_session_id, storage_path, attempt_number, execution_status, is_active")
        .eq("provider", PROVIDER_IDENTITY_CONSISTENCY)
        .or(
          `media_id.in.(${idIds.join(",")}),and(media_id.is.null,storage_path.in.(${idTargets
            .map((m) => `"${m.storage_path}"`)
            .join(",")}))`
        );
      if (idPriorErr) {
        console.error("[identity] recheck prior read failed:", idPriorErr.message);
      } else {
        const idMaxAttempt = new Map<string, number>();
        const idDeactivate: string[] = [];
        for (const row of idPrior ?? []) {
          const target = idTargets.find(
            (m) =>
              row.media_id === m.id ||
              (row.media_id === null &&
                row.capture_session_id === m.capture_session_id &&
                row.storage_path === m.storage_path)
          );
          if (!target) continue;
          idMaxAttempt.set(
            target.id,
            Math.max(idMaxAttempt.get(target.id) ?? 0, row.attempt_number ?? 0)
          );
          if (row.execution_status === "completed" && row.is_active === true) {
            idDeactivate.push(row.id);
          }
        }
        if (idDeactivate.length > 0) {
          const { error: idDeactErr } = await service
            .from("listing_integrity_provider_results")
            .update({ is_active: false })
            .in("id", idDeactivate);
          if (idDeactErr) {
            console.error("[identity] recheck deactivate failed:", idDeactErr.message);
          }
        }
        await Promise.allSettled(
          idTargets.map(async (m) => {
            const url = m.storage_path ? urlByPath.get(m.storage_path) : undefined;
            const core = url
              ? await executeIdentityConsistencyCheck({
                  photoUrl: url,
                  claimedBrand,
                  category: m.category ?? null,
                })
              : {
                  execution_status: "unavailable" as const,
                  classification: null,
                  is_active: true,
                  completed_at: null,
                  reason: null,
                  detail: { note: "photo_url_missing" },
                };
            const { error: insErr } = await service
              .from("listing_integrity_provider_results")
              .insert({
                provider: PROVIDER_IDENTITY_CONSISTENCY,
                attempt_number: (idMaxAttempt.get(m.id) ?? 0) + 1,
                triggered_by: triggeredBy,
                capture_session_id: m.capture_session_id,
                storage_path: m.storage_path,
                category: m.category ?? null,
                media_id: m.id,
                ...core,
              });
            if (insErr && (insErr as { code?: string }).code !== "23505") {
              console.error("[identity] recheck insert failed:", insErr.message);
            }
          })
        );
      }
    }
  }

  // 5 · promote new accepted findings (idempotent by provider_result_id).
  const { data: results, error: resultsErr } = await service
    .from("listing_integrity_provider_results")
    .select("id, provider, classification, execution_status, is_active, detail, reason")
    .in("media_id", mediaIds);
  if (!resultsErr) {
    // Step 2 · the same shared builder the publish path uses, so a recheck
    // promotion carries cause identity exactly as a first publish does.
    const evidenceRows = await buildPromotedEvidenceRows({
      service,
      listingId,
      results: results ?? [],
    });
    if (evidenceRows.length > 0) {
      const { error: evErr } = await service
        .from("listing_integrity_evidence")
        .upsert(evidenceRows, { onConflict: "provider_result_id", ignoreDuplicates: true });
      if (evErr) console.error("[aubrey] recheck evidence promotion failed:", evErr.message);
    }
  }

  return { ran: rechecked, mediaIds };
}
