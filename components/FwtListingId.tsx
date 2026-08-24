/* ════════════════════════════════════════════════════════════════════════
   components/FwtListingId.tsx — the collector-facing FairWatchTrade code

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "The listing code is an internal key."

   It is not. `listings.public_code` is minted once by the database
   (assign_listing_public_code) and protected against rewrite
   (protect_listing_public_code) precisely so it can be SAID OUT LOUD — one
   letter and five digits, durable and unique, the thing a collector quotes
   in an email, reads over the phone, or types into search when they come
   back for the watch they saw last week.

   It had drifted into being visible only where the platform talks to
   itself: Marketplace Control, the Communications rail, the seller's own
   workspace, and — worst of all — the listing detail page's structured-data
   `sku`, which is to say a machine could read it and a person could not.
   Every public buyer surface represented a listing without ever naming it.

   THIS COMPONENT IS NOT AN AUTHORITY. It mints nothing, derives nothing,
   and falls back to nothing. It renders the code the row already carries,
   or it renders nothing at all. If a listing has no code, the answer is a
   database question, never a display one.

   ONE COMPONENT BECAUSE THE LABEL IS THE PRODUCT. Four surfaces printing
   their own wording is how "FWT Listing ID", "Listing ID", "FWT Code" and
   "ID" end up on four pages of the same marketplace. The vocabulary is
   stated once, here.

   ⚠ NOT the Marketplace Control treatment. That room anchors the code in
   --mineral by explicit order; the Mineral accent stays inside
   Communications and Marketplace Control until its acceptance closes. On a
   buyer surface the code uses the ordinary public palette. The Sitka face
   is shared deliberately — an identifier reads as an identifier everywhere
   on the platform — but the colour is not.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

import type { CSSProperties } from "react";

/* The identifier face, matching the established FWT-ID treatment elsewhere.
   A serif with real figures: a collector reading a code aloud needs the 5
   and the S to be different shapes. */
const ID_FACE: CSSProperties = {
  fontFamily: '"Sitka Text", Sitka, Georgia, Cambria, "Times New Roman", serif',
};

export type FwtListingIdProps = {
  /** listings.public_code, exactly as stored. Null renders nothing. */
  code: string | null | undefined;
  /**
   * `card` — compact, rides the maker line on a listing card.
   * `detail` — labelled, stands on its own in the identity block.
   */
  variant?: "card" | "detail";
  className?: string;
};

/** The spoken name of the identifier. Stated once for the whole platform. */
export const FWT_LISTING_ID_LABEL = "FWT Listing ID";

export function FwtListingId({ code, variant = "card", className }: FwtListingIdProps) {
  const value = typeof code === "string" ? code.trim() : "";
  if (!value) return null;

  if (variant === "detail") {
    return (
      <div className={`flex flex-wrap items-baseline gap-x-2 gap-y-1 ${className ?? ""}`}>
        <span className="text-[11px] uppercase tracking-[0.24em] text-[var(--muted)]">
          {FWT_LISTING_ID_LABEL}
        </span>
        <span aria-hidden="true" className="text-[11px] text-[var(--gold-dim)]">
          ·
        </span>
        {/* --platinum-dim, not --muted: this is functional text a collector
            is meant to read and quote, and the readability floor forbids
            dressing a working value as decorative metadata. `select-all`
            makes one click take the whole code and nothing around it.
            whitespace-nowrap so an identifier never breaks across lines. */}
        <span
          style={ID_FACE}
          className="select-all whitespace-nowrap text-[15px] uppercase tracking-[0.14em] text-[var(--platinum-dim)] sm:text-[16px]"
        >
          {value}
        </span>
      </div>
    );
  }

  /* Card. Rides the maker eyebrow, so it inherits that line's size and
     uppercase treatment and cannot outweigh the watch. The tone change is
     the whole signal: the maker is gold, the platform's own identifier is
     platinum. */
  return (
    <>
      <span aria-hidden="true" className="px-1 text-[var(--gold-dim)]">
        ·
      </span>
      <span
        style={ID_FACE}
        className={`select-all whitespace-nowrap tracking-[0.1em] text-[var(--platinum-dim)] ${className ?? ""}`}
      >
        {value}
      </span>
    </>
  );
}

export default FwtListingId;
