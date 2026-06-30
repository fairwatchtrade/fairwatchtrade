/* ────────────────────────────────────────────────────────────────────────
   VAULT ENRICHMENT — scripts/enrich-vault.ts

   Standalone maintenance script. Backfills classification metadata for the
   192 brands already in vault_brands, using Gemini. NOT an app route.

   What it writes per brand:
     DIRECT (low-risk facts):
       country_of_origin, independent_status, search_aliases (jsonb)
     STAGING (judgment calls — promoted to canonical by the review tool):
       cluster_staging, region_staging, cluster_rationale_staging

   Leaves alone: cluster, region, cluster_rationale, cluster_reviewed.
   Those are owned by the /admin/vault-review tool (William approves staging→canonical).

   Idempotent: skips any brand where cluster_staging is already set, so a long
   run that dies mid-way resumes cleanly. Use --dry-run to preview first 5.

   Run:
     npx tsx scripts/enrich-vault.ts --dry-run     # preview 5, no writes
     npx tsx scripts/enrich-vault.ts               # full run, writes
     npx tsx scripts/enrich-vault.ts --limit 20    # process up to 20 (then stop)

   Env (.env.local): GEMINI_API_KEY, SUPABASE_SERVICE_ROLE_KEY,
                     NEXT_PUBLIC_SUPABASE_URL
   Canary PFC274=62 — not touched. This script never reads/writes the evaluate route.
   ──────────────────────────────────────────────────────────────────────── */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/* ── Minimal .env.local loader (no extra dependency) ─────────────────────── */
function loadEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim();
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch {
    // fall back to whatever's already in the environment
  }
}
loadEnv();

/* ── Config / flags ──────────────────────────────────────────────────────── */
const DRY_RUN = process.argv.includes("--dry-run");
const limitArg = process.argv.indexOf("--limit");
const LIMIT =
  limitArg !== -1 ? parseInt(process.argv[limitArg + 1] ?? "0", 10) : 0;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const DELAY_MS = Number(process.env.ENRICH_DELAY_MS || 1500); // rate-limit cushion

if (!GEMINI_API_KEY || !SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing env. Need GEMINI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}

// Service-role client — bypasses RLS for bulk writes. Server-side only; never ship this key.
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

/* ── Canonical vocabularies (Vault-lock v3.1, Sections 4 & 20) ───────────── */
const CLUSTERS = [
  "Japanese",
  "German",
  "British",
  "American",
  "Heritage Swiss",
  "Contemporary Independent",
  "High Complication",
  "Dress / Classic",
  "Tool / Sports",
  "Military / Pilot",
  "Dive",
  "Microbrand",
  "Jewelry Maison",
  "Experimental / Conceptual",
  "Historic / Defunct",
  "Other",
] as const;

const REGIONS = [
  "Europe",
  "Asia",
  "North America",
  "South America",
  "Oceania",
  "Africa",
  "Unknown",
] as const;

const INDEPENDENT_STATUS = [
  "independent",
  "group-owned",
  "manufacture",
  "microbrand",
  "defunct",
  "revived",
  "maison",
  "unknown",
] as const;

/* ── The prompt (credibility posture per v3.1 §18–20) ────────────────────── */
function buildPrompt(brandName: string): string {
  return `You are classifying a watch brand for a collector reference database. Return ONLY a single JSON object, no prose, no markdown, no code fences. First character "{", last character "}".

Brand: "${brandName}"

Return this exact shape:
{
  "brand": "${brandName}",
  "country_of_origin": "",
  "region": "",
  "cluster": "",
  "cluster_rationale": "",
  "independent_status": "",
  "search_aliases": []
}

RULES — accuracy over completeness. A trained collector will read this; confident wrongness is worse than an honest "Unknown".

country_of_origin: The country collectors historically associate with this brand. If you are not confident, return "Unknown". Never guess a country.

region: One of exactly: ${REGIONS.join(", ")}. Must agree with country_of_origin. "Unknown" if country is Unknown.

cluster: The single primary galaxy neighborhood. Choose exactly one of: ${CLUSTERS.join(", ")}.
- Single string, never an array.
- Country may influence cluster but is not the same as it. Do not force every Swiss brand into "Heritage Swiss". Most Japanese makers use "Japanese" unless another neighborhood is clearly stronger.
- Hybrid jewelry maisons (Cartier, Bulgari, Piaget, Chopard, Harry Winston, and similar): default "Jewelry Maison" unless watchmaking identity overwhelmingly argues otherwise.
- Architecture/conceptual brands (Richard Mille, MB&F, Ressence, Urwerk, and similar): "Experimental / Conceptual", or "Contemporary Independent" if more collector-recognizable for this specific brand.
- If uncertain, choose the most conservative, defensible neighborhood. Test: would a knowledgeable owner nod, or smirk? If smirk, pick safer.

cluster_rationale: 8–25 words. Factual, restrained. No marketing, no praise, no speculation. One sentence on why this cluster.

independent_status: Exactly one of: ${INDEPENDENT_STATUS.join(", ")}.
- independent: privately held or founder/watchmaker-led, not part of a large group.
- group-owned: owned by a major luxury group/corporate parent.
- manufacture: vertically integrated, this identity more important than ownership.
- microbrand: small modern, typically direct-to-consumer/limited.
- defunct: no longer active. revived: dormant brand relaunched. maison: jewelry house with serious watchmaking. unknown: insufficient info.

search_aliases: JSON array of strings — alternate spellings, punctuation/umlaut variants, abbreviations, collector phrasing. Empty array [] if none. Example: ["Muhle Glashutte", "Mühle Glashütte", "Muhle"].

Output ONLY the JSON object.`;
}

