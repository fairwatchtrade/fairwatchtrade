/* ════════════════════════════════════════════════════════════════════════
   TRADE OFFERS — shared truth — lib/trade.ts

   Pure functions and vocabulary. No React, no I/O.

   ── THE ONE THING THIS MODULE PROTECTS ─────────────────────────────────
   Cash direction is NEVER a signed number. "+2000" and "-2000" look like
   arithmetic and read as ambiguity the moment anyone forgets which side is
   positive. A trade stores WHO PAYS as its own value and the amount
   separately, and every sentence rendered to a human is generated from that
   pair — never from a sign.

   The second protected truth: NULL and 0 must not be abused to mean
   "trade". An even trade has cash_direction 'none' and no amount at all;
   the database CHECK enforces the pairing, and buildCashTerms() below is
   the only place the application constructs it.

   Pinned by scripts/trade.test.mjs.
   ════════════════════════════════════════════════════════════════════════ */

export const TRADE_STATUSES = [
  "pending",
  "accepted",
  "declined",
  "superseded",
  "withdrawn",
] as const;
export type TradeStatus = (typeof TRADE_STATUSES)[number];

export const CASH_DIRECTIONS = ["none", "proposer_pays", "recipient_pays"] as const;
export type CashDirection = (typeof CASH_DIRECTIONS)[number];

export const DEAL_STATUSES = ["pending", "settling", "completed", "cancelled"] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

export const LEG_STATUSES = [
  "bound",
  "in_transit",
  "delivered",
  "verified",
  "transferred",
  "cancelled",
] as const;
export type LegStatus = (typeof LEG_STATUSES)[number];

export const TRADE_STATUS_LABELS: Record<TradeStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  declined: "Declined",
  /* The Purchase Request distinction, preserved exactly: nobody rejected a
     superseded offer — a different deal won. */
  superseded: "Superseded",
  withdrawn: "Withdrawn",
};

export type CashTerms = {
  cash_direction: CashDirection;
  cash_amount: number | null;
  cash_currency: string | null;
};

/** The ONE place cash terms are constructed. Returns an error rather than
    quietly coercing, because a coerced trade term is a wrong trade term. */
export function buildCashTerms(input: {
  direction: unknown;
  amount?: unknown;
  currency?: unknown;
}): { ok: true; terms: CashTerms } | { ok: false; error: string } {
  const direction = (CASH_DIRECTIONS as readonly string[]).includes(String(input.direction))
    ? (input.direction as CashDirection)
    : null;
  if (!direction) {
    return { ok: false, error: "Choose an even trade, or say who adds cash." };
  }

  if (direction === "none") {
    // An even trade carries no amount at all — not zero, not null-with-currency.
    return { ok: true, terms: { cash_direction: "none", cash_amount: null, cash_currency: null } };
  }

  const raw = input.amount;
  /* A negative input is REFUSED, never stripped to its absolute value.
     Quietly turning "-500" into 500 would let a sign smuggle direction back
     in through the amount field and produce the opposite trade term from
     the one that was typed — the precise ambiguity this module exists to
     prevent. Direction is a value; the amount is only ever a magnitude. */
  const text = typeof raw === "number" ? String(raw) : String(raw ?? "").trim();
  if (/^\s*-/.test(text)) {
    return {
      ok: false,
      error: "Enter the amount as a positive figure, and choose who adds it above.",
    };
  }
  const n = typeof raw === "number" ? raw : Number(text.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, error: "Enter the cash amount that goes with this trade." };
  }
  const currency =
    typeof input.currency === "string" && input.currency.trim() !== ""
      ? input.currency.trim().toUpperCase().slice(0, 8)
      : null;
  if (!currency) {
    return { ok: false, error: "A currency is required with a cash difference." };
  }
  return {
    ok: true,
    terms: {
      cash_direction: direction,
      cash_amount: Math.round(n * 100) / 100,
      cash_currency: currency,
    },
  };
}

/* ── Human sentences, always generated from direction + amount ──────────
   The user must never decode a formula. Each viewer is told what THEY do,
   because "proposer pays" is meaningless to someone who does not think of
   themselves as the proposer. */

