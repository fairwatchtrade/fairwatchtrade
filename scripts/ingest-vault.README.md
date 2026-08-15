# Vault Ingestion

**Repo-local machinery README**  
**Intended location:** `scripts/ingest-vault.README.md`  
**Primary machinery:** `scripts/ingest-vault.js`  
**Architecture status:** Active first-ingestion path

---

## Why this README exists

Vault ingestion is simple to describe and easy to misuse.

A finalized Vault-lock v3.2 JSON file can look like “just data,” but ingestion crosses strict file validation, Vault identity hierarchy, database projection, duplicate-tree protection, alias/search behavior, downstream Sell recognition, Galaxy publication safety, first-ingestion versus existing-brand reconciliation, and post-write verification.

This README exists under the FairWatchTrade **Complex Piping Documentation Law**:

> If losing session context would require roughly 30+ minutes to rediscover how the machinery works, it earns a repo-local README beside the machinery.

This file records durable architecture properties and live-truth commands. It deliberately avoids hardcoded brand counts, row counts, line numbers, or other values that will rot.

When this README and current code disagree about mechanics, inspect the current code and update this README in the same flight.

---

# 1. Product contract

The purpose of Vault ingestion is:

```text
final, strict-valid Vault-lock v3.2 brand JSON
→ first-ingestion safety checks
→ create the brand hierarchy in the production Vault
→ preserve every supported supplied fact
→ keep unsupported supplied facts authoritative in the JSON
→ verify the resulting production tree against the source artifact
```

The hierarchy remains:

```text
Brand
→ Collection
→ Family
→ Variant / Collector Identity
→ Reference
```

Ingestion is successful only when the database projection is verified against the authoritative source file.

A successful script exit by itself is not proof.

---

# 2. The authoritative input

The input artifact is the finalized Vault-lock v3.2 JSON.

Before ingestion, the file must:

- strict-parse as JSON;
- satisfy the current Vault-lock v3.2 contract;
- not be marked `PROVISIONAL`;
- not be marked `DECISION_REQUIRED`;
- not carry another unresolved/finalization blocker;
- contain the intended Brand → Collection → Family → Variant → Reference structure;
- preserve missing data as missing rather than inventing facts.

Governing law:

> **No penalty for missing data. Only a penalty for bad data.**

The authoritative JSON may be richer than the current database projection. That is allowed.

Do not delete valid specification fields merely because the database does not yet have a destination for them.

---

# 3. What `scripts/ingest-vault.js` is

`scripts/ingest-vault.js` is the current first-ingestion path for a brand that does not already exist in the production Vault.

It may create the hierarchy and project supported Vault-lock v3.2 fields into their current database homes.

The safe mental model is:

```text
NEW brand from nothing
→ ingest-vault.js

EXISTING brand correction / addition / restructuring
→ reconciliation machinery, not ingest-vault.js
```

The distinction is permanent unless an explicitly approved architecture replaces it.

---

# 4. What this importer is NOT

## Not an existing-brand update tool

The importer refuses an existing brand.

That guard is deliberate. It exists because re-running create-oriented ingestion over an existing hierarchy can produce duplicate or partially duplicated subtrees.

Do not weaken the existing-brand guard merely to make an update “go through.”

If a brand already exists, stop and use or build the approved reconciliation path.

## Not database reconciliation

A finalized JSON file can be correct while the production database already contains an older or different representation.

Those are separate truths that require reconciliation.

Do not treat “the JSON is current” as authority to overwrite an existing production tree.

## Not Galaxy publication

Vault ingestion and Galaxy publication are intentionally separate.

A successful ingestion must not imply that the brand should immediately become visible in the Galaxy.

See the repo-local Galaxy README beside the Galaxy machinery for publication architecture.

## Not taxonomy repair

The importer should not invent hierarchy decisions while writing.

Taxonomy questions belong upstream in governed Vault-lock v3.2 / Vault Upgrade / reconciliation machinery.

---

# 5. Explicit-file execution is a safety property

The importer must support deliberate, explicit file selection.

