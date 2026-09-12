import Link from "next/link";
import {
  chunkRows,
  composeWatchDetailGeography,
  type SpecSlot,
  type WatchDetailDetails,
} from "@/lib/watchDetailGeography";

/* ────────────────────────────────────────────────────────────────────────
   LISTING SPECS — the narrow normal specification flow plus the established
   desktop Snapshot / Technical Specifications geography for /listings/[id].

   Fixed semantic geography (Watch Detail scanability, 2026-09-10). The
   matrix itself is composed in lib/watchDetailGeography.ts, which also
   carries the reasoning; this file only lays it out.

   The layout law, in one line: on desktop a slot is a slot whether or not
   this watch has a value for it. Every governed row is its own three-column
   grid, so a missing value can never pull a later fact forward, and the
   reserved cell is simply the empty third column of its row.

   Below `sm` there is no matrix to protect, only sequence (founder ruling
   2026-09-10): an absent slot does not render on a phone, and a row with
   nothing present does not render either. The facts that are present keep
   the governed order because each row still becomes a single column in DOM
   order. Because a hidden row still counts as a child, the faint rule
   between rows is decided here per breakpoint from what is actually shown,
   never with a `first:` variant that a hidden sibling would fool.

   v4.26 — THE BROOM CLOSET OPENS (founder audit, 2026-08-12) still governs
   the facts this matrix does not name: a fact we hold is never hidden. Those
   render after the governed rows, present-only, never inside a slot.

   Labels sit one tier above the old --muted treatment with tracking pulled
   back so they can be found in a second; values stay larger, lighter and
   platinum so they remain the thing the eye lands on. Faint rules separate
   rows. No boxes, no cards, no bold-black labels.
   ──────────────────────────────────────────────────────────────────────── */

const HEADING =
  "text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--gold-dim)]";
const LABEL = "text-[12px] uppercase tracking-[0.08em] text-[var(--slate)]";
const VALUE =
  "mt-1 font-display text-[16px] font-light text-[var(--platinum)] [overflow-wrap:anywhere] sm:min-h-[1.5rem]";
/* Founder target (2026-09-12): a phone reads these two-up. A single column
   turned eight short facts into eight full-width lines and pushed the
   reference sheet into a brochure. Short values pair; the wide units below
   keep the full measure, so a long string is never squeezed into half a
   phone. Desktop keeps its three-column matrix untouched. */
const ROW =
  "grid-cols-2 gap-x-5 gap-y-4 border-[var(--border-faint)] sm:grid-cols-3 sm:gap-x-6";
const WIDE = "grid-cols-1 border-[var(--border-faint)]";

const isPresent = (slot: SpecSlot) => !slot.reserved && slot.value !== "";

function Slot({ slot }: { slot: SpecSlot }) {
  return (
    /* An absent value keeps its desktop slot and leaves the phone. */
    <div className={isPresent(slot) ? undefined : "hidden sm:block"}>
      <dt className={LABEL}>{slot.label}</dt>
      <dd className={VALUE}>
        {/* Underlining means a real interaction. Only a value with a live
            Browse destination gets the link treatment; everything else is
            plain text. */}
        {slot.href ? (
          <Link
            href={slot.href}
            className="underline decoration-[var(--border-mid)] underline-offset-4 transition hover:text-[var(--gold)] hover:decoration-[var(--gold-dim)]"
          >
            {slot.value}
          </Link>
        ) : (
          slot.value
        )}
      </dd>
    </div>
  );
}

type Unit = { key: string; slots: SpecSlot[]; wide?: boolean };

/* One section body. Rows are rendered in order; each decides its own
   visibility and its own top rule for each breakpoint from what precedes
   it, so the first VISIBLE row at either width carries no rule. The
   reserved cell is deliberately not an element: the row is a three-column
   grid and the third column simply stays empty. */
type LaidUnit = Unit & { className: string };

