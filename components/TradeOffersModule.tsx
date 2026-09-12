"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  DEAL_STATUS_LABELS,
  LEG_STATUS_LABELS,
  TRADE_STATUS_LABELS,
  archiveEligibility,
  dealNextStep,
  tradeSummary,
  watchIdentity,
  type CashDirection,
  type DealStatus,
  type LegStatus,
  type TradeStatus,
} from "@/lib/trade";
import { formatMoney } from "@/lib/formatMoney";
import { ACCOUNT_ROOM_BODY } from "@/lib/accountWorkspace/roomGeography";
import {
  applyRead,
  established,
  readJson,
  LOADING,
  STALE_NOTE,
  type LoadState,
} from "@/lib/accountWorkspace/readTruth";

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

   ── ONE CONTENT ORIGIN (2026-09-12) ────────────────────────────────────
   The subtitle used to start at the pane's own edge while every record was
   pushed to `md:ml-[30px]`, so the room's sentence and the records it
   introduces disagreed about where the room begins — and on desktop the
   first letter sat against the Account rail. Both now root on
   ACCOUNT_ROOM_BODY, the shared header's own inset. No typography changed:
   the LS1 recipes this file consumes are untouched.

   ── ARCHIVE IS A VIEW, NOT A STATE OF THE TRADE (2026-09-12) ───────────
   Active and Archived are two readings of the same room. Archiving is one
   person's private decision to stop looking at a finished exchange; it
   writes nothing to the trade, the deal, the legs, the transfer events or
   the cash, and the counterparty cannot see that it happened. Eligibility
   is recomputed from live status on every read and again inside the
   database on every write, so a trade that becomes active again leaves
   Archived on its own — see lib/trade.archiveEligibility and the
   trade_archive_preferences migration.

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
  "fw-compact-control border border-[var(--border-mid)] px-3 py-1.5 uppercase text-[var(--slate)] transition-colors hover:border-[var(--border-gold)] hover:text-[var(--platinum)]";

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

type Workspace = {
  offers: OfferRow[];
  viewerId: string | null;
  counterpartNames: Record<string, string | null>;
  deals: Record<string, DealRow>;
  /** False when the deal read FAILED — not when there are no deals. */
  dealsOk: boolean;
  archived: Array<{ kind: "deal" | "offer"; id: string }>;
  /** False when the archive-preference read FAILED. */
  archiveOk: boolean;
};