Do not restore behavior that blindly sweeps an entire directory when the operator intends to ingest one or two finalized files.

The intended invocation shape is:

```bash
node scripts/ingest-vault.js <path-to-final-brand.json> [additional-final-brand.json ...]
```

Before relying on that syntax, re-read the current argument handling:

```bash
rg -n "process\.argv|VAULT_PATH|readdir|ingest" scripts/ingest-vault.js
```

The safety property is more important than the exact CLI spelling:

> **Only the files explicitly selected by the operator should be eligible for the run.**

If the current code no longer provides that property, stop before production ingestion and repair it.

---

# 6. Vault-lock v3.2 projection

The importer must preserve supplied facts when the production schema has a legitimate destination for them.

Current known brand-level fields with production homes include:

- `search_aliases`;
- `country_of_origin`;
- `region`;
- `independent_status`;
- `cluster`;
- `cluster_rationale`.

Do not assume this list is forever complete.

Verify the live schema:

```sql
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'vault_brands'
order by ordinal_position;
```

Inspect the current mapping in the importer:

```bash
rg -n "search_aliases|country_of_origin|region|independent_status|cluster|cluster_rationale" scripts/ingest-vault.js
```

A prior defect caused the v3.2 path to discard supplied brand aliases even though `vault_brands` had a destination for them.

Permanent lesson:

> **A field supplied by the authoritative JSON and supported by the live schema must not be silently thrown away because an old importer branch stopped reading it.**

---

# 7. Valid v3.2 data without a current database home

The authoritative JSON may contain valid Vault-lock v3.2 facts for which the current production schema has no destination.

Known examples at the time this architecture was refreshed include:

- brand-level `revival_status`;
- brand-level `revival_type`;
- brand-level `historical_continuity`;
- collection-level `search_aliases`.

These remain authoritative in the source JSON unless and until a product/schema decision gives them a durable database home.

Do not:

- invent a column ad hoc;
- stuff a field into an unrelated column;
- serialize it into arbitrary notes merely to claim “full persistence”;
- delete it from the authoritative file;
- claim ingestion persists it when it does not.

The rule is:

> **Schema expansion should be earned by a real product reader or governed data requirement, not merely by the producer having more fields.**

Re-check current table shape instead of trusting this list:

```sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'vault_brands',
    'vault_collections',
    'vault_families',
    'vault_variants',
    'vault_references'
  )
order by table_name, ordinal_position;
```

---

# 8. Galaxy publication boundary

All five Vault hierarchy levels participate in Galaxy publication state:

```text
vault_brands
vault_collections
vault_families
vault_variants
vault_references
```

The durable safety property is:

> **Newly ingested hierarchy is inert with respect to Galaxy publication unless a separate deliberate publication act changes that state.**

Do not “fix” a newly ingested brand being absent from Galaxy by changing ingestion defaults to published/visible.

Verify current database defaults:

```sql
select
  table_name,
  column_name,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'vault_brands',
    'vault_collections',
    'vault_families',
    'vault_variants',
    'vault_references'
  )
  and column_name = 'galaxy_visible'
order by table_name;
```

Verify the current Galaxy views:

```sql
select
  viewname,
  definition
from pg_views
where schemaname = 'public'
  and viewname like 'vault_galaxy_%'
order by viewname;
```

The Galaxy machinery has its own colocated README. Read it before changing publication behavior.

---

# 9. Sell recognition is intentionally different from Galaxy publication

The Sell brand field is a recognition aid, not a Galaxy publication surface.

Current architecture composes the Sell brand corpus at read time from:

```text
curated static brand floor
+
live vault_brands
→ shared brand index
→ Sell brand field
```

The shared brand-index path is currently under:

```text
lib/brandIndex.ts
```

The static floor remains useful for fast rendering / network-failure resilience, but newly ingested Vault brands should become available to the Sell recognition path without a manual frontend brand-list edit.

Verify current wiring:

```bash
rg -n "brandIndex|vault_brands|BrandCombobox|brands\.ts" app components lib
```

Do not assume an old component name or file location from memory.

## Alias behavior

