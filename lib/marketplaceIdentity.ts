/* ════════════════════════════════════════════════════════════════════════
   MARKETPLACE IDENTITY — the platform's public identity copy
   (Hero-copy ruling 2026-08-06 · supersedes the prior single-line form)

   The absolute claim "Independent & Boutique Watchmakers Only" is retired:
   it conflicts with the approved selective-mainstream-admission position.
   Independent and boutique watchmaking remains the visible and verbal
   center of the marketplace; admitted references never redefine it.

   Two governed pieces: the primary eyebrow (white, uppercase, dominant,
   centered) and the secondary clarification (gold, secondary but fully
   legible, rendered as EXACTLY two centered lines reading as one balanced
   block — the break point is governed here, per the approved visual
   reference). Every homepage implementation renders THESE constants, so
   the surfaces can never drift apart. The exact wording is approved
   language — the clarification says "select", never "selected" — do not
   edit the strings or the break point without an equivalent ruling.

   The clarification carries TWO governed compositions of the same sentence,
   one per width, because one break point cannot serve both. The wide break
   ("…collector importance" / "deserves the same care.") balances at desktop
   but overruns the 312px usable width of a 360px phone by a few pixels, and
   the overrun stranded the single word "importance" on a third line — an
   accident, not a composition (XCover, live, 2026-08-06). The phone takes
   its own approved break instead of a smaller type size: the sentence stays
   at full mobile size and simply turns in a different place.
   ════════════════════════════════════════════════════════════════════════ */

export const MARKETPLACE_IDENTITY_EYEBROW =
  "FOR INDEPENDENT & BOUTIQUE WATCHMAKERS";

/* Wide composition — sm and above. */
export const MARKETPLACE_IDENTITY_CLARIFICATION_LINES = [
  "and select references whose collector importance",
  "deserves the same care.",
] as const;

/* Phone composition — below sm. Same sentence, same size, earlier turn. */
export const MARKETPLACE_IDENTITY_CLARIFICATION_LINES_MOBILE = [
  "and select references whose",
  "collector importance deserves the same care.",
] as const;

export const MARKETPLACE_IDENTITY_CLARIFICATION =
  MARKETPLACE_IDENTITY_CLARIFICATION_LINES.join(" ");
