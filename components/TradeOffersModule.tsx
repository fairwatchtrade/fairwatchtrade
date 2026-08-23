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
   TRADES — the offers workspace — components/TradeOffersModule.tsx

   Trade proposals live in the same offer workspace architecture as cash
   requests, not in a separate Trade dashboard. The row's job is to make the
   type and BOTH watches obvious without opening anything:

     TRADE · Pending
     You give   Explorer 114270 + $1,500
     You receive Kalpa Hebdomadaire · X38205

   Every row is written from the reader's own side of the table. The same
   database row renders "You add $1,500" to one collector and "They add
   $1,500" to the other — because a stored direction is a fact about the
   deal, and second person is the only way a human reads it without doing
   arithmetic.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

type OfferRow = {
  id: string;
  target_listing_id: string;
  offered_listing_id: string;
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
  offered_brand: string | null;
  offered_model: string | null;
  offered_reference: string | null;
  created_at: string;
};

type DealRow = {
  id: string;
  trade_offer_id: string;
  status: DealStatus;
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
          "id, trade_offer_id, status, trade_deal_legs ( id, listing_id, from_user_id, to_user_id, leg_status, listing_brand, listing_model, listing_reference, listing_public_code )"
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
      <div className="mb-4">
        <h2 className="font-display text-[22px] font-light text-[var(--platinum)]">Trades</h2>
        <p className="mt-1 text-[12px] text-[var(--muted)]">
          Proposals where the consideration is another watch, with or without a cash difference.
        </p>
      </div>

      {note && <p className="mb-4 text-[12px] italic text-[var(--gold-subtle)]">{note}</p>}

      {offers === null ? (
        <p className="text-[13px] italic text-[var(--muted)]">Loading trades…</p>
      ) : offers.length === 0 ? (
        <p className="border border-[var(--border-subtle)] px-4 py-8 text-center text-[13px] italic text-[var(--muted)]">
          No trade proposals yet.
        </p>
      ) : (
        <div className="divide-y divide-[var(--border-faint)] border border-[var(--border-subtle)]">
          {offers.map((o) => {
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

            return (
              <div key={o.id} className="px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-[2px] text-[var(--gold-dim)]">
                      Trade · {TRADE_STATUS_LABELS[o.status]}
                    </div>
                    <dl className="mt-2 space-y-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <dt className="w-[92px] shrink-0 text-[10px] uppercase tracking-[1.5px] text-[var(--muted)]">
                          You receive
                        </dt>
                        <dd className="text-[14px] text-[var(--platinum)]">{summary.youReceive}</dd>
                      </div>
                      <div className="flex flex-wrap items-baseline gap-2">
                        <dt className="w-[92px] shrink-0 text-[10px] uppercase tracking-[1.5px] text-[var(--muted)]">
                          You give
                        </dt>
                        <dd className="text-[14px] text-[var(--platinum)]">{summary.youGive}</dd>
                      </div>
                      <div className="flex flex-wrap items-baseline gap-2">
                        <dt className="w-[92px] shrink-0 text-[10px] uppercase tracking-[1.5px] text-[var(--muted)]">
                          Cash
                        </dt>
                        <dd className="text-[13px] text-[var(--gold)]">{summary.cash}</dd>
                      </div>
                    </dl>
                    {o.note && (
                      <p className="mt-2 text-[12px] italic text-[var(--muted)]">“{o.note}”</p>
                    )}
                  </div>
                </div>

                {/* Actions — decline belongs to the recipient, withdraw to
                    the proposer, and neither can perform the other's act. */}
                {o.status === "pending" && (
                  <div className="mt-3 flex flex-wrap gap-2">
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
                    <Link href={`/listings/${o.target_listing_id}`} className={quietBtn}>
                      View watch
                    </Link>
                  </div>
                )}

                {/* The accepted deal, and each watch's own progress. The deal
                    is the agreement; the legs are the objects. */}
                {deal && (
                  <div className="mt-4 border-t border-[var(--border-faint)] pt-3">
                    <div className="text-[10px] uppercase tracking-[1.5px] text-[var(--gold-dim)]">
                      {DEAL_STATUS_LABELS[deal.status]}
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-[var(--muted)]">
                      {dealNextStep(deal.status)}
                    </p>
                    <div className="mt-2 space-y-1">
                      {deal.legs.map((leg) => (
                        <div
                          key={leg.id}
                          className="flex flex-wrap items-baseline justify-between gap-2 text-[12px]"
                        >
                          <span className="text-[var(--platinum-dim)]">
                            {watchIdentity({
                              brand: leg.listing_brand,
                              model: leg.listing_model,
                              reference: leg.listing_reference,
                              publicCode: leg.listing_public_code,
                            })}
                            <span className="ml-2 text-[10px] uppercase tracking-[1px] text-[var(--muted)]">
                              {leg.to_user_id === viewerId ? "to you" : "to them"}
                            </span>
                          </span>
                          <span className="text-[10px] uppercase tracking-[1.5px] text-[var(--muted)]">
                            {LEG_STATUS_LABELS[leg.leg_status]}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-8 text-[11px] leading-relaxed text-[var(--muted)]">
        Accepting a trade reserves both watches at the same moment, so neither can be sold out from
        under the other. Arranging the exchange itself happens in the listing conversation.
      </p>
    </div>
  );
}
