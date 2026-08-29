/* ════════════════════════════════════════════════════════════════════════
   TUDOR REFERENCE ADMISSION — lib/admission/tudorReference.ts

   The one narrow reader of `vault_references.metadata.fwt_admission`, and
   the only place in the product that answers:

       Is this Tudor reference admitted by FairWatchTrade?

   ── THE LAW THIS ENCODES ───────────────────────────────────────────────
   Select references deliberately, then judge the watch honestly. The
   selectivity lives HERE, at the reference level. Everything downstream —
   profile, gates, evidence — judges the individual watch and is forbidden
   from re-litigating commonness, liquidity, scarcity, or collector merit.

   ── FAIL CLOSED, EVERYWHERE ────────────────────────────────────────────
   Unknown reference, unresolved identity, ambiguous identity, missing row,
   missing metadata, malformed metadata, an unrecognized status, an
   unrecognized documentation policy, an enhanced-evidence policy without a
   single valid identifier requirement — every one of these is the SAME
   answer: { admitted: false }. Admission is never inferred from brand,
   family, popularity, price, age, or similarity. The governed ingest path
   validates authored metadata loudly before it is ever written; this
   parser still refuses quietly at read time, because data that somehow
   bypassed the door must not become admission by accident.

   ── AUTHORITY BOUNDARY ─────────────────────────────────────────────────
   This truth is CANONICAL SERVER TRUTH. A derived summary may travel to
   the client so the corridor can render, but the server re-resolves from
   the submitted identity text before accepting a submission — a browser
   can corroborate an admission, never assert one. That is the same rule
   the canonical vault link already lives by.

   The types below are plain JSON-serializable data on purpose: the derived
   summary rides a draft and an API response. This module is deliberately
   DEPENDENCY-FREE — pure data in, pure answer out — so client code and
   plain-node tests can import it without dragging a Vault client along.
   The server-side resolution that feeds it lives beside it in
   tudorReferenceResolution.ts, because reading the Vault is server work.
   ════════════════════════════════════════════════════════════════════════ */

export const TUDOR_DOCUMENTATION_POLICIES = [
  "original_required",
  "enhanced_evidence_allowed",
] as const;

export type TudorDocumentationPolicy = (typeof TUDOR_DOCUMENTATION_POLICIES)[number];

/** One physical identity marking the admitted reference requires evidence
    for — seller-entered text, plus a photograph when the policy says so. */
export type TudorIdentityRequirement = {
  key: string;
  label: string;
  photoRequired: boolean;
};

export type TudorReferenceAdmission =
  | {
      admitted: true;
      vaultReferenceId: string;
      documentationPolicy: TudorDocumentationPolicy;
      /** Present (non-empty) whenever the policy is enhanced_evidence_allowed. */
      identityEvidence: TudorIdentityRequirement[];
    }
  | { admitted: false };

export const TUDOR_NOT_ADMITTED: TudorReferenceAdmission = { admitted: false };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseIdentityRequirements(v: unknown): TudorIdentityRequirement[] | null {
  if (!isRecord(v)) return null;
  const raw = v.required_identifiers;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: TudorIdentityRequirement[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) return null;
    const key = typeof entry.key === "string" ? entry.key.trim() : "";
    const label = typeof entry.label === "string" ? entry.label.trim() : "";
    if (!key || !label) return null;
    if (typeof entry.photo_required !== "boolean") return null;
    out.push({ key, label, photoRequired: entry.photo_required });
  }
  return out;
}

/** `vault_references.metadata` → the admission answer for that reference.
 *
 *  Pure and side-effect free so the same reading can be tested exhaustively
 *  and shared by the server resolution below and the governed ingest
 *  validation. Anything short of a fully well-formed `fwt_admission`
 *  contract is NOT ADMITTED — never a throw, never a guess. */
export function parseTudorAdmission(
  metadata: unknown,
  vaultReferenceId: string
): TudorReferenceAdmission {
  if (!vaultReferenceId) return TUDOR_NOT_ADMITTED;
  if (!isRecord(metadata)) return TUDOR_NOT_ADMITTED;
  const adm = metadata.fwt_admission;
  if (!isRecord(adm)) return TUDOR_NOT_ADMITTED;
  if (adm.status !== "admitted") return TUDOR_NOT_ADMITTED;

  const policy = adm.documentation_policy;
  if (
    policy !== "original_required" &&
    policy !== "enhanced_evidence_allowed"
  ) {
    return TUDOR_NOT_ADMITTED;
  }

  if (policy === "enhanced_evidence_allowed") {
    /* An enhanced policy with no identifier requirements would be a corridor
       that demands nothing in place of papers. That is not a lenient
       admission — it is an invalid one. */
    const identityEvidence = parseIdentityRequirements(adm.identity_evidence);
    if (!identityEvidence) return TUDOR_NOT_ADMITTED;
    return {
      admitted: true,
      vaultReferenceId,
      documentationPolicy: policy,
      identityEvidence,
    };
  }

  return {
    admitted: true,
    vaultReferenceId,
    documentationPolicy: policy,
    identityEvidence: [],
  };
}

/** True when the seller-entered brand is Tudor by the dispatcher's own
    equality rule (trim + lowercase). */
export function isTudorBrand(brand: string | null | undefined): boolean {
  return (brand ?? "").trim().toLowerCase() === "tudor";
}
