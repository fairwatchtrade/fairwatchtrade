/* Sensitive identifier contract — normalization equivalence, token security.

   Run: node --experimental-strip-types scripts/identifier-contract.test.mjs

   These assertions guard the boundary that keeps FWT from becoming an
   uncontrolled store of recoverable serial numbers:

     · normalization folds exactly what is transcription noise (whitespace,
       case, compatibility forms) and NOTHING else — punctuation and
       visually confusable characters stay significant, because a fold that
       fixes a typo also silently merges two genuine identifiers;
     · the token is keyed, so it is not the dictionary-attackable digest a
       plain SHA256 of a six-character serial would be;
     · identifier type is inside the token domain, so the same characters
       seen as a serial and as a case number are never the same evidence;
     · both versions are inside the domain, so tokens from different
       generations cannot be silently compared;
     · a missing key REFUSES rather than falling back to something weaker;
     · nothing here concludes that two watches are the same watch. Equal
       tokens are evidence. That is the whole claim. */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  IDENTIFIER_TYPES,
  MAX_IDENTIFIER_INPUT,
  NORMALIZATION_VERSION,
  identifierTokenMessage,
  isIdentifierType,
  normalizeIdentifier,
} from "../lib/identity/identifierNormalization.ts";

/* A test key. Not a production value and never used to write anything —
   the production key lives only in the environment. */
process.env.IDENTIFIER_TOKEN_KEY_V1 =
  "test-only-key-material-for-contract-assertions-0123456789";

const { TOKEN_KEY_VERSION, identifierTokensEqual, identifierTokenKeyConfigured, tokenizeIdentifier } =
  await import("../lib/identity/identifierToken.ts");

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const tok = (rawValue, identifierType = "serial_number") => {
  const r = tokenizeIdentifier({ identifierType, rawValue });
  assert.equal(r.ok, true, `expected tokenization to succeed for this input`);
  return r.value.equalityToken;
};

console.log("\nnormalization — what is folded");

check("whitespace is transcription noise and folds away", () => {
  const a = normalizeIdentifier("8Z1 2345");
  const b = normalizeIdentifier("8Z12345");
  const c = normalizeIdentifier("  8Z1\t2345\n");
  assert.equal(a.normalized, "8Z12345");
  assert.equal(b.normalized, "8Z12345");
  assert.equal(c.normalized, "8Z12345");
});

check("case is transcription style and folds away", () => {
  assert.equal(normalizeIdentifier("ab12cd").normalized, "AB12CD");
  assert.equal(
    normalizeIdentifier("ab12cd").normalized,
    normalizeIdentifier("AB12CD").normalized
  );
});

check("compatibility forms fold to their canonical characters", () => {
  // Full-width digits are the same marking typed on a different keyboard.
  assert.equal(normalizeIdentifier("１２３ＡＢ").normalized, "123AB");
});

console.log("\nnormalization — what is deliberately NOT folded");

check("punctuation is significant and survives", () => {
  assert.notEqual(
    normalizeIdentifier("12-345").normalized,
    normalizeIdentifier("12345").normalized
  );
  assert.equal(normalizeIdentifier("12-345").normalized, "12-345");
  assert.equal(normalizeIdentifier("A.1/2").normalized, "A.1/2");
});

check("visually confusable characters are NOT folded together", () => {
  // O/0, I/1, S/5, B/8. Folding these would fix transcription typos and, in
  // exactly the same stroke, merge two different watches — undetectably,
  // because no raw value is retained to audit the decision against.
  assert.notEqual(normalizeIdentifier("O123").normalized, normalizeIdentifier("0123").normalized);
  assert.notEqual(normalizeIdentifier("I23").normalized, normalizeIdentifier("123").normalized);
  assert.notEqual(normalizeIdentifier("S5").normalized, normalizeIdentifier("55").normalized);
  assert.notEqual(normalizeIdentifier("B8").normalized, normalizeIdentifier("88").normalized);
});

check("empty and whitespace-only input is refused, not stored as blank", () => {
  assert.equal(normalizeIdentifier("").ok, false);
  assert.equal(normalizeIdentifier("   ").ok, false);
  assert.equal(normalizeIdentifier("   ").reason, "empty");
});

check("absurdly long input is refused rather than tokenized", () => {
  const r = normalizeIdentifier("A".repeat(MAX_IDENTIFIER_INPUT + 1));
  assert.equal(r.ok, false);
  assert.equal(r.reason, "too_long");
});

check("the governed type set is bounded and excludes non-identifiers", () => {
  assert.deepEqual(IDENTIFIER_TYPES.slice().sort(), [
    "case_number",
    "certificate_identifier",
    "movement_number",
    "serial_number",
  ]);
  // A model or a record, never an object.
  for (const notAnIdentifier of ["calibre", "caseback_type", "dealer_sku", "public_code", "reference"]) {
    assert.equal(isIdentifierType(notAnIdentifier), false);
  }
});

console.log("\ntoken — equality semantics");

check("same normalized value under same type and versions gives same token", () => {
  assert.equal(tok("8Z1 2345"), tok("8z12345"));
});

