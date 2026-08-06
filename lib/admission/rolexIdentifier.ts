/* ════════════════════════════════════════════════════════════════════════
   ROLEX IDENTIFIER — canonical references and documented style numbers
   (Style-number ruling · 2026-08-06 · Jason)

   Rolex paperwork carries TWO separate identity fields: a Serial Number
   (private, never handled here) and a Style. The Style is a composite:
   an embedded canonical reference plus Rolex's internal bracelet/dial
   codes. A punch-card Style like R79173327B6252 decomposes as

       R · 79173 · 327B6252
       │   │       └─ internal bracelet/dial coding (preserved, not parsed)
       │   └─ canonical reference — the public identity of the watch
       └─ single-letter card prefix

   The ruling this module implements:
     · A clean canonical reference (79173) is admitted directly. Entering
       only the reference is never a rejection — but recognition of an
       identifier NEVER satisfies the original-documentation requirement;
       that gate still demands the actual paperwork image.
     · A supported composite Style is preserved EXACTLY as documented and
       its canonical reference is derived DETERMINISTICALLY — no fuzzy
       matching, no guessing. Raw Style and canonical reference are kept
       as separate values, and the Style value stands as documentary
       identity evidence pending image verification.
     · Anything the grammar does not recognize — including any parse with
       MORE THAN ONE structurally valid reading — is UNSUPPORTED: the
       entry is preserved verbatim and the corridor stops for review. The
       stop copy never claims the value is unknown to Rolex; it only says
       FairWatchTrade could not parse it.

   Pure TypeScript — no React, no network, no database — imported by the
   client corridor (SellFlow), the curation submission mapper, and
   POST /api/listings, so the three surfaces can never drift. The
   /api/evaluate route (canary PFC274 = 62) is NOT touched: this layer
   simply ensures the evaluator only ever receives a canonical reference,
   so identity-format judgments are never left to model prose again.

   Grammar v1 — deliberately narrow; widen only by ruling:
     · canonical reference: 4 digits [1-9]…, 5 digits [1-9]…, or
       6 digits [1-3]… (the modern six-digit families), plus an optional
       1–3 letter suffix (16610LV, 116610LN).
     · punch-card Style: optional single letter prefix + digits-only
       canonical reference + internal-code tail ^\d{2,3}[A-Z]?\d{3,5}$.
       Every reference length is tried; the parse is accepted ONLY when
       exactly one candidate survives — structural ambiguity is a stop,
       never a choice.
     · modern Style: optional M prefix + six-digit reference (suffix
       allowed) + "-" + 4-digit dial code (M126610LN-0001).
   ════════════════════════════════════════════════════════════════════════ */

export type RolexIdentifier =
  | {
      /** A bare canonical reference — corridor may open; documentation unproven. */
      kind: "reference";
      reference: string;
    }
  | {
      /** A documented composite Style — preserved verbatim; reference derived. */
      kind: "style";
      /** The complete Style value exactly as entered (trimmed only). */
      style: string;
      /** The canonical reference deterministically embedded in the Style. */
      reference: string;
    }
  | {
      /** Structure unsupported or ambiguous — preserve and stop for review. */
      kind: "unsupported";
      raw: string;
    };

/* Canonical reference shapes, by digit length, with family-true leading
   digits. Six-digit Rolex references live in the 1xxxxx–3xxxxx families;
   a six-digit candidate starting 4–9 is not a reference, which is exactly
   what makes the composite parse below deterministic. */
const CANONICAL_REFERENCE = /^(?:[1-9]\d{3}|[1-9]\d{4}|[1-3]\d{5})[A-Z]{0,3}$/;

/* Digits-only reference candidates inside a punch-card composite, and the
   internal bracelet/dial tail that must follow one. */
const COMPOSITE_REFERENCE_LENGTHS = [6, 5, 4] as const;
const COMPOSITE_HEAD: Record<(typeof COMPOSITE_REFERENCE_LENGTHS)[number], RegExp> = {
  6: /^[1-3]\d{5}$/,
  5: /^[1-9]\d{4}$/,
  4: /^[1-9]\d{3}$/,
};
const COMPOSITE_TAIL = /^\d{2,3}[A-Z]?\d{3,5}$/;

const MODERN_STYLE = /^M?([1-3]\d{5}[A-Z]{0,3})-\d{4}$/;

/** Uppercased, space-stripped form used ONLY for matching. The preserved
    Style value is always the trimmed raw entry, never this. */
function matchForm(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

export function classifyRolexIdentifier(raw: string): RolexIdentifier {
  const trimmed = raw.trim();
  const m = matchForm(trimmed);
  if (!m) return { kind: "unsupported", raw: trimmed };

  // 1 · bare canonical reference
  if (CANONICAL_REFERENCE.test(m)) {
    return { kind: "reference", reference: m };
  }

  // 2 · modern composite style (M126610LN-0001)
  const modern = MODERN_STYLE.exec(m);
  if (modern) {
    return { kind: "style", style: trimmed, reference: modern[1] };
  }

  // 3 · punch-card composite style (R79173327B6252). Optional single
  //     letter prefix, then the deterministic head/tail split: accepted
  //     only when EXACTLY one reference length yields a valid reading.
  const body = /^[A-Z]/.test(m) ? m.slice(1) : m;
  if (/^\d/.test(body)) {
    const survivors: string[] = [];
    for (const len of COMPOSITE_REFERENCE_LENGTHS) {
      const head = body.slice(0, len);
      const tail = body.slice(len);
      if (head.length === len && COMPOSITE_HEAD[len].test(head) && COMPOSITE_TAIL.test(tail)) {
        survivors.push(head);
      }
    }
    if (survivors.length === 1) {
      return { kind: "style", style: trimmed, reference: survivors[0] };
    }
  }

  return { kind: "unsupported", raw: trimmed };
}

/* ── Governed copy ──────────────────────────────────────────────────────── */

/** The ONLY rejection language for an unparsed Rolex identifier. Humble by
    ruling: FairWatchTrade's parser not recognizing a value is never grounds
    to call it unknown to Rolex. */
export const ROLEX_IDENTIFIER_STOP =
  "This entry does not match the expected Rolex reference format.";

export const ROLEX_IDENTIFIER_STOP_DETAIL =
  "Your entry is preserved exactly as typed and stops here for review — a value FairWatchTrade cannot yet parse is not the same as a reference unknown to Rolex. If it comes from original paperwork, keep that paperwork ready.";

/** Bare canonical reference — recognition without documentary claim. */
export const ROLEX_REFERENCE_RECOGNIZED = "Reference recognized";
export const ROLEX_REFERENCE_DOC_FLAG = "Original documentation not yet verified";

/** Documented Style — recognition WITH a documentary identity claim that
    still awaits verification against the uploaded paperwork image. */
export const ROLEX_STYLE_RECOGNIZED = "Rolex style recognized";
export const rolexStyleReferenceLine = (reference: string) =>
  `Canonical reference identified: ${reference}`;
export const ROLEX_STYLE_DOC_FLAG = "Documentation pending image verification";
