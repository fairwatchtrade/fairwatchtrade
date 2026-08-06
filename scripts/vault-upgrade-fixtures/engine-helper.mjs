/* Shared loader for vault-upgrade direct-node tests: builds the production
   engine from the real spec byte carrier, real schema companion, and real
   manifest verification — the exact code path the room runs. */
import { readFileSync } from "node:fs";

export async function loadEngine() {
  const { verifyActiveContract, VAULT_LOCK_V3_2_MANIFEST } = await import(
    "../../lib/vault-upgrade/contracts/vault-lock-v3.2.manifest.ts"
  );
  const { VAULT_LOCK_V3_2_TEXT } = await import(
    "../../lib/vault-upgrade/contracts/vault-lock-v3.2.spec-bytes.ts"
  );
  const { createUpgradeEngine } = await import(
    "../../lib/vault-upgrade/analyze.ts"
  );
  const schema = JSON.parse(
    readFileSync(
      new URL(
        "../../lib/vault-upgrade/contracts/vault-lock-v3.2.schema.json",
        import.meta.url
      ),
      "utf8"
    )
  );
  const contract = await verifyActiveContract(VAULT_LOCK_V3_2_TEXT, schema);
  if (!contract.ok) {
    throw new Error(`Active contract failed verification: ${contract.detail}`);
  }
  return {
    engine: createUpgradeEngine(schema, contract),
    contract,
    schema,
    specText: VAULT_LOCK_V3_2_TEXT,
    manifest: VAULT_LOCK_V3_2_MANIFEST,
    verifyActiveContract,
    createUpgradeEngine,
  };
}

export function fixtureBytes(name) {
  return readFileSync(new URL(`./${name}`, import.meta.url));
}

export function fixtureJson(name) {
  return JSON.parse(fixtureBytes(name).toString("utf8"));
}

export const encode = (value) =>
  new TextEncoder().encode(
    typeof value === "string" ? value : JSON.stringify(value)
  );
