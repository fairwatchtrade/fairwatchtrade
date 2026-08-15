# The Galaxy — publication model

**Read this before concluding that an ingestion "didn't work."**

It probably worked. The Galaxy is deliberately not showing it.

This file exists because the answer lives in a database view definition, which
is the last place anyone thinks to look. It has been reconstructed from
scratch more than once.

---

## The one-sentence version

> **Ingesting a brand cannot publish it. Publication is a separate, deliberate
> act, and nothing in the application performs that act today.**

---

## How the Galaxy decides what to show

The Galaxy does **not** read `vault_brands`. It reads a view:

```sql
CREATE VIEW vault_galaxy_brands AS
  SELECT id, slug, name, description, search_aliases,
         galaxy_x, galaxy_y, galaxy_z, cluster
  FROM vault_brands
  WHERE galaxy_visible;
```

There is one such view at every level of the hierarchy, and **all five filter
on `galaxy_visible`**:

| View | Source table |
|---|---|
| `vault_galaxy_brands` | `vault_brands` |
| `vault_galaxy_collections` | `vault_collections` |
| `vault_galaxy_families` | `vault_families` |
| `vault_galaxy_variants` | `vault_variants` |
| `vault_galaxy_references` | `vault_references` |

`app/vault/galaxy/page.tsx` queries the view rather than filtering the table
in application code, and that choice is load-bearing: a filter written in the
page can drift from a filter written in the phone wizard, in an admin screen,
or in a future surface. A view cannot drift from itself.

**If you add a Galaxy surface, read the view.** Do not query `vault_brands`
and add your own `WHERE`.

---

## Why a new brand does not appear

`galaxy_visible` is `DEFAULT false` on all five tables.

So every row an ingestion creates — brand, collections, families, variants,
references — lands **inert**. The ingestion script never sets the column, and
no other code path sets it either.

This is the safety property. A brand file dropped into the Vault can add 800
rows to production and change nothing a collector sees. Nothing an ingestion
does can disturb the Galaxy.

---

## The part that surprises people

**Nothing in the application ever writes `galaxy_visible`.**

Search the repository: the column appears in its migration, that migration's
rollback, and the tests. There is no admin control, no API route, no script
that turns a brand on. Publishing a brand today means running SQL by hand.

That is not an oversight to "fix" casually — the model was built deliberately
and the switch is intentionally hard to throw. But it does mean:

> The Galaxy count does not grow by ingesting. It grows only when someone
> builds, or manually performs, the publication act.

Where it lives:

- `supabase/migrations/20260803120000_galaxy_publication_model.sql`
- `supabase/rollbacks/20260803120000_galaxy_publication_model.down.sql`
- `scripts/galaxy-publication.test.sql`
- `scripts/galaxy-publication-concurrency/`

---

## The asymmetry worth knowing

An ingested-but-unpublished brand **is** usable elsewhere. The Sell brand
field reads `vault_brands` directly, with no visibility filter:

- `components/useBrandIndex.ts` → `components/BrandCombobox.tsx` (desktop)
- `app/sell/mobile/page.tsx` → the phone wizard

So a seller can list a watch under a brand that does not exist in the Galaxy
yet. That is deliberate, not a bug: recognition and publication are different
questions. A brand the platform demonstrably knows should not be refused in
the Sell field merely because nobody has decided to put a star in the sky.

`lib/brandIndex.ts` explains the recognition rules in full — most importantly
that the index is **never an admission gate**, and that aliases match but
never rewrite.

---

## Check the current state yourself

Do not trust a count written in a document — including this one. Run this:

```sql
select
 (select count(*) from vault_brands)                          as brands,
 (select count(*) from vault_brands where galaxy_visible)     as brands_visible,
 (select count(*) from vault_collections)                     as collections,
 (select count(*) from vault_collections where galaxy_visible) as collections_visible,
 (select count(*) from vault_families)                        as families,
 (select count(*) from vault_families where galaxy_visible)   as families_visible,
 (select count(*) from vault_variants)                        as variants,
 (select count(*) from vault_variants where galaxy_visible)   as variants_visible,
 (select count(*) from vault_references)                      as refs,
 (select count(*) from vault_references where galaxy_visible) as refs_visible;
```

A gap between a total and its visible count is unpublished inventory, not a
broken ingestion.

To see a specific brand's state:

```sql
select slug, name, galaxy_visible, search_aliases, country_of_origin, cluster
from vault_brands where slug = 'your-brand-slug';
```

**Snapshot at 2026-08-15**, immediately after ingesting Nivada Grenchen and
Accutron, purely as a worked example of what the gap looks like:

| Level | Total | Visible | Unpublished |
|---|---|---|---|
| Brands | 193 | 191 | 2 |
| Collections | 422 | 396 | 26 |
| Families | 620 | 579 | 41 |
| Variants | 796 | 710 | 86 |
| References | 468 | 388 | 80 |

Every unpublished number there is exactly what that one ingestion added.

---

## Ingestion, in one paragraph

Brand files are authored as Vault-lock JSON and live on Drive, not in this
repository. `scripts/ingest-vault.js` writes them into the Vault tables and
accepts named files as arguments:

```bash
node scripts/ingest-vault.js "G:/…/Some-Brand.json"
```

It **refuses any brand that already exists**. It can only create a brand from
nothing, because its inserts are not idempotent — re-running it appends a
second parallel subtree rather than updating the first, which is how Lang &
Heyne once ended up doubled. Corrective or additive work on an existing brand
needs a reconciliation path, not this script.

---

## The schema does not hold everything the files hold

Vault-lock v3.2 files carry brand facts the tables have no column for:
`revival_status`, `revival_type`, `historical_continuity`, and
collection-level `search_aliases`. These are deliberately **not** forced into
some other column — inventing a home is how facts get quietly reshaped.

The JSON files are the source of truth; these tables are a projection of them.
A field living only in the file is not lost data, it is an unextended
projection. Promote a field to a column when a surface actually reads it, in
the same flight as the feature that reads it — not before, or you inherit a
column nobody maintains.
