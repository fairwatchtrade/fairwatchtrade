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
    search_aliases: isNewFormat ? [] : (data.search_aliases || []),
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

  console.log(`\n📍 Ingesting: ${brand.name}`);

  const { data: brandRow, error: brandError } = await supabase
    .from('vault_brands')
    .upsert({
      slug: brand.slug,
      name: brand.name,
      description: brand.description,
      search_aliases: brand.search_aliases,
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

  console.log(`Found ${files.length} JSON files to ingest\n`);

  let success = 0;
  let failed = 0;

  for (const file of files) {
    const filePath = path.join(VAULT_PATH, file);
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
