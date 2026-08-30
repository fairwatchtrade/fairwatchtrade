"use client";

import { useEffect, useRef, useState } from "react";

/* ────────────────────────────────────────────────────────────────────────
   ACCOUNT ROOM SELECTOR — the narrow-width form of the Account workspace
   navigation.

   The mechanism this replaces was a native <select>: functional, but its
   open state on a real phone is the OS's white radio-sheet — a giant
   native drawer wearing none of the product's language. The collector
   navigation already solved this exact problem with a compact 46px
   control that opens a lightweight owned overlay, and this control adopts
   that same presentation contract for Account's own destinations.

   WHY A SIBLING AND NOT A REUSE of the collector selector: that component
   navigates by href through real route changes, carries the collector
   grouping, and its source is held verbatim by a guard test. Account
   navigation is a different mechanism entirely — the module URL truth is
   written by the workspace's own selectModule (a pushState on one page),
   Settings alone is a real route, and the destination set is Account's
   eight rooms, flat. Same visual language, different navigation physics;
   forcing one component to speak both would couple two governed surfaces
   that change for different reasons.

   WHAT THIS DELIBERATELY IS NOT:
   · not Catalogue — no COLLECTOR/DISCOVER/YOURS groups, no collector
     destinations; Account keeps Account's mixed-workspace meaning;
   · not a new source of navigation truth — selection calls the SAME
     onSelect the native select called, and the ?module= URL remains the
     only owner of the active room;
   · no Marketplace Control, no invented rooms.

   Accessibility keeps what the native select provided: a real button with
   aria-expanded/haspopup, menu items that are buttons, Escape closes and
   returns focus to the trigger, outside interaction closes, and a room
   change closes via render-adjustment — this codebase's lint forbids
   setState inside an effect, and React's own answer for "reset state when
   a value changes" is exactly this pattern.
   ──────────────────────────────────────────────────────────────────────── */

export type AccountRoom = { id: string; label: string };

/* Account's eight real destinations — the exact set the native select
   exposed, in the same order. `settings` is the one real route; the rest
   are ?module= values the workspace owns. */
export const ACCOUNT_ROOMS: ReadonlyArray<AccountRoom> = [
  { id: "dashboard", label: "Overview" },
  { id: "inventory", label: "Listings" },
  { id: "trades", label: "Trades" },
  { id: "communications", label: "Messages" },
  { id: "saved", label: "Saved" },
  { id: "wanted", label: "Wanted" },
  { id: "accelerator", label: "Dealer" },
  { id: "settings", label: "Settings" },
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

export default function AccountRoomSelector({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const currentLabel =
    ACCOUNT_ROOMS.find((r) => r.id === value)?.label ?? "Listings";

  /* Outside dismissal, and Escape returns focus to the control that opened
     the menu — the same contract the collector selector and the global
     drawer honour. */
  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /* A room change closes the menu during render, never in an effect. This
     covers changes that arrive without a selection click — back/forward
     walking the module history most of all. */
  const [valueWhenOpened, setValueWhenOpened] = useState(value);
  if (valueWhenOpened !== value) {
    setValueWhenOpened(value);
    setOpen(false);
  }

  return (
    <nav ref={navRef} className="relative md:hidden" aria-label="Account room">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-[46px] items-center gap-3 border-y border-[var(--border-subtle)] pr-1 text-left"
      >
        <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
          Account
        </span>
        <span className="font-display text-[16px] font-light text-[var(--platinum)]">
          {currentLabel}
        </span>
        <span className="text-[var(--gold)]">
          <Chevron open={open} />
        </span>
      </button>

      {/* Borrowed space, not page structure: absolutely positioned so the
          workspace beneath never reflows for a menu that is about to close
          again. Sits on the control's lower hairline. */}
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-[46px] z-40 w-[228px] border border-[var(--border-subtle)] bg-[var(--surface)] py-1.5 shadow-[0_14px_30px_rgba(0,0,0,0.28)]"
        >
          {ACCOUNT_ROOMS.map((room) => {
            /* Quiet, but unmistakable: a gold left edge and the faintest
               gold wash — the language the workspace already uses for the
               active room, and the tick is what survives when the wash is
               washed out by sunlight on a phone. */
            const selected = room.id === value;
            return (
              <button
                key={room.id}
                type="button"
                role="menuitem"
                aria-current={selected ? "true" : undefined}
                onClick={() => {
                  setOpen(false);
                  if (!selected) onSelect(room.id);
                }}
                className={`flex min-h-[42px] w-full items-center justify-between border-l-2 px-3.5 text-left text-[14px] transition-colors ${
                  selected
                    ? "border-[var(--gold)] bg-[var(--gold-whisper)] text-[var(--platinum)]"
                    : "border-transparent text-[var(--slate)] hover:text-[var(--platinum)]"
                }`}
              >
                <span>{room.label}</span>
                {selected && (
                  <span className="text-[var(--gold)]" aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </nav>
  );
}
