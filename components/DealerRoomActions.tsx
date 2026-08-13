"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import HelpBubble from "@/components/HelpBubble";

/* ────────────────────────────────────────────────────────────────────────
   DEALER ROOM ACTIONS — components/DealerRoomActions.tsx

   Two buyer-facing affordances for the Dealer Room identity header, per the
   buyer-facing polish order (2026-08-13):

   · DealerContactPanel — the room's primary buyer action. FairWatchTrade
     has ONE messaging system and one governing rule: conversations belong
     where the subject lives. A question about a watch belongs with that
     watch. So "Contact Dealer" does not open a parallel channel — it
     presents the dealer's watches and walks the buyer into the existing
     listing conversation (the listing page opens its composer on arrival
     via ?contact=1). No new routes, threads, or message semantics.

   · DealerTrustMark — a compact trust marker whose explanation says what
     FairWatchTrade actually does, in the same terms as the published FAQ:
     listings reviewed before publication, photo-match evidence recorded,
     no independent third-party authentication, payment arranged directly.
     Nothing reassuring-sounding is claimed beyond what is true. The
     explanation speaks FairWatchTrade's ONE help-affordance language —
     the shared HelpBubble (Layout ruling 2026-08-06): refined gold ?,
     hover/focus/tap behavior, anchored speech bubble with its caret,
     Escape / outside / Android Back close, focus returned to the trigger.
     Never a second question-mark design, never a generic tooltip.

   Both are outward-facing. No dealer management controls live here.
   Canary: PFC274 = 62 — /api/evaluate untouched.
   ──────────────────────────────────────────────────────────────────────── */

export type DealerContactItem = {
  id: string;
  brand: string;
  model: string | null;
  reference: string;
  thumbUrl: string | null;
};

export function DealerContactPanel({
  businessName,
  items,
}: {
  businessName: string;
  items: DealerContactItem[];
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Escape closes with focus returned; outside activation closes without
  // stealing focus — the overlay conventions the help language set.
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="dealer-contact-panel"
        className="inline-flex min-h-[44px] w-full items-center justify-center border border-[var(--border-gold)] bg-[rgba(201,168,76,0.08)] px-5 py-2 text-[12px] uppercase tracking-[2px] text-[var(--gold)] transition hover:bg-[rgba(201,168,76,0.14)] sm:w-auto"
      >
        Contact Dealer
      </button>

      {open && (
        <div
          id="dealer-contact-panel"
          ref={panelRef}
          className="absolute left-0 right-0 top-full z-30 border-b border-l border-r border-[var(--border-gold)] bg-[var(--ink-deep)] px-6 py-5 shadow-[0_18px_40px_rgba(0,0,0,0.55)]"
        >
          <div className="mx-auto flex w-full max-w-[720px] flex-col gap-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[2px] text-[var(--gold-dim)]">
                  Contact {businessName}
                </div>
                <p className="mt-2 text-[13px] leading-[1.6] text-[var(--slate)]">
                  Every conversation on FairWatchTrade lives with the watch
                  it&rsquo;s about — so the answers stay where you can find
                  them. Choose a watch to start your conversation:
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  buttonRef.current?.focus();
                }}
                aria-label="Close contact panel"
                className="min-h-[44px] shrink-0 px-2 text-[12px] uppercase tracking-[1.5px] text-[var(--muted)] transition hover:text-[var(--platinum-dim)]"
              >
                Close
              </button>
            </div>

            {items.length === 0 ? (
              <p className="text-[13px] text-[var(--muted)]">
                {businessName} has no public watches right now — check back
                soon.
              </p>
            ) : (
              <ul className="max-h-[320px] divide-y divide-[var(--border-faint)] overflow-y-auto border border-[var(--border-subtle)]">
                {items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/listings/${item.id}?contact=1`}
                      className="flex min-h-[56px] items-center gap-3 px-3 py-2 transition hover:bg-[rgba(255,255,255,0.03)]"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden border border-[var(--border-subtle)] bg-[var(--ink)]">
                        {item.thumbUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.thumbUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-[9px] text-[var(--muted)]">—</span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-[14px] font-light text-[var(--platinum)]">
                          {item.brand}
                          {item.model ? ` ${item.model}` : ""}
                        </span>
                        <span className="block truncate font-mono text-[11px] text-[var(--muted)]">
                          {item.reference}
                        </span>
                      </span>
                      <span className="shrink-0 text-[10px] uppercase tracking-[1.5px] text-[var(--gold-dim)]">
                        Ask about this watch →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export function DealerTrustMark() {
  return (
    <span className="flex items-center gap-0.5">
      <span className="inline-flex min-h-[28px] items-center border border-[var(--border-subtle)] px-2 py-1 text-[10px] uppercase tracking-[1.5px] text-[var(--slate)]">
        FairWatchTrade Dealer
      </span>
      {/* The ? and its speech bubble are the shared pattern. Anchoring is
          breakpoint-split ON PURPOSE: below sm this span is static, so the
          bubble anchors to the identity SECTION (relative, full width) and
          spans it edge to edge — a fixed-width card anchored to this tiny
          span overflowed the phone viewport faster than the clamp could
          measure it, and mobile Chrome expanded the whole layout viewport
          to fit (caught on the real XCover, 2026-08-13). A full-width card
          cannot overflow, and the caret tracks the ? wherever it sits.
          At sm+ the span is the ancestor and the card is the same 330px
          long-help rounded card as everywhere else. */}
      <span className="inline-flex sm:relative">
        <HelpBubble
          label="What FairWatchTrade Dealer means"
          historyKey="fwtDealerTrustHelp"
          title="A dealer storefront, reviewed like everything else"
          bubbleClassName="left-3 right-3 top-[calc(100%+8px)] rounded-2xl sm:left-0 sm:right-auto sm:top-[calc(100%+10px)] sm:w-[330px]"
          caretTracksTrigger
        >
          <p className="text-[13px] leading-[1.65] text-[var(--slate)]">
            This seller operates a dealer storefront on FairWatchTrade. Every
            listing here passed the same review before publication as the rest
            of the marketplace, and exact photo matches are recorded across
            listings as review evidence. FairWatchTrade does not provide
            independent third-party authentication, and payment is arranged
            directly between buyer and seller.
          </p>
        </HelpBubble>
      </span>
    </span>
  );
}
