/* ────────────────────────────────────────────────────────────────────────
   UNIFIED SEARCH — interpretation and matching.

   One allowlist. No AI, no fuzzy guessing, no operator invention. A word this
   file does not recognize stays ordinary text and is matched as ordinary text
   — it never becomes a hidden exclusion.

   Resolution order (Search Flight 1 §5):
     1. exact FairWatchTrade listing code
     2. exact manufacturer reference
     3. allowlisted structured meaning
     4. ordinary-text fallback

   PAIRED IMPLEMENTATION — the meaning vocabulary emitted here is evaluated in
   two places and they must agree:
     · matchesListing() below, for live Browse results;
     · public.saved_search_matches_listing() in SQL, for the saved-Search
       watcher.
   A saved Search stores these structured meanings, so the watcher re-evaluates
   stored MEANING rather than re-parsing text. Adding a `kind` here without
   adding it there means saved Searches quietly stop matching on it.
   ──────────────────────────────────────────────────────────────────────── */

export const SEARCH_MEANING_VERSION = 1;

export type MeaningKind =
  | "brand"
  | "collection"
  | "caseMaterial"
  | "excludeCaseMaterial"
  | "complication"
  | "movement"
  | "beatRateMin"
  | "powerReserveMinDays"
  | "powerReservePresent"
  | "caseSizeMaxMm"
  | "text";

export type Meaning = {
  kind: MeaningKind;
  /** Machine value: a name, or a number as a string for comparisons. */
  value: string;
  /** Collector-facing wording. Never says "criterion" or "criteria". */
  label: string;
  /** The raw query fragments this meaning consumed. Removing the meaning
      removes exactly these fragments from the visible Search text, so the
      input and the actual result state can never contradict each other. */
  source: string[];
};

export type SearchState = {
  version: number;
  /** Exactly what the collector typed. */
  text: string;
  /** Normalized listing code (lowercase, no hyphen) when the query is one. */
  code: string | null;
  /** Exact manufacturer reference when the query resolves to one. */
  reference: string | null;
  meanings: Meaning[];
};

export const EMPTY_SEARCH: SearchState = {
  version: SEARCH_MEANING_VERSION,
  text: "",
  code: null,
  reference: null,
  meanings: [],
};

/* A listing, reduced to only what Search reads. */
export type SearchableListing = {
  brand: string;
  model: string | null;
  reference: string;
  description?: string | null;
  public_code?: string | null;
  details?: {
    caseMaterial?: string;
    dialColorType?: string;
    movementType?: string;
    movementFrequency?: string;
    powerReserve?: string;
    caseSizeMm?: string;
    complications?: string[];
  } | null;
};

/* ── Listing code ──────────────────────────────────────────────────────────
   One lowercase letter + five digits. Accepted case-insensitively and with an
   optional hyphen; always normalized to the stored lowercase form. */
const LISTING_CODE = /^([a-z])-?(\d{5})$/i;

export function normalizeListingCode(raw: string): string | null {
  const m = raw.trim().match(LISTING_CODE);
  return m ? `${m[1].toLowerCase()}${m[2]}` : null;
}

/* ── Allowlisted phrases ───────────────────────────────────────────────────
   Longest / most specific first: "power reserve >5d" must be consumed before
   plain "power reserve" can claim the words. */
type PhraseRule = {
  pattern: RegExp;
  build: (m: RegExpMatchArray) => Meaning;
};

