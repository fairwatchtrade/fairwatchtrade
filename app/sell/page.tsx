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
  const searchParams = useSearchParams();
  const privateThreadId = searchParams.get("privateThread");
  /* Wanted V1 — answering a demand request. This is a SECOND, independent
     entry: it needs no correspondence thread, so it deliberately does not
     reuse the privateThread resolution above (nor its known direct-load
     hydration defect). The request id names a REQUEST; the server derives
     the buyer from it at creation time. */
  const wantedId = searchParams.get("wanted");
  const wantedPrivate = searchParams.get("private") === "1";
  const [wantedState, setWantedState] = useState<
    "none" | "resolving" | "ready" | "invalid"
  >(wantedId ? "resolving" : "none");
  const [wantedIdentity, setWantedIdentity] = useState<string | null>(null);
  const [wantedPrivateOk, setWantedPrivateOk] = useState(false);

  useEffect(() => {
    if (!wantedId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/wanted/${wantedId}/peek`);
        if (cancelled) return;
        if (!res.ok) {
          setWantedState("invalid");
          return;
        }
        const data = await res.json().catch(() => null);
        const identity = typeof data?.request?.display_identity === "string"
          ? data.request.display_identity
          : null;
        if (!identity) {
          setWantedState("invalid");
          return;
        }
        setWantedIdentity(identity);
        setWantedPrivateOk(data?.request?.private_listing_ok !== false);
        setWantedState("ready");
      } catch {
        if (!cancelled) setWantedState("invalid");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wantedId]);

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
        const raw =
          typeof data?.thread?.otherName === "string" ? data.thread.otherName : null;
        /* The API's generic fallback identity is honest machinery, but it is
           machine language — "FairWatchTrade Member" on a private-listing
           header reads like a database default where a relationship should
           be. A usable display name is used normally; the generic becomes
           null here so every surface below speaks collector language
           instead. The thread is still perfectly valid either way — the
           BINDING is the thread id, never the name. */
        const name = raw === "FairWatchTrade Member" ? "" : raw;
        if (cancelled) return;
        if (name !== null) {
          setBuyerName(name || null);
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
  const isWanted = wantedState === "ready" && !!wantedId;
  /* Private only when the seller asked AND the collector accepts private
     listings. The server re-checks both; this only keeps the header honest. */
  const isWantedPrivate = isWanted && wantedPrivate && wantedPrivateOk;

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
                {buyerName ? `List your watch for ${buyerName}.` : "List your watch for this collector."}
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
                  {buyerName ? `Private listing · for ${buyerName}` : "Private listing for this collector"}
                </div>
                <p className="mt-1 text-[13px] leading-[1.6] text-[var(--slate)]">
                  {buyerName
                    ? `Visible only to ${buyerName}. It`
                    : "Only this collector can see this listing. It"}{" "}
                  will never appear on Browse, in search, or in any public
                  count — and they can make an offer through the normal
                  purchase path the moment you activate it.
                </p>
              </div>
            </>
          ) : isWanted ? (
            <>
              <h1 className="mt-2 font-display text-[28px] font-light tracking-[0.3px] text-[var(--platinum)]">
                {isWantedPrivate ? "List this watch for one collector." : "Answer a Wanted request."}
              </h1>
              <p className="mt-1 font-display text-[14px] font-light italic text-[var(--muted)]">
                {wantedIdentity}
              </p>
              <div className="mt-4 border border-[var(--border-gold)] px-4 py-3">
                <div className="text-[11px] uppercase tracking-[2px] text-[var(--gold-dim)]">
                  {isWantedPrivate ? "Private listing · for the requester" : "Answering a Wanted request"}
                </div>
                <p className="mt-1 text-[13px] leading-[1.6] text-[var(--slate)]">
                  {isWantedPrivate
                    ? "Only the collector who asked for this watch will see the listing. It will never appear on Browse, in search, or in any public count — and no message thread was needed to reach them."
                    : "This listing will be offered as the answer to a collector's Wanted request once it exists. Photographs, review and publication rules are unchanged."}
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
        ) : wantedState === "resolving" ? (
          <p className="py-10 text-center font-display text-[14px] font-light italic text-[var(--muted)]">
            Confirming the request…
          </p>
        ) : wantedState === "invalid" ? (
          /* Refuse rather than quietly become an ordinary public listing the
             seller did not intend — the same fail-safe the thread path uses. */
          <div className="border border-[var(--border-faint)] px-6 py-8 text-center">
            <p className="mx-auto max-w-[52ch] font-display text-[15px] font-light italic leading-[1.7] text-[var(--platinum-dim)]">
              That Wanted request is no longer open for answers.
            </p>
            <Link
              href="/account?module=wanted"
              className="mt-4 inline-block border border-[var(--border-gold)] px-4 py-2 text-[11px] uppercase tracking-[1.6px] text-[var(--gold)] transition hover:bg-[var(--gold-whisper)]"
            >
              Back to Wanted Requests
            </Link>
          </div>
        ) : isPrivate ? (
          <SellFlow
            privateThreadId={privateThreadId as string}
            privateBuyerName={buyerName ?? undefined}
          />
        ) : isWanted ? (
          <SellFlow wantedRequestId={wantedId as string} wantedPrivate={isWantedPrivate} />
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