Brand aliases help recognition without silently rewriting ambiguous identity.

Durable rules:

- canonical brand names win;
- aliases may resolve to a canonical brand when unambiguous;
- ambiguous alias input must not guess;
- widening recognition does not itself admit a watch for listing;
- downstream evaluator/admission rules remain separate.

A newly ingested brand may therefore be recognized by Sell while remaining unpublished in Galaxy.

That asymmetry is intentional.

---

# 10. Existing-brand quarantine

Before any write, confirm that the target brand is genuinely new.

Do not rely on one signal only.

Check the current database using canonical name, slug where used, and aliases where used.

Do not infer “new brand” merely because one exact spelling returns no result.

A useful first look is:

```sql
select
  id,
  name,
  slug,
  search_aliases,
  galaxy_visible
from vault_brands
order by name;
```

If the brand already exists in any canonical or alias form, stop.

> **Existing brand = reconciliation problem.**

Do not force the first-ingestion script past the guard.

---

# 11. The importer is not assumed atomic

Do not treat this script as an atomic reconciliation transaction.

If a production run fails after writes begin:

1. stop;
2. inspect what was actually created;
3. do not blindly rerun the same file;
4. preserve the source artifact;
5. determine whether the partial state now makes the brand “existing”;
6. use the approved repair/reconciliation path for any partial production tree;
7. do not weaken quarantine to make recovery easier.

A failed run that partially writes a brand is exactly the kind of case where “just rerun it” can make the data worse.

If atomicity is later added, update this README with the exact transaction boundary and proof.

---

# 12. Pre-ingestion procedure

For every selected finalized brand file:

## Step 1 — Re-read the file

Confirm the exact artifact being ingested. Do not ingest a similarly named older copy by accident.

## Step 2 — Strict-parse

Example:

```bash
node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); console.log('strict JSON: OK')" "<file.json>"
```

## Step 3 — Check finalization markers

Useful search:

```bash
rg -n "PROVISIONAL|DECISION_REQUIRED|CURRENT_SPEC_NO_CHANGE" "<file.json>"
```

Interpret the result according to the current Vault Upgrade / Vault-lock v3.2 contract rather than merely searching strings.

## Step 4 — Compute expected hierarchy from the source

Before writing, compute the expected:

- Collections;
- Families;
- Variants;
- References.

Also collect the exact reference identifier set.

Do not hardcode those counts into this README. They belong in run evidence for that specific artifact.

## Step 5 — Confirm brand is new

Check current production identity/name/slug/aliases.

If it exists, stop.

## Step 6 — Inspect current importer mapping if schema/spec recently changed

At minimum:

```bash
node --check scripts/ingest-vault.js
```

and:

```bash
rg -n "search_aliases|country_of_origin|region|independent_status|cluster|cluster_rationale|process\.argv" scripts/ingest-vault.js
```

## Step 7 — Run only the explicit selected files

Use the current explicit-file invocation. Do not sweep unrelated artifacts.

---

# 13. Post-ingestion verification

Never verify only against the script's own console output.

The database result must be checked independently against the source file.

For each ingested brand verify:

- exactly one intended brand identity exists;
- Collections match the source;
- Families match the source;
- Variants match the source;
- References match the source;
- exact reference identifier set has zero missing and zero extra values;
- supported supplied v3.2 brand metadata reached the correct database columns;
- aliases were preserved where supported;
- Galaxy visibility remained inert/unpublished unless a separate publication act was explicitly authorized;
- no unrelated brand subtree changed;
- no duplicate brand/tree was created.

The source JSON is the comparison authority for that run.

Use:

```text
source-derived expected set
vs.
database-derived actual set
```

Do not compare the database only to values printed by the same importer that wrote it.

---

# 14. Exact reference identifiers are a high-value checksum

Hierarchy counts can match while the wrong references are present.

Therefore exact reference identifiers should be compared set-against-set whenever references exist.

Acceptance:

```text
missing references = 0
extra references   = 0
```

Do not substitute “same count” for exact identifier equality.

---

# 15. Unrelated-mutation check