const PHRASE_RULES: PhraseRule[] = [
  /* Known multiword materials resolve by deterministic longest-known-phrase
     matching, BEFORE single-word rules can split them. Gold Filled is not
     Gold: a positive `gold` must never silently include filled, plated,
     capped, or gold-colored cases — and a minus before the first word of a
     recognized multiword material excludes the complete phrase (caught on
     Jason's real Galaxy: `-gold filled` had read as exclude-Gold plus the
     positive word "filled", which RETURNED the Gold Filled Omega). This is
     allowlisted interpretation, not phrase guessing. */
  {
    pattern: /(?<=^|\s)-gold filled\b/,
    build: (m) => ({
      kind: "excludeCaseMaterial",
      value: "Gold Filled",
      label: "Exclude Case Material: Gold Filled",
      source: [m[0]],
    }),
  },
  {
    pattern: /(?<=^|\s)gold filled\b/,
    build: (m) => ({
      kind: "caseMaterial",
      value: "Gold Filled",
      label: "Case Material: Gold Filled",
      source: [m[0]],
    }),
  },
  {
    // "more than 5 days of power reserve"
    pattern: /\bmore than (\d+(?:\.\d+)?) days? of power reserve\b/,
    build: (m) => ({
      kind: "powerReserveMinDays",
      value: m[1],
      label: `Power Reserve: More than ${m[1]} days`,
      source: [m[0]],
    }),
  },
  {
    // "power reserve >5d" / "power reserve > 5 d"
    pattern: /\bpower reserve\s*>\s*(\d+(?:\.\d+)?)\s*d\b/,
    build: (m) => ({
      kind: "powerReserveMinDays",
      value: m[1],
      label: `Power Reserve: More than ${m[1]} days`,
      source: [m[0]],
    }),
  },
  {
    // ">=28800vph" / ">= 28,800 vph"
    pattern: />=\s*([\d,]+)\s*vph\b/,
    build: (m) => {
      const n = m[1].replace(/,/g, "");
      return {
        kind: "beatRateMin",
        value: n,
        label: `Beat rate: ${Number(n).toLocaleString("en-US")} vph or higher`,
        source: [m[0]],
      };
    },
  },
  {
    // "under 40mm" / "under 40 mm"
    pattern: /\bunder (\d+(?:\.\d+)?)\s*mm\b/,
    build: (m) => ({
      kind: "caseSizeMaxMm",
      value: m[1],
      label: `Case size: under ${m[1]} mm`,
      source: [m[0]],
    }),
  },
  {
    pattern: /\bmanual wind\b/,
    build: (m) => ({
      kind: "movement",
      value: "Manual Wind",
      label: "Movement: Manual Wind",
      source: [m[0]],
    }),
  },
  {
    pattern: /\bsmall seconds\b/,
    build: (m) => ({
      kind: "complication",
      value: "Small Seconds",
      label: "Complication: Small Seconds",
      source: [m[0]],
    }),
  },
  {
    pattern: /\bwith date\b/,
    build: (m) => ({ kind: "complication", value: "Date", label: "Complication: Date", source: [m[0]] }),
  },
  {
    // Plain "power reserve" — only reachable once the measured forms above
    // have already consumed their words.
    pattern: /\bpower reserve\b/,
    build: (m) => ({
      kind: "powerReservePresent",
      value: "present",
      label: "Power Reserve: Present",
      source: [m[0]],
    }),
  },
];

/* Single words. `-gold` excludes ONLY Case Material: Gold — never a gold dial,
   never ordinary text containing "gold". Source fragments are attached at
   parse time from the actual token encountered. */
type MeaningTemplate = Omit<Meaning, "source">;

const WORD_RULES: Record<string, MeaningTemplate> = {
  parmigiani: { kind: "brand", value: "Parmigiani Fleurier", label: "Brand: Parmigiani Fleurier" },
  kalpa: { kind: "collection", value: "Kalpa", label: "Collection: Kalpa" },
  // Exact material identity — matches Gold and only Gold ("gold filled" was
  // already consumed above by longest-known-phrase order).
  gold: { kind: "caseMaterial", value: "Gold", label: "Case Material: Gold" },
  automatic: { kind: "movement", value: "Automatic", label: "Movement: Automatic" },
  chronograph: {
    kind: "complication",
    value: "Chronograph",
    label: "Complication: Chronograph",
  },
  date: { kind: "complication", value: "Date", label: "Complication: Date" },
};

const NEGATED_MATERIALS: Record<string, MeaningTemplate> = {
  gold: {
    kind: "excludeCaseMaterial",
    value: "Gold",
    label: "Exclude Case Material: Gold",
  },
};