check("clearly different values give different tokens", () => {
  assert.notEqual(tok("8Z12345"), tok("8Z12346"));
});

check("identifier type domain-separates: same characters, different evidence", () => {
  assert.notEqual(tok("8Z12345", "serial_number"), tok("8Z12345", "case_number"));
  assert.notEqual(tok("8Z12345", "movement_number"), tok("8Z12345", "certificate_identifier"));
});

check("token comparison is available and is not a conclusion", () => {
  assert.equal(identifierTokensEqual(tok("ABC123"), tok("abc 123")), true);
  assert.equal(identifierTokensEqual(tok("ABC123"), tok("ABC124")), false);
  // Note what is absent: there is no exported function anywhere in this
  // module that turns equal tokens into a same-watch claim. 06C provides
  // the primitive and stops.
});

console.log("\ntoken — security properties");

check("the token is NOT an unkeyed SHA256 of the value", () => {
  const normalized = normalizeIdentifier("8Z12345").normalized;
  const naiveHex = createHash("sha256").update(normalized).digest("hex");
  const naiveB64 = createHash("sha256").update(normalized).digest("base64url");
  const actual = tok("8Z12345");
  assert.notEqual(actual, naiveHex);
  assert.notEqual(actual, naiveB64);
  // Also not a digest of the domain-separated message without a key — that
  // would be just as enumerable.
  const message = identifierTokenMessage({
    identifierType: "serial_number",
    normalized,
    normalizationVersion: NORMALIZATION_VERSION,
    tokenKeyVersion: TOKEN_KEY_VERSION,
  });
  assert.notEqual(actual, createHash("sha256").update(message).digest("base64url"));
});

check("a different key produces a different token for the same value", () => {
  const before = tok("8Z12345");
  const saved = process.env.IDENTIFIER_TOKEN_KEY_V1;
  process.env.IDENTIFIER_TOKEN_KEY_V1 = "a-completely-different-key-of-sufficient-length-12345";
  const after = tok("8Z12345");
  process.env.IDENTIFIER_TOKEN_KEY_V1 = saved;
  assert.notEqual(before, after);
  // Which is exactly why rotation cannot re-tokenize history: with no raw
  // value retained, there is nothing to recompute the old tokens from.
});

check("both versions are inside the token domain", () => {
  const normalized = normalizeIdentifier("8Z12345").normalized;
  const base = { identifierType: "serial_number", normalized };
  assert.notEqual(
    identifierTokenMessage({ ...base, normalizationVersion: 1, tokenKeyVersion: 1 }),
    identifierTokenMessage({ ...base, normalizationVersion: 2, tokenKeyVersion: 1 })
  );
  assert.notEqual(
    identifierTokenMessage({ ...base, normalizationVersion: 1, tokenKeyVersion: 1 }),
    identifierTokenMessage({ ...base, normalizationVersion: 1, tokenKeyVersion: 2 })
  );
});

check("a missing key refuses rather than falling back to something weaker", () => {
  const saved = process.env.IDENTIFIER_TOKEN_KEY_V1;
  delete process.env.IDENTIFIER_TOKEN_KEY_V1;
  assert.equal(identifierTokenKeyConfigured(), false);
  assert.throws(
    () => tokenizeIdentifier({ identifierType: "serial_number", rawValue: "8Z12345" }),
    /not configured/
  );
  process.env.IDENTIFIER_TOKEN_KEY_V1 = saved;
  assert.equal(identifierTokenKeyConfigured(), true);
});

check("a key too short to be key material is treated as absent", () => {
  const saved = process.env.IDENTIFIER_TOKEN_KEY_V1;
  process.env.IDENTIFIER_TOKEN_KEY_V1 = "tooshort";
  assert.equal(identifierTokenKeyConfigured(), false);
  process.env.IDENTIFIER_TOKEN_KEY_V1 = saved;
});

check("no thrown error carries the submitted value or the key", () => {
  const saved = process.env.IDENTIFIER_TOKEN_KEY_V1;
  delete process.env.IDENTIFIER_TOKEN_KEY_V1;
  try {
    tokenizeIdentifier({ identifierType: "serial_number", rawValue: "SECRETSERIAL999" });
    assert.fail("expected a refusal");
  } catch (e) {
    assert.ok(!String(e.message).includes("SECRETSERIAL999"));
    assert.ok(!String(e.message).includes(saved));
    assert.ok(!String(e.stack ?? "").includes("SECRETSERIAL999"));
  }
  process.env.IDENTIFIER_TOKEN_KEY_V1 = saved;
});

check("the tokenize result carries no trace of the raw value", () => {
  const r = tokenizeIdentifier({ identifierType: "serial_number", rawValue: "8Z12345" });
  const serialized = JSON.stringify(r);
  assert.ok(!serialized.includes("8Z12345"));
  assert.ok(!serialized.includes("8z12345"));
  assert.deepEqual(Object.keys(r.value).sort(), [
    "equalityToken",
    "normalizationVersion",
    "tokenKeyVersion",
  ]);
});

console.log(`\n${passed} assertions passed\n`);
