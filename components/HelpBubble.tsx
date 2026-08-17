'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/* ════════════════════════════════════════════════════════════════════════
   HELP BUBBLE — FairWatchTrade's one help-affordance language
   (Layout ruling 2026-08-06)

   FairWatchTrade gets ONE help affordance, not a new question-mark design
   per feature. This component is the Search help's established pattern —
   the refined gold ?, its hover/focus/touch behavior, and the anchored
   speech-bubble treatment — extracted verbatim from BrowseSearch.tsx so
   the Sell Flow (Condition help, Service Evidence help, and every future
   ? control) speaks the identical language.

   Why extraction rather than direct reuse: the Search help is not a
   standalone component — its trigger, hover-intent timers, Android-Back
   history handling, and bubble markup live inline in BrowseSearch.tsx,
   coupled to search state (its example buttons commit live queries).
   This component carries the SAME interaction contract:

     · hover opens a preview after 300ms intent; leaving closes after
       220ms; the preview never takes a history entry;
     · focus opens the preview; click pins (tap on touch = pin);
     · a pinned bubble takes ONE history entry so the first Android Back
       closes help without leaving the page;
     · Escape, outside pointerdown, and popstate all close it;
     · an explicit close (Escape, ×, toggle-click) returns focus to the
       trigger; outside-click and Back do not steal focus;
     · the bubble is an anchored speech bubble with the rotated-square
       caret — never a bottom sheet, never a square-edged slab.

   Longer instructional content uses THIS same bubble as a compact
   floating card — never long inline copy that expands the page.
   ════════════════════════════════════════════════════════════════════════ */

