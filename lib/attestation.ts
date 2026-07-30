/* ════════════════════════════════════════════════════════════════════════
   DEALER ATTESTATION FINGERPRINT — client mirror of the SQL contract
   (v2.21, Dealer Accelerator Flight 2B)

   The AUTHORITATIVE fingerprint is computed inside Postgres by
   public.submit_listing_for_review() at submission time. This module exists
   for one purpose: recomputing the same fingerprint client-side so the
   Review Workspace can COMPOSE attestation validity at read time (Law 5 —
   nothing stored, no flag to forget to flip). Stored fingerprint ≠ live
   recomputation → the attestation is stale and the ceremony reappears.

   THE CONTRACT (frozen — any change here REQUIRES the matching change in
   the RPC, and vice versa):

     frame(s)  = <utf8 byte length> ':' s          (netstring-style; injective)
     list(a)   = concat of frame(e) for each element, stored order, no join
     canonical = concat of frame(field) for the 13 fields below, in order
     fingerprint = lowercase hex SHA-256 of the canonical text's UTF-8 bytes

   Field order (frozen):
     1 brand · 2 model · 3 reference · 4 year · 5 condition · 6 asking_price
     7 provenance_note · 8 description · 9 has_bracelet
     10 details.availability · 11 details.includedWithWatch (list)
     12 details.includedNotes · 13 photos[].photo.url (list; entries whose
        url is missing, NULL, empty, or whitespace-only are DROPPED —
        emptiness tested on the trimmed value (/\S/ ↔ SQL ~ '\S'), while
        surviving urls hash their ORIGINAL bytes, untrimmed)

   ── v2 FRAME (Marketplace Money Truth Stage B, order §10) ───────────────
   Currency becomes protected field 14. The v2 canonical text is:

     frame('v2') + <the 13 v1 frames, unchanged> + frame(asking_currency)

   i.e. 15 frames, mirroring public.listing_attestation_fingerprint_v2.

   NON-COLLISION (why v1 and v2 can never be confused): length-prefixed
   concatenation is uniquely decodable — read digits to ':', then exactly that
   many bytes, repeat. A given byte string parses to exactly ONE frame count.
   v1 always yields 13 frames, v2 always yields 15, so no v1 canonical text
   can equal a v2 one. The leading 'v2' frame makes the version self-describing
   on top of that.

   WHICH FRAME APPLIES is decided by the row's own currency, not by a stored
   flag (Law 5 — composed at read time, nothing to forget to flip):

     asking_currency NULL  → v1. A legacy row keeps the attestation it earned;
                             adding currency truth later must not retroactively
                             accuse an untouched listing.
     asking_currency SET   → v2. A stored v1 fingerprint CANNOT match a v2
                             recomputation, so attesting a currency correctly
                             invalidates the old attestation and the ceremony
                             reappears. That is the intended consequence, not
                             a side effect.

   v2 is never computed for a row without a currency — an amount with no
   currency is not a price, and fingerprinting one would assert the very
   amount-without-currency state the staged rollout exists to prevent.
   Amount edits keep invalidating attestation exactly as before, in both
   frames, because asking_price is still field 6.

   submit_listing_for_review still emits v1 in the database. Activating v2
   there is a later, deliberate act performed in lockstep with this file.

   Normalization:
     · null / undefined / missing key → '' (frames as "0:")
     · text fields byte-exact — no trim, no case fold, no unicode normalization
     · asking_price: trailing zeros stripped — SQL trim_scale()::text,
       here String(number) (JS numbers carry no trailing zeros)
     · has_bracelet: literal 'true' / 'false'
     · arrays keep STORED order — reordering photographs IS a truth change

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export type CommercialTruth = {
  brand: string | null;
  model: string | null;
  reference: string | null;
  year: string | null;
  condition: string | null;
  asking_price: number | null;
  /** Protected field 14 (v2). REQUIRED — deliberately not optional, so a
      caller cannot silently fall back to the v1 frame by omitting it. */
  asking_currency: string | null;
  provenance_note: string | null;
  description: string | null;
  has_bracelet: boolean;
  details: {
    availability?: string;
    includedWithWatch?: string[];
    includedNotes?: string;
  } | null;
  photos: { photo?: { url?: string | null } | null }[] | null;
};