function pushUnique(list: Meaning[], meaning: Meaning) {
  if (!list.some((m) => m.kind === meaning.kind && m.value === meaning.value)) {
    list.push(meaning);
  }
}

/**
 * Interpret a raw query. `knownReferences` makes reference resolution an exact
 * identity lookup against real listings rather than a broad keyword match; omit
 * it and no query will be treated as a reference.
 */
export function parseSearch(
  raw: string,
  opts?: { knownReferences?: Iterable<string> }
): SearchState {
  const text = raw ?? "";
  const trimmed = text.trim();
  if (!trimmed) return { ...EMPTY_SEARCH, text };

  // 1 — exact listing code.
  const code = normalizeListingCode(trimmed);
  if (code) {
    return { version: SEARCH_MEANING_VERSION, text, code, reference: null, meanings: [] };
  }

  // 2 — exact manufacturer reference.
  if (opts?.knownReferences) {
    const wanted = trimmed.toLowerCase();
    for (const ref of opts.knownReferences) {
      if (ref && ref.trim().toLowerCase() === wanted) {
        return {
          version: SEARCH_MEANING_VERSION,
          text,
          code: null,
          reference: ref,
          meanings: [],
        };
      }
    }
  }

  // 3 — allowlisted meanings, consumed out of a working copy.
  const meanings: Meaning[] = [];
  let working = trimmed.toLowerCase();

  // Curly double quotes (what a Galaxy keyboard actually inserts) behave
  // exactly like straight ones from here on.
  working = working.replace(/[“”„‟]/g, '"');

  // Quoted phrases are considered first and always consumed, so a quoted
  // phrase can never be re-read as loose words.
  const quoted: { inner: string; raw: string }[] = [];
  working = working.replace(/"([^"]+)"/g, (all, inner: string) => {
    quoted.push({ inner: inner.trim(), raw: all });
    return " ";
  });

  // An UNMATCHED quotation mark is harmless punctuation, not an operator:
  // `"Omega` must read as the word Omega, not as text containing a literal
  // quote that no listing can ever match (caught on Jason's real Galaxy).
  // Balanced pairs were already consumed above, so any quote still standing
  // here is stray and simply normalizes away. The collector's words and every
  // independently recognized operator are preserved — this is punctuation
  // cleanup, not broadening.
  working = working.replace(/"/g, " ");
  for (const { inner, raw } of quoted) {
    const rule = PHRASE_RULES.find((r) => r.pattern.test(inner));
    const m = rule ? inner.match(rule.pattern) : null;
    if (rule && m) pushUnique(meanings, { ...rule.build(m), source: [raw] });
    else if (inner)
      pushUnique(meanings, {
        kind: "text",
        value: inner,
        label: `Search text: ${inner}`,
        source: [raw],
      });
  }

  for (const rule of PHRASE_RULES) {
    const m = working.match(rule.pattern);
    if (m) {
      pushUnique(meanings, rule.build(m));
      working = working.replace(rule.pattern, " ");
    }
  }

  const leftover: string[] = [];
  for (const token of working.split(/\s+/)) {
    const word = token.trim();
    if (!word) continue;

    if (word.startsWith("-")) {
      const bare = word.slice(1);
      const negated = NEGATED_MATERIALS[bare];
      if (negated) {
        pushUnique(meanings, { ...negated, source: [word] });
        continue;
      }
      leftover.push(word);
      continue;
    }

    const known = WORD_RULES[word];
    if (known) {
      pushUnique(meanings, { ...known, source: [word] });
      continue;
    }
    leftover.push(word);
  }

  // 4 — ordinary fallback. Unrecognized words stay text, shown plainly.
  // Bare connectors left behind by a consumed phrase ("manual wind WITH more
  // than 5 days...") are dropped — requiring the word "with" to appear in a
  // listing would silently fail honest queries. Connectors are removed only
  // here, never from inside an unrecognized phrase the collector typed.
  const CONNECTORS = new Set(["with", "of", "and", "a", "an", "the"]);
  const kept = leftover.filter((w) => !CONNECTORS.has(w));
  if (kept.length) {
    const phrase = kept.join(" ");
    pushUnique(meanings, {
      kind: "text",
      value: phrase,
      label: `Search text: ${phrase}`,
      source: kept,
    });
  }

  return { version: SEARCH_MEANING_VERSION, text, code: null, reference: null, meanings };
}

