"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  DEAL_STATUS_LABELS,
  LEG_STATUS_LABELS,
  TRADE_STATUS_LABELS,
  dealNextStep,
  tradeSummary,
  watchIdentity,
  type CashDirection,
  type DealStatus,
  type LegStatus,
  type TradeStatus,
} from "@/lib/trade";
import { formatMoney } from "@/lib/formatMoney";

/* ════════════════════════════════════════════════════════════════════════
   TRADES — the editorial exchange record — components/TradeOffersModule.tsx

   A trade reads as ONE composed exchange between two watches, not a stack of
   database rows: a lifecycle header, the exchange itself as the primary object
   (You receive ⇄ You give), the cash adjustment as its own beat, and — once a
   trade is accepted — an aligned transfer ledger.

   PRESENTATION ONLY. Every visible fact still comes from the live production
   data model; the four acts (accept / decline / withdraw, mark sent / undo /
   confirm receipt, cancel) call the same endpoints they always did. The
   viewer-relative direction and cash sentence come from lib/trade.tradeSummary
   unchanged — a stored direction is a fact about the deal and second person is
   the only way a human reads it without doing arithmetic. This file re-skins
   that truth; it does not re-derive it.

   The page title lives ONCE in the shared workspace header (AccountDashboard
   renders the "Trades" h2). This module owns the locked subtitle and the
   records — never a second title.

   Colour comes from the app's theme-aware tokens, not any static mock's literal
   paper palette, so the record reads correctly in both light and dark.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

type OfferRow = {
  id: string;
  /* NULL only on terminal history whose listing was permanently deleted
     (v6.93) — the record renders from the durable snapshots; the View watch
     link renders only for pending offers, which are never detached. */
  target_listing_id: string | null;
  offered_listing_id: string | null;
  proposer_id: string;
  recipient_id: string;
  status: TradeStatus;
  cash_direction: CashDirection;
  cash_amount: number | null;
  cash_currency: string | null;
  note: string | null;
  target_brand: string | null;
  target_model: string | null;
  target_reference: string | null;
  /* Durable public-code snapshots (v6.93). Present in the API payload;
     rendered as the FWT listing code in the exchange meta line, and the one
     identity that survives when a terminal offer's listing is deleted. */
  target_public_code: string | null;
  offered_brand: string | null;
  offered_model: string | null;
  offered_reference: string | null;
  offered_public_code: string | null;
  created_at: string;
};

type DealRow = {
  id: string;
  trade_offer_id: string;
  status: DealStatus;
  /* Recorded, never settled. transactions has zero rows and no payment
     rail exists; these three describe an agreed adjustment, nothing more. */
  cash_direction: "none" | "proposer_pays" | "recipient_pays";
  cash_amount: number | null;
  cash_currency: string | null;
  legs: {
    id: string;
    listing_id: string;
    from_user_id: string;
    to_user_id: string;
    leg_status: LegStatus;
    listing_brand: string | null;
    listing_model: string | null;
    listing_reference: string | null;
    listing_public_code: string | null;
  }[];
};

const quietBtn =
  "border border-[var(--border-mid)] px-3 py-1.5 text-[10px] uppercase tracking-[1.5px] text-[var(--slate)] transition-colors hover:border-[var(--border-gold)] hover:text-[var(--platinum)]";

/* The two watch faces of one exchange, from the reader's own side of the
   table. Same viewer rule as lib/trade.tradeSummary (the proposer receives
   the TARGET and gives the OFFERED watch); reused here only to split name
   from meta for the composition — never to re-derive cash direction. */
function exchangeSides(o: OfferRow, viewer: "proposer" | "recipient") {
  const target = {
    name: [o.target_brand, o.target_model].filter(Boolean).join(" ").trim() || "Watch",
    meta: [o.target_reference, o.target_public_code].filter(Boolean).join(" · "),
  };
  const offered = {
    name: [o.offered_brand, o.offered_model].filter(Boolean).join(" ").trim() || "Watch",
    meta: [o.offered_reference, o.offered_public_code].filter(Boolean).join(" · "),
  };
  return viewer === "proposer"
    ? { receive: target, give: offered }
    : { receive: offered, give: target };
}

