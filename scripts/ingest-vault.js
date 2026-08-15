#!/usr/bin/env node

/**
 * FairWatchTrade Vault Ingestion Script v2
 * Handles both old and new JSON formats, skips bad files, 
 * gracefully handles missing names.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const { createClient } = require('@supabase/supabase-js');

const VAULT_PATH = 'G:/My Drive/Fairwatchtrade Vault GD/FairWatchTrade-Vault-Lab/brands';

const SKIP_FILES = [
  'vault-lock_backup(no descriptions).md',
  'vault-lock-summary.txt',
  'vault-prompt-snippets.txt',
  'Vault-progress.txt',
  'Vault-lock.md',
  'PANERAI.txt',
  'Hajime .json',
  'Asaoka.json',
  'Masahiro .json',
];

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeBrand(data, filename) {
  const isNewFormat = !!data.Brand;
  let name = isNewFormat ? data.Brand : data.name;

  // Fallback: derive name from filename
  if (!name) {
    name = filename
      .replace('.json', '')
      .replace(/-/g, ' ')
      .replace(/_/g, ' ')
      .trim();
  }

  const collections = isNewFormat
    ? (data.Collections || [])
    : (data.collections || []);

  return {
    name,
    slug: slugify(name),
    description: data.description || null,
    /* v3.2 CARRY (2026-08-15). This read `isNewFormat ? [] : ...`, so a
       Vault-lock v3.2 file — the only format the Upgrade room now produces —
       had its brand aliases thrown away at the door. Nivada Grenchen would
       have entered the Vault unreachable by "Nivada" or "Croton Nivada
       Grenchen"; Accutron unreachable by "Bulova Accutron". The column
       exists, the file supplies the values, and the search law depends on
       them. Both shapes are read now; neither is invented. */
    search_aliases: data.search_aliases || [],
    /* The remaining v3.2 brand facts that have a home in vault_brands.
       Absent keys stay null — no penalty for missing data. Fields the
       schema cannot hold (revival_status, revival_type,
       historical_continuity) are deliberately NOT forced somewhere they
       do not belong; they remain in the authoritative file. */
    country_of_origin: data.country_of_origin || null,
    region: data.region || null,
    independent_status: data.independent_status || null,
    cluster: data.cluster || null,
    cluster_rationale: data.cluster_rationale || null,
    collections,
  };
}

function normalizeCollection(coll) {
  const isNewFormat = !!coll.Families;
  return {
    name: coll.name || coll.Name || null,
    families: isNewFormat ? (coll.Families || []) : (coll.families || []),
  };
}

function normalizeFamily(fam) {
  const isNewFormat = !!fam.Variants;
  return {
    name: fam.name || fam.Name || null,
    variants: isNewFormat ? (fam.Variants || []) : (fam.variants || []),
  };
}
function normalizeVariant(variant) {
  return {
    name: variant.name || 'Unknown Variant',
    description: variant.description || null,
    search_aliases: variant.search_aliases || [],
    notes: variant.notes || null,
    references: variant.references || [],
  };
}

