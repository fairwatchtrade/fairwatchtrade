"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

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
     Nothing reassuring-sounding is claimed beyond what is true.

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

  // Escape closes; focus returns to the button that opened it.
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
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
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex min-h-[28px] items-center gap-1.5 border border-[var(--border-subtle)] px-2 py-1 text-[10px] uppercase tracking-[1.5px] text-[var(--slate)] transition hover:border-[var(--border-gold)] hover:text-[var(--platinum-dim)]"
      >
        FairWatchTrade Dealer
        <span
          aria-hidden="true"
          className="flex h-[14px] w-[14px] items-center justify-center rounded-full border border-current text-[9px] lowercase italic"
        >
          i
        </span>
      </button>
      {open && (
        <span
          role="note"
          className="absolute left-0 top-full z-40 mt-2 block w-[300px] max-w-[80vw] border border-[var(--border-subtle)] bg-[var(--ink-deep)] px-4 py-3 text-left shadow-[0_12px_30px_rgba(0,0,0,0.55)]"
        >
          <span className="block text-[12px] leading-[1.6] text-[var(--slate)]">
            This seller operates a dealer storefront on FairWatchTrade. Every
            listing here passed the same review before publication as the rest
            of the marketplace, and exact photo matches are recorded across
            listings as review evidence. FairWatchTrade does not provide
            independent third-party authentication, and payment is arranged
            directly between buyer and seller.
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2 text-[10px] uppercase tracking-[1.5px] text-[var(--muted)] transition hover:text-[var(--platinum-dim)]"
          >
            Close
          </button>
        </span>
      )}
    </span>
  );
}