export default function TradeOffersModule() {
  /* LS-4 (2026-09-12). Three separate lies used to live in this component:
     a failed offers fetch returned `[]` and rendered "No trade proposals
     yet"; a failed deal query returned `{}`, which is indistinguishable
     from "this offer has no deal", so an accepted exchange was DOWNGRADED
     to an ordinary pending offer by a network error; and there was no
     archive read at all. All three now arrive from one route that reports
     what it managed to establish, and this room says so rather than
     inventing the parts it does not have. */
  const [workspace, setWorkspace] = useState<LoadState<Workspace>>(LOADING);
  const [view, setView] = useState<"active" | "archived">("active");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const fetchWorkspace = useCallback(
    () =>
      readJson<Workspace>("/api/trade-offers", (body) => {
        const b = body as Partial<Workspace> | null;
        if (!b || !Array.isArray(b.offers)) return null;
        return {
          offers: b.offers as OfferRow[],
          viewerId: typeof b.viewerId === "string" ? b.viewerId : null,
          counterpartNames:
            b.counterpartNames && typeof b.counterpartNames === "object" ? b.counterpartNames : {},
          deals: (b.deals && typeof b.deals === "object" ? b.deals : {}) as Record<string, DealRow>,
          dealsOk: b.dealsOk !== false,
          archived: Array.isArray(b.archived) ? b.archived : [],
          archiveOk: b.archiveOk !== false,
        };
      }),
    []
  );

  const load = useCallback(async () => {
    const result = await fetchWorkspace();
    setWorkspace((prev) => applyRead(prev, result));
  }, [fetchWorkspace]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchWorkspace();
      if (!cancelled) setWorkspace((prev) => applyRead(prev, result));
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchWorkspace]);

  const data = established(workspace);
  const offers = data?.offers ?? null;
  const deals = data?.deals ?? {};
  const viewerId = data?.viewerId ?? null;
  const counterpartNames = data?.counterpartNames ?? {};
  const dealsOk = data?.dealsOk ?? true;
  const archiveOk = data?.archiveOk ?? true;
  const archivedKeys = new Set((data?.archived ?? []).map((a) => `${a.kind}:${a.id}`));

  /* Archive or restore one record. The browser sends which record and which
     intent; participation and eligibility are the database's to decide. A
     confirmed mutation is merged optimistically so a failing refresh cannot
     visually undo it, then the refresh reconciles. */
  async function setArchived(kind: "deal" | "offer", id: string, archived: boolean) {
    const key = `${kind}:${id}`;
    setBusy(key);
    setNote(null);
    try {
      const res = await fetch("/api/trades/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordKind: kind, recordId: id, archived }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setNote(body?.detail ?? "That could not be saved just now.");
        return;
      }
      setWorkspace((prev) => {
        const current = established(prev);
        if (!current || prev.phase === "loading" || prev.phase === "unavailable") return prev;
        const next = archived
          ? [...current.archived.filter((a) => `${a.kind}:${a.id}` !== key), { kind, id }]
          : current.archived.filter((a) => `${a.kind}:${a.id}` !== key);
        return { phase: prev.phase, data: { ...current, archived: next } };
      });
      setNote(archived ? "Filed in Archived. Only you see this." : "Restored to Active.");
      await load();
    } catch {
      setNote("Network error — nothing changed.");
    } finally {
      setBusy(null);
    }
  }

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

  /* Which records belong to the view on screen. Eligibility is live truth
     recomputed here on every render, so a record that stopped being
     finished is in Active again without anyone clearing a flag. */
  const archivedNow = (o: OfferRow) => {
    const deal = deals[o.id];
    const key = deal ? `deal:${deal.id}` : `offer:${o.id}`;
    if (!archivedKeys.has(key)) return false;
    /* TWO independent guards, and the second is the load-bearing one.
       The route already retires a preference whose stored generation no
       longer matches the record. This adds the rule from the other side:
       Archived shows only records that are CURRENTLY eligible. A deal that
       went back to settling is actionable, and actionable truth may never
       sit in a view the collector is not looking at — so it returns to
       Active whatever any stored preference says. */
    if (!dealsOk) return false;
    return archiveEligibility({ dealStatus: deal?.status ?? null, offerStatus: o.status }).eligible;
  };

  const inView = (offers ?? []).filter((o) => {
    if (!archiveOk) return true; // cannot classify — see the banner below
    return view === "archived" ? archivedNow(o) : !archivedNow(o);
  });

  return (
    /* ONE origin for the room: subtitle, controls, states and records. */
    <div className={ACCOUNT_ROOM_BODY}>
      {/* Locked founder subtitle (§3) — the single page title lives in the
          shared workspace header, never repeated here. */}
      <p className="max-w-[650px] text-[12px] leading-[1.55] text-[var(--muted)]">
        Looking to trade for another watch—cash can be added to balance the deal.
      </p>

      {/* Active / Archived — a view of this room, not a second room, and
          never a rail door. Hidden while there is nothing to divide. */}
      {offers !== null && offers.length > 0 && archiveOk && (
        <div className="mt-4 flex gap-2" role="tablist" aria-label="Trade views">
          {(["active", "archived"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              data-trade-view={v}
              className={`fw-compact-control border px-3 py-1.5 uppercase transition-colors ${
                view === v
                  ? "border-[var(--border-gold)] text-[var(--gold)]"
                  : "border-[var(--border-mid)] text-[var(--slate)] hover:text-[var(--platinum)]"
              }`}
            >
              {v === "active" ? "Active" : "Archived"}
            </button>
          ))}
        </div>
      )}

      {note && (
        <p className="mt-4 text-[12px] italic text-[var(--gold-subtle)]">{note}</p>
      )}

      {workspace.phase === "stale" && (
        <p role="status" className="mt-4 text-[12px] text-[var(--slate)]">
          {STALE_NOTE}
        </p>
      )}

      {/* Archive truth could not be established. Rather than sort records
          into two views it cannot justify, the room shows them all and says
          why — classifying on a failed read would hide a finished trade in
          a view the collector never chose, or claim Archived is empty. */}
      {offers !== null && !archiveOk && (
        <p role="status" className="mt-4 text-[12px] text-[var(--slate)]" data-archive-unavailable="">
          Your Active and Archived views could not be established just now, so every trade is shown
          together. Nothing has been archived or restored.
        </p>
      )}

      {/* Deal truth could not be established. The offers are real and are
          shown; what the room will not do is call an accepted exchange an
          ordinary proposal because the deal read failed. */}
      {offers !== null && !dealsOk && (
        <p role="status" className="mt-4 text-[12px] text-[var(--slate)]" data-deals-unavailable="">
          Current trade state could not be established just now. The exchanges below are real; their
          progress and the actions that depend on it are unavailable until this can be read.
        </p>
      )}

      {workspace.phase === "loading" ? (
        <p className="mt-10 text-[13px] italic text-[var(--muted)]">Loading trades…</p>
      ) : workspace.phase === "unavailable" ? (
        <div
          className="mt-10 max-w-[840px] border-t border-[var(--border-faint)] py-10"
          data-trades-unavailable=""
        >
          <p role="status" className="text-[13px] text-[var(--slate)]">
            Your trades could not be loaded just now. Nothing has changed.
          </p>
          <button type="button" onClick={() => void load()} className={`${quietBtn} mt-3`}>
            Try again
          </button>
        </div>
      ) : (offers ?? []).length === 0 ? (
        /* Reachable only from an ESTABLISHED read: loading and unavailable
           are handled above, so zero here was proven, never assumed. */
        <p className="mt-10 max-w-[840px] border-t border-[var(--border-faint)] py-10 text-[13px] italic text-[var(--muted)]">
          No trade proposals yet.
        </p>
      ) : inView.length === 0 ? (
        <p className="mt-10 max-w-[840px] border-t border-[var(--border-faint)] py-10 text-[13px] italic text-[var(--muted)]">
          {view === "archived"
            ? "Nothing archived yet. A finished trade stays in Active until you file it here."
            : "Nothing active. Your finished trades are in Archived."}
        </p>
      ) : (
        inView.map((o) => {
          const viewer = viewerId === o.proposer_id ? "proposer" : "recipient";
          /* Founder ruling: counterparty identity is profiles.display_name
             through the sanctioned public view, or NOTHING. A null or blank
             name collapses honestly — never a manufactured placeholder
             standing where a person's identity belongs. */
          const counterpartName =
            (counterpartNames[
              viewer === "proposer" ? o.recipient_id : o.proposer_id
            ] ?? "").trim() || null;
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
          /* When the deal read FAILED we do not know whether this offer has
             a deal, so we may not fall through to the offer's own lifecycle:
             that is the downgrade LS-4 found. An accepted offer with
             unavailable deal truth says so instead. */
          const dealTruthMissing = !dealsOk && o.status === "accepted" && !deal;
          const currentState = deal
            ? DEAL_STATUS_LABELS[deal.status]
            : dealTruthMissing
              ? "Trade state unavailable"
              : TRADE_STATUS_LABELS[o.status];
          const historyLine = deal
            ? dealNextStep(deal.status)
            : dealTruthMissing
              ? "This exchange was accepted. Its current state could not be read just now."
              : o.status === "pending"
                ? "Awaiting a response"
                : null;
          const showExplainer = o.status === "pending" || Boolean(deal);

          /* Archive eligibility: the deal governs wherever one exists, the
             offer only when none does, and leg status never — the helper
             does not accept legs at all. Unknown deal truth means unknown
             eligibility, so no control is offered. */
          const eligibility = dealsOk
            ? archiveEligibility({ dealStatus: deal?.status ?? null, offerStatus: o.status })
            : null;
          const archiveKind: "deal" | "offer" = deal ? "deal" : "offer";
          const archiveId = deal ? deal.id : o.id;
          const archiveKey = `${archiveKind}:${archiveId}`;
          const isArchived = archivedNow(o);
          const canArchive = archiveOk && !!eligibility?.eligible;

          return (
            <section
              key={o.id}
              className="mt-10 max-w-[840px]"
              aria-label="Trade record"
            >
              {/* ── Lifecycle header ── */}
              <div className="grid grid-cols-[1fr_auto] items-start gap-6 border-b border-[var(--border-gold)] pb-4">
                <div>
                  <div className="fw-lifecycle-label uppercase text-[var(--muted)]">
                    Trade
                  </div>
                  <div className="mt-1.5 font-display text-[26px] font-light leading-tight text-[var(--platinum)]">
                    {currentState}
                  </div>
                  {historyLine && (
                    <div className="mt-1 text-[11px] text-[var(--muted)]">{historyLine}</div>
                  )}
                  {/* The other party, by name — a trade is with a PERSON,
                      and until now this surface never said which one. When
                      no public display name exists the line is OMITTED
                      entirely: an honest absence, never a placeholder
                      rendered as someone's identity. */}
                  {counterpartName && (
                    <div className="mt-1 text-[11px] text-[var(--platinum-dim)]">
                      With{" "}
                      <span className="text-[var(--platinum)]">{counterpartName}</span>
                    </div>
                  )}
                </div>
                <div className="fw-lifecycle-label pt-1 uppercase text-[var(--gold-dim)]">
                  {currentState}
                </div>
              </div>

              {/* ── The exchange — the primary object ── */}
              <div className="grid grid-cols-1 items-center gap-5 border-b border-[var(--border-faint)] py-7 sm:grid-cols-[1fr_auto_1fr]">
                <div>
                  <div className="fw-lifecycle-label uppercase text-[var(--muted)]">
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
                  <div className="fw-lifecycle-label uppercase text-[var(--muted)]">
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
                  <div className="fw-lifecycle-label uppercase text-[var(--muted)]">
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

              {/* ── Transfer record — the aligned per-watch ledger. Rendered
                   only from established deal truth; never guessed. ── */}
              {deal && dealsOk && (
                <div className="pt-7">
                  <h3 className="font-display text-[18px] font-light text-[var(--platinum)]">
                    Transfer record
                  </h3>

                  {deal.cash_direction !== "none" && deal.cash_amount != null && (
                    <p className="mt-2 text-[12px] text-[var(--platinum-dim)]">
                      Cash adjustment {formatMoney(deal.cash_amount, deal.cash_currency)}{" "}
                      {/* Viewer-relative, never role-language: the exchange
                          sides above already speak as "you receive / you
                          give", and the money must speak the same way. A
                          seller should never have to remember which of the
                          two of them the word "proposer" meant. */}
                      <span className="text-[var(--muted)]">
                        &mdash;{" "}
                        {(deal.cash_direction === "proposer_pays") ===
                        (viewer === "proposer")
                          ? "from you"
                          : `from ${counterpartName ?? "your counterparty"}`}
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
                            <div className="fw-lifecycle-label uppercase text-[var(--muted)]">
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
                            <div className="fw-lifecycle-label uppercase text-[var(--gold-dim)] sm:text-right">
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

              {/* ── Archive / Restore — quiet, and only where the record is
                   genuinely finished. Filing changes nothing about the trade
                   and the other party never learns of it. ── */}
              {canArchive && (
                <div className="flex flex-wrap items-center gap-3 pt-5">
                  <button
                    type="button"
                    disabled={busy === archiveKey}
                    onClick={() => setArchived(archiveKind, archiveId, !isArchived)}
                    className={quietBtn}
                    data-archive-control={isArchived ? "restore" : "archive"}
                  >
                    {busy === archiveKey ? "Working…" : isArchived ? "Restore" : "Archive"}
                  </button>
                  <span className="text-[11px] text-[var(--muted)]">
                    {isArchived
                      ? "Only you filed this away. Restoring returns it to Active."
                      : "Files this out of your Active view. Private to you; the trade itself is unchanged."}
                  </span>
                </div>
              )}

              {/* ── Acceptance explainer, integrated into the record (§9) ── */}
              {showExplainer && (
                <div className="mt-7 grid grid-cols-1 gap-4 border-t border-[var(--border-gold)] pt-5 sm:grid-cols-[180px_1fr]">
                  <div className="fw-lifecycle-label uppercase text-[var(--muted)]">
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
