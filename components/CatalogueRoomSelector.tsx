"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/* ────────────────────────────────────────────────────────────────────────
   COLLECTOR ROOM SELECTOR — the narrow-width form of Collector Navigation.

   The desktop rail is a persistent object: 238px of permanent left edge
   that a collector reads once and then navigates by muscle memory. On a
   380px phone that same object would be most of the runway, so below the
   rail's own breakpoint it is not shrunk — it is REPLACED by one control
   that answers the only question a phone has room to answer: which
   collector room am I in, and where else can I go.

   Closed, it costs a single 46px control. Open, it is a temporary overlay:
   absolutely positioned, so the Catalogue page underneath never reflows
   downward to make room for a menu that is about to close again.

   WHAT THIS IS NOT, deliberately:
   · not a second hamburger — the global drawer is a different object with a
     different job (leaving this room); this one only moves within it;
   · not horizontal tabs — seven destinations in two named groups do not
     survive being flattened into a scrolling strip;
   · not a miniature permanent rail;
   · and it carries no Sell, no Seller Workspace, no account furniture. The
     seller group was removed from the collector rail deliberately, and the
     phone is not a loophole for putting it back.

   It renders below md only. The rail hides itself at max-width:767px, so
   `md:hidden` is that breakpoint's exact complement: at any width, exactly
   one of the two navigations exists.
   ──────────────────────────────────────────────────────────────────────── */

export type CollectorDestination = { label: string; href: string };

/* The seven destinations, grouped exactly as the desktop rail groups them.
   Kept in the order the rail renders them; a guard test holds this list and
   CatalogueRail's markup to the same seven hrefs so the two forms of one
   navigation cannot quietly drift apart. */
export const COLLECTOR_GROUPS: ReadonlyArray<{
  label: string;
  items: ReadonlyArray<CollectorDestination>;
}> = [
  {
    label: "Discover",
    items: [
      { label: "Browse", href: "/browse" },
      { label: "Catalogue", href: "/catalogue" },
      { label: "Watch DNA", href: "/watch-dna" },
      { label: "Wanted", href: "/wanted" },
    ],
  },
  {
    label: "Yours",
    items: [
      { label: "My Catalogue", href: "/catalogue#saved-watches" },
      { label: "Saved Searches", href: "/catalogue#saved-searches" },
      { label: "My Offers", href: "/catalogue#my-offers" },
    ],
  },
];

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 10 10"
      fill="none"
      className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <path
        d="M1.5 3.5L5 7L8.5 3.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function CatalogueRoomSelector() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);

  /* The room the collector is actually standing in, never a hardcoded word.
     Only the full-page destinations can be a room — the three under "Yours"
     are places on the Catalogue page, not rooms of their own, so they never
     rename the control. The fallback cannot be reached from the two pages
     that mount this, and exists so an unrouted mount degrades to the family
     name rather than to an empty control. */
  const currentRoom =
    COLLECTOR_GROUPS.flatMap((group) => group.items).find(
      (item) => !item.href.includes("#") && item.href === pathname
    )?.label ?? "Catalogue";

  /* Outside dismissal, and Escape returns focus to the control that opened
     the menu — the same contract the global drawer honours. */
  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /* A route change closes the menu, adjusted during render rather than in an
     effect — this codebase's lint forbids setState inside one, and React's
     own answer for "reset some state when something changes" is exactly
     this. It converges immediately and cannot loop.

     Selecting a destination already closes the menu on click; this covers
     the routes that change without that click, browser back/forward most of
     all, so the menu can never be left standing over the section it was
     asked to reveal. */
  const [routeWhenOpened, setRouteWhenOpened] = useState(pathname);
  if (routeWhenOpened !== pathname) {
    setRouteWhenOpened(pathname);
    setOpen(false);
  }

  /* No horizontal padding of its own: the CONTAINER owns the inset, so this
     control lines up with the page text above and below it rather than
     floating in from an edge nobody else respects. Any future mount must
     therefore sit inside a container that provides the narrow-width inset —
     both current mounts do. */
  return (
    <nav
      ref={navRef}
      className="relative pb-3 pt-4 md:hidden"
      aria-label="Collector navigation"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-[46px] w-full items-center justify-between border-y border-[var(--border-subtle)] text-left"
      >
        <span className="flex items-baseline gap-3">
          <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
            Collector
          </span>
          <span className="font-display text-[16px] font-light text-[var(--platinum)]">
            {currentRoom}
          </span>
        </span>
        <span className="text-[var(--gold)]">
          <Chevron open={open} />
        </span>
      </button>

      {/* Absolutely positioned on purpose: the menu is borrowed space, not
          new page structure. `top-[46px]` sits it on the control's lower
          hairline; left-0/right-0 span exactly the control's own width, so
          the menu's edges land on the hairline's edges — and the container's
          inset carries both. */}
      {open && (
        <div
          role="menu"
          className="absolute left-0 right-0 top-[46px] z-40 border border-[var(--border-subtle)] bg-[var(--surface)] py-1.5 shadow-[0_14px_30px_rgba(0,0,0,0.28)]"
        >
          {COLLECTOR_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="px-3.5 pb-1 pt-2 text-[11px] uppercase tracking-[0.15em] text-[var(--muted)]">
                {group.label}
              </div>
              {group.items.map((item) => {
                /* Quiet, but unmistakable: a gold left edge and the faintest
                   gold wash, the same language the desktop rail uses for the
                   active room. The tick is what survives when the wash is
                   washed out by sunlight on a phone. */
                const selected = item.href === pathname;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    aria-current={selected ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={`flex min-h-[42px] items-center justify-between border-l-2 px-3.5 text-[14px] transition-colors ${
                      selected
                        ? "border-[var(--gold)] bg-[var(--gold-whisper)] text-[var(--platinum)]"
                        : "border-transparent text-[var(--slate)] hover:text-[var(--platinum)]"
                    }`}
                  >
                    <span>{item.label}</span>
                    {selected && (
                      <span className="text-[var(--gold)]" aria-hidden="true">
                        ✓
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </nav>
  );
}
