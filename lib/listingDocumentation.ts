/* Completeness — the one vocabulary, shared by every card grid.
   ────────────────────────────────────────────────────────────────────────
   Ruling (2026-08-14): nothing informational sits on top of the watch
   photograph unless it truly needs to interrupt the image, and completeness
   never does. The fact is rendered as restrained inline metadata in the
   card's own text block instead of as a pill over the dial.

   The Browse and Catalogue grids are read the same way and must not drift,
   so the state set and the inline form live here rather than being declared
   twice. A card must never honour two of these states and stay silent about
   the other two — a watch with no box says so in the same voice a full set
   does. */

export const DOCUMENTATION_STATES: ReadonlySet<string> = new Set([
  "Full Set",
  "Papers Only",
  "Watch Only",
  "No Box or Papers",
]);

/** The stored value if it is one of the four states, else null. */
export function documentationState(value: string | null | undefined): string | null {
  return value && DOCUMENTATION_STATES.has(value) ? value : null;
}

/** Sentence case inside parentheses — the fact stays visible while reading as
    an aside in the spec line rather than a second shouted label:
    `Very Good · 2004 · Champagne · Stainless Steel · (Papers only)` */
export function inlineDocumentation(value: string): string {
  return `(${value.charAt(0).toUpperCase()}${value.slice(1).toLowerCase()})`;
}
