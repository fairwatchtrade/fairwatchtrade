# Watch Identity

Two separate questions live in this folder, and conflating them is how
provenance gets destroyed.

| Question | Column | Round |
|---|---|---|
| **What kind of watch is this?** | `listings.vault_reference_id` | 06A |
| **Which physical object is this listing about?** | `listings.physical_watch_id` | 06B |

Neither is derived from the other, and neither ever may be. Two listings can
share a `vault_reference_id` (same model) while being two entirely different
objects — that is the normal case, not an edge case.

---

# Part 1 — Canonical Watch Identity (06A)

**Manufacturer reference text is not canonical listing identity.**

That sentence is the whole reason this folder's canonical-identity machinery
exists. `listings.reference` is a string a seller typed into a form. It is
evidence. It is not an answer, it is not unique, and nothing may treat it as
the identity of a watch.

`listings.vault_reference_id` is the answer: the one governed
`vault_references` row this listing has been determined to be.

---

## The question this answers — and the one it does not

| Question | Answered here? |
|---|---|
| **What kind of watch is this?** | Yes. That is the entire scope. |
| **Which exact physical watch is this?** | **No.** Deliberately not built. |

Two listings of the same reference legitimately carry the **same**
`vault_reference_id` while remaining **completely independent physical
objects**. That is the acceptance law of this seam, and it is why the column
has no unique constraint and never should.

Physical-watch identity, serial/case/movement numbers, sensitive-identifier
governance, same-watch matching, dedupe, merge/split, transfer events and
Passport history are all **outside** this machinery. None of them is
introduced by it, and none of them can be inferred from it. A canonical link
says "this is a Datograph." It says nothing whatsoever about *which*
Datograph.

---

## Where the behaviour actually lives

This is the part that costs hours if it is not written down.

| Behaviour | Lives in | Not in |
|---|---|---|
| What counts as "the same reference" | `canonicalIdentity.ts` → `referenceCompareKey` | any route |
| What counts as "the same brand" | `normalizeBrand` in `lib/brandIndex.ts`, reused | a second normalizer |
| Whether a resolution is allowed | `canonicalReferenceResolver.ts` → `resolveCanonicalReference` | the client |
| **What actually gets written** | `resolveCanonicalForPersistence`, called from `app/api/listings/route.ts` | anything the browser sent |
| Staleness detection | `canonicalIdentityKey` stored on the draft as `vaultReferenceKey` | a timestamp or a diff |
| Correction | `app/api/admin/listings/[id]/canonical-reference` + `components/CanonicalReferenceControl.tsx` | Marketplace Control |

**The single most important line:** the value the browser sends is never
trusted as an assertion. The publication route re-resolves from the submitted
identity text and writes **its own** answer. A supplied id is compared and
reported, never obeyed. You can delete the client-side resolution entirely and
the persisted data is unchanged — that is by design.

---

## The three states, and why there is no fourth

```
exactly one candidate   → resolved
zero candidates         → no_match   → NULL
more than one candidate → ambiguous  → NULL
```

`vault_references.reference` is **not unique** and a real duplicate already
exists in the corpus — two rows share `90-002` under the same brand, the same
collection and the same family, differing only by variant. They are two
different watches the Vault deliberately distinguishes.

Collapsing them because their text matches is exactly the failure the **Exact
Identifier Search Law** names: a near match presented as the found object. So
ambiguity resolves to NULL — never "the first one", never "the closest", never
a score.

**Unknown is an honest answer.** A null link costs nothing. A wrong one
silently files a watch under another watch's identity, and nothing downstream
would ever see the seam where it went wrong.

### Why the reference normalizer is deliberately timid

Brand text is normalized aggressively (case, accents, punctuation, spaces) —
a maker's identity does not live in its hyphen.

A reference is the opposite. One changed character can identify a different
case material, dial, movement, generation, or market. So reference
normalization does exactly two things — collapses whitespace, compares without
case — and **nothing else**. No punctuation stripping, no separator folding.