const encoder = new TextEncoder();

function frame(s: string): string {
  return `${encoder.encode(s).length}:${s}`;
}

function list(items: string[]): string {
  return items.map(frame).join("");
}

export function canonicalCommercialTruth(t: CommercialTruth): string {
  const d = t.details ?? {};
  const included = Array.isArray(d.includedWithWatch) ? d.includedWithWatch : [];
  const photoUrls = (Array.isArray(t.photos) ? t.photos : [])
    .map((p) => p?.photo?.url)
    // v2.21b: drop missing/NULL, empty, and whitespace-only urls — same
    // /\S/ predicate as the RPC's ~ '\S'. Survivors hash ORIGINAL bytes.
    .filter((u): u is string => typeof u === "string" && /\S/.test(u));

  return [
    frame(t.brand ?? ""),
    frame(t.model ?? ""),
    frame(t.reference ?? ""),
    frame(t.year ?? ""),
    frame(t.condition ?? ""),
    frame(t.asking_price === null || t.asking_price === undefined ? "" : String(t.asking_price)),
    frame(t.provenance_note ?? ""),
    frame(t.description ?? ""),
    frame(t.has_bracelet ? "true" : "false"),
    frame(d.availability ?? ""),
    frame(list(included)),
    frame(d.includedNotes ?? ""),
    frame(list(photoUrls)),
  ].join("");
}

/* v2 canonical text — the version frame, the unchanged 13, then currency.
   A faithful mirror of the SQL, including its coalesce of a NULL currency to
   the empty string: the two implementations must agree byte-for-byte so the
   fixture harness can prove equivalence. Policy (below) is what guarantees
   this is never CALLED for a row without a currency. */
export function canonicalCommercialTruthV2(t: CommercialTruth): string {
  return (
    frame("v2") +
    canonicalCommercialTruth(t) +
    frame(t.asking_currency ?? "")
  );
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function commercialFingerprint(t: CommercialTruth): Promise<string> {
  return sha256Hex(canonicalCommercialTruth(t));
}

export async function commercialFingerprintV2(t: CommercialTruth): Promise<string> {
  return sha256Hex(canonicalCommercialTruthV2(t));
}

export type AttestationFrame = "v1" | "v2";

/* THE TRANSITION RULE, in one place. The row's own currency decides its frame;
   there is no stored version column to drift. Treating whitespace as absent
   matches the SQL's own '' handling of a coalesced NULL. */
export function attestationFrameFor(
  askingCurrency: string | null | undefined
): AttestationFrame {
  return typeof askingCurrency === "string" && askingCurrency.trim() !== "" ? "v2" : "v1";
}

/** The live fingerprint under whichever frame this row's currency selects. */
export async function currentFingerprint(t: CommercialTruth): Promise<string> {
  return attestationFrameFor(t.asking_currency) === "v2"
    ? commercialFingerprintV2(t)
    : commercialFingerprint(t);
}

/* Attestation validity, composed at read time. A listing with no stored
   fingerprint has never been attested.

   Frame selection is the whole v1→v2 transition: a legacy null-currency row is
   compared under v1 and keeps its attestation; the moment a currency is
   attested, the comparison moves to v2, the stored v1 value cannot match, and
   the confirmation ceremony correctly reappears. */
export async function isAttestationCurrent(
  t: CommercialTruth,
  storedFingerprint: string | null
): Promise<boolean> {
  if (!storedFingerprint) return false;
  return (await currentFingerprint(t)) === storedFingerprint;
}