/**
 * Remove one recognized meaning from the visible Search text by excising the
 * exact fragments it consumed. Removing "Collection: Kalpa" from
 * "parmigiani kalpa -gold" leaves "parmigiani -gold" — the input and the
 * actual result state can never contradict each other. Case-insensitive,
 * first occurrence per fragment, whitespace collapsed after.
 */
export function removeMeaningFromQuery(text: string, meaning: Meaning): string {
  let out = text;
  for (const fragment of meaning.source) {
    if (!fragment) continue;
    const escaped = fragment
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      // Fragments are captured with straight quotes (the parser normalizes
      // curly ones first); the collector's actual text may carry either.
      .replace(/"/g, '["“”„‟]');
    // Whole-token boundary for plain words; verbatim for fragments carrying
    // their own punctuation (quotes, ">=", "-gold").
    const needsBoundary = /^[a-z0-9]+$/i.test(fragment);
    const re = new RegExp(needsBoundary ? `\\b${escaped}\\b` : escaped, "i");
    out = out.replace(re, " ");
  }
  return out.replace(/\s+/g, " ").trim();
}

/* ── Matching ──────────────────────────────────────────────────────────────
   Mirrors public.saved_search_matches_listing(). Keep the two in step. */

function numeric(value?: string | null): number | null {
  if (!value) return null;
  const cleaned = String(value).replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function haystack(listing: SearchableListing): string {
  const d = listing.details ?? {};
  return [
    listing.brand,
    listing.model,
    listing.reference,
    d.caseMaterial,
    d.dialColorType,
    d.movementType,
    listing.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function matchesMeaning(listing: SearchableListing, meaning: Meaning): boolean {
  const d = listing.details ?? {};
  const v = meaning.value;

  switch (meaning.kind) {
    case "brand":
      return (listing.brand ?? "").toLowerCase() === v.toLowerCase();
    case "collection":
      return (listing.model ?? "").toLowerCase().includes(v.toLowerCase());
    case "caseMaterial":
      // Exact identity: Gold Filled is not Gold.
      return (d.caseMaterial ?? "").toLowerCase() === v.toLowerCase();
    case "excludeCaseMaterial":
      return (d.caseMaterial ?? "").toLowerCase() !== v.toLowerCase();
    case "complication":
      return (Array.isArray(d.complications) ? d.complications : []).some(
        (c) => String(c).toLowerCase() === v.toLowerCase()
      );
    case "movement":
      return (d.movementType ?? "").toLowerCase() === v.toLowerCase();
    case "beatRateMin": {
      const n = numeric(d.movementFrequency);
      return n !== null && n >= Number(v);
    }
    case "powerReserveMinDays": {
      // powerReserve is stored in hours.
      const n = numeric(d.powerReserve);
      return n !== null && n > Number(v) * 24;
    }
    case "powerReservePresent":
      return Boolean(d.powerReserve && String(d.powerReserve).trim() !== "");
    case "caseSizeMaxMm": {
      const n = numeric(d.caseSizeMm);
      return n !== null && n < Number(v);
    }
    case "text": {
      const hay = haystack(listing);
      return v
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .every((word) => hay.includes(word));
    }
    default:
      return true;
  }
}

/** Does one listing satisfy the whole Search? */
export function matchesSearch(listing: SearchableListing, state: SearchState): boolean {
  if (state.code) {
    return (listing.public_code ?? "").toLowerCase() === state.code.toLowerCase();
  }
  if (state.reference) {
    return (listing.reference ?? "").toLowerCase() === state.reference.toLowerCase();
  }
  return state.meanings.every((m) => matchesMeaning(listing, m));
}
