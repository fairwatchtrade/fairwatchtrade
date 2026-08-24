/* ════════════════════════════════════════════════════════════════════════
   SENSITIVE IDENTIFIER NORMALIZATION — the pure half (no runtime deps)

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     A serial number is evidence ABOUT a physical watch. It is not the
     physical watch's identity, and it is not a column on a listing.

   This file decides one narrow thing: what counts as the same written
   identifier before an equality token is computed. It never decides that
   two watches are the same watch. Nothing here may grow into matching.

   ── WHY NORMALIZATION IS VERSIONED, AND WHY THAT MATTERS MORE HERE ─────
   Tokens are keyed and one-way. The platform deliberately keeps NO
   recoverable raw value, so a token can never be recomputed from storage.
   That makes a normalization change irreversible in a way it would not be
   if raw values were retained: every observation written under the old
   rules keeps its old token forever.

   So the rules are frozen per version. To change how an identifier is
   normalized, ADD a version — never edit an existing one. Two tokens are
   comparable only when their identifier type, normalization version and
   token key version all agree.

   ── WHY EVERY CLASS SHARES ONE RULE IN v1 (a decision, not an oversight)
   The order requires punctuation, whitespace and case handling to be
   deliberate per identifier class. Having looked at what these four
   actually are, v1 deliberately applies ONE rule to all of them, because
   they share the property that matters:

     · they are engraved, stamped, or printed onto an object and then
       TRANSCRIBED by a human;
     · whitespace in the transcription is layout noise — an engraver's
       spacing, or where someone's eye paused. "8Z1 2345" and "8Z12345"
       are the same marking;
     · case is transcription style, not content;
     · punctuation is NOT noise. A hyphen or a dot may be part of the
       manufacturer's scheme, and dropping it could fuse two real
       identifiers into one token.

   So: fold whitespace and case, preserve everything else. Any class that
   later proves to need different handling earns its own normalization
   version rather than a quiet edit to this one.

   ── WHAT IS DELIBERATELY NOT FOLDED ────────────────────────────────────
   Visually confusable characters — O/0, I/1/l, S/5, B/8 — are NOT folded
   together. It is tempting, because transcription errors are real. It is
   also exactly how two different watches become one: a fold that fixes a
   typo also merges two genuine identifiers that differ only by that
   character, and with no raw value retained the mistake is undetectable
   afterwards. Transcription error is a matching problem with evidence
   behind it, and it belongs to a later governed round. Not here.
   ════════════════════════════════════════════════════════════════════════ */

/** The bounded governed set. Anything not on this list is not an identifier
    for this purpose — notably calibre, caseback type, dealer inventory SKU,
    listing public code, and canonical reference, none of which uniquely
    identify an OBJECT. */
export const IDENTIFIER_TYPES = [
  "serial_number",
  "case_number",
  "movement_number",
  "certificate_identifier",
] as const;

export type IdentifierType = (typeof IDENTIFIER_TYPES)[number];

export function isIdentifierType(v: unknown): v is IdentifierType {
  return typeof v === "string" && (IDENTIFIER_TYPES as readonly string[]).includes(v);
}

/** Bump by ADDING a version. Never edit the behaviour of an existing one. */
export const NORMALIZATION_VERSION = 1;

/** Long enough for any real identifier, short enough that this is never a
    channel for smuggling a document into the column. */
export const MAX_IDENTIFIER_INPUT = 128;

export type NormalizationResult =
  | { ok: true; normalized: string; version: number }
  | { ok: false; reason: "empty" | "too_long" };

/**
 * v1 — NFKC, strip all Unicode whitespace, uppercase, preserve everything
 * else. See the header for why each of those four is what it is.
 *
 * NFKC is applied so that full-width and other compatibility forms of the
 * same character land on the same token; it does not fold letters into
 * digits or otherwise touch content.
 */
export function normalizeIdentifier(raw: string): NormalizationResult {
  const input = typeof raw === "string" ? raw : "";
  if (input.length > MAX_IDENTIFIER_INPUT) return { ok: false, reason: "too_long" };

  const normalized = input
    .normalize("NFKC")
    .replace(/\s+/gu, "")
    .toUpperCase();

  if (normalized === "") return { ok: false, reason: "empty" };
  return { ok: true, normalized, version: NORMALIZATION_VERSION };
}

/**
 * The exact bytes that get tokenized. Kept here, beside the normalizer, so
 * the domain separation is impossible to change by accident in one place
 * and not the other.
 *
 * Identifier type is INSIDE the message, so the same characters observed as
 * a serial number and as a case number produce different tokens and can
 * never be read as the same piece of evidence. Both versions are inside it
 * too, so a token from one generation cannot silently be compared against
 * another.
 */
export function identifierTokenMessage(params: {
  identifierType: IdentifierType;
  normalized: string;
  normalizationVersion: number;
  tokenKeyVersion: number;
}): string {
  return [
    "fwt.identifier",
    `k${params.tokenKeyVersion}`,
    `n${params.normalizationVersion}`,
    params.identifierType,
    params.normalized,
  ].join("|");
}