async function ingestBrand(brandData, filename) {
  const brand = normalizeBrand(brandData, filename);

  if (!brand.name) {
    console.log(`  ⚠️  Skipping ${filename} — no brand name found`);
    return;
  }

  /* ══════════════════════════════════════════════════════════════════════
     QUARANTINE — EXISTING BRANDS ARE REFUSED
     ══════════════════════════════════════════════════════════════════════
     This script upserts vault_brands by slug but uses plain INSERT for
     collections, families, variants and references. Re-running it on a
     brand that already exists therefore APPENDS a second, parallel subtree
     instead of matching the first. That is not a hypothetical: Lang & Heyne
     was ingested twice and carried two identical "Complications" and two
     identical "Time-Only" collections in production until Flight A
     (v3.4) removed them.

     The v3.4 uniqueness indexes now make exact duplication fail — but they
     do NOT make this script safe, and the difference matters:

       · it is NOT atomic. A failure partway leaves whatever it already
         inserted behind, so a refused run can still dirty the database;
       · the indexes match exact stored text, so "Complications " or
         "complications" would still slip past them;
       · it cannot express a genuinely additive update — its only verb is
         "insert everything again";
       · it bypasses manifests, reconciliation, plan approval and audit
         entirely. Nothing it does is reviewable after the fact.

     A loud failure halfway through an unreviewable non-atomic script is
     not a safety property. So the refusal happens HERE, before any write.

     First ingestion of a genuinely new brand is still permitted — that is
     the one case this script handles correctly.

     Removing this guard requires the reconciliation engine described in
     the Discovery → Certification → Deterministic Writer architecture, not
     a judgement call at the console.
     ══════════════════════════════════════════════════════════════════════ */
  const { data: existing, error: existingError } = await supabase
    .from('vault_brands')
    .select('id, name')
    .eq('slug', brand.slug)
    .maybeSingle();

  if (existingError) {
    console.error(`  ❌ Could not check for an existing brand: ${existingError.message}`);
    console.error(`     Refusing to proceed — an unverified insert could duplicate a subtree.`);
    return;
  }

  if (existing) {
    console.error(`\n  ⛔ REFUSED: "${brand.name}" already exists in the Vault (slug: ${brand.slug}).`);
    console.error(`     This script can only create a brand from nothing. Re-running it on an`);
    console.error(`     existing brand appends a duplicate subtree rather than updating it —`);
    console.error(`     exactly how Lang & Heyne ended up doubled.`);
    console.error(`     Use the reconciliation engine for additive or corrective work.`);
    return;
  }

  console.log(`\n📍 Ingesting: ${brand.name}`);

  const { data: brandRow, error: brandError } = await supabase
    .from('vault_brands')
    .upsert({
      slug: brand.slug,
      name: brand.name,
      description: brand.description,
      search_aliases: brand.search_aliases,
      country_of_origin: brand.country_of_origin,
      region: brand.region,
      independent_status: brand.independent_status,
      cluster: brand.cluster,
      cluster_rationale: brand.cluster_rationale,
    }, { onConflict: 'slug' })
    .select('id')
    .single();

  if (brandError) {
    console.error(`  ❌ Brand error: ${brandError.message}`);
    return;
  }

  const brandId = brandRow.id;
  const collections = brand.collections || [];

  for (let ci = 0; ci < collections.length; ci++) {
    const collNorm = normalizeCollection(collections[ci]);

    if (!collNorm.name) {
      console.log(`  ⚠️  Skipping collection with no name`);
      continue;
    }

    const { data: collRow, error: collError } = await supabase
      .from('vault_collections')
      .insert({
        brand_id: brandId,
        name: collNorm.name,
        sort_order: ci,
      })
      .select('id')
      .single();

    if (collError) {
      console.error(`  ❌ Collection error (${collNorm.name}): ${collError.message}`);
      continue;
    }

    const collId = collRow.id;
    const families = collNorm.families || [];

    for (let fi = 0; fi < families.length; fi++) {
      const famNorm = normalizeFamily(families[fi]);

      if (!famNorm.name) {
        console.log(`  ⚠️  Skipping family with no name`);
        continue;
      }

      const { data: famRow, error: famError } = await supabase
        .from('vault_families')
        .insert({
          collection_id: collId,
          name: famNorm.name,
          sort_order: fi,
        })
        .select('id')
        .single();

      if (famError) {
        console.error(`  ❌ Family error (${famNorm.name}): ${famError.message}`);
        continue;
      }

      const famId = famRow.id;
      const variants = famNorm.variants || [];

      for (let vi = 0; vi < variants.length; vi++) {
        const varNorm = normalizeVariant(variants[vi]);

        const { data: varRow, error: varError } = await supabase
          .from('vault_variants')
          .insert({
            family_id: famId,
            name: varNorm.name,
            description: varNorm.description,
            search_aliases: varNorm.search_aliases,
            notes: varNorm.notes,
            sort_order: vi,
          })
          .select('id')
          .single();

        if (varError) {
          console.error(`  ❌ Variant error (${varNorm.name}): ${varError.message}`);
          continue;
        }

        const varId = varRow.id;
        const references = varNorm.references || [];

        for (let ri = 0; ri < references.length; ri++) {
          const ref = references[ri];
          let refData = {};

          if (typeof ref === 'string') {
            refData = { reference: ref };
          } else if (typeof ref === 'object' && ref !== null && ref.reference) {
            refData = {
              reference: ref.reference,
              metadata: {
                dial: ref.dial || null,
                case_material: ref.case || ref.case_material || null,
                movement: ref.movement || null,
                notes: ref.notes || null,
              }
            };
          }

          if (refData.reference) {
            await supabase
              .from('vault_references')
              .insert({
                variant_id: varId,
                reference: refData.reference,
                metadata: refData.metadata || {},
                sort_order: ri,
              });
          }
        }
      }
    }
    console.log(`  ✓ ${collNorm.name} (${families.length} families)`);
  }

  console.log(`  ✅ ${brand.name} complete`);
}

async function main() {
  console.log('🌌 FairWatchTrade Vault Ingestion v2');
  console.log('=====================================');
  console.log(`📁 Reading from: ${VAULT_PATH}\n`);

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Missing env vars in .env.local');
    process.exit(1);
  }

  /* Named files may be passed as arguments:
       node scripts/ingest-vault.js "G:/…/Accutron.json"
     Brand files no longer all live in one folder — later batches arrive in
     their own dated directories — and a whole-folder sweep is the wrong
     instrument when the task names its inputs. With no arguments the
     original folder scan is unchanged. */
  const named = process.argv.slice(2).filter((a) => a.endsWith('.json'));

  let entries;
  if (named.length) {
    entries = named.map((p) => ({ file: path.basename(p), filePath: p }));
    console.log(`Named files: ${entries.length}`);
    for (const e of entries) console.log(`  · ${e.filePath}`);
    console.log('');
  } else {
    let files;
    try {
      files = fs.readdirSync(VAULT_PATH).filter(f => {
        if (!f.endsWith('.json')) return false;
        if (SKIP_FILES.includes(f)) return false;
        return true;
      });
    } catch (err) {
      console.error(`❌ Cannot read vault folder: ${err.message}`);
      process.exit(1);
    }
    entries = files.map((f) => ({ file: f, filePath: path.join(VAULT_PATH, f) }));
    console.log(`Found ${entries.length} JSON files to ingest\n`);
  }

  let success = 0;
  let failed = 0;

  for (const { file, filePath } of entries) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);
      await ingestBrand(data, file);
      success++;
    } catch (err) {
      console.error(`❌ Failed to process ${file}: ${err.message}`);
      failed++;
    }
  }

  console.log('\n=====================================');
  console.log(`✅ Complete: ${success} brands ingested`);
  if (failed > 0) console.log(`⚠️  Issues: ${failed} brands had problems`);
  console.log('🌌 Vault is ready for the Galaxy');
}

main().catch(console.error);
