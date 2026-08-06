/* ────────────────────────────────────────────────────────────────────────
   VAULT SPECIFICATION UPGRADE — active contract manifest

   Binds the governing human specification to its machine-executable
   companion. The upgrade room refuses to generate candidates unless both
   bindings verify at runtime:

     1. specification bytes  → SHA-256 must equal specificationSha256
     2. schema companion     → SHA-256 of stableStringify(schema) must equal
                               schemaCompanionSha256

   A failure of either check is ACTIVE_CONTRACT_MISMATCH and blocks
   candidate generation. The human specification remains the product
   authority; the schema is its deterministic implementation.

   The schema object is passed in by the caller (the app imports the JSON;
   direct-node tests read it from disk) so this module stays importable in
   both environments.
   ──────────────────────────────────────────────────────────────────────── */

import { stableStringify } from "../canonicalize.ts";
import { sha256HexOfText } from "../hash.ts";
import type { ContractIdentity, ContractVerification } from "../types.ts";

export const VAULT_LOCK_V3_2_MANIFEST: ContractIdentity = {
  contractId: "vault-lock-v3.2",
  specificationFilename: "VAULT-LOCK-v3.2.md",
  specificationSha256:
    "fc703e8ee4d2e64beade425256a970f5abd6518acc4fd37c7ce09faa98df22d9",
  schemaCompanionSha256:
    "02e3de03cdda67c97a03dc98bb74cc723d8f109f3762b96100dad14a9034a08d",
  upgradeRuleVersion: "legacy-safe-v1",
  normalizationVersion: "normalization-v1",
  registeredOn: "2026-08-05",
  status: "active",
};

/** Verify the schema companion object against the manifest binding. */
export async function verifySchemaCompanion(
  schema: Record<string, unknown>
): Promise<ContractVerification> {
  const actual = await sha256HexOfText(stableStringify(schema));
  if (actual !== VAULT_LOCK_V3_2_MANIFEST.schemaCompanionSha256) {
    return {
      ok: false,
      code: "ACTIVE_CONTRACT_MISMATCH",
      detail: `Schema companion SHA-256 ${actual} does not match the manifest binding ${VAULT_LOCK_V3_2_MANIFEST.schemaCompanionSha256}.`,
    };
  }
  return { ok: true, identity: VAULT_LOCK_V3_2_MANIFEST };
}

/**
 * Verify the human specification bytes and the schema companion against the
 * manifest. The server page supplies the text from the governed byte
 * carrier; tests may supply altered bytes to prove blocking.
 */
export async function verifyActiveContract(
  specificationText: string,
  schema: Record<string, unknown>
): Promise<ContractVerification> {
  const specSha = await sha256HexOfText(specificationText);
  if (specSha !== VAULT_LOCK_V3_2_MANIFEST.specificationSha256) {
    return {
      ok: false,
      code: "ACTIVE_CONTRACT_MISMATCH",
      detail: `Specification SHA-256 ${specSha} does not match the manifest binding ${VAULT_LOCK_V3_2_MANIFEST.specificationSha256}.`,
    };
  }
  return verifySchemaCompanion(schema);
}
