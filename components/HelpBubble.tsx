'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

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
}) {
  const [open, setOpen] = useState(false);
  const pinnedRef = useRef(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushedHistory = useRef(false);
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
        if (typeof window !== "undefined" && window.history.state?.[historyKey]) {
          window.history.back();
        }
      }
      if (restoreFocus) btnRef.current?.focus();
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
      if (pinned && typeof window !== "undefined" && !pushedHistory.current) {
        pushedHistory.current = true;
        window.history.pushState({ [historyKey]: true }, "");
      }
    },
    [historyKey]
  );

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
          if (!pinnedRef.current) openHelp(false);
        }}
        onClick={() => {
          if (pinnedRef.current && open) close();
          else openHelp(true);
        }}
      >
        <span
          aria-hidden="true"
          className={`flex h-5 w-5 items-center justify-center rounded-full border bg-[#151a22] font-display text-[13px] font-semibold leading-none transition-colors ${
            open
              ? "border-[rgba(201,168,76,0.52)] bg-[#1b2028] text-[var(--gold)]"
              : "border-transparent text-[var(--gold-dim)] group-hover:border-[rgba(201,168,76,0.42)] group-focus-visible:border-[rgba(201,168,76,0.42)]"
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
          className={`absolute z-30 border border-[rgba(201,168,76,0.48)] bg-[#12161e] p-4 shadow-[0_18px_55px_rgba(0,0,0,0.5)] sm:p-[18px] ${
            bubbleClassName ?? "left-0 right-0 top-[calc(100%+10px)] sm:left-auto sm:right-0 sm:w-[390px]"
          }`}
        >
          <span
            aria-hidden="true"
            className={`absolute top-[-10px] h-[18px] w-[18px] rotate-45 border-l border-t border-[rgba(201,168,76,0.48)] bg-[#12161e] ${
              caretClassName ?? "right-[23px]"
            }`}
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
