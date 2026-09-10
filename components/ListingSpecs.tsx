import Link from "next/link";
import {
  chunkRows,
  composeWatchDetailGeography,
  type SpecRow,
  type SpecSlot,
  type WatchDetailDetails,
} from "@/lib/watchDetailGeography";

/* ────────────────────────────────────────────────────────────────────────
   LISTING SPECS — §3 Collector Snapshot + §4 Technical Specifications
   for /listings/[id].

   Fixed semantic geography (Watch Detail scanability, 2026-09-10). The
   matrix itself is composed in lib/watchDetailGeography.ts, which also
   carries the reasoning; this file only lays it out.

   The layout law, in one line: a slot is a slot whether or not this watch
   has a value for it. Every governed row is its own three-column grid, so a
   missing value can never pull a later fact forward, and the reserved cell
   is simply the empty third column of its row. Below `sm` each row becomes
   a single column, which makes the narrow reading order the desktop
   row-major order by construction, never by auto-placement.

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
  "mt-1 font-display text-[16px] font-light text-[var(--platinum)] sm:min-h-[1.5rem]";
const ROW =
  "grid grid-cols-1 gap-y-4 border-t border-[var(--border-faint)] pt-4 first:border-t-0 first:pt-0 sm:grid-cols-3 sm:gap-x-6";
const WIDE =
  "grid grid-cols-1 border-t border-[var(--border-faint)] pt-4 first:border-t-0 first:pt-0";

function Slot({ slot }: { slot: SpecSlot }) {
  return (
    <div>
      <dt className={LABEL}>{slot.label}</dt>
      <dd className={VALUE}>
        {/* Underlining means a real interaction. Only a value with a live
            Browse destination gets the link treatment; everything else is
            plain text, including an absent value, which renders nothing
            and leaves its slot standing. */}
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

/* The reserved cell is deliberately not an element: the row is a
   three-column grid, so the third column simply stays empty. */
function Row({ row }: { row: SpecRow }) {
  return (
    <dl className={ROW}>
      {row
        .filter((slot) => !slot.reserved)
        .map((slot) => (
          <Slot key={slot.key} slot={slot} />
        ))}
    </dl>
  );
}

function Wide({ slot }: { slot: SpecSlot }) {
  return (
    <dl className={WIDE}>
      <Slot slot={slot} />
    </dl>
  );
}

function SectionHeading({ children }: { children: string }) {
  return (
    <div className="pt-8">
      <div className="mb-6 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
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

  return (
    <>
      {/* SECTION 3 — Collector Snapshot: 3 × 3, slots fixed. */}
      <section className="mt-8">
        <SectionHeading>Collector Snapshot</SectionHeading>
        <div className="mt-4 flex flex-col gap-y-4">
          {geo.snapshot.map((row, i) => (
            <Row key={`snapshot-${i}`} row={row} />
          ))}
          {chunkRows(geo.snapshotExtras).map((row, i) => (
            <Row key={`snapshot-extra-${i}`} row={row} />
          ))}
        </div>
      </section>

      {/* SECTION 4 — Technical Specifications: short facts align in two
          three-column rows, long facts breathe in wide rows beneath. One
          continuous surface; the disclosure died in v4.26. */}
      <section className="mt-6">
        <SectionHeading>Technical Specifications</SectionHeading>
        <div className="mt-4 flex flex-col gap-y-4">
          {geo.technical.map((row, i) => (
            <Row key={`technical-${i}`} row={row} />
          ))}
          {geo.technicalWide.map((slot) => (
            <Wide key={slot.key} slot={slot} />
          ))}
          {chunkRows(geo.technicalExtras).map((row, i) => (
            <Row key={`technical-extra-${i}`} row={row} />
          ))}
        </div>
      </section>
    </>
  );
}
