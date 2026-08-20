"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import SellFlow from "@/components/SellFlow";

/* ────────────────────────────────────────────────────────────────────────
   /sell — the one listing creation experience.

   Private Listing V1 (v5.98): arriving with ?privateThread=<threadId> (the
   Communications room's "Create Private Listing for This Buyer" doorway)
   turns this same flow into a PRIVATE listing for the one buyer behind that
   conversation. The recipient is resolved and displayed before anything is
   entered, so the identity is unmistakable; the server independently
   re-derives the buyer from the thread at creation time — these props only
   carry the relationship and name it truthfully.

   FAIL SAFE, NEVER SILENTLY PUBLIC: if the thread cannot be resolved (not
   the caller's conversation, deleted, malformed), the flow REFUSES to render
   rather than quietly falling back to an ordinary public submission the
   seller did not intend.
   ──────────────────────────────────────────────────────────────────────── */

function SellPageInner() {
  const privateThreadId = useSearchParams().get("privateThread");

  const [privateState, setPrivateState] = useState<
    "none" | "resolving" | "ready" | "invalid"
  >(privateThreadId ? "resolving" : "none");
  const [buyerName, setBuyerName] = useState<string | null>(null);

  useEffect(() => {
    if (!privateThreadId) return;
    let cancelled = false;
    (async () => {
      try {
        // peek — confirming the recipient is not reading the correspondence.
        const res = await fetch(`/api/messages/${privateThreadId}?peek=1`);
        if (cancelled) return;
        if (!res.ok) {
          setPrivateState("invalid");
          return;
        }
        const data = await res.json().catch(() => null);
        const name =
          typeof data?.thread?.otherName === "string" ? data.thread.otherName : null;
        if (cancelled) return;
        if (name) {
          setBuyerName(name);
          setPrivateState("ready");
        } else {
          setPrivateState("invalid");
        }
      } catch {
        if (!cancelled) setPrivateState("invalid");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [privateThreadId]);

  const isPrivate = privateState === "ready" && !!privateThreadId;

  return (
    <main className="min-h-screen bg-[var(--ink)]">
      <div className="mx-auto max-w-3xl px-6 py-12 sm:px-8">
        <div className="mb-8">
          <div className="text-[8px] uppercase tracking-[4px] text-[var(--gold-subtle)]">
            FairWatchTrade
          </div>

          {isPrivate ? (
            <>
              <h1 className="mt-2 font-display text-[28px] font-light tracking-[0.3px] text-[var(--platinum)]">
                List your watch for {buyerName}.
              </h1>
              <p className="mt-1 font-display text-[14px] font-light italic text-[var(--muted)]">
                A private listing — the same real FairWatchTrade listing, for one
                collector.
              </p>
              {/* The recipient, unmistakable before a single field is filled. */}
              <div className="mt-4 border border-[var(--lc-private_active-line)] px-4 py-3">
                <div
                  className="text-[11px] uppercase tracking-[2px]"
                  style={{ color: "var(--lc-private_active-badge)" }}
                >
                  Private listing · for {buyerName}
                </div>
                <p className="mt-1 text-[13px] leading-[1.6] text-[var(--slate)]">
                  Visible only to {buyerName}. It will never appear on Browse, in
                  search, or in any public count — and they can make an offer
                  through the normal purchase path the moment you activate it.
                </p>
              </div>
            </>
          ) : (
            <>
              <h1 className="mt-2 font-display text-[28px] font-light tracking-[0.3px] text-[var(--platinum)]">
                List your watch.
              </h1>
              <p className="mt-1 font-display text-[14px] font-light italic text-[var(--muted)]">
                Independent &amp; boutique makers only. Curated before listed.
              </p>

              {/* v2.56 — the seller's approved answer, near the entry. */}
              <div className="mt-4 text-[14px] leading-[1.6]">
                <span className="font-display text-[16px] text-[var(--platinum)]">
                  Pay a flat 5% only when your watch sells.
                </span>
                <span className="mt-0.5 block text-[13px] text-[var(--muted)]">
                  No listing fee. No paid placement. No games.
                </span>
              </div>

              {/* v2.2 — List from Phone. A quiet, explicit opt-in for mobile
                  sellers (md:hidden). Never an auto-redirect: tablets, foldables,
                  desktop-mode browsers, and sellers who prefer this form all stay
                  right here. The wizard is a choice, not a funnel. */}
              <Link
                href="/sell/mobile"
                className="mt-5 inline-flex items-center gap-2 border border-[var(--border-gold)] px-4 py-2 text-[11px] uppercase tracking-[1.6px] text-[var(--gold-dim)] transition-colors hover:text-[var(--gold)] md:hidden"
              >
                List from Phone →
              </Link>
            </>
          )}
        </div>

        {privateState === "resolving" ? (
          <p className="py-10 text-center font-display text-[14px] font-light italic text-[var(--muted)]">
            Confirming the private recipient…
          </p>
        ) : privateState === "invalid" ? (
          /* Refuse rather than silently publish publicly — the seller came
             here to list for ONE person. */
          <div className="border border-[var(--border-faint)] px-6 py-8 text-center">
            <p className="mx-auto max-w-[52ch] font-display text-[15px] font-light italic leading-[1.7] text-[var(--platinum-dim)]">
              This private listing must start from one of your own buyer
              conversations, and this one couldn&apos;t be confirmed.
            </p>
            <Link
              href="/account?module=communications"
              className="mt-4 inline-block border border-[var(--border-gold)] px-4 py-2 text-[11px] uppercase tracking-[1.6px] text-[var(--gold)] transition hover:bg-[var(--gold-whisper)]"
            >
              Back to Communications
            </Link>
          </div>
        ) : isPrivate ? (
          <SellFlow
            privateThreadId={privateThreadId as string}
            privateBuyerName={buyerName ?? undefined}
          />
        ) : (
          <SellFlow />
        )}
      </div>
    </main>
  );
}

export default function SellPage() {
  return (
    <Suspense fallback={null}>
      <SellPageInner />
    </Suspense>
  );
}
