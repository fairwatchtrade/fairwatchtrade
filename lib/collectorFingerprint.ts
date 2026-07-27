/* ────────────────────────────────────────────────────────────────────────
   COLLECTOR FINGERPRINT — the listing-detail quick read (Design Gate v2).

   Pure derivation, composed at read time from the same live values the rest
   of the detail page uses — never a stored copy. Two conceptual lines:

     primary        →  40 mm case · 11.7 mm thick · Automatic · 2016
     complications  →  Chronograph · Small Seconds · Date

   Facts that don't exist never join a line, so a separator can never lead,
   trail, or double. A line with no facts is omitted entirely by the caller.
   No fabrication, no fallback copy: the shape follows the truth.

   The v2 Gate supersedes LD1.7's chronograph fold: the movement renders
   plain ("Automatic"), and Chronograph takes its place in the complications
   line alongside its siblings, in the truthful stored order.
   ──────────────────────────────────────────────────────────────────────── */

export type FingerprintFacts = {
  caseSizeMm?: string | null;
  caseThicknessMm?: string | null;
  movementType?: string | null;
  complications?: string[] | null;
};

export type CollectorFingerprint = {
  primary: string[];
  complications: string[];
};

const clean = (v: string | null | undefined): string =>
  v == null ? "" : String(v).trim();

export function buildCollectorFingerprint(
  facts: FingerprintFacts,
  year?: string | null,
): CollectorFingerprint {
  const primary: string[] = [];

  const size = clean(facts.caseSizeMm);
  if (size) primary.push(`${size} mm case`);

  const thick = clean(facts.caseThicknessMm);
  if (thick) primary.push(`${thick} mm thick`);

  const movement = clean(facts.movementType);
  if (movement) primary.push(movement);

  const yr = clean(year);
  if (yr) primary.push(yr);

  const complications = Array.isArray(facts.complications)
    ? facts.complications.map((c) => clean(c)).filter((c) => c !== "")
    : [];

  return { primary, complications };
}
