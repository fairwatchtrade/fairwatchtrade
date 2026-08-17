import "server-only";

/* ════════════════════════════════════════════════════════════════════════
   EVIDENCE → DRAFT MATERIALIZATION BRIDGE (worker core)
   lib/dealer/materializationBridge.ts

   Takes ONE captured item from the accelerator spine and turns it into a
   truthful seller-owned DRAFT listing. Deliberately single-item: there is no
   batch parameter anywhere in this module, so a broad run cannot happen by
   accident — it can only happen by calling this once per item, on purpose.

   Who does what:

     the database decides    — eligibility, field mapping, atomicity, and the
                               single lawful write into 'draft_created'
     this module carries     — the bytes, from the private evidence bucket to
                               the public listing-media path

   Nothing about the listing's CONTENT passes through here. This module never
   names a brand, a price, a seller, or a category. It moves photographs and
   reports what the database decided.

   Photograph republication (§ the private→public step):
     Evidence photographs live in the private 'dealer-evidence' bucket,
     unreadable by a browser. Their bytes are copied — byte for byte, hash
     verified before and after the copy — to the sanctioned public listing
     path. The public object is content-addressed by the evidence hash, so
     the same bytes always land at the same URL and a replay is a no-op
     rather than a duplicate.

   Boundaries this module does not cross:
     · no publication, no pending_review, no notification
     · no identity resolution (that happens after the draft exists)
     · no second item — one call, one item, always

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

import { createHash } from "node:crypto";
import { put } from "@vercel/blob";
import { createServiceClient } from "@/lib/supabase/service";

/** The private bucket the adapter archives source evidence into. */
export const EVIDENCE_BUCKET = "dealer-evidence";

/** The sanctioned public listing-media prefix (same root /api/upload uses).
    The nested segment keeps republished dealer evidence distinguishable from
    seller-uploaded photographs at a glance in the blob store. */
export const LISTING_MEDIA_PREFIX = "listings/dealer-evidence";

const sha256hex = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

type Db = ReturnType<typeof createServiceClient>;

async function rpc<T>(db: Db, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new BridgeError(`${fn}: ${error.message}`);
  return data as T;
}

/** A refusal this module can state exactly. */
export class BridgeError extends Error {}

/* ── image typing: derived from the bytes themselves, never from stored
      metadata, so the republished object's content type is a fact about the
      file rather than a claim someone recorded about it ──────────────────── */
function imageTypeOf(b: Uint8Array): { contentType: string; extension: string } | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { contentType: "image/jpeg", extension: "jpg" };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { contentType: "image/png", extension: "png" };
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
      && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { contentType: "image/webp", extension: "webp" };
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return { contentType: "image/gif", extension: "gif" };
  return null;
}

/* ── shapes ────────────────────────────────────────────────────────────── */

interface AssessedPhotograph {
  photograph_id: string;
  sequence_index: number;
  declared_category: string | null;
  retrieval_state: string;
  content_hash: string | null;
  evidence_storage_path: string | null;
}

export interface Assessment {
  batch_item_id: string;
  source_item_key: string | null;
  item_status: string;
  listing_id: string | null;
  observation_id: string | null;
  eligible: boolean;
  blocked_reason_code: string | null;
  listing: Record<string, unknown> | null;
  photographs: AssessedPhotograph[];
}

export interface RehostRecord {
  photograph_id: string;
  sequence_index: number;
  content_hash: string;
  listing_media_url: string;
  listing_media_pathname: string;
  outcome: "rehosted" | "already_rehosted";
}

export interface MaterializationReport {
  sourceId: string;
  batchItemId: string;
  sourceItemKey: string | null;
  /** The item's status when this call finished. */
  itemStatus: string;
  outcome:
    | "DRAFT_CREATED"
    | "ALREADY_MATERIALIZED"
    | "BLOCKED"
    | "READY_NOT_MATERIALIZED"; // assess-only mode
  blockedReasonCode: string | null;
  listingId: string | null;
  observationId: string | null;
  photographs: RehostRecord[];
  /** Truthful echo of what the import primitive warned about, if anything. */
  warnings: string[];
  detail: string;
}

export interface MaterializeInvocation {
  /** The source the item MUST belong to. A mismatch is refused, never coerced. */
  sourceId: string;
  /** Exactly one item, addressed by its stable source key. */
  sourceItemKey: string;
  /** The human whose act triggered this materialization. */
  actorUserId: string;
  /** Which kind of human. Only the draft-creation event is attributed to a
      person; the mechanical ready/blocked transitions and photograph
      rehosts stay 'worker' because a machine performed them.

      Defaults to 'founder' so the existing founder route is unchanged. A
      dealer preparing their own inventory passes 'dealer' — attributing a
      dealer's act to the founder would be a false line in an append-only
      log. 'worker' is a background continuation of a run the dealer already
      started; actor_user_id still names the dealer, so the act stays
      traceable to whose inventory it was. */
  actorKind?: "founder" | "dealer" | "worker";
  /** assess: read + mechanical ready/blocked only. No bytes move, no draft. */
  mode: "assess" | "materialize";
}

