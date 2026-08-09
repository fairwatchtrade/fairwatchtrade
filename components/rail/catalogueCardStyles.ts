/* ════════════════════════════════════════════════════════════════════════
   CATALOGUE RIGHT-RAIL CARD TREATMENT — one visual family, five states.

   The rail's four cards were each styled on their own and had drifted to
   the same place: 9px headings and body copy in --ghost, which measures
   3.6:1 against --ink and fails the 4.5:1 floor at that size, on cards
   whose 6%-white border left them barely separable from the page. Active
   links, descriptive copy and genuinely unavailable controls all collapsed
   into one low-contrast state, so a working door read exactly like a dead
   one.

   These are shared class strings rather than a wrapper component: the cards
   differ in content and element type — a div, a Link, a disabled button —
   and only their surface treatment is common. Every one of them is applied
   in this flight; none of it is speculative.

   The rail stays deliberately secondary to the watch imagery beside it. It
   is quieter than the primary content, never quieter than legibility.
   ════════════════════════════════════════════════════════════════════════ */

/** The shared card surface. --surface lifts off --ink just enough to read as
    a card; the border is restrained, never a bright dashboard tile. */
export const railCard =
  "border border-[var(--border-mid)] bg-[var(--surface)] px-4 py-5";

/** Card headings. Was 9px/--ghost (3.6:1); --slate measures 7.4:1. */
export const railHeading =
  "text-[10px] uppercase tracking-[2.5px] text-[var(--slate)]";

/** Descriptive and empty-state copy. --muted measures 5.4:1. */
export const railBody =
  "font-display text-[12px] italic leading-[1.6] text-[var(--muted)]";

/** An action that genuinely goes somewhere. Full gold rather than the 45%
    --gold-subtle, plus an underline so the affordance never rests on colour
    alone, and a focus ring that does not wait for hover. */
export const railAction =
  "inline-flex items-center text-[10px] uppercase tracking-[2px] text-[var(--gold)] underline decoration-[rgba(201,168,76,0.35)] underline-offset-[4px] transition-colors hover:text-[var(--platinum)] hover:decoration-[var(--platinum)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--gold)] focus-visible:outline-offset-[3px]";

/** Intentionally unavailable — readable, and dashed so it reads as not-yet
    rather than broken. The old treatment was --ghost at 40% opacity, which
    measures 1.5:1 and is effectively invisible. */
export const railInactive =
  "cursor-not-allowed border border-dashed border-[var(--border-mid)] px-3 py-1.5 text-[9px] uppercase tracking-[2px] text-[var(--muted)]";
