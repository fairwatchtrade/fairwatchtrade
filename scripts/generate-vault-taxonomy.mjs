/* ════════════════════════════════════════════════════════════════════════
   VAULT TAXONOMY GENERATOR — SFX-006B

   Emits ONE deterministic static artifact from governed Vault truth so that
   Browse search and saved-search matching share a single semantic source.
   There is no second hand-maintained dictionary anywhere.

   Regenerate with:

     node scripts/generate-vault-taxonomy.mjs

   Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
   (read-only SELECTs; this script never writes to the database).

   AMBIGUITY IS RESOLVED HERE, ONCE. A normalized key that maps to more than
   one distinct governed node is emitted as `0` (ambiguous) rather than being
   dropped, so the resolver can tell "this is a known-but-ambiguous name, leave
   it as honest Text" apart from "never heard of it". 72 names genuinely
   collide between collections and families, so this is load-bearing, not
   theoretical.

   The artifact is SERVER-ONLY by ruling (v6.86 protected-alias posture): the
   curated alias corpus must not ship inside the browser bundle. The generated
   file carries a runtime guard that throws if it is ever imported into client
   code, so the boundary fails loudly instead of silently leaking.
   ════════════════════════════════════════════════════════════════════════ */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const OUT = "lib/search/server/vaultTaxonomy.generated.ts";

/* .env.local is the canonical local source; parsed by hand so the generator
   stays dependency-free beyond the Supabase client the app already ships. */
function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    let raw;
    try {
      raw = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

/* Must stay byte-identical in meaning to normalizeTaxonomyKey() in
   lib/search/taxonomy.ts. Diacritics fold so a collector can type
   "tonda metrographe" for "Tonda Métrographe". */
function norm(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

loadEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — cannot reach governed Vault truth."
  );
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

async function all(table, columns) {
  const page = 1000;
  const out = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await db
      .from(table)
      .select(columns)
      .range(from, from + page - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < page) break;
  }
  return out;
}

const brands = await all("vault_brands", "id,name,search_aliases");
const collections = await all("vault_collections", "id,brand_id,name");
const families = await all("vault_families", "id,collection_id,name");
const variants = await all("vault_variants", "id,family_id,name,search_aliases");

const brandById = new Map(brands.map((b) => [b.id, b]));
const collectionById = new Map(collections.map((c) => [c.id, c]));
const familyById = new Map(families.map((f) => [f.id, f]));

/* key → node, or the ambiguity sentinel. A node is identified by its level +
   name + owning brand, so the SAME node reached through several aliases is
   not mistaken for a collision. */
const table = new Map();

function add(key, node) {
  const k = norm(key);
  if (!k) return;
  const id = `${node.k}|${node.n}|${node.b}`;
  const prior = table.get(k);
  if (!prior) {
    table.set(k, { ...node, _id: id });
    return;
  }
  if (prior === "AMBIGUOUS" || prior._id === id) return;
  table.set(k, "AMBIGUOUS");
}

for (const b of brands) {
  const node = { k: "brand", n: b.name, b: b.name };
  add(b.name, node);
  for (const a of b.search_aliases ?? []) add(a, node);
}
for (const c of collections) {
  const brand = brandById.get(c.brand_id);
  if (!brand) continue;
  add(c.name, { k: "collection", n: c.name, b: brand.name, c: c.name });
}
for (const f of families) {
  const col = collectionById.get(f.collection_id);
  const brand = col ? brandById.get(col.brand_id) : null;
  if (!col || !brand) continue;
  add(f.name, { k: "family", n: f.name, b: brand.name, c: col.name, f: f.name });
}
for (const v of variants) {
  const fam = familyById.get(v.family_id);
  const col = fam ? collectionById.get(fam.collection_id) : null;
  const brand = col ? brandById.get(col.brand_id) : null;
  if (!fam || !col || !brand) continue;
  const node = { k: "variant", n: v.name, b: brand.name, c: col.name, f: fam.name };
  add(v.name, node);
  for (const a of v.search_aliases ?? []) add(a, node);
}

const keys = [...table.keys()].sort();
let ambiguous = 0;
let maxWords = 1;
const lines = [];
for (const k of keys) {
  const val = table.get(k);
  maxWords = Math.max(maxWords, k.split(" ").length);
  if (val === "AMBIGUOUS") {
    ambiguous += 1;
    lines.push(`  ${JSON.stringify(k)}: 0,`);
    continue;
  }
  const node = { k: val.k, n: val.n, b: val.b };
  if (val.c) node.c = val.c;
  if (val.f) node.f = val.f;
  lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(node)},`);
}

const header = `/* ════════════════════════════════════════════════════════════════════════
   GENERATED FILE — DO NOT EDIT BY HAND.

   Source of truth: the governed Vault tables (vault_brands, vault_collections,
   vault_families, vault_variants).

   Regenerate:  node scripts/generate-vault-taxonomy.mjs

   SERVER ONLY. The curated alias corpus must not ship inside the browser
   bundle (v6.86 protected-alias posture); the guard below makes that boundary
   fail loudly rather than leak silently.

   Counts at generation: ${brands.length} brands, ${collections.length} collections, ${families.length} families, ${variants.length} variants.
   Keys: ${keys.length} total, ${ambiguous} ambiguous (emitted as 0 — resolve to honest Text).
   Longest governed key: ${maxWords} words.
   ════════════════════════════════════════════════════════════════════════ */

import type { GovernedNode } from "../taxonomy.ts";

if (typeof window !== "undefined") {
  throw new Error(
    "vaultTaxonomy.generated is server-only: the governed alias corpus must not enter the browser bundle."
  );
}

/** Longest governed key, in words — the resolver's n-gram ceiling. */
export const GOVERNED_MAX_WORDS = ${maxWords};

/** Normalized key → governed node, or 0 when the name is known but ambiguous. */
export const GOVERNED_KEYS: Record<string, GovernedNode | 0> = {
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, header + lines.join("\n") + "\n};\n", "utf8");

console.log(
  `${OUT}\n  ${brands.length} brands, ${collections.length} collections, ${families.length} families, ${variants.length} variants` +
    `\n  ${keys.length} keys (${ambiguous} ambiguous), max ${maxWords} words`
);