/* ── the single-item bridge ────────────────────────────────────────────── */

export async function materializeOneItem(inv: MaterializeInvocation): Promise<MaterializationReport> {
  const db = createServiceClient();

  // ── 1. Resolve exactly one item, and prove it belongs to the declared
  //       source. The source is not a filter of convenience; it is the
  //       authorization boundary this call was granted against. ──
  const { data: sourceItem, error: siErr } = await db
    .from("dealer_accelerator_source_items")
    .select("id,source_id,dealer_profile_id,source_item_key")
    .eq("source_id", inv.sourceId)
    .eq("source_item_key", inv.sourceItemKey)
    .maybeSingle();
  if (siErr) throw new BridgeError(`source_item_lookup_failed: ${siErr.message}`);
  if (!sourceItem) throw new BridgeError("source_item_not_found");

  const { data: items, error: biErr } = await db
    .from("dealer_accelerator_batch_items")
    .select("id,status,listing_id,source_id,batch_id,created_at")
    .eq("source_item_id", sourceItem.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (biErr) throw new BridgeError(`batch_item_lookup_failed: ${biErr.message}`);
  if (!items || items.length === 0) throw new BridgeError("batch_item_not_found");

  // A source item can appear in more than one batch. The one already carrying
  // a listing is authoritative; otherwise the most recent.
  const item = items.find((i) => i.listing_id !== null) ?? items[0];
  if (item.source_id !== inv.sourceId) throw new BridgeError("item_source_mismatch");

  const base = {
    sourceId: inv.sourceId,
    batchItemId: item.id as string,
    sourceItemKey: sourceItem.source_item_key as string,
  };

  // ── 2. Settled replay: already materialized. Report and write nothing. ──
  if (item.status === "draft_created") {
    return {
      ...base,
      itemStatus: item.status,
      outcome: "ALREADY_MATERIALIZED",
      blockedReasonCode: null,
      listingId: item.listing_id as string,
      observationId: null,
      photographs: [],
      warnings: [],
      detail: "already materialized; this call wrote nothing",
    };
  }

  /* ── 2b. Continuity across authorization episodes ──────────────────────
     The check above only sees THIS episode. Source items are scoped to a
     source_id, and revocation is terminal, so a dealer who reconnects the
     same website gets a new source whose items look untouched — even for
     watches an earlier episode already turned into listings. Materializing
     those again would create a second listing for the same watch.

     So before assessing evidence, ask whether an earlier episode of the same
     LINEAGE already materialized this exact source item key. If it did, this
     item links to that listing and no second one is created.

     Deliberately placed before eligibility assessment: an item that was
     legitimately materialized once should not have to re-clear the evidence
     bar to be recognized, and its current-episode evidence may differ
     (a photograph that has since 404'd, say) without that making the
     existing listing untrue. */
  const adoption = await rpc<
    Array<{ outcome: string; listing_id: string | null; adopted_from_source_id: string | null; detail: string }>
  >(db, "dealer_accelerator_adopt_prior_materialization", {
    p_batch_item_id: item.id,
    p_actor_kind: inv.actorKind ?? "founder",
    p_actor_user_id: inv.actorUserId,
  });

  const adopted = Array.isArray(adoption) ? adoption[0] : adoption;
  if (adopted?.outcome === "ADOPTED" || adopted?.outcome === "ALREADY_LINKED") {
    return {
      ...base,
      itemStatus: "draft_created",
      outcome: "ALREADY_MATERIALIZED",
      blockedReasonCode: null,
      listingId: adopted.listing_id as string,
      observationId: null,
      photographs: [],
      warnings: [],
      detail: adopted.detail,
    };
  }

  // ── 3. Mechanical eligibility. Deterministic, computed in the database
  //       from the item's own evidence — not a founder-by-founder judgement. ──
  const assessment = await rpc<Assessment>(db, "dealer_accelerator_assess_item_eligibility", {
    p_batch_item_id: item.id,
  });

  if (!assessment.eligible) {
    const reason = assessment.blocked_reason_code ?? "unknown";
    // discovered → blocked, ready → blocked. An item already blocked stays
    // blocked; the spine has no blocked → blocked transition and inventing
    // one would fabricate an event that did not happen.
    if (item.status === "discovered" || item.status === "ready") {
      await rpc(db, "dealer_accelerator_transition_item", {
        p_item_id: item.id,
        p_next_status: "blocked",
        p_blocked_reason_code: reason,
        p_actor_kind: "worker",
        p_actor_user_id: null,
        p_reason_code: "mechanical_eligibility",
      });
    }
    return {
      ...base,
      itemStatus: "blocked",
      outcome: "BLOCKED",
      blockedReasonCode: reason,
      listingId: null,
      observationId: assessment.observation_id,
      photographs: [],
      warnings: [],
      detail: `evidence incomplete or contradictory: ${reason}`,
    };
  }

  // ── 4. Eligible: discovered → ready, or blocked → ready if the evidence
  //       has since become complete. ──
  if (item.status === "discovered" || item.status === "blocked") {
    await rpc(db, "dealer_accelerator_transition_item", {
      p_item_id: item.id,
      p_next_status: "ready",
      p_blocked_reason_code: null,
      p_actor_kind: "worker",
      p_actor_user_id: null,
      p_reason_code: "mechanical_eligibility",
    });
  }

  if (inv.mode === "assess") {
    return {
      ...base,
      itemStatus: "ready",
      outcome: "READY_NOT_MATERIALIZED",
      blockedReasonCode: null,
      listingId: null,
      observationId: assessment.observation_id,
      photographs: [],
      warnings: [],
      detail: "eligible; assess-only invocation moved no bytes and created no draft",
    };
  }

  // ── 5. Republish the photographs, private bucket → public listing path. ──
  const photographs: RehostRecord[] = [];
  for (const ph of assessment.photographs) {
    if (ph.retrieval_state !== "retrieved" || !ph.content_hash || !ph.evidence_storage_path) {
      // Eligibility already proved every declared photograph is retrieved, so
      // reaching here means the evidence changed underneath us.
      throw new BridgeError(`photograph_not_retrieved:${ph.photograph_id}`);
    }

    // Already republished? Reuse it. This is what makes a replay produce no
    // second object and no second media row.
    const { data: existing, error: exErr } = await db
      .from("dealer_accelerator_photograph_rehosts")
      .select("photograph_id,content_hash,listing_media_url,listing_media_pathname")
      .eq("photograph_id", ph.photograph_id)
      .maybeSingle();
    if (exErr) throw new BridgeError(`rehost_lookup_failed: ${exErr.message}`);
    if (existing) {
      photographs.push({
        photograph_id: ph.photograph_id,
        sequence_index: ph.sequence_index,
        content_hash: existing.content_hash as string,
        listing_media_url: existing.listing_media_url as string,
        listing_media_pathname: existing.listing_media_pathname as string,
        outcome: "already_rehosted",
      });
      continue;
    }

    // Read the frozen evidence object and re-hash it. Bytes that do not match
    // the hash the spine recorded are not the bytes we were authorized to
    // republish, whatever they are.
    const { data: blob, error: dlErr } = await db.storage
      .from(EVIDENCE_BUCKET)
      .download(ph.evidence_storage_path);
    if (dlErr || !blob) throw new BridgeError(`evidence_object_unreadable:${ph.photograph_id}`);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (sha256hex(bytes) !== ph.content_hash) {
      throw new BridgeError(`evidence_hash_mismatch:${ph.photograph_id}`);
    }

    const typed = imageTypeOf(bytes);
    if (!typed) throw new BridgeError(`evidence_not_an_image:${ph.photograph_id}`);

    // Content-addressed public path: identical bytes always land at the same
    // URL, so overwriting can only ever rewrite a file with itself.
    const pathname = `${LISTING_MEDIA_PREFIX}/${ph.content_hash}.${typed.extension}`;
    // Buffer view over the SAME verified bytes — nothing is re-read or
    // re-derived between the hash check above and the upload below.
    const uploaded = await put(pathname, Buffer.from(bytes), {
      access: "public",
      contentType: typed.contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    const recorded = await rpc<{
      result: string;
      listing_media_url: string;
      listing_media_pathname: string;
      content_hash: string;
    }>(db, "dealer_accelerator_record_photograph_rehost", {
      p_photograph_id: ph.photograph_id,
      p_listing_media_url: uploaded.url,
      p_listing_media_pathname: uploaded.pathname,
      p_byte_length: bytes.byteLength,
      p_content_type: typed.contentType,
      p_actor_kind: "worker",
      p_actor_user_id: null,
    });

    photographs.push({
      photograph_id: ph.photograph_id,
      sequence_index: ph.sequence_index,
      content_hash: recorded.content_hash,
      listing_media_url: recorded.listing_media_url,
      listing_media_pathname: recorded.listing_media_pathname,
      outcome: recorded.result === "REHOSTED" ? "rehosted" : "already_rehosted",
    });
  }

  // ── 6. The bridge. One transaction: listing + media + item status +
  //       listing_id + lifecycle event, together or not at all. ──
  const result = await rpc<{
    result: string;
    listing_id: string;
    observation_id?: string;
    media_count?: number;
    warnings?: unknown;
  }>(db, "dealer_accelerator_materialize_item_draft", {
    p_batch_item_id: item.id,
    p_actor_kind: inv.actorKind ?? "founder",
    p_actor_user_id: inv.actorUserId,
  });

  const alreadyDone = result.result === "ALREADY_MATERIALIZED";
  return {
    ...base,
    itemStatus: "draft_created",
    outcome: alreadyDone ? "ALREADY_MATERIALIZED" : "DRAFT_CREATED",
    blockedReasonCode: null,
    listingId: result.listing_id,
    observationId: assessment.observation_id,
    photographs,
    warnings: Array.isArray(result.warnings) ? (result.warnings as string[]) : [],
    detail: alreadyDone
      ? "already materialized; this call wrote nothing"
      : "draft created from evidence; not published, not submitted for review",
  };
}
