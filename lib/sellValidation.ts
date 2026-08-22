/* ════════════════════════════════════════════════════════════════════════
   SELL FLOW VALIDATION — lib/sellValidation.ts

   The shared "this required thing is missing" seam: one alarm treatment,
   one set of pure predicates, so Photos and Details cannot drift apart.

   ── THE ALARM ──────────────────────────────────────────────────────────
   A missing required control wears a full 3px #880015 perimeter around the
   ACTIONABLE area — not a thin side rule, which the founder's own walk
   proved reads as ordinary page structure and gets skipped. Four sides,
   modest inner breathing room so it cannot be mistaken for a browser focus
   ring, and it persists until the requirement is resolved.

   ── ASSIST, NEVER DISABLE ──────────────────────────────────────────────
   Continue stays clickable. The click validates the step, reveals EVERY
   missing item at once, and brings the first into view. A disabled button
   makes the seller hunt the page for a reason it refuses to name.

   ── TWO TIERS OF REQUIRED, AND THE DIFFERENCE IS HONEST ────────────────
   BLOCKING — the answer is genuinely needed before the step can close, so
   an empty value keeps the step open however many times Continue is
   pressed (Case size).
   NON-BLOCKING — the answer is wanted and the control is marked, but the
   seller may proceed past it on a second press (Crown present, whose
   admission relocation is a separate governed seam). A non-blocking
   question must never present itself as `required`; the label and the
   behavior have to tell the same story.

   Pure functions only — no React, no I/O. Pinned by
   scripts/sell-validation.test.mjs.
   ════════════════════════════════════════════════════════════════════════ */

/** The founder-approved missing-required perimeter. Applied to the wrapper
    of the actionable control/group, never to the label alone. */
export const MISSING_REQUIRED_CLS =
  "border-[3px] border-solid border-[#880015] p-2";

export type MissingRequired = {
  key: string;
  /** DOM id the assist pass scrolls to. */
  anchor: string;
  /** true = an empty value keeps the step open, however many clicks. */
  blocking: boolean;
};

/** Details-step required answers, in the order the seller meets them.
    Empty/whitespace-only is missing — a cleared field is a real answer of
    "nothing here", never an invitation to restore what was there before. */
export function detailsMissingRequired(d: {
  caseSizeMm?: string | null;
  crownPresent?: boolean;
}): MissingRequired[] {
  const missing: MissingRequired[] = [];
  if (!(d.caseSizeMm ?? "").trim()) {
    missing.push({ key: "caseSizeMm", anchor: "case-size-field", blocking: true });
  }
  if (d.crownPresent === undefined) {
    missing.push({ key: "crownPresent", anchor: "crown-present-field", blocking: false });
  }
  return missing;
}

/** Does this Continue press keep the seller on the step?
    First press with anything missing: yes (reveal + scroll).
    Later presses: only while something BLOCKING is still empty. */
export function continueHeld(
  missing: MissingRequired[],
  assistAlreadyShown: boolean
): boolean {
  if (missing.length === 0) return false;
  return !assistAlreadyShown || missing.some((m) => m.blocking);
}

/** The rows a typeahead should offer right now.

    The defect this closes: once a value is committed, filtering by that
    value matches only the value itself, so reopening the field offered the
    seller a menu of exactly what they had already chosen — the founder had
    to erase most of a Closure type before the real choices came back. A
    value that EXACTLY equals a known suggestion is a committed selection,
    not a search query, so the full list returns. Free text still filters. */
export function typeaheadMenuOptions(
  value: string,
  suggestions: string[],
  maxSuggestions: number
): string[] {
  const q = value.trim().toLowerCase();
  if (!q) return suggestions.slice(0, maxSuggestions);
  if (suggestions.some((s) => s.toLowerCase() === q)) {
    return suggestions.slice(0, maxSuggestions);
  }
  return suggestions.filter((s) => s.toLowerCase().includes(q)).slice(0, maxSuggestions);
}
