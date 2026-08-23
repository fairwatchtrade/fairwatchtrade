# Canonical Watch Identity

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