A two-brand ingestion should not mutate a third brand.

A one-brand ingestion should not mutate siblings elsewhere in the Vault.

Before and after a run, use suitable live database comparison/audit evidence to establish that unrelated trees did not move.

The durable requirement is:

> **Prove the intended brand tree changed and unrelated brand trees did not.**

---

# 16. Current downstream boundaries

After successful first ingestion:

## Sell

The new brand should be discoverable by the live brand-index path without manually editing a frontend brand array, subject to current recognition/admission architecture.

## Galaxy

The brand remains unpublished until the separate Galaxy publication machinery deliberately changes visibility state.

## Vault Upgrade

Upgrade produces/repairs current-spec artifacts. It is not an existing-brand database reconciliation tool.

## Reconciliation

Existing-brand corrections/additions require the approved reconciliation path. Do not repurpose `ingest-vault.js`.

## Enrichment

Vault Enrichment remains separate governed machinery for evidence-backed facts attached to known Vault references.

---

# 17. Live-truth recovery commands

When returning to this machinery after lost context, start here.

## Importer mechanics

```bash
node --check scripts/ingest-vault.js

rg -n "process\.argv|VAULT_PATH|readdir|already exists|quarantine|search_aliases|country_of_origin|region|independent_status|cluster|cluster_rationale" scripts/ingest-vault.js
```

## Downstream consumers

```bash
rg -n "brandIndex|vault_brands|BrandCombobox|galaxy_visible|vault_galaxy_" app components lib scripts
```

## Vault table shape

```sql
select
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'vault_brands',
    'vault_collections',
    'vault_families',
    'vault_variants',
    'vault_references'
  )
order by table_name, ordinal_position;
```

## Galaxy publication views

```sql
select
  viewname,
  definition
from pg_views
where schemaname = 'public'
  and viewname like 'vault_galaxy_%'
order by viewname;
```

## Look for newer reconciliation machinery

```bash
rg -n "reconcil|operation ledger|plan hash|approved plan|atomic apply" app lib scripts supabase
```

```sql
select
  routine_name
from information_schema.routines
where routine_schema = 'public'
  and (
    routine_name ilike '%vault%'
    or routine_name ilike '%reconcil%'
  )
order by routine_name;
```

If these commands reveal architecture materially different from this README, read the current implementation and update this file before relying on the old description.

---

# 18. What is durable and what can age

## Durable

These are architecture/safety properties and should not change casually:

- ingestion is distinct from Galaxy publication;
- ingestion is distinct from existing-brand reconciliation;
- authoritative JSON may be richer than the database projection;
- supported supplied facts must not be silently discarded;
- unsupported facts remain authoritative in the source artifact;
- the first-ingestion guard protects against duplicate-tree creation;
- explicit file selection is safer than broad directory sweeping;
- post-write proof must compare the database to the source artifact;
- exact reference-set equality is stronger proof than matching counts;
- Sell recognition and Galaxy publication answer different questions.

## Can age

These must be verified live:

- exact schema columns;
- exact CLI argument syntax;
- exact importer implementation;
- exact unsupported v3.2 fields;
- current downstream component/file names;
- current RLS;
- current reconciliation machinery;
- current Galaxy publication writer/control;
- exact brand/tree counts.

Never preserve a current count as architecture.

---

# 19. README maintenance law

Update this file in the same flight whenever any of these change:

- `scripts/ingest-vault.js` invocation semantics;
- first-ingestion guard behavior;
- importer atomicity;
- Vault-lock v3.2 field mapping;
- database destinations for current v3.2 fields;
- explicit-file selection behavior;
- existing-brand reconciliation architecture;
- Galaxy publication boundary;
- Sell brand-index behavior;
- alias resolution behavior;
- post-ingestion verification procedure;
- a newly discovered failure mode changes safe operating procedure.

When adding a current implementation detail, label it as something that may age.

When preserving a safety property, explain why it exists.

The point of this README is not to make Vault ingestion look simple.

The point is to make sure the next person can ingest a finalized new brand safely without reconstructing the entire pipeline from chat history.
