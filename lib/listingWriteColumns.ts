/* ════════════════════════════════════════════════════════════════════════
   HOW A DRAFT BECOMES LISTING COLUMNS — lib/listingWriteColumns.ts

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "Resubmitting a returned listing is just another write, so it can map the
      seller's fields onto columns however it likes."

   It cannot. There are now TWO writers that turn a seller's wizard draft into
   a listing row — creation, and resubmission of a listing the founder handed
   back — and a mapping expressed twice is a mapping that drifts. The first
   time one of them learns about a new field and the other does not, a seller
   edits something on a returned watch and it silently fails to persist.

   So the mapping lives here once, and both writers spread it.

   ── WHAT THIS OWNS AND WHAT IT DOES NOT ────────────────────────────────
   It owns the columns that DESCRIBE THE WATCH. It owns none of the columns
   that describe the row's identity or its place in the lifecycle:

     · seller_id, status, private_buyer_id, publish_request_id,
       in_hand_verified, integrity_hold_reason  — the creator's business;
     · public_code    — assigned by a BEFORE INSERT trigger, never authored;
     · physical_watch_id — minted by a COLUMN DEFAULT, which does not fire on
       UPDATE. That is exactly why resubmission updates the existing row: the
       object keeps the identity it has always had, by construction rather
       than by anyone remembering to preserve it.

   ── MONEY IS PARSED HERE, NOT BESIDE EACH CALLER ───────────────────────
   Amount, raw text and currency are one governed fact written together or not
   at all. Both writers parse through the same contract so a resubmission can
   never land a price the create route would have refused.

   ── PRESENTATION IS ALWAYS WRITTEN ─────────────────────────────────────
   `photo_presentation` is emitted even when it is null. On INSERT that is
   identical to omitting it (the column is nullable and defaults to NULL), and
   on UPDATE it is the only way a seller can CLEAR framing they no longer want.
   Omitting it would make hero framing a thing you can set and never undo.

   PFC274 = 62 — nothing here evaluates anything. `significance_score` and
   `score_state` are carried exactly as the caller supplied them.
   ════════════════════════════════════════════════════════════════════════ */

import { isSupportedCurrency } from "@/lib/supportedCurrencies";
import { parsePrice } from "@/lib/parsePrice";
import {
  isDefaultPresentation,
  sanitizePhotoPresentation,
} from "@/lib/photoPresentation";

/* Money Truth Stage B — the local [^0-9.]-strip clone is retired. Amount and
   currency are parsed together through the governed lib/parsePrice contract,
   and they are written together or not at all. */
export type MoneyTruth =
  | { ok: true; amount: number | null; raw: string | null; currency: string | null }
  | { ok: false; detail: string };

export function resolveAskingMoney(
  rawPrice?: string,
  rawCurrency?: string
): MoneyTruth {
  const priceText = typeof rawPrice === "string" ? rawPrice.trim() : "";
  if (priceText === "") {
    // No amount → no currency. An amount-less draft (e.g. price on request)
    // carries no money fact to protect.
    return { ok: true, amount: null, raw: null, currency: null };
  }
  if (!isSupportedCurrency(rawCurrency)) {
    return {
      ok: false,
      detail: "Choose the currency for your asking price before publishing.",
    };
  }
  const parsed = parsePrice(priceText, rawCurrency);
  if (!parsed.ok) return { ok: false, detail: parsed.message };
  return { ok: true, amount: parsed.amount, raw: parsed.raw, currency: rawCurrency };
}

/** The seller-authored fields both writers accept, in wizard vocabulary. */
export type ListingWatchInput = {
  brand?: string;
  customBrandFlag?: boolean;
  model?: string;
  reference?: string;
  year?: string;
  condition?: string;
  provenanceNote?: string;
  significanceScore?: number | null;
  scoreState?: unknown;
  photos?: unknown;
  hasBracelet?: boolean;
  openToTrades?: boolean;
  details?: unknown;
  description?: string;
  descriptionPassedAI?: boolean | null;
  photoPresentation?: unknown;
};

/**
 * The columns describing the watch itself.
 *
 * `money` and `vaultReferenceId` are passed in already resolved, because both
 * are governed server-side decisions the caller must make for itself — the
 * browser's canonical id is never obeyed, and each writer re-resolves from the
 * reference text the seller actually submitted.
 */
export function listingWatchColumns(
  body: ListingWatchInput,
  money: { amount: number | null; raw: string | null; currency: string | null },
  vaultReferenceId: string | null
): Record<string, unknown> {
  /* Re-sanitized rather than trusted: the value has crossed the network and
     the DB CHECK will refuse anything out of bounds, so a bad payload must
     become automatic framing, not a 500 on an otherwise valid write. Default
     framing writes NULL — "the seller chose nothing" and "the seller chose the
     centre" are the same picture, and NULL keeps that honest in the data. */
  const presentation = sanitizePhotoPresentation(body.photoPresentation);

  return {
    brand: body.brand,
    custom_brand_flag: body.customBrandFlag ?? false,
    model: body.model || null,
    reference: body.reference,
    /* Seller-stated text above; determined canonical identity here. Written
       together, never merged — NULL is an honest value, not a gap. */
    vault_reference_id: vaultReferenceId,
    year: body.year ?? null,
    condition: body.condition || null,
    // The governed pair, written together — plus the exact raw text the parser
    // accepted, so asking_price_raw can never drift from the canonical value.
    asking_price: money.amount,
    asking_price_raw: money.raw,
    asking_currency: money.currency,
    provenance_note: body.provenanceNote ?? null,
    significance_score: body.significanceScore ?? null,
    score_state: body.scoreState ?? {},
    photos: body.photos ?? [],
    has_bracelet: body.hasBracelet ?? false,
    /* Off unless the seller said yes — an unset posture is not consent. */
    open_to_trades: body.openToTrades === true,
    details: body.details ?? {},
    description: body.description ?? null,
    description_passed_ai: body.descriptionPassedAI ?? null,
    photo_presentation: isDefaultPresentation(presentation) ? null : presentation,
  };
}