Widening that normalizer widens what the platform will silently call the same
watch. That is a founder ruling, not a refactor.

---

## What is deliberately NOT built

- **No backfill.** Of the listings that existed when this shipped, exactly one
  resolved deterministically. The rest genuinely have no unambiguous canonical
  answer. Guessing them by fuzzy text would manufacture identity the platform
  has not earned — and afterwards it would be indistinguishable from identity
  it had. Historical rows are corrected by a human or not at all.
- **No read-model migration.** Browse, filters, Listing Detail, Watch DNA,
  evidence snapshots and purchase-request snapshots all still read the text
  columns. This round establishes the pointer and populates it responsibly;
  consuming it is a later decision.
- **No uniqueness cleanup** on `vault_references.reference`. The duplicate is
  correct data.
- **No seller UI.** The seller is never told whether their watch resolved.
  Resolution is silent enrichment — it never blocks, warns, scores, or
  congratulates. An unresolved watch is an ordinary watch.
- **No alias widening.** `vault_brands.search_aliases` is knowingly ambiguous
  in both directions (`TAG Heuer` is recorded as an alias of `Heuer`). Aliases
  resolve upstream in the Sell Flow's brand field; they are not permitted to
  widen identity matching here.
- **No seller UPDATE grant.** `authenticated` can INSERT the column and cannot
  UPDATE it. Once created, canonical identity is a founder correction.

---

## Two systems that are not this one

**`/api/validate-reference`** is advisory plausibility. Model-mediated, fails
open, renders silence when content, and has no idea what the Vault contains.
It shares a moment in the Sell Flow with canonical resolution and shares
nothing else — separate route, separate cache, separate timer, separate
sequence guard. That separation is structural on purpose: the day they merge
is the day an opinion starts minting identity.

**`lib/research/resolveListingReference.ts`** is the human-reviewed identity
resolution domain. It returns a reference id only when a founder has recorded
a current, fingerprint-valid `exact` decision. It is a *review* system with a
much higher bar; this is a *deterministic* seam with a much narrower claim.
Neither reads the other, and neither writes the other's storage.

---

## Verifying current state

```sql
-- how many listings carry canonical identity
select count(*) filter (where vault_reference_id is not null) as linked,
       count(*) as total
  from public.listings;

-- the FK is SET NULL, not CASCADE ('n' = set null)
select conname, confdeltype from pg_constraint
 where conname = 'listings_vault_reference_id_fkey';

-- references that CANNOT resolve automatically (the ambiguity set)
select lower(trim(reference)) as ref, count(*)
  from public.vault_references
 where reference is not null and trim(reference) <> ''
 group by 1 having count(*) > 1;

-- what a given listing's text would resolve to today
select l.id, l.brand, l.reference, count(r.id) as candidates
  from public.listings l
  left join public.vault_references r
    on lower(trim(r.reference)) = lower(trim(l.reference))
  group by l.id, l.brand, l.reference
 having count(r.id) <> 1;
```

Founder correction lives at `/admin/listings/[id]`, in the **Canonical
identity** panel directly beneath the review header.

---

# Part 2 — Physical Object Identity (06B)

**A listing row is not the physical watch.**

A listing is one chapter: a moment when someone offered an object for sale.
The object outlives the chapter. `listings.physical_watch_id` points at the
object; the listing is a thing said *about* it.

`public.physical_watches` holds exactly two columns — `id` and `created_at`.
No reference, brand, serial, case number, movement number, owner, status,
matching metadata, merge fields, or Passport fields. It is an opaque bead to
hang history on, not a description of a watch. Every attribute is a later
round's decision, and a column added early becomes a column something starts
trusting early.

## The law this round is built around

> **False split is repairable later. False merge corrupts provenance.**

So 06B mints **one fresh object identity per listing row** and refuses to
decide anything else. Every listing that existed at migration time got its
own. No grouping by reference, seller, brand, images, provenance, text
similarity, or inference of any kind.

