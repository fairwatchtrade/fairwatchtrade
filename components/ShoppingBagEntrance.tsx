"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ShoppingBagIcon from "@/components/ShoppingBagIcon";
import type { BagHeaderTruth } from "@/lib/purchases/bagMembership";

/* ────────────────────────────────────────────────────────────────────────
   SHOPPING BAG ENTRANCE — the conditional header control
   (Accepted Purchase Continuity + Shopping Bag, 2026-09-11)

   Three truths, three renderings, and absence is one of them:

     none ............ NOTHING renders. A successful read that proved zero
                       members means there is no Bag, so there is no icon.
                       No permanent empty bag, no "0".
     members(N) ...... the locked bag + gold-check mark, with N beside it.
                       N is exactly the number of watches in the Bag — not
                       unread, not messages, not actions. The count sits
                       NEXT TO the mark; it never covers the gold check.
     unavailable ..... the mark renders with no number and an honest label:
                       FairWatchTrade could not establish the Bag. Absence
                       is reserved for a read that succeeded and found none;
                       an error may never look like none (§7).

   The server seeds the first truth (root layout) so the entrance never
   flashes on mount; afterwards it re-reads /api/shopping-bag on a slow
   poll, when the tab regains focus, and on a same-tab `fwt:bag-changed`
   event (fired after Checkout returns or a payment resolves), so a watch
   leaving the Bag leaves the header too without a reload.

   Placement is the founder-locked signed-in utility order:
   desktop  SELL → [Bag when present] → Bell → Username
   drawer   Sell → [Bag when present] → Account → …
   NavBar and MobileNav mount this component in exactly those slots; it
   decides only whether and how to render, never where.
   ──────────────────────────────────────────────────────────────────────── */

const POLL_MS = 30_000;
export const BAG_CHANGED_EVENT = "fwt:bag-changed";

type Read = { ok: true; count: number } | { ok: false };

async function readBag(): Promise<Read> {
  try {
    const res = await fetch("/api/shopping-bag", { cache: "no-store" });
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as { ok?: boolean; count?: number };
    return data.ok && typeof data.count === "number" ? { ok: true, count: data.count } : { ok: false };
  } catch {
    return { ok: false };
  }
}

function truthFrom(read: Read): BagHeaderTruth {
  if (!read.ok) return { status: "unavailable" };
  return read.count > 0 ? { status: "members", count: read.count } : { status: "none" };
}

export function bagAriaLabel(truth: BagHeaderTruth): string {
  if (truth.status === "unavailable") return "Shopping Bag, contents unavailable right now";
  if (truth.status === "members") return `Shopping Bag, ${truth.count} ${truth.count === 1 ? "watch" : "watches"}`;
  return "Shopping Bag";
}

/** Signal the entrance (same tab) that Bag membership may have changed. */
export function announceBagChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(BAG_CHANGED_EVENT));
}

export default function ShoppingBagEntrance({
  initial,
  variant = "masthead",
  onNavigate,
}: {
  /** Server-resolved first truth; null when the server could not resolve
      (rendered as unavailable, never as none). */
  initial: BagHeaderTruth | null;
  variant?: "masthead" | "drawer";
  onNavigate?: () => void;
}) {
  const [truth, setTruth] = useState<BagHeaderTruth>(initial ?? { status: "unavailable" });
  const pathname = usePathname();
  const active = pathname === "/shopping-bag";

  const refresh = useCallback(async () => {
    const next = truthFrom(await readBag());
    setTruth(next);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => void refresh(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onChanged = () => void refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(BAG_CHANGED_EVENT, onChanged);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(BAG_CHANGED_EVENT, onChanged);
    };
  }, [refresh]);

  /* A successful read proving none: no Bag, no icon. */
  if (truth.status === "none") return null;

  const label = bagAriaLabel(truth);
  const unavailable = truth.status === "unavailable";

  if (variant === "drawer") {
    return (
      <Link
        href="/shopping-bag"
        onClick={onNavigate}
        aria-label={label}
        data-shopping-bag-entrance={truth.status}
        className={`flex items-center gap-3 border-l-2 px-5 py-[13px] text-[14.8px] transition ${
          active
            ? "border-[var(--gold)] bg-[color:light-dark(rgba(122,95,32,0.05),rgba(201,168,76,0.04))] text-[var(--platinum)]"
            : "border-transparent text-[var(--muted)] hover:text-[var(--platinum)]"
        }`}
      >
        <ShoppingBagIcon size={20} className="shrink-0" />
        <span className="flex min-w-0 items-baseline gap-2">
          <span>Shopping Bag</span>
          {truth.status === "members" ? (
            <span className="text-[12px] tracking-[1px] text-[var(--gold)]" data-shopping-bag-count="">
              {truth.count}
            </span>
          ) : (
            <span className="text-[11px] italic text-[var(--muted)]">unavailable</span>
          )}
        </span>
      </Link>
    );
  }

  return (
    <Link
      href="/shopping-bag"
      aria-label={label}
      title={unavailable ? "FairWatchTrade could not read your Shopping Bag just now." : undefined}
      data-shopping-bag-entrance={truth.status}
      className={`flex shrink-0 items-center gap-1.5 transition-colors ${
        active ? "text-[var(--gold)]" : "text-[var(--slate)] hover:text-[var(--platinum)]"
      }`}
    >
      <ShoppingBagIcon size={22} />
      {truth.status === "members" ? (
        /* Beside the mark, never on the disc. */
        <span className="text-[12px] tracking-[1px] text-[var(--gold)]" data-shopping-bag-count="">
          {truth.count}
        </span>
      ) : (
        <span className="fw-lifecycle-label uppercase text-[var(--muted)]" data-shopping-bag-unavailable="">
          Unavailable
        </span>
      )}
    </Link>
  );
}
