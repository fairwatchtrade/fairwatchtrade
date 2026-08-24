# Watch Identity

Two separate questions live in this folder, and conflating them is how
provenance gets destroyed.

| Question | Column | Round |
|---|---|---|
| **What kind of watch is this?** | `listings.vault_reference_id` | 06A |
| **Which physical object is this listing about?** | `listings.physical_watch_id` | 06B |
| **What markings has that object been observed to carry?** | `physical_watch_identifier_observations` | 06C |

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

---

# Part 3 — Sensitive Identifier Contract (06C)

**A serial number is evidence ABOUT a physical watch. It is not the watch's
identity, and it is not a column on a listing.**

So there is no serial column on `listings` and none on `physical_watches`.
There is an *observation*: someone, at some time, from some source, said this
object carried this marking. Everything below follows from that framing.

## What this round refuses to conclude

Nothing. 06C establishes how identifier evidence may be represented,
protected, sourced, retained and accessed. It contains **no same-watch
conclusion anywhere** — no matching, no dedupe, no merge, no link. Two
contradictory observations about one watch may coexist indefinitely and both
stand. Deciding what equal tokens *mean* is a later governed round with its
own evidence and its own resolution states.

## Token-only, and what that costs

The equality token is a **keyed one-way construction** (HMAC-SHA256 over a
domain-separated message), computed in the application, never in the
database.

It is deliberately **not** `SHA256(serial)`. A watch serial is a low-entropy
secret — six to ten alphanumeric characters. An unkeyed digest of that space
is enumerable in minutes, so it would store the identifiers in all but name
while looking like protection.

The message is:

```
fwt.identifier | k<keyVersion> | n<normalizationVersion> | <identifierType> | <normalized>
```

Identifier type is **inside the domain**, so the same characters seen as a
serial and as a case number are different evidence and can never collide into
one match. Both versions are inside it too, so tokens from different
generations are never silently compared.

### The key-evolution law — read before rotating anything

V1 stores no recoverable raw value. That safety property has a permanent
cost:

> **A rotated key cannot re-tokenize history. There is nothing to
> re-tokenize from.**

Therefore every observation persists `token_key_version`, and **old key
material must be retained, not destroyed**. Destroying an old key does not
"retire" it — it permanently blinds the platform to every observation written
under it. A future rotation must either keep old generations available for
comparison, or explicitly accept that those observations become
non-comparable. This is a contract requirement, not a key-management
subsystem.

Keys live in versioned environment variables (`IDENTIFIER_TOKEN_KEY_V<n>`), so
a rotation **adds** a variable rather than overwriting the one history depends
on. A missing key **refuses the write** — there is no unkeyed fallback,
because a weak token is indistinguishable from a real one once it is in the
table and cannot be recomputed afterwards.

## Normalization, and what is deliberately not folded

Versioned (`normalization_version`), centralized in
`identifierNormalization.ts`, and frozen per version — to change the rules you
**add** a version, never edit one.

v1 folds **whitespace, case, and Unicode compatibility forms**, because all
three are transcription noise: an engraver's spacing, someone's shift key, a
different keyboard.

v1 does **not** fold:

- **punctuation** — a hyphen or dot may be part of the manufacturer's scheme,
  and dropping it could fuse two real identifiers into one token;
- **visually confusable characters** — O/0, I/1, S/5, B/8 stay distinct. It is
  tempting to fold them, because transcription errors are real. But a fold
  that fixes a typo also merges two genuine identifiers in the same stroke —
  undetectably, since no raw value is retained to audit against. Transcription
  error is a matching problem with evidence behind it, and it belongs to a
  later round.

All four identifier types share one rule in v1. That is a decision, not an
oversight: they are all human transcriptions of markings on an object. A class
that later proves to need different handling earns its own version.

## Append-only supersession, and what `current` means

A correction never overwrites. It inserts a new row pointing at what it
supersedes, keeps the chain root, and flips the prior row's currentness. The
prior row's token, provenance and timestamps are never rewritten.

> **`is_current` means "not superseded within THIS chain."** It does **not**
> mean FairWatchTrade has declared this the one true identifier for the watch.

Several unsuperseded, contradictory observations of the same identifier type
may coexist. One current head per *chain* is enforced; the number of chains
per watch is deliberately unlimited.

## Equality tokens are evidence, never a merge constraint

**There is no UNIQUE index on `equality_token`, on purpose.** It is the single
most important constraint decision in the schema. Uniqueness would turn the
database into a matching engine — it would either refuse the second
observation of a genuine duplicate, or imply that two watches sharing a token
must be one watch. Both are conclusions, and conclusions belong to a later
round. Lookup uses a **non-unique** index scoped by identifier type +
normalization version + key version + token.

## Two timestamps, deliberately

- `observed_at` — when somebody actually looked at the watch. Nullable.
- `recorded_at` — when this platform learned of it.

