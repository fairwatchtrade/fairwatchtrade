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
   ════════════════════════════════════════════════════════════════════════ */

export const MARKETPLACE_IDENTITY_EYEBROW =
  "FOR INDEPENDENT & BOUTIQUE WATCHMAKERS";

export const MARKETPLACE_IDENTITY_CLARIFICATION_LINES = [
  "and select references whose collector importance",
  "deserves the same care.",
] as const;

export const MARKETPLACE_IDENTITY_CLARIFICATION =
  MARKETPLACE_IDENTITY_CLARIFICATION_LINES.join(" ");