export default function HelpBubble({
  label,
  historyKey,
  title,
  children,
  bubbleClassName,
  caretClassName,
  triggerClassName,
  caretTracksTrigger = false,
}: {
  /** Accessible name for the trigger and dialog (e.g. "Condition help"). */
  label: string;
  /** Unique history-state key so pinned help owns exactly one Back entry. */
  historyKey: string;
  title?: string;
  children: ReactNode;
  /** Bubble geometry override; defaults to the Search help's placement. */
  bubbleClassName?: string;
  caretClassName?: string;
  triggerClassName?: string;
  /** When the bubble is anchored to a WIDE positioning ancestor (so a
      fixed-width card can never force mobile-viewport expansion), the caret
      can no longer be placed with a static offset — the trigger's position
      inside that ancestor varies. This measures the trigger each open and
      seats the caret directly under it, shift-aware. The pointer stays part
      of the character, wherever the ? happens to sit. */
  caretTracksTrigger?: boolean;
}) {
  const [open, setOpen] = useState(false);
  /* Viewport-aware placement: the bubble opens below by default, but when the
     trigger sits near the bottom of the viewport the card would clip or force
     a scroll merely to be read. Measured after layout, before paint — if the
     card would leave the viewport below AND there is genuinely more room
     above, it opens above instead. Same card, same caret, mirrored. */
  const [placeAbove, setPlaceAbove] = useState(false);
  /* Horizontal viewport clamp. The bubble anchors to its positioning
     ancestor, which may be a narrow grid cell near the viewport edge — a
     fixed-width card anchored there can run off screen. The measured shift
     slides the CARD back inside the viewport while the caret is compensated
     the opposite way, so it keeps pointing at its trigger. Width is never
     crushed to solve collision. */
  const [shiftX, setShiftX] = useState(0);
  /** caretTracksTrigger only: the caret element, positioned by direct DOM
      write in the measurement effect (the blessed effect job — updating the
      DOM from measured layout — and it runs before paint, so the caret
      never flashes at a wrong spot). */
  const caretRef = useRef<HTMLSpanElement | null>(null);
  const pinnedRef = useRef(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushedHistory = useRef(false);
  /* True only while close() is programmatically handing focus back to the
     trigger. Focus opens the preview by design — but the RESTORED focus of a
     close must not, or × and Escape on an unpinned preview close and reopen
     in one batched render and look dead. (A pinned bubble accidentally
     escaped this: its history.back() popstate closed the ghost a beat
     later.) Focus events dispatch synchronously inside .focus(), so setting
     and clearing the flag around that one call is exact. */
  const restoringFocus = useRef(false);
  /* True from the instant close() asks for its entry back until that pop
     actually lands. history.back() is ASYNCHRONOUS: the entry is still
     current when back() returns, so anything that pushes during this window
     stacks a NEW entry on top and the in-flight pop consumes THAT instead.
     The bubble's bookkeeping then believes it still owns an entry it has
     already spent, and its next close pops one level too far — into a Sell
     Flow step entry, dropping the seller to Curation with the draft intact
     (reproduced twice, 2026-08-07). Suppressing the push for the few ms the
     pop is in flight costs that one bubble its Android-Back entry and
     nothing else. */
  const popPending = useRef(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);

  const clearTimers = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    hoverTimer.current = null;
    leaveTimer.current = null;
  };

  const close = useCallback(
    (restoreFocus = true) => {
      clearTimers();
      pinnedRef.current = false;
      setOpen(false);
      if (pushedHistory.current) {
        pushedHistory.current = false;
        /* Two conditions, and BOTH are load-bearing. The state check proves
           the current entry is this bubble's own — a help overlay may only
           ever consume its own entry, never a step entry beneath it. The
           popPending check proves we are not already waiting on a pop we
           asked for, so one close can never spend two entries. */
        if (
          typeof window !== "undefined" &&
          !popPending.current &&
          window.history.state?.[historyKey]
        ) {
          popPending.current = true;
          window.history.back();
        }
      }
      if (restoreFocus) {
        restoringFocus.current = true;
        btnRef.current?.focus();
        restoringFocus.current = false;
      }
    },
    [historyKey]
  );

  const openHelp = useCallback(
    (pinned: boolean) => {
      clearTimers();
      pinnedRef.current = pinned;
      setOpen(true);
      // Only pinned (tap-opened) help takes a history entry — the first
      // Android Back then closes help without leaving the page. A hover
      // preview must never own history.
      if (
        pinned &&
        typeof window !== "undefined" &&
        !pushedHistory.current &&
        !popPending.current // never stack an entry onto an in-flight pop
      ) {
        pushedHistory.current = true;
        /* MERGE, never replace: raw object state wipes the Next App Router's
           own history.state, and the close's history.back() then pops to an
           entry the router cannot reconcile — it falls back to a full
           navigation, remounting the page and destroying every entered
           field (launch-blocking data loss, reproduced 2026-08-06). The
           spread carries the router's state and any host-page keys (e.g.
           the Sell flow's sellStep) through the help entry untouched. */
        window.history.pushState(
          { ...window.history.state, [historyKey]: true },
          ""
        );
      }
    },
    [historyKey]
  );

  /* Clearing popPending needs a listener that outlives the close. The
     open-scoped one below is already torn down by the time our own pop
     lands — close() sets open to false first — so the flag would latch on
     forever and silently cost this bubble its Back entry for the rest of
     the session. This one is mounted for the component's whole life and
     does nothing else. */
  useEffect(() => {
    const clearPending = () => {
      popPending.current = false;
    };
    window.addEventListener("popstate", clearPending);
    return () => window.removeEventListener("popstate", clearPending);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (bubbleRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      close(false);
    };
    const onPop = () => {
      pushedHistory.current = false;
      close(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("popstate", onPop);
    };
  }, [open, close]);

  useEffect(() => () => clearTimers(), []);

  /* Placement measurement. Runs synchronously after the open render so the
     flip never paints in the wrong place first. Closing resets to the
     default downward placement for the next open. */
  useLayoutEffect(() => {
    if (!open) {
      setPlaceAbove(false);
      setShiftX(0);
      return;
    }
    const bubble = bubbleRef.current;
    const trigger = btnRef.current;
    if (!bubble || !trigger) return;
    const b = bubble.getBoundingClientRect();

    /* Horizontal: slide the card back inside the viewport, never narrower.
       Measured before any shift is applied (shiftX is 0 on a fresh open). */
    const margin = 12;
    let shift = 0;
    if (b.right > window.innerWidth - margin) {
      shift = b.right - (window.innerWidth - margin);
    }
    if (b.left - shift < margin) {
      shift = Math.max(0, b.left - margin); // never push the card off the left
    }
    if (shift !== 0) setShiftX(shift);

    /* Caret tracking: seat the caret under the trigger's centre, in the
       card's own coordinate space. The caret rides the card, and the card's
       visual left after the clamp is (b.left - shift), so the offset lands
       the point exactly on the ? without any separate shift compensation.
       Clamped inside the card so a trigger near an edge can never push the
       caret out of the border. */
    if (caretTracksTrigger && caretRef.current) {
      const t = trigger.getBoundingClientRect();
      const center = (t.left + t.right) / 2;
      const x = center - (b.left - shift) - 9; // 9 = half the 18px caret
      const clamped = Math.min(Math.max(x, 14), Math.max(14, b.width - 32));
      /* ⚠ LEFT ONLY — NEVER RESTATE THE ROTATION HERE.

         This used to also write transform: rotate(45deg), on the reasoning
         that an inline transform replaces the class transform entirely. That
         was true under Tailwind v3, where `rotate-45` compiled INTO
         `transform`. Tailwind v4 compiles it to the standalone `rotate`
         property instead, so the two no longer replace each other — they
         COMPOSE. 45° from the class plus 45° from the inline transform is a
         90° turn, and a square turned 90° is a square: flat top, no point.

         Measured on the live page: the caret's bounding box read 18×18. A
         genuine 45° turn measures 25×25. The rotation was there twice and
         visible zero times. */
      caretRef.current.style.left = `${clamped}px`;
    }

    if (b.bottom <= window.innerHeight - 12) return; // fits below — stay put
    const t = trigger.getBoundingClientRect();
    const spaceAbove = t.top;
    const spaceBelow = window.innerHeight - t.bottom;
    // Flip only when above is genuinely the better room AND the whole card
    // fits there — otherwise below (scrollable) beats above (clipped at top).
    if (spaceAbove > spaceBelow && spaceAbove >= b.height + 22) {
      setPlaceAbove(true);
    }
  }, [open, caretTracksTrigger]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        className={`group relative flex h-11 w-11 flex-none items-center justify-center sm:h-9 sm:w-9 ${triggerClassName ?? ""}`}
        onPointerEnter={() => {
          if (leaveTimer.current) clearTimeout(leaveTimer.current);
          if (pinnedRef.current || open) return;
          hoverTimer.current = setTimeout(() => {
            if (!pinnedRef.current) openHelp(false);
          }, 300);
        }}
        onPointerLeave={() => {
          if (hoverTimer.current) clearTimeout(hoverTimer.current);
          if (pinnedRef.current) return;
          leaveTimer.current = setTimeout(() => {
            if (!pinnedRef.current) close(false);
          }, 220);
        }}
        onFocus={() => {
          if (restoringFocus.current) return; // a close handing focus back, not the user arriving
          if (!pinnedRef.current) openHelp(false);
        }}
        onClick={() => {
          if (pinnedRef.current && open) close();
          else openHelp(true);
        }}
      >
        <span
          aria-hidden="true"
          className={`flex h-5 w-5 items-center justify-center rounded-full border bg-[var(--surface-2)] font-display text-[13px] font-semibold leading-none transition-colors ${
            open
              ? "border-[var(--border-gold-strong)] bg-[var(--surface-2)] text-[var(--gold)]"
              : "border-transparent text-[var(--gold-dim)] group-hover:border-[var(--border-gold-strong)] group-focus-visible:border-[var(--border-gold-strong)]"
          }`}
        >
          ?
        </span>
      </button>

      {open && (
        <div
          ref={bubbleRef}
          role="dialog"
          aria-modal="false"
          aria-label={label}
          onPointerEnter={() => {
            if (leaveTimer.current) clearTimeout(leaveTimer.current);
          }}
          onPointerLeave={() => {
            if (pinnedRef.current) return;
            leaveTimer.current = setTimeout(() => {
              if (!pinnedRef.current) close(false);
            }, 220);
          }}
          /* Inline placement wins over the classes in bubbleClassName: the
             vertical side mirrors when flipped, and the measured horizontal
             shift slides the card inside the viewport. Caller geometry is
             otherwise untouched. */
          style={{
            ...(placeAbove ? { top: "auto", bottom: "calc(100% + 10px)" } : null),
            ...(shiftX !== 0 ? { transform: `translateX(${-shiftX}px)` } : null),
          }}
          className={`absolute z-30 border border-[var(--border-gold-strong)] bg-[var(--surface-2)] p-4 shadow-[0_18px_55px_var(--panel-shadow-color)] sm:p-[18px] ${
            bubbleClassName ?? "left-0 right-0 top-[calc(100%+10px)] sm:left-auto sm:right-0 sm:w-[390px]"
          }`}
        >
          <span
            aria-hidden="true"
            /* The caret rides the card, so a shifted card would drag it off
               its trigger — the inline transform walks it back.

               ⚠ TRANSLATE ONLY. It must NOT restate rotate(45deg). Under
               Tailwind v3 `rotate-45` compiled into `transform`, so an inline
               transform replaced it and had to carry the rotation itself.
               Tailwind v4 compiles it to the standalone `rotate` property,
               which composes with `transform` rather than being replaced by
               it — restating the angle turns the caret 90° and it renders as
               a flat-topped square. The class owns the rotation now. */
            ref={caretRef}
            style={
              !caretTracksTrigger && shiftX !== 0
                ? { transform: `translateX(${shiftX}px)` }
                : undefined
            }
            className={`absolute h-[18px] w-[18px] rotate-45 border-[var(--border-gold-strong)] bg-[var(--surface-2)] ${
              placeAbove
                ? "bottom-[-10px] border-b border-r"
                : "top-[-10px] border-l border-t"
            } ${caretTracksTrigger ? "" : (caretClassName ?? "right-[23px]")}`}
          />
          <button
            type="button"
            aria-label={`Close ${label}`}
            onClick={() => close()}
            className="absolute right-2 top-1 text-[20px] leading-none text-[var(--muted)] hover:text-[var(--platinum)]"
          >
            ×
          </button>
          {title && (
            <h2 className="mb-2 mr-8 font-display text-[20px] font-light text-[var(--platinum)] sm:text-[22px]">
              {title}
            </h2>
          )}
          {children}
        </div>
      )}
    </>
  );
}