Historical evidence is recorded long after it was observed. Collapsing these
would silently backdate the record or forward-date the observation.

## Retention: evidence belongs to the object

- **Listing deletion** does not touch observations — they are keyed to
  `physical_watch_id`, and nothing links them to a listing.
- **Account deletion** detaches the submitter (`source_actor_id` and
  `recorded_by` are `ON DELETE SET NULL`) without destroying the evidence.
- **The physical watch cannot be deleted** while evidence references it
  (`ON DELETE RESTRICT`).

Legal retention duration is deliberately not invented here.

## Access: structurally denied, not filtered

| Audience | May see |
|---|---|
| Public / buyer / external AI | **nothing** — no raw, no token, no masked value, not even an existence bit |
| Seller | existence-only state, if a later round adds it. No token, no raw. |
| Verifier / dealer | no standing raw access; any future access must be case-scoped and governed |
| Founder / service | metadata and provenance. **No recoverable raw exists in V1.** |

RLS is enabled with **zero policies** and `anon`/`authenticated` hold no
privilege at all, so this is structural rather than a query that remembers to
filter. The write RPC is executable only by `service_role`.

If protected raw storage is ever enabled, founder access must use an
**audited reveal**, never blanket table read. The nullable `protected_value`
column exists so that future is not blocked — and a CHECK constraint keeps it
NULL in V1, so enabling it is a deliberate, visible migration rather than
drift.

## The write path

One door: `POST /api/admin/identifiers`, founder-gated.

- The raw value is **ephemeral processing material**. It lives in the route's
  memory long enough to normalize and tokenize, and is then gone. It is never
  written to a row, echoed in a response, attached to an error, or logged —
  validation failures name the rule that failed, never the submitted value.
- **The browser cannot mint a token.** There is no request field through which
  a caller can supply one, and the route never reads one. A caller who sends a
  precomputed token is simply ignored.
- The response is **metadata only**. The caller learns *that* evidence was
  recorded, and nothing about what it says.
- The route accepts **no free-text field at all**. `sourceReference` is
  **rejected with a 400**, not quietly dropped — a silent drop is the worse
  failure, because the founder writes a provenance note, gets a success, and
  believes something was recorded that never was. A database CHECK keeps the
  column NULL as well, so this is enforced in two places rather than promised
  in one. The column survives for a future named source integration carrying a
  *non-user-supplied* opaque reference under its own contract.
- Write failures return a **bounded reason code**, never the raw database
  error message.

## What is deliberately NOT built

- **No raw storage.** No route accepts and stores a recoverable value, no UI
  reveals one, no founder bypass reads one, no provider path writes one.
- **No buyer-facing masked reveal.** Ruled out for V1.
- **No matching, dedupe, merge, split, Trade, transfer, or Passport
  behaviour.**
- **No OCR and no provider redesign.** Google Vision remains `WEB_DETECTION`
  only.
- **No Monaco ingestion.** Its `case_number` / `movement_number` values remain
  source-file-only.

## Provider matched-page titles are untrusted third-party metadata

The one narrow path by which outside text about a watch reaches the platform
is a matched page's title, from `WEB_DETECTION`. Those titles are **not
stripped** — they remain founder-facing evidence — but they are classified in
`lib/imageAuthenticity.ts` as untrusted metadata that must **never be
auto-promoted into a structured identifier observation**. A stranger's page
title is not an observation by someone with a stated source class, and
treating it as one would let an outside party write identity evidence into
FairWatchTrade. If provider-derived identifiers are ever wanted, they enter
through the governed write path under `provider_extracted`, with a human
deciding.

## Photo-borne exposure — a known, unsolved fact

Caseback, warranty and service-evidence photographs **may visibly contain
serial, case, and movement numbers**, and some are already public.

06C's structured-data contract does **not** solve that. Protecting the column
does nothing about a number legible in a JPEG. Nothing here crops, redacts,
blurs, gates, or redesigns photo handling, and this round deliberately did not
expand into image processing.

A separate media/privacy round owns redaction and review policy. Recorded here
so it is a known gap rather than a discovered surprise.

## Verifying current state

```sql
-- V1 stores no raw, and that is enforced rather than promised
select count(*) filter (where protected_value is not null) as raw_values_stored,
       count(*) as observations
  from public.physical_watch_identifier_observations;

-- no client role can reach the table at all
select count(*) from information_schema.role_table_grants
 where table_name = 'physical_watch_identifier_observations'
   and grantee in ('anon', 'authenticated');

-- correction chains: one current head each
select chain_root_id,
       count(*) as rows_in_chain,
       count(*) filter (where is_current) as current_heads
  from public.physical_watch_identifier_observations
 group by chain_root_id;
```

Contract assertions:

- `scripts/identifier-contract.test.sql` — schema and access, read-only, safe against production
- `node --experimental-strip-types scripts/identifier-contract.test.mjs` — normalization and token security

**06D is the first round permitted to reason about same-watch identity.**
