"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ────────────────────────────────────────────────────────────────────────
   BROWSE SEARCH SHELL — DD10.

   The search field, the restrained graphite "?" with its anchored speech
   bubble, and the shared interpreted-criteria rows. Search-made meanings and manually
   chosen Refine filters render as the same kind of removable row here, because
   they are one product — the border colour carries where a row came from,
   and only a manually chosen filter still says so in words.

   Nothing renders beneath the field while the search is dormant, and the
   criteria carry no heading when they do exist: the field is the label.

   Composition and interaction follow DD10; colour and type come from the real
   FairWatchTrade tokens, not DD10's standalone palette. The production header
   and hamburger are untouched — this component renders inside Browse.
   ──────────────────────────────────────────────────────────────────────── */

export type SearchChip = {
  id: string;
  label: string;
  source: "search" | "filter";
  onRemove: () => void;
};

const EXAMPLES = [
  "manual wind with more than 5 days of power reserve",
  "manual wind power reserve >5d",
  "parmigiani kalpa -gold",
  '"small seconds"',
  ">=28800vph",
  "SBGH201",
  "Q15932",
];

export default function BrowseSearch({
  query,
  onCommit,
  chips,
  onClearAll,
  ariaLabel = "Search FairWatchTrade",
  placeholder = "Search watches, references, or listing codes",
  legibilityMode = false,
  dealerRoomMode = false,
}: {
  query: string;
  onCommit: (next: string) => void;
  chips: SearchChip[];
  onClearAll: () => void;
  ariaLabel?: string;
  placeholder?: string;
  /** Dealer Rooms use this search as functional catalogue navigation, so its
      helper labels must meet the readable UI floor rather than the quieter
      decorative treatment used by the general discovery surface. */
  legibilityMode?: boolean;
  /** Compact Dealer Room composition from the authoritative storefront
      study: labelled local search, explicit GO action, and no empty helper
      block consuming the space where inventory belongs. */
  dealerRoomMode?: boolean;
}) {
  const [text, setText] = useState(query);
  const [mirroredQuery, setMirroredQuery] = useState(query);
  const [helpOpen, setHelpOpen] = useState(false);

  /* CARET LAW — live Search may update results; it may never interfere with
     ordinary text editing.

     The debounced commit writes the box text into the URL, and the URL comes
     back through the `query` prop. Rebuilding the input from that echo while
     the collector is still typing is exactly the caret-jump defect Jason hit
     on his Galaxy ("Omega seamast -goldr"): the echo is one debounce behind
     the box, so adopting it both reverts keystrokes and throws the caret.

     `lastSent` remembers every value THIS component committed. A `query`
     change that matches it (or matches the box) is our own echo — ignored,
     the input is never reconstructed, selection never touched. Only a query
     this component did NOT send (Clear all, a Search-row removal, history
     back) is adopted into the box. Adoption is deliberate and rare, and it
     leaves the caret at the end of the new text — the one predictable place
     after the text itself has been externally replaced. */
  const [lastSent, setLastSent] = useState(query);
  if (query !== mirroredQuery) {
    setMirroredQuery(query);
    if (query !== lastSent && query !== text) {
      setText(query);
    }
  }

  const pinnedRef = useRef(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushedHistory = useRef(false);
  const helpBtnRef = useRef<HTMLButtonElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    hoverTimer.current = null;
    leaveTimer.current = null;
  };

  const closeHelp = useCallback((restoreFocus = true) => {
    clearTimers();
    pinnedRef.current = false;
    setHelpOpen(false);
    // Consume the history entry we added for Android Back, if it is still ours.
    if (pushedHistory.current) {
      pushedHistory.current = false;
      if (typeof window !== "undefined" && window.history.state?.fwtSearchHelp) {
        window.history.back();
      }
    }
    if (restoreFocus) helpBtnRef.current?.focus();
  }, []);

  const openHelp = useCallback((pinned: boolean) => {
    clearTimers();
    pinnedRef.current = pinned;
    setHelpOpen(true);
    // First Android Back should close help without leaving Browse. Only pinned
    // (tap-opened) help gets a history entry — a hover preview must not.
    if (pinned && typeof window !== "undefined" && !pushedHistory.current) {
      pushedHistory.current = true;
      window.history.pushState({ fwtSearchHelp: true }, "");
    }
  }, []);

  // Escape, outside activation, and Android Back all close it.
  useEffect(() => {
    if (!helpOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeHelp();
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (bubbleRef.current?.contains(t) || helpBtnRef.current?.contains(t)) return;
      closeHelp(false);
    };
    const onPop = () => {
      // The entry we pushed is already gone by the time this fires.
      pushedHistory.current = false;
      closeHelp(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("popstate", onPop);
    };
  }, [helpOpen, closeHelp]);

  useEffect(() => () => clearTimers(), []);

  const commit = (next: string) => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    setLastSent(next);
    onCommit(next);
  };

  const onChange = (next: string) => {
    setText(next);
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => {
      setLastSent(next);
      onCommit(next);
    }, 350);
  };

  const runExample = (example: string) => {
    setText(example);
    // If the pinned bubble owns a history entry, closeHelp() consumes it with
    // history.back(), which is asynchronous — committing before that pop lands
    // lets the back() revert the freshly-replaced URL and the example never
    // applies (caught live during verification). Defer the commit until the
    // pop has actually happened.
    const mustWaitForPop =
      pushedHistory.current &&
      typeof window !== "undefined" &&
      window.history.state?.fwtSearchHelp;
    closeHelp(false);
    if (mustWaitForPop) {
      window.addEventListener("popstate", () => commit(example), { once: true });
    } else {
      commit(example);
    }
  };

  return (
    <div
      className={
        dealerRoomMode
          ? /* Inline in the catalogue bar: the search no longer closes a band
               of its own. The controls bar directly beneath draws the single
               border that closes the whole group. */
            ""
          : /* Phone: the search state reads as one cohesive block riding
               close to the header; desktop keeps its py-5 room. */
            "border-b border-[var(--border-faint)] px-6 pt-3 pb-4 md:py-5"
      }
    >
      <div className={dealerRoomMode ? "w-full" : "mx-auto w-full max-w-[940px]"}>
        {dealerRoomMode && (
          <div className="mb-1.5 text-[10px] uppercase tracking-[1.4px] text-[var(--gold-dim)]">
            Search inventory
          </div>
        )}
        {/* ── Search field ───────────────────────────────────────────────── */}
        <div className={dealerRoomMode ? "grid grid-cols-[minmax(0,1fr)_48px] gap-1.5" : ""}>
        <div className={`relative flex min-w-0 items-center border border-[var(--input-line)] bg-[var(--input-bg)] transition-colors focus-within:border-[var(--input-line-focus)] ${dealerRoomMode ? "min-h-[38px]" : "min-h-[46px] sm:min-h-[50px]"}`}>
          <div aria-hidden="true" className={dealerRoomMode ? "w-9 text-center text-[15px] text-[var(--muted)]" : "w-10 text-center text-[23px] text-[var(--slate)] sm:w-[46px]"}>
            ⌕
          </div>
          <input
            value={text}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                // Apply the live Search as-is and dismiss the on-screen
                // keyboard (Galaxy): blur is what releases it. The committed
                // text is byte-identical to the box — no meaning change.
                commit(text);
                e.currentTarget.blur();
              }
            }}
            aria-label={ariaLabel}
            placeholder={placeholder}
            autoComplete="off"
            className={`min-w-0 w-full bg-transparent pr-2 text-[var(--platinum)] outline-none focus-visible:outline-none ${legibilityMode ? "placeholder:text-[var(--muted)]" : "placeholder:text-[var(--ghost)]"} ${dealerRoomMode ? "py-2 text-[13px]" : "py-[14px] text-[15px] sm:text-[16px]"}`}
          />
          {!dealerRoomMode && <button
            ref={helpBtnRef}
            type="button"
            aria-label="Search help"
            aria-expanded={helpOpen}
            className="group relative mr-1 flex h-11 w-11 flex-none items-center justify-center sm:mr-2 sm:h-9 sm:w-9"
            onPointerEnter={() => {
              if (leaveTimer.current) clearTimeout(leaveTimer.current);
              if (pinnedRef.current || helpOpen) return;
              hoverTimer.current = setTimeout(() => {
                if (!pinnedRef.current) openHelp(false);
              }, 300);
            }}
            onPointerLeave={() => {
              if (hoverTimer.current) clearTimeout(hoverTimer.current);
              if (pinnedRef.current) return;
              leaveTimer.current = setTimeout(() => {
                if (!pinnedRef.current) closeHelp(false);
              }, 220);
            }}
            onFocus={() => {
              if (!pinnedRef.current) openHelp(false);
            }}
            onClick={() => {
              if (pinnedRef.current && helpOpen) closeHelp();
              else openHelp(true);
            }}
          >
            <span
              aria-hidden="true"
              className={`flex h-5 w-5 items-center justify-center rounded-full border bg-[var(--surface-2)] font-display text-[13px] font-semibold leading-none transition-colors ${
                helpOpen
                  ? "border-[var(--border-gold-strong)] bg-[var(--surface-2)] text-[var(--gold)]"
                  : "border-transparent text-[var(--gold-dim)] group-hover:border-[var(--border-gold-strong)] group-focus-visible:border-[var(--border-gold-strong)]"
              }`}
            >
              ?
            </span>
          </button>}

          {/* ── Anchored speech bubble (never a bottom sheet) ─────────────── */}
          {!dealerRoomMode && helpOpen && (
            <div
              ref={bubbleRef}
              role="dialog"
              aria-modal="false"
              aria-label="Search help"
              onPointerEnter={() => {
                if (leaveTimer.current) clearTimeout(leaveTimer.current);
              }}
              onPointerLeave={() => {
                if (pinnedRef.current) return;
                leaveTimer.current = setTimeout(() => {
                  if (!pinnedRef.current) closeHelp(false);
                }, 220);
              }}
              className="absolute left-0 right-0 top-[calc(100%+10px)] z-30 border border-[var(--border-gold-strong)] bg-[var(--surface-2)] p-4 shadow-[0_18px_55px_var(--panel-shadow-color)] sm:left-auto sm:right-0 sm:w-[390px] sm:p-[18px]"
            >
              <span
                aria-hidden="true"
                className="absolute right-[23px] top-[-10px] h-[18px] w-[18px] rotate-45 border-l border-t border-[var(--border-gold-strong)] bg-[var(--surface-2)]"
              />
              <button
                type="button"
                aria-label="Close Search help"
                onClick={() => closeHelp()}
                className="absolute right-2 top-1 text-[20px] leading-none text-[var(--muted)] hover:text-[var(--platinum)]"
              >
                ×
              </button>
              <h2 className="mb-2 mr-8 font-display text-[20px] font-light text-[var(--platinum)] sm:text-[22px]">
                Search the way collectors think
              </h2>
              <p className="mb-3 text-[13px] leading-[1.5] text-[var(--muted)]">
                Use ordinary language, an exact reference, or a FairWatchTrade listing code.
              </p>
              <div className="my-3 grid gap-2">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => runExample(example)}
                    className="border border-[var(--border-subtle)] bg-[var(--input-bg)] px-[10px] py-[9px] text-left font-mono text-[12px] leading-[1.25] text-[var(--platinum-dim)] transition-colors hover:border-[var(--gold-dim)] sm:text-[13px]"
                  >
                    {example}
                  </button>
                ))}
              </div>
              <div className="border-t border-[var(--border-subtle)] pt-[10px] text-[12px] text-[var(--muted)]">
                Recognized details appear below so you can review or remove them. Uncertain
                words remain part of your Search.
              </div>
            </div>
          )}
        </div>
        {dealerRoomMode && (
          <button
            type="button"
            onClick={() => commit(text)}
            className="border border-[var(--border-subtle)] bg-[var(--ink-deep)] text-[10px] uppercase tracking-[1.4px] text-[var(--platinum-dim)] transition hover:border-[var(--border-gold)] hover:text-[var(--platinum)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-gold)]"
          >
            Go
          </button>
        )}
        </div>

        {/* ── Interpreted criteria ──────────────────────────────────────────
            RULED: a dormant search renders NOTHING beneath the field. This
            block used to announce itself with a "Your Search" heading and
            then admit "No search details yet" underneath it — two lines of
            chrome standing between the field and the watches on every first
            load, in order to report that the collector had not typed
            anything yet.

            When criteria do exist they are the first thing under the field.
            No heading above them: the field they sit directly beneath is the
            only label they need. Clear all rides at the end of the same flow
            rather than claiming a row of its own above the criteria. */}
        {chips.length > 0 && (
          <div className="mt-[10px] flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center md:mt-[14px]">
            {chips.map((chip) => {
              /* RULED form: "Brand · Parmigiani Fleurier", never
                 "SEARCH Brand: Parmigiani Fleurier". The split happens HERE,
                 in the view, and on the FIRST ": " only — the label producers
                 in lib/search are interpretation and this presentation round
                 does not touch them, while cutting at the first separator
                 leaves a value carrying its own colon intact. */
              const cut = chip.label.indexOf(": ");
              const name = cut > 0 ? chip.label.slice(0, cut) : null;
              const value = cut > 0 ? chip.label.slice(cut + 2) : chip.label;
              return (
                <div
                  key={chip.id}
                  className={`flex items-center justify-between gap-2 border bg-[var(--surface)] px-[10px] py-[10px] text-[12px] text-[var(--platinum-dim)] sm:w-auto sm:justify-start sm:px-[9px] sm:py-2 ${
                    chip.source === "filter" ? "border-[color:light-dark(#5D7186,#34495b)]" : "border-[color:light-dark(#6E6B52,#4a4a3c)]"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-[7px]">
                    {/* Only a manually chosen Refine filter still names its
                        origin. "Search" named the obvious on a row sitting
                        directly beneath the search field; "Filter" is
                        contrastive and earns its place. The border colour
                        carries the distinction either way. */}
                    {chip.source === "filter" && (
                      <small
                        className={`flex-none uppercase tracking-[0.1em] ${
                          legibilityMode
                            ? "text-[10px] text-[var(--slate)]"
                            : "text-[11px] text-[var(--muted)]"
                        }`}
                      >
                        Filter
                      </small>
                    )}
                    <b className="font-normal">{name ? `${name} · ${value}` : value}</b>
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${chip.label}`}
                    onClick={chip.onRemove}
                    className="flex h-8 w-8 flex-none items-center justify-center text-[16px] leading-none text-[var(--muted)] transition-colors hover:text-[var(--platinum)] sm:h-auto sm:w-auto sm:px-[2px]"
                  >
                    ×
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              onClick={onClearAll}
              className="self-start text-[12px] text-[var(--gold-dim)] transition-colors hover:text-[var(--gold)] sm:ml-1 sm:self-auto"
            >
              Clear all
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