That deliberately creates false splits — the same watch relisted is currently
two object records. That is the correct error to make. Merging two records
later is a governed decision with evidence behind it; un-merging two
histories that were wrongly fused is not really possible.

**06B does not answer "are these two listings the same physical watch?"**
That question, and any mechanism for sharing an identity between listings,
belongs to a later round. Nothing here may assign one listing's object
identity to another.

## Where the mint actually lives — read before editing any route

**The mint is a column DEFAULT, not application code.** Nothing in the
TypeScript writes `physical_watch_id`, and nothing should start.

```sql
alter table public.listings
  alter column physical_watch_id set default public.mint_physical_watch();
```

This is not cleverness. There are two listing-creation seams:

| Seam | Where the row is actually inserted |
|---|---|
| Sell Flow + Private Listing | `app/api/listings/route.ts` |
| Dealer materialization | inside `dealer_accelerator_materialize_item_draft` — a `security definer` SQL function |

The second one inserts listing, media, item status and lifecycle event in
**one transaction that application code cannot join.** A TypeScript mint
there would be a second round trip that could succeed while the listing
failed, or fail while the listing succeeded — exactly the non-atomicity this
round forbids.

A DEFAULT is evaluated per row inside whatever transaction is doing the
INSERT. So it is atomic at *both* seams for free, it fires for any future
creation path nobody has thought of yet, and it cannot be forgotten.

It also makes the negative guarantee **structural rather than a promise**:
`mint_physical_watch()` takes no arguments and can only INSERT and return a
brand-new id. There is no expression anywhere in this round capable of
handing one listing another listing's object identity.

## Same-row lifecycle needs no code

A DEFAULT does not fire on UPDATE. So edit, reject-then-resubmit,
remove-then-restore, and every status transition preserve the object identity
with **no guard, no trigger, and no application logic**. The behaviour falls
out of the mechanism rather than being defended by it.

The idempotent retry branches in the listings route return an *existing*
listing rather than inserting, so they cannot re-mint either.

## Why ON DELETE RESTRICT, when 06A uses SET NULL

Opposite kinds of fact, opposite answers.

- **Taxonomy** may legitimately be reclassified or removed. A listing that
  loses its classification is merely unclassified → `SET NULL`.
- **Object identity** is durable infrastructure. Severing it silently would
  destroy the continuity every later round depends on → `RESTRICT`.

Ordinary lifecycle must not be able to delete an object identity out from
under a listing. Retirement, merge and split semantics belong to a governed
later round that can reason about provenance. Until that exists, the database
simply refuses.

## What is deliberately NOT built

- **No unique constraint** on `physical_watch_id`. Uniqueness would
  permanently forbid two listings from ever sharing an object — and a later
  round exists precisely to allow that when evidence earns it. The absence of
  this constraint is a decision, not an omission.
- **No sharing or matching mechanism** of any kind.
- **No sensitive identifiers** — no serial, case, or movement numbers. That
  is a separate round with its own governance.
- **No UI, anywhere.** Not Sell Flow, not Listing Detail, not Founder Review.
  Opaque ids are not for human interpretation in this round.
- **No Passport behaviour**, no transfer events, no history accumulation.
- **No read access for client roles.** `physical_watches` has RLS enabled
  with no policy, and `anon`/`authenticated` have no grants. Referential
  integrity checks are exempt from RLS, so the foreign key still validates.

## Verifying current state

```sql
-- every listing carries its own object identity, and no two share one
select count(*) as listings,
       count(physical_watch_id) as populated,
       count(distinct physical_watch_id) as distinct_objects
  from public.listings;

-- the mint is attached where it belongs
select pg_get_expr(d.adbin, d.adrelid)
  from pg_attrdef d
  join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
 where d.adrelid = 'public.listings'::regclass and a.attname = 'physical_watch_id';

-- the FK refuses parent deletion ('r' = restrict)
select conname, confdeltype from pg_constraint
 where conname = 'listings_physical_watch_id_fkey';

-- nothing but the mint can produce a value for the column
select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prosrc ilike '%physical_watch_id%';
```
