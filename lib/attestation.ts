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

export async function commercialFingerprint(t: CommercialTruth): Promise<string> {
  const bytes = encoder.encode(canonicalCommercialTruth(t));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* Attestation validity, composed at read time. A listing with no stored
   fingerprint has never been attested. */
export async function isAttestationCurrent(
  t: CommercialTruth,
  storedFingerprint: string | null
): Promise<boolean> {
  if (!storedFingerprint) return false;
  return (await commercialFingerprint(t)) === storedFingerprint;
}
