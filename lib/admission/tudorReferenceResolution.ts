import {
  resolveCanonicalReference,
  vaultReferenceMetadata,
} from "../identity/canonicalReferenceResolver.ts";
import type { CanonicalIdentityContext } from "@/lib/identity/canonicalIdentity";
import {
  parseTudorAdmission,
  TUDOR_NOT_ADMITTED,
  type TudorReferenceAdmission,
} from "./tudorReference.ts";

/* ════════════════════════════════════════════════════════════════════════
   TUDOR REFERENCE ADMISSION — server resolution

   Split from the parser on purpose: tudorReference.ts is pure data-in,
   answer-out, importable by client code and plain-node tests alike. THIS
   file is the half that reads the Vault, so it lives with the server.

   It reuses the exact existing Watch Identity seam — the same
   deterministic resolver the canonical link uses, with the same refusals:
   no_match and ambiguous are both simply not admitted. A Vault read
   failure is not admitted either. Unlike the canonical link, which is an
   enrichment that must never cost a publication, admission IS a gate —
   and a gate that cannot read its authority stays shut.
   ════════════════════════════════════════════════════════════════════════ */

export async function resolveTudorReferenceAdmission(
  ctx: CanonicalIdentityContext
): Promise<TudorReferenceAdmission> {
  try {
    const resolution = await resolveCanonicalReference(ctx);
    if (resolution.status !== "resolved" || !resolution.vaultReferenceId) {
      return TUDOR_NOT_ADMITTED;
    }
    const metadata = await vaultReferenceMetadata(resolution.vaultReferenceId);
    return parseTudorAdmission(metadata, resolution.vaultReferenceId);
  } catch {
    return TUDOR_NOT_ADMITTED;
  }
}