export type Viewer = "proposer" | "recipient";

export function cashSentence(
  terms: CashTerms,
  viewer: Viewer,
  money: (amount: number | null, currency: string | null) => string
): string {
  if (terms.cash_direction === "none") return "Even trade — no cash either way";
  const amount = money(terms.cash_amount, terms.cash_currency);
  const viewerPays =
    (viewer === "proposer" && terms.cash_direction === "proposer_pays") ||
    (viewer === "recipient" && terms.cash_direction === "recipient_pays");
  return viewerPays ? `You add ${amount}` : `They add ${amount}`;
}

/** The compact two-object summary. Never a formula, never a swap arrow with
    no subject: what you receive, what you give, who adds cash. */
export function tradeSummary(
  input: {
    targetIdentity: string;
    offeredIdentity: string;
    terms: CashTerms;
  },
  viewer: Viewer,
  money: (amount: number | null, currency: string | null) => string
): { youReceive: string; youGive: string; cash: string } {
  /* The proposer wants the TARGET and gives the OFFERED watch. For the
     recipient every direction reverses — the same row read from the other
     side of the table. */
  return viewer === "proposer"
    ? {
        youReceive: input.targetIdentity,
        youGive: input.offeredIdentity,
        cash: cashSentence(input.terms, viewer, money),
      }
    : {
        youReceive: input.offeredIdentity,
        youGive: input.targetIdentity,
        cash: cashSentence(input.terms, viewer, money),
      };
}

/** Identity for a watch inside a trade row. Absent parts stay absent. */
export function watchIdentity(input: {
  brand?: string | null;
  model?: string | null;
  reference?: string | null;
  publicCode?: string | null;
}): string {
  const name = [input.brand, input.model].filter(Boolean).join(" ").trim();
  const tail = [input.reference, input.publicCode].filter(Boolean).join(" · ");
  return [name || "Watch", tail].filter(Boolean).join(" · ");
}

/* ── Eligibility, stated once ───────────────────────────────────────────
   A watch may take part in a trade only from a status a collector can
   actually act on. Mirrors the acceptance function's own check so the UI
   and the database agree about what "eligible" means. */
export const TRADEABLE_STATUSES = ["published", "private_active"] as const;

export function isTradeable(status: string | null | undefined): boolean {
  return (TRADEABLE_STATUSES as readonly string[]).includes(status ?? "");
}

/** Can this viewer propose a trade for this listing right now? Every reason
    is named so the surface can say why rather than just hiding a button. */
export function proposeBlocker(input: {
  listingStatus: string | null;
  openToTrades: boolean | null;
  isOwner: boolean;
  signedIn: boolean;
  hasPendingOffer: boolean;
}): string | null {
  if (!input.openToTrades) return "not_open";
  if (input.isOwner) return "own_listing";
  if (!isTradeable(input.listingStatus)) return "not_available";
  if (!input.signedIn) return "sign_in";
  if (input.hasPendingOffer) return "already_proposed";
  return null;
}

/* ── Deal presentation ──────────────────────────────────────────────────
   A deal is one agreement with two objects. The legs describe the objects;
   the deal describes the agreement. Keeping those separate in the language
   is what stops a trade from reading as two unrelated sales. */

export const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  pending: "Agreed — not yet settled",
  settling: "Settling",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const LEG_STATUS_LABELS: Record<LegStatus, string> = {
  bound: "Bound to this trade",
  in_transit: "In transit",
  delivered: "Delivered",
  verified: "Verified",
  transferred: "Transferred",
  cancelled: "Cancelled",
};

/** What the deal still needs, in one honest sentence. V1 stops at binding:
    settlement and shipping are a stated seam, not a pretended capability. */
export function dealNextStep(status: DealStatus): string {
  switch (status) {
    case "pending":
      return "Both watches are reserved for this trade. Arrange the exchange through the listing conversation.";
    case "settling":
      return "The exchange is under way.";
    case "completed":
      return "This trade is complete.";
    case "cancelled":
      return "This trade was cancelled.";
  }
}
