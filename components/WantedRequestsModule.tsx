"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  BUDGET_FIT_LABELS,
  DOCUMENTATION_LABELS,
  ageLabel,
  compatibilitySentence,
  type BudgetFit,
  type CriteriaReport,
  type DocumentationLevel,
} from "@/lib/wanted";
import { formatMoney } from "@/lib/formatMoney";

/* ════════════════════════════════════════════════════════════════════════
   WANTED REQUESTS — the Seller Workspace queue

   Open collector demand a seller may answer, and the three governed ways
   to answer it. Seller Workspace owns this by founder ruling; Dealer Room
   may surface the same requests later and is out of scope here.

   ── WHAT THIS COMPONENT CANNOT SHOW, BY CONSTRUCTION ───────────────────
   The buyer's name, contact, exact target, exact ceiling and private note
   are not omitted by this file's restraint — they never arrive. The queue
   is served by wanted_requests_for_seller(), a SECURITY DEFINER projection
   that does not select them, and the seller's session has no row access to
   the underlying table. The only budget information here is one of three
   words computed inside Postgres.

   ── THREE PATHS, AND NO FOURTH ─────────────────────────────────────────
   Use Existing Listing · Create New Listing · Create Private Listing for
   Requester. There is deliberately no "message the buyer" — a freeform
   response before a governed listing exists is exactly what Wanted was
   designed to replace, and Communications remains listing-bound.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

type SellerRequest = {
  id: string;
  display_identity: string;
  brand: string;
  model_text: string | null;
  reference_text: string | null;
  min_condition: string | null;
  documentation: DocumentationLevel;
  must_have: string[];
  preferred: string[];
  private_listing_ok: boolean;
  status: string;
  created_at: string;
  budget_fit: BudgetFit | null;
  answer_count: number;
  answered_by_me: boolean;
};

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

const quietBtn =
  "border border-[var(--border-mid)] px-3 py-1.5 text-[10px] uppercase tracking-[1.5px] text-[var(--slate)] transition-colors hover:border-[var(--border-gold)] hover:text-[var(--platinum)]";

export default function WantedRequestsModule() {
  const [rows, setRows] = useState<SellerRequest[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  /* Same shape as the collector workspace: the mount effect commits after
     the await, and answering refreshes through load(). */
  const fetchRows = useCallback(async (): Promise<SellerRequest[]> => {
    try {
      const res = await fetch("/api/wanted/seller");
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.requests) ? data.requests : [];
    } catch {
      return [];
    }
  }, []);

  const load = useCallback(async () => {
    setRows(await fetchRows());
  }, [fetchRows]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = await fetchRows();
      if (!cancelled) setRows(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchRows]);

  const [now] = useState(() => Date.now());

  return (
    <div>
      <div className="mb-4">
        <h2 className="font-display text-[22px] font-light text-[var(--platinum)]">
          Wanted Requests
        </h2>
        <p className="mt-1 text-[12px] text-[var(--muted)]">
          Collectors actively looking for a watch. Answer with a listing you already have, a new
          one, or a private listing made for that collector alone.
        </p>
      </div>

      {note && <p className="mb-4 text-[12px] italic text-[var(--gold-subtle)]">{note}</p>}

      {rows === null ? (
        <p className="text-[13px] italic text-[var(--muted)]">Loading open requests…</p>
      ) : rows.length === 0 ? (
        <p className="border border-[var(--border-subtle)] px-4 py-8 text-center text-[13px] italic text-[var(--muted)]">
          No open Wanted requests right now.
        </p>
      ) : (
        <div className="divide-y divide-[var(--border-faint)] border border-[var(--border-subtle)]">
          {rows.map((r) => (
            <div key={r.id} className="px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-display text-[18px] text-[var(--platinum)]">
                    {r.display_identity}
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--muted)]">
                    {[
                      r.min_condition ? `${r.min_condition} or better` : null,
                      r.documentation !== "any" ? DOCUMENTATION_LABELS[r.documentation] : null,
                      ageLabel(r.created_at, now),
                      r.answer_count > 0
                        ? `${r.answer_count} answer${r.answer_count === 1 ? "" : "s"}`
                        : "No answers yet",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(r.must_have ?? []).map((m) => (
                      <span
                        key={`m-${m}`}
                        className="border border-[var(--border-mid)] px-2 py-1 text-[9px] uppercase tracking-[1px] text-[var(--platinum-dim)]"
                      >
                        Must · {m}
                      </span>
                    ))}
                    {(r.preferred ?? []).map((p) => (
                      <span
                        key={`p-${p}`}
                        className="border border-[var(--border-faint)] px-2 py-1 text-[9px] uppercase tracking-[1px] text-[var(--muted)]"
                      >
                        Pref · {p}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {/* The entire seller-visible surface of the buyer's budget. */}
                  <div className="text-[10px] uppercase tracking-[1.5px] text-[var(--gold-dim)]">
                    {r.budget_fit ? BUDGET_FIT_LABELS[r.budget_fit] : "No comparable listing"}
                  </div>
                  {r.answered_by_me && (
                    <div className="mt-1 text-[10px] uppercase tracking-[1.5px] text-[var(--muted)]">
                      You answered
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3">
                <button
                  type="button"
                  className={quietBtn}
                  onClick={() => setOpen(open === r.id ? null : r.id)}
                >
                  {open === r.id ? "Close" : "Answer Request"}
                </button>
              </div>

              {open === r.id && (
                <AnswerPanel
                  request={r}
                  onAnswered={(msg) => {
                    setNote(msg);
                    setOpen(null);
                    void load();
                  }}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <p className="mt-8 text-[11px] leading-relaxed text-[var(--muted)]">
        The collector&rsquo;s exact budget and identity are never shown here. You are told only
        whether a watch sits within, near, or outside their range — and every answer is a real
        FairWatchTrade listing, never a message.
      </p>
    </div>
  );
}

/* ── The three governed paths ──────────────────────────────────────────── */
function AnswerPanel({
  request,
  onAnswered,
}: {
  request: SellerRequest;
  onAnswered: (message: string) => void;
}) {
  const [listings, setListings] = useState<OwnListing[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [report, setReport] = useState<CriteriaReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setListings([]);
          return;
        }
        /* The seller's own answerable inventory. Own-row RLS scopes it;
           the brand filter is convenience, not a boundary. */
        const { data } = await supabase
          .from("listings")
          .select("id, public_code, brand, model, reference, status, asking_price, asking_currency")
          .eq("seller_id", user.id)
          .in("status", ["draft", "pending_review", "published"])
          .order("created_at", { ascending: false });
        if (!cancelled) setListings((data ?? []) as OwnListing[]);
      } catch {
        if (!cancelled) setListings([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* The compatibility preview is computed SERVER-side — it needs the
     collector's ceiling, which this browser must never hold. */
  async function preview(listingId: string) {
    setSelected(listingId);
    setReport(null);
    setError(null);
    try {
      const res = await fetch(
        `/api/wanted/${request.id}/answer?listingId=${encodeURIComponent(listingId)}`
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data?.detail ?? "That listing could not be compared.");
        return;
      }
      setReport(data.report as CriteriaReport);
    } catch {
      setError("Network error.");
    }
  }

  async function send() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/wanted/${request.id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: selected, kind: "existing_listing" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.detail ?? "That answer could not be sent.");
        return;
      }
      onAnswered("Your listing has been sent as an answer.");
    } catch {
      setError("Network error — nothing was sent.");
    } finally {
      setBusy(false);
    }
  }

  const brandMatches = (listings ?? []).filter(
    (l) => l.brand.toLowerCase() === request.brand.toLowerCase()
  );
  const others = (listings ?? []).filter(
    (l) => l.brand.toLowerCase() !== request.brand.toLowerCase()
  );

  return (
    <div className="mt-4 border-t border-[var(--border-faint)] pt-4">
      {/* A · existing listing */}
      <div className="mb-5">
        <div className="mb-2 text-[11px] uppercase tracking-[2px] text-[var(--gold-subtle)]">
          Use an existing listing
        </div>
        {listings === null ? (
          <p className="text-[12px] italic text-[var(--muted)]">Loading your listings…</p>
        ) : listings.length === 0 ? (
          <p className="text-[12px] text-[var(--muted)]">
            You have no listings that could answer this yet.
          </p>
        ) : (
          <div className="space-y-1">
            {[...brandMatches, ...others].slice(0, 12).map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => preview(l.id)}
                className={`flex w-full flex-wrap items-baseline justify-between gap-2 border px-3 py-2 text-left transition-colors ${
                  selected === l.id
                    ? "border-[var(--border-gold)] bg-[var(--surface)]"
                    : "border-[var(--border-faint)] hover:border-[var(--border-mid)]"
                }`}
              >
                <span className="text-[13px] text-[var(--platinum-dim)]">
                  {[l.brand, l.model].filter(Boolean).join(" ")}
                  {l.reference ? ` · ${l.reference}` : ""}
                  {l.public_code ? ` · ${l.public_code}` : ""}
                </span>
                <span className="text-[12px] tabular-nums text-[var(--muted)]">
                  {formatMoney(l.asking_price, l.asking_currency)} · {l.status}
                </span>
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div className="mt-3 border border-[var(--border-subtle)] p-3">
            {report === null && !error ? (
              <p className="text-[12px] italic text-[var(--muted)]">Comparing…</p>
            ) : error ? (
              <p className="text-[12px] text-[var(--platinum-dim)]">{error}</p>
            ) : report ? (
              <>
                <p className="text-[12px] text-[var(--platinum-dim)]">
                  {compatibilitySentence(report)}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {report.requiredMet.map((m) => (
                    <span
                      key={`ok-${m}`}
                      className="border border-[var(--border-faint)] px-2 py-1 text-[9px] uppercase tracking-[1px] text-[var(--platinum-dim)]"
                    >
                      ✓ {m}
                    </span>
                  ))}
                  {report.requiredFailed.map((m) => (
                    <span
                      key={`no-${m}`}
                      className="border border-[#880015] px-2 py-1 text-[9px] uppercase tracking-[1px] text-[var(--platinum-dim)]"
                    >
                      ✗ {m}
                    </span>
                  ))}
                  {report.requiredUnknown.map((m) => (
                    <span
                      key={`un-${m}`}
                      className="border border-[var(--border-faint)] px-2 py-1 text-[9px] uppercase tracking-[1px] text-[var(--muted)]"
                    >
                      ? {m}
                    </span>
                  ))}
                </div>
                {report.budgetFit && (
                  <div className="mt-2 text-[10px] uppercase tracking-[1.5px] text-[var(--gold-dim)]">
                    {BUDGET_FIT_LABELS[report.budgetFit]}
                  </div>
                )}
                <button
                  type="button"
                  className="fw-btn-primary mt-3 disabled:opacity-40"
                  disabled={busy}
                  onClick={send}
                >
                  {busy ? "Sending…" : "Send this listing as the answer"}
                </button>
                {report.requiredFailed.length > 0 && (
                  <p className="mt-2 text-[11px] text-[var(--muted)]">
                    You can still send it — the collector sees exactly which criteria it misses.
                  </p>
                )}
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* B · new listing */}
      <div className="mb-5 border-t border-[var(--border-faint)] pt-4">
        <div className="mb-1 text-[11px] uppercase tracking-[2px] text-[var(--gold-subtle)]">
          Create a new listing
        </div>
        <p className="mb-2 text-[11px] text-[var(--muted)]">
          Opens the normal Sell Flow with the maker prefilled. Photographs, review and publication
          rules are unchanged.
        </p>
        <Link href={`/sell?wanted=${request.id}`} className={quietBtn}>
          Create listing →
        </Link>
      </div>

      {/* C · private listing for the requester */}
      {request.private_listing_ok && (
        <div className="border-t border-[var(--border-faint)] pt-4">
          <div className="mb-1 text-[11px] uppercase tracking-[2px] text-[var(--gold-subtle)]">
            Create a private listing for this collector
          </div>
          <p className="mb-2 text-[11px] text-[var(--muted)]">
            Have one in the safe? Make a complete FairWatchTrade listing visible only to the
            collector who asked. No message thread is needed — the request itself binds them as the
            authorized buyer.
          </p>
          <Link href={`/sell?wanted=${request.id}&private=1`} className={quietBtn}>
            Create private listing →
          </Link>
        </div>
      )}
    </div>
  );
}