/* ── Gemini call ─────────────────────────────────────────────────────────── */
type Enrichment = {
  brand: string;
  country_of_origin: string;
  region: string;
  cluster: string;
  cluster_rationale: string;
  independent_status: string;
  search_aliases: string[];
};

async function callGemini(brandName: string): Promise<Enrichment> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(brandName) }] }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const text: string =
    json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const cleaned = text.replace(/```json|```/g, "").trim();
  let parsed: Enrichment;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Unparseable response for "${brandName}": ${cleaned.slice(0, 200)}`);
  }
  return parsed;
}

/* ── Validation / coercion to canonical vocab ────────────────────────────── */
function coerce<T extends readonly string[]>(
  value: string,
  allowed: T,
  fallback: T[number]
): T[number] {
  const v = (value ?? "").trim();
  const hit = allowed.find((a) => a.toLowerCase() === v.toLowerCase());
  return (hit as T[number]) ?? fallback;
}

/* ── Main ────────────────────────────────────────────────────────────────── */
async function main() {
  console.log(
    `\nVault enrichment — model=${GEMINI_MODEL} ${DRY_RUN ? "(DRY RUN — no writes)" : "(LIVE — writing)"}${LIMIT ? ` limit=${LIMIT}` : ""}\n`
  );

  // Idempotent: only brands not yet staged. Resumable across runs.
  const { data: brands, error } = await supabase
    .from("vault_brands")
    .select("id, name, cluster_staging")
    .is("cluster_staging", null)
    .order("name");

  if (error) {
    console.error("Fetch failed:", error.message);
    process.exit(1);
  }
  if (!brands || brands.length === 0) {
    console.log("Nothing to enrich — every brand already has cluster_staging. Done.");
    return;
  }

  const queue = LIMIT ? brands.slice(0, LIMIT) : DRY_RUN ? brands.slice(0, 5) : brands;
  console.log(`${brands.length} brands need enrichment. Processing ${queue.length}.\n`);

  let ok = 0;
  let fail = 0;

  for (let i = 0; i < queue.length; i++) {
    const b = queue[i];
    const tag = `[${i + 1}/${queue.length}] ${b.name}`;
    try {
      const e = await callGemini(b.name);

      const country = (e.country_of_origin || "Unknown").trim();
      const region = coerce(e.region, REGIONS, "Unknown");
      const cluster = coerce(e.cluster, CLUSTERS, "Other");
      const status = coerce(e.independent_status, INDEPENDENT_STATUS, "unknown");
      const rationale = (e.cluster_rationale || "").trim();
      const aliases = Array.isArray(e.search_aliases)
        ? e.search_aliases.filter((s) => typeof s === "string")
        : [];

      console.log(
        `${tag}\n   country=${country} | region=${region} | status=${status}\n   cluster→staging=${cluster}\n   rationale=${rationale}\n   aliases=${JSON.stringify(aliases)}`
      );

      if (!DRY_RUN) {
        const { error: upErr } = await supabase
          .from("vault_brands")
          .update({
            // direct (facts)
            country_of_origin: country,
            independent_status: status,
            search_aliases: aliases, // jsonb — real array, not stringified
            // staging (judgment — promoted by review tool)
            cluster_staging: cluster,
            region_staging: region,
            cluster_rationale_staging: rationale,
          })
          .eq("id", b.id);
        if (upErr) throw new Error(`DB write: ${upErr.message}`);
      }
      ok++;
    } catch (err) {
      fail++;
      console.error(`${tag}\n   !! ${err instanceof Error ? err.message : String(err)}`);
      // do NOT set cluster_staging on failure → stays null → retried next run
    }

    if (i < queue.length - 1) await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  console.log(
    `\nDone. ${ok} enriched, ${fail} failed${DRY_RUN ? " (dry run — nothing written)" : ""}. Failed brands keep cluster_staging=null and will retry on next run.\n`
  );
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