/* Pure bookkeeping, outside render: walks the rows once and decides each
   one's visibility and top rule for each breakpoint from what precedes it,
   so the first VISIBLE row at either width carries no rule. */
function layoutUnits(units: Unit[]): LaidUnit[] {
  const laid: LaidUnit[] = [];
  let shownBeforeNarrow = false;
  let shownBeforeWide = false;
  for (const unit of units) {
    const shownNarrow = unit.slots.some(isPresent);
    const narrowRule = shownBeforeNarrow;
    const wideRule = shownBeforeWide;
    if (shownNarrow) shownBeforeNarrow = true;
    shownBeforeWide = true;
    const className = [
      unit.wide ? WIDE : ROW,
      shownNarrow ? "grid" : "hidden sm:grid",
      narrowRule ? "border-t pt-4" : "border-t-0 pt-0",
      wideRule ? "sm:border-t sm:pt-4" : "sm:border-t-0 sm:pt-0",
    ].join(" ");
    laid.push({ ...unit, className });
  }
  return laid;
}

/* One section body. The reserved cell is deliberately not an element: the
   row is a three-column grid and the third column simply stays empty. */
function Units({ units }: { units: Unit[] }) {
  return (
    <div className="mt-4 flex flex-col gap-y-4">
      {layoutUnits(units).map(({ className, ...unit }) => (
        <dl key={unit.key} className={className}>
          {unit.slots
            .filter((slot) => !slot.reserved)
            .map((slot) => (
              <Slot key={slot.key} slot={slot} />
            ))}
        </dl>
      ))}
    </div>
  );
}

function SectionHeading({ children }: { children: string }) {
  return (
    /* One modest transition on narrow, not another monument: the founder
       target crosses from the decision cluster into the specifications on a
       single rule with the heading close beneath it. Desktop spacing is
       restored at `sm` and is unchanged. */
    <div className="pt-5 sm:pt-8">
      <div className="mb-4 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent sm:mb-6" />
      <h2 className={HEADING}>{children}</h2>
    </div>
  );
}

export default function ListingSpecs({
  details,
  year,
  condition,
}: {
  details: WatchDetailDetails;
  year?: string | null;
  condition?: string | null;
}) {
  const geo = composeWatchDetailGeography(details, year, condition);

  const snapshotUnits: Unit[] = [
    ...geo.snapshot.map((slots, i) => ({ key: `snapshot-${i}`, slots })),
    ...chunkRows(geo.snapshotExtras).map((slots, i) => ({ key: `snapshot-extra-${i}`, slots })),
  ];

  const technicalUnits: Unit[] = [
    ...geo.technical.map((slots, i) => ({ key: `technical-${i}`, slots })),
    ...geo.technicalWide.map((slot) => ({ key: slot.key, slots: [slot], wide: true })),
    ...chunkRows(geo.technicalExtras).map((slots, i) => ({ key: `technical-extra-${i}`, slots })),
  ];

  const mobileUnits: Unit[] = [...snapshotUnits, ...technicalUnits];

  return (
    <>
      {/* Narrow/mobile: one specification doorway and one continuous factual
          sequence. Collector Snapshot is not a separate mobile destination. */}
      <section data-mobile-specifications="" className="mt-4 min-[56rem]:hidden sm:mt-8">
        <SectionHeading>Technical Specifications</SectionHeading>
        <Units units={mobileUnits} />
      </section>

      {/* `contents` keeps the established desktop sections as direct layout
          participants while the complementary narrow branch stays hidden. */}
      <div data-desktop-specifications="" className="hidden min-[56rem]:contents">
        <section className="mt-8">
          <SectionHeading>Collector Snapshot</SectionHeading>
          <Units units={snapshotUnits} />
        </section>

        <section className="mt-6">
          <SectionHeading>Technical Specifications</SectionHeading>
          <Units units={technicalUnits} />
        </section>
      </div>
    </>
  );
}