export default function TradeOffersModule() {
  const [offers, setOffers] = useState<OfferRow[] | null>(null);
  const [deals, setDeals] = useState<Record<string, DealRow>>({});
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const fetchOffers = useCallback(async (): Promise<{
    offers: OfferRow[];
    viewerId: string | null;
  }> => {
    try {
      const res = await fetch("/api/trade-offers");
      if (!res.ok) return { offers: [], viewerId: null };
      const data = await res.json();
      return {
        offers: Array.isArray(data.offers) ? data.offers : [],
        viewerId: typeof data.viewerId === "string" ? data.viewerId : null,
      };
    } catch {
      return { offers: [], viewerId: null };
    }
  }, []);

  const fetchDeals = useCallback(async (): Promise<Record<string, DealRow>> => {
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      /* RLS scopes both to the two parties. The legs are the per-watch
         truth; the deal is the agreement they belong to. */
      const { data } = await supabase
        .from("trade_deals")
        .select(
          "id, trade_offer_id, status, cash_direction, cash_amount, cash_currency, trade_deal_legs ( id, listing_id, from_user_id, to_user_id, leg_status, listing_brand, listing_model, listing_reference, listing_public_code )"
        );
      const out: Record<string, DealRow> = {};
      for (const d of (data ?? []) as unknown as (DealRow & {
        trade_deal_legs: DealRow["legs"];
      })[]) {
        out[d.trade_offer_id] = { ...d, legs: d.trade_deal_legs ?? [] };
      }
      return out;
    } catch {
      return {};
    }
  }, []);

  const load = useCallback(async () => {
    const [o, d] = await Promise.all([fetchOffers(), fetchDeals()]);
    setOffers(o.offers);
    setViewerId(o.viewerId);
    setDeals(d);
  }, [fetchOffers, fetchDeals]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [o, d] = await Promise.all([fetchOffers(), fetchDeals()]);
      if (cancelled) return;
      setOffers(o.offers);
      setViewerId(o.viewerId);
      setDeals(d);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchOffers, fetchDeals]);

  /* ── THE ACTS ────────────────────────────────────────────────────────
     Both reload from the server rather than patching local state. leg_status
     is a CACHE the database derives — confirming one leg can also complete
     the parent deal — so the only honest thing to show afterwards is what
     the server now says, not what this component guessed. */
  async function markSent(legId: string, sent: boolean) {
    setBusy(legId);
    setNote(null);
    try {
      const res = await fetch(`/api/trades/legs/${legId}/sent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sent }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setNote(data?.detail ?? "That did not go through.");
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function confirmReceipt(legId: string) {
    setBusy(legId);
    setNote(null);
    try {
      /* The key is per LEG, not per click. One leg confirmed by its
         recipient is one fact however many times the button is pressed, and
         the producer collapses the repeat into the original event. */
      const res = await fetch("/api/trade/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tradeDealLegId: legId,
          action: "confirm",
          idempotencyKey: `trade_leg_receipt:${legId}`,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setNote(
          data?.reason === "only_the_recipient_may_confirm_receipt"
            ? "Only the collector receiving this watch can confirm it arrived."
            : (data?.detail ?? "That did not go through.")
        );
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function cancelDeal(dealId: string) {
    setBusy(dealId);
    setNote(null);
    try {
      const res = await fetch(`/api/trades/${dealId}/cancel`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setNote(data?.detail ?? "That did not go through.");
        return;
      }
      setNote("Trade cancelled. Both watches are back on the market.");
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function act(offerId: string, action: "accept" | "decline" | "withdraw") {
    setBusy(offerId);
    setNote(null);
    try {
      const res = await fetch(`/api/trade-offers/${offerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNote(data?.detail ?? "That did not go through.");
        return;
      }
      setNote(
        action === "accept"
          ? "Trade accepted. Both watches are reserved for this trade."
          : action === "decline"
            ? "Trade declined."
            : "Proposal withdrawn."
      );
      await load();
    } catch {
      setNote("Network error — nothing changed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {/* Locked founder subtitle (§3) — the single page title lives in the
          shared workspace header, never repeated here. */}
      <p className="max-w-[650px] text-[12px] leading-[1.55] text-[var(--muted)]">
        Looking to trade for another watch—cash can be added to balance the deal.
      </p>

      {note && (
        <p className="mt-4 text-[12px] italic text-[var(--gold-subtle)]">{note}</p>
      )}

      {offers === null ? (
        <p className="mt-10 text-[13px] italic text-[var(--muted)]">Loading trades…</p>
      ) : offers.length === 0 ? (
        <p className="mt-10 max-w-[840px] border-t border-[var(--border-faint)] px-1 py-10 text-[13px] italic text-[var(--muted)] md:ml-[30px]">
          No trade proposals yet.
        </p>
      ) : (
        offers.map((o) => {
          const viewer = viewerId === o.proposer_id ? "proposer" : "recipient";
          const summary = tradeSummary(
            {
              targetIdentity: watchIdentity({
                brand: o.target_brand,
                model: o.target_model,
                reference: o.target_reference,
              }),
              offeredIdentity: watchIdentity({
                brand: o.offered_brand,
                model: o.offered_model,
                reference: o.offered_reference,
              }),
              terms: {
                cash_direction: o.cash_direction,
                cash_amount: o.cash_amount,
                cash_currency: o.cash_currency,
              },
            },
            viewer,
            formatMoney
          );
          const deal = deals[o.id];
          const sides = exchangeSides(o, viewer);
          const hasCash = o.cash_direction !== "none";

          /* Lifecycle hierarchy (§5): one current state, not three competing
             ones. Once accepted the deal owns the state; before that the offer
             does. The history line is the already-shipped truthful next-step
             for a deal, and the plain outcome for a resolved offer — never a
             manufactured phrase. */
          const currentState = deal
            ? DEAL_STATUS_LABELS[deal.status]
            : TRADE_STATUS_LABELS[o.status];
          const historyLine = deal
            ? dealNextStep(deal.status)
            : o.status === "pending"
              ? "Awaiting a response"
              : null;
          const showExplainer = o.status === "pending" || Boolean(deal);

          return (
            <section
              key={o.id}
              className="mt-10 max-w-[840px] px-1 md:ml-[30px]"
              aria-label="Trade record"
            >
              {/* ── Lifecycle header ── */}
              <div className="grid grid-cols-[1fr_auto] items-start gap-6 border-b border-[var(--border-gold)] pb-4">
                <div>
                  <div className="text-[9px] uppercase tracking-[0.18em] text-[var(--muted)]">
                    Trade
                  </div>
                  <div className="mt-1.5 font-display text-[26px] font-light leading-tight text-[var(--platinum)]">
                    {currentState}
                  </div>
                  {historyLine && (
                    <div className="mt-1 text-[11px] text-[var(--muted)]">{historyLine}</div>
                  )}
                </div>
                <div className="pt-1 text-[9px] uppercase tracking-[0.16em] text-[var(--gold-dim)]">
                  {currentState}
                </div>
              </div>

              {/* ── The exchange — the primary object ── */}
              <div className="grid grid-cols-1 items-center gap-5 border-b border-[var(--border-faint)] py-7 sm:grid-cols-[1fr_auto_1fr]">
                <div>
                  <div className="text-[9px] uppercase tracking-[0.17em] text-[var(--muted)]">
                    You receive
                  </div>
                  <div className="mt-2 font-display text-[20px] font-light leading-tight text-[var(--platinum)]">
                    {sides.receive.name}
                  </div>
                  {sides.receive.meta && (
                    <div className="mt-1 text-[11px] text-[var(--muted)]">
                      {sides.receive.meta}
                    </div>
                  )}
                </div>
                <div
                  aria-hidden
                  className="justify-self-center font-display text-[26px] text-[var(--slate)] max-sm:rotate-90"
                >
                  ⇄
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-[0.17em] text-[var(--muted)]">
                    You give
                  </div>
                  <div className="mt-2 font-display text-[20px] font-light leading-tight text-[var(--platinum)]">
                    {sides.give.name}
                  </div>
                  {sides.give.meta && (
                    <div className="mt-1 text-[11px] text-[var(--muted)]">{sides.give.meta}</div>
                  )}
                </div>
              </div>

              {/* ── Cash adjustment — its own beat ── */}
              {hasCash ? (
                <div className="grid grid-cols-1 gap-3 border-b border-[var(--border-faint)] py-5 sm:grid-cols-[180px_1fr]">
                  <div className="text-[9px] uppercase tracking-[0.16em] text-[var(--muted)]">
                    Cash adjustment
                  </div>
                  <div>
                    <div className="font-display text-[18px] font-light text-[var(--gold)]">
                      {summary.cash}
                    </div>
                    {o.note && (
                      <p className="mt-1.5 text-[13px] italic text-[var(--muted)]">“{o.note}”</p>
                    )}
                  </div>
                </div>
              ) : (
                o.note && (
                  <p className="border-b border-[var(--border-faint)] py-5 text-[13px] italic text-[var(--muted)]">
                    “{o.note}”
                  </p>
                )
              )}

              {/* ── Pending actions — decline is the recipient's, withdraw
                   the proposer's; neither can perform the other's act ── */}
              {o.status === "pending" && (
                <div className="flex flex-wrap gap-2 py-5">
                  {viewer === "recipient" ? (
                    <>
                      <button
                        type="button"
                        className="fw-btn-primary disabled:opacity-40"
                        disabled={busy === o.id}
                        onClick={() => act(o.id, "accept")}
                      >
                        {busy === o.id ? "Working…" : "Accept trade"}
                      </button>
                      <button
                        type="button"
                        className={quietBtn}
                        disabled={busy === o.id}
                        onClick={() => act(o.id, "decline")}
                      >
                        Decline
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className={quietBtn}
                      disabled={busy === o.id}
                      onClick={() => act(o.id, "withdraw")}
                    >
                      Withdraw proposal
                    </button>
                  )}
                  {o.target_listing_id && (
                    <Link href={`/listings/${o.target_listing_id}`} className={quietBtn}>
                      View watch
                    </Link>
                  )}
                </div>
              )}

              {/* ── Transfer record — the aligned per-watch ledger ── */}
              {deal && (
                <div className="pt-7">
                  <h3 className="font-display text-[18px] font-light text-[var(--platinum)]">
                    Transfer record
                  </h3>

                  {deal.cash_direction !== "none" && deal.cash_amount != null && (
                    <p className="mt-2 text-[12px] text-[var(--platinum-dim)]">
                      Cash adjustment {formatMoney(deal.cash_amount, deal.cash_currency)}{" "}
                      <span className="text-[var(--muted)]">
                        &mdash;{" "}
                        {deal.cash_direction === "proposer_pays"
                          ? "from the proposer"
                          : "from the recipient"}
                        . Recorded here, settled between you. FairWatchTrade does not move it.
                      </span>
                    </p>
                  )}

                  <div className="mt-3">
                    {deal.legs.map((leg) => {
                      const iSend = leg.from_user_id === viewerId;
                      const iReceive = leg.to_user_id === viewerId;
                      const live = deal.status !== "cancelled" && deal.status !== "completed";
                      /* Sent belongs to whoever posts the watch, receipt to
                         whoever gets it. Never both, never neither. */
                      const canMarkSent = live && iSend && leg.leg_status === "bound";
                      const canUndoSent = live && iSend && leg.leg_status === "in_transit";
                      /* Offered from bound OR in_transit: Sent is advisory, so
                         a recipient holding the watch is never blocked by a
                         sender who forgot to mark it. */
                      const canConfirm =
                        live &&
                        iReceive &&
                        (leg.leg_status === "bound" || leg.leg_status === "in_transit");
                      return (
                        <div
                          key={leg.id}
                          className="border-t border-[var(--border-faint)] py-3 last:border-b"
                        >
                          <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[110px_minmax(0,1fr)_auto]">
                            <div className="text-[9px] uppercase tracking-[0.14em] text-[var(--muted)]">
                              {iReceive ? "To you" : "To them"}
                            </div>
                            <div className="text-[11px] text-[var(--platinum-dim)]">
                              {watchIdentity({
                                brand: leg.listing_brand,
                                model: leg.listing_model,
                                reference: leg.listing_reference,
                                publicCode: leg.listing_public_code,
                              })}
                            </div>
                            <div className="text-[9px] uppercase tracking-[0.14em] text-[var(--gold-dim)] sm:text-right">
                              {LEG_STATUS_LABELS[leg.leg_status]}
                            </div>
                          </div>
                          {(canMarkSent || canUndoSent || canConfirm) && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {canMarkSent && (
                                <button
                                  type="button"
                                  disabled={busy === leg.id}
                                  onClick={() => markSent(leg.id, true)}
                                  className={quietBtn}
                                >
                                  Mark as sent
                                </button>
                              )}
                              {canUndoSent && (
                                <button
                                  type="button"
                                  disabled={busy === leg.id}
                                  onClick={() => markSent(leg.id, false)}
                                  className={quietBtn}
                                >
                                  Undo sent
                                </button>
                              )}
                              {canConfirm && (
                                <button
                                  type="button"
                                  disabled={busy === leg.id}
                                  onClick={() => confirmReceipt(leg.id)}
                                  className={quietBtn}
                                >
                                  Confirm receipt
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Cancellation dies the moment a watch genuinely moves. The
                      control disappears rather than failing, so nobody presses
                      it expecting the trade to come undone. */}
                  {deal.status !== "cancelled" &&
                    deal.status !== "completed" &&
                    deal.legs.every(
                      (l) => l.leg_status === "bound" || l.leg_status === "in_transit"
                    ) && (
                      <button
                        type="button"
                        disabled={busy === deal.id}
                        onClick={() => cancelDeal(deal.id)}
                        className={quietBtn + " mt-4"}
                      >
                        Cancel trade
                      </button>
                    )}
                </div>
              )}

              {/* ── Acceptance explainer, integrated into the record (§9) ── */}
              {showExplainer && (
                <div className="mt-7 grid grid-cols-1 gap-4 border-t border-[var(--border-gold)] pt-5 sm:grid-cols-[180px_1fr]">
                  <div className="text-[9px] uppercase tracking-[0.16em] text-[var(--muted)]">
                    What acceptance means
                  </div>
                  <p className="max-w-[630px] text-[11px] leading-[1.62] text-[var(--muted)]">
                    Accepting a trade reserves both watches at the same moment so neither can be
                    sold out from under the other. FairWatchTrade records the exchange and transfer
                    state; the cash difference is settled between the parties in the listing
                    conversation.
                  </p>
                </div>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
