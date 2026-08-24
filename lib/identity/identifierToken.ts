import { createHmac, timingSafeEqual } from "node:crypto";
import {
  identifierTokenMessage,
  normalizeIdentifier,
  NORMALIZATION_VERSION,
  type IdentifierType,
} from "./identifierNormalization.ts";

/* ════════════════════════════════════════════════════════════════════════
   SENSITIVE IDENTIFIER TOKENS — keyed, one-way, server-only

   An equality token answers exactly one question: were these two
   observations of the same written identifier? It cannot answer "what was
   the serial number", and that is the entire point.

   ── WHY NOT SHA256(value) ──────────────────────────────────────────────
   Because a watch serial is a LOW-ENTROPY secret. A plain unkeyed digest
   of a six-to-ten character alphanumeric string is not protection; it is a
   dictionary lookup waiting to happen. Anyone who obtained the table could
   enumerate the entire plausible serial space in minutes and recover every
   value. The digest would give the appearance of protection while storing
   the identifiers in all but name.

   A keyed construction removes that: without the key, the token space is
   not enumerable, and the key never lives in the same place as the tokens.

   HMAC-SHA256 over a domain-separated message, base64url encoded.

   ── WHAT IS IN THE MESSAGE, AND WHY ────────────────────────────────────
     fwt.identifier | k<keyVersion> | n<normVersion> | <type> | <normalized>

   The identifier TYPE is inside the message, so the same characters seen
   as a serial number and as a case number are different evidence and can
   never collide into one match. Both versions are inside it, so tokens
   from different generations cannot be silently compared as if they meant
   the same thing.

   ── THE KEY-EVOLUTION CONSEQUENCE — READ BEFORE ROTATING ANYTHING ──────
   V1 stores no recoverable raw value. That is a deliberate safety
   property, and it has a permanent cost:

     A rotated key CANNOT be used to re-tokenize history.

   There is nothing to re-tokenize FROM. Every observation therefore
   records the key version that produced it, and old key material must be
   retained — not destroyed — so newly submitted values can still be
   tokenized under an old generation for comparison against old evidence.
   Destroying an old key does not "retire" it; it permanently blinds the
   platform to every observation written under it.

   This file supports that by keying off a versioned env name and refusing
   to invent a default. It is deliberately NOT a key-management subsystem.

   ── FAIL CLOSED, ALWAYS ────────────────────────────────────────────────
   A missing key produces a refusal, never a fallback. An unkeyed or
   default-keyed token would be indistinguishable from a real one in the
   table forever, and it would be dictionary-attackable. Refusing to write
   is recoverable; writing a weak token is not.

   THE SECRET NEVER: appears in a row, reaches a browser, enters a log, an
   error message, telemetry, or any payload. Nothing in this module returns
   it, and no error thrown from here embeds it.
   ════════════════════════════════════════════════════════════════════════ */

/** Bump when a new key generation is introduced. Old generations keep
    working for comparison as long as their env value is still present. */
export const TOKEN_KEY_VERSION = 1;

export class IdentifierTokenUnavailable extends Error {
  constructor(version: number) {
    // Names the env var, never the value — this message reaches logs.
    super(`Identifier token key v${version} is not configured on this environment.`);
    this.name = "IdentifierTokenUnavailable";
  }
}

/** Env name for a generation. Versioned so a rotation ADDS a variable
    rather than overwriting the one that history depends on. */
export function tokenKeyEnvName(version: number): string {
  return `IDENTIFIER_TOKEN_KEY_V${version}`;
}

function keyMaterial(version: number): Buffer {
  const raw = process.env[tokenKeyEnvName(version)];
  if (typeof raw !== "string" || raw.trim().length < 32) {
    // Also refuses a token key that is present but too short to be one.
    throw new IdentifierTokenUnavailable(version);
  }
  return Buffer.from(raw.trim(), "utf8");
}

export function identifierTokenKeyConfigured(version: number = TOKEN_KEY_VERSION): boolean {
  try {
    keyMaterial(version);
    return true;
  } catch {
    return false;
  }
}

export type TokenizedIdentifier = {
  equalityToken: string;
  normalizationVersion: number;
  tokenKeyVersion: number;
};

export type TokenizeResult =
  | { ok: true; value: TokenizedIdentifier }
  | { ok: false; reason: "empty" | "too_long" };

/**
 * Normalize then tokenize. The caller hands in raw transcription and gets
 * back nothing from which the raw could be reconstructed.
 *
 * THE RAW ARGUMENT IS EPHEMERAL. It is processing material only: it must
 * not be persisted, logged, echoed into a response, attached to an error,
 * or forwarded anywhere. Nothing in this function retains it beyond the
 * call, and nothing it returns contains it.
 *
 * Throws IdentifierTokenUnavailable when the named key generation is not
 * configured. That is a refusal, not a fallback.
 */
export function tokenizeIdentifier(params: {
  identifierType: IdentifierType;
  rawValue: string;
  tokenKeyVersion?: number;
}): TokenizeResult {
  const keyVersion = params.tokenKeyVersion ?? TOKEN_KEY_VERSION;
  const key = keyMaterial(keyVersion); // throws before any parsing work

  const normalized = normalizeIdentifier(params.rawValue);
  if (!normalized.ok) return { ok: false, reason: normalized.reason };

  const message = identifierTokenMessage({
    identifierType: params.identifierType,
    normalized: normalized.normalized,
    normalizationVersion: normalized.version,
    tokenKeyVersion: keyVersion,
  });

  const equalityToken = createHmac("sha256", key).update(message, "utf8").digest("base64url");

  return {
    ok: true,
    value: {
      equalityToken,
      normalizationVersion: NORMALIZATION_VERSION,
      tokenKeyVersion: keyVersion,
    },
  };
}

/**
 * Constant-time token comparison. 06C provides the primitive and draws no
 * conclusion from it — deciding what equal tokens MEAN about two watches is
 * a later governed round's problem, with its own evidence and its own
 * resolution states. Equal tokens are evidence, never a verdict.
 */
export function identifierTokensEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a ?? "", "utf8");
  const bb = Buffer.from(b ?? "", "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
