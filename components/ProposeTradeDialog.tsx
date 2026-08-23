"use client";

import { useCallback, useEffect, useState } from "react";
import {
  buildCashTerms,
  isTradeable,
  tradeSummary,
  watchIdentity,
  type CashDirection,
} from "@/lib/trade";
import { formatMoney } from "@/lib/formatMoney";

/* ════════════════════════════════════════════════════════════════════════
   PROPOSE A TRADE — components/ProposeTradeDialog.tsx

   Three questions, in the order a collector actually thinks:
     1. which of my watches am I offering?
     2. does cash go either way, and which way?
     3. anything to say?

   ── THE ONE VISUAL LAW ─────────────────────────────────────────────────
   What I receive · what I give · who adds cash. The user must never decode
   a formula, so the summary is rendered from the direction VALUE, never
   from a signed number, and it is written in second person because "the
   proposer pays" means nothing to someone who has not been told they are
   the proposer.

   No swap-arrow carnival graphics, no TRADE! banner, no exchange styling.
   A trade is an ordinary way to acquire a watch and should look like one.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

type OwnListing = {
  id: string;
  public_code: string | null;
  brand: string;
  model: string | null;
  reference: string | null;
  status: string;
  asking_price: number | null;
  asking_currency: string | null;
};

const inputCls =
  "w-full border border-[var(--border-subtle)] bg-[rgba(7,8,12,0.4)] px-3 py-2 text-[13px] text-[var(--platinum)] outline-none focus:border-[var(--border-gold)]";
const labelCls = "mb-1 block text-[11px] uppercase tracking-[2px] text-[var(--muted)]";
const quietBtn =
  "border border-[var(--border-mid)] px-3 py-1.5 text-[10px] uppercase tracking-[1.5px] text-[var(--slate)] transition-colors hover:border-[var(--border-gold)] hover:text-[var(--platinum)]";

const DIRECTIONS: { value: CashDirection; label: string }[] = [
  { value: "none", label: "Even trade" },
  { value: "proposer_pays", label: "I add cash" },
  { value: "recipient_pays", label: "They add cash" },
];

export default function ProposeTradeDialog({
  targetListingId,
  targetIdentity,
  onClose,
  onProposed,
}: {
  targetListingId: string;
  targetIdentity: string;
  onClose: () => void;
  onProposed: () => void;
}) {
  const [listings, setListings] = useState<OwnListing[] | null>(null);
  const [offeredId, setOfferedId] = useState<string | null>(null);
  const [direction, setDirection] = useState<CashDirection>("none");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOwn = useCallback(async (): Promise<OwnListing[]> => {
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];
      /* Own-row RLS scopes this. Only genuinely tradeable statuses are
         offered — a draft or a rejected listing is not consideration. */
      const { data } = await supabase
        .from("listings")
        .select("id, public_code, brand, model, reference, status, asking_price, asking_currency")
        .eq("seller_id", user.id)
        .in("status", ["published", "private_active"])
        .order("created_at", { ascending: false });
      return ((data ?? []) as OwnListing[]).filter((l) => isTradeable(l.status));
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = await fetchOwn();
      if (!cancelled) setListings(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchOwn]);

  const offered = (listings ?? []).find((l) => l.id === offeredId) ?? null;

  const terms = buildCashTerms({ direction, amount, currency });
  const summary = offered
    ? tradeSummary(
        {
          targetIdentity,
          offeredIdentity: watchIdentity({
            brand: offered.brand,
            model: offered.model,
            reference: offered.reference,
            publicCode: offered.public_code,
          }),
          terms: terms.ok
            ? terms.terms
            : { cash_direction: "none", cash_amount: null, cash_currency: null },
        },
        "proposer",
        formatMoney
      )
    : null;

  async function submit() {
    if (!offeredId) return;
    if (!terms.ok) {
      setError(terms.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/trade-offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetListingId,
          offeredListingId: offeredId,
          cashDirection: direction,
          cashAmount: amount,
          cashCurrency: currency,
          note,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.detail ?? "That proposal could not be sent.");
        return;
      }
      onProposed();
    } catch {
      setError("Network error — nothing was sent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-[var(--border-gold)] p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div className="text-[11px] uppercase tracking-[3px] text-[var(--gold-subtle)]">
          Propose a trade
        </div>
        <button type="button" onClick={onClose} className="text-[10px] uppercase tracking-[1.5px] text-[var(--slate)] hover:text-[var(--platinum)]">
          Cancel
        </button>
      </div>

      {/* 1 · the watch being offered */}
      <div className={labelCls}>Which of your watches are you offering?</div>
      {listings === null ? (
        <p className="text-[12px] italic text-[var(--muted)]">Loading your watches…</p>
      ) : listings.length === 0 ? (
        <p className="text-[12px] leading-relaxed text-[var(--muted)]">
          A trade is offered with a real FairWatchTrade watch, so you need one that is live before
          you can propose. List the watch you want to trade — it can be a private listing if you
          would rather it stay off the market.
        </p>
      ) : (
        <div className="space-y-1">
          {listings.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setOfferedId(l.id)}
              className={`flex w-full flex-wrap items-baseline justify-between gap-2 border px-3 py-2 text-left transition-colors ${
                offeredId === l.id
                  ? "border-[var(--border-gold)] bg-[var(--surface)]"
                  : "border-[var(--border-faint)] hover:border-[var(--border-mid)]"
              }`}
            >
              <span className="text-[13px] text-[var(--platinum-dim)]">
                {watchIdentity({
                  brand: l.brand,
                  model: l.model,
                  reference: l.reference,
                  publicCode: l.public_code,
                })}
              </span>
              <span className="text-[11px] text-[var(--muted)]">
                {l.status === "private_active" ? "Private" : "Public"}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* 2 · cash direction — never a signed number */}
      {offeredId && (
        <>
          <div className={`${labelCls} mt-5`}>Does cash go either way?</div>
          <div className="flex flex-wrap gap-2">
            {DIRECTIONS.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => setDirection(d.value)}
                className={`border px-3 py-1.5 text-[11px] uppercase tracking-[1.5px] transition-colors ${
                  direction === d.value
                    ? "border-[var(--border-gold)] bg-[var(--surface)] text-[var(--platinum)]"
                    : "border-[var(--border-mid)] text-[var(--slate)] hover:text-[var(--platinum)]"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>

          {direction !== "none" && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Amount</label>
                <input
                  className={inputCls}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="2,000"
                />
              </div>
              <div>
                <label className={labelCls}>Currency</label>
                <input
                  className={inputCls}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 8))}
                />
              </div>
            </div>
          )}

          <div className="mt-4">
            <label className={labelCls}>Message (optional)</label>
            <input
              className={inputCls}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything the seller should know"
            />
          </div>

          {/* 3 · the summary — what I get, what I give, who adds cash */}
          {summary && (
            <div className="mt-5 border border-[var(--border-subtle)] p-3">
              <dl className="space-y-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <dt className="text-[10px] uppercase tracking-[1.5px] text-[var(--muted)]">
                    You receive
                  </dt>
                  <dd className="text-[13px] text-[var(--platinum)]">{summary.youReceive}</dd>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <dt className="text-[10px] uppercase tracking-[1.5px] text-[var(--muted)]">
                    You give
                  </dt>
                  <dd className="text-[13px] text-[var(--platinum)]">{summary.youGive}</dd>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-[var(--border-faint)] pt-1.5">
                  <dt className="text-[10px] uppercase tracking-[1.5px] text-[var(--muted)]">
                    Cash
                  </dt>
                  <dd className="text-[13px] text-[var(--gold)]">{summary.cash}</dd>
                </div>
              </dl>
            </div>
          )}

          {error && <p className="mt-3 text-[12px] text-[var(--platinum-dim)]">{error}</p>}

          <button
            type="button"
            className="fw-btn-primary mt-4 disabled:opacity-40"
            disabled={busy || !offeredId}
            onClick={submit}
          >
            {busy ? "Sending…" : "Submit trade proposal"}
          </button>
          <p className="mt-2 text-[11px] text-[var(--muted)]">
            If the seller accepts, both watches are reserved for this trade at the same moment —
            neither can be sold out from under the other.
          </p>
        </>
      )}

      {listings !== null && listings.length > 0 && !offeredId && (
        <button type="button" className={`${quietBtn} mt-4`} onClick={onClose}>
          Not now
        </button>
      )}
    </div>
  );
}
