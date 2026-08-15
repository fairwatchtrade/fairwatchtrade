# Vault Upgrade v3.2 Room

**Repo-local machinery README**  
**Intended location:** `app/admin/vault-upgrade/README.md`  
**Route:** `/admin/vault-upgrade`  
**Architecture status:** Active machinery  
**Last truth refresh:** 2026-08-15

---

## Why this README exists

The Vault Upgrade room crosses enough product, taxonomy, research, file-safety, and downstream-ingestion boundaries that losing session context would require significant rediscovery.

This file preserves the durable intent of the machinery and, just as importantly, records what is **not yet settled**.

It is not a substitute for reading the current code.

When code and this README disagree about mechanics, verify the code and update this file. When code appears to disagree with a product rule or unresolved item recorded here, do **not** silently choose one; resolve the contradiction explicitly.

---

## 1. What the Vault Upgrade room is for

The Vault Upgrade room exists so an older or incomplete FairWatchTrade Vault brand JSON can be brought forward to the current Vault specification **without requiring the founder to manually reconstruct the file**.

The core product outcome is:

```text
older / incomplete Vault JSON
→ analyze against the current Vault contract
→ make safe deterministic upgrades
→ research or complete eligible missing facts
→ surface genuine taxonomy or evidence decisions rather than inventing certainty
→ return a usable current-spec JSON artifact
```

The room succeeds when it removes repetitive manual reconstruction while preserving the quality and identity discipline of the Vault.

The room is allowed to say:

- this fact is missing;
- this fact can be safely completed;
- this file is already current;
- this taxonomy distinction requires judgment;
- this result is provisional;
- this provider/research attempt failed;
- this question remains unresolved.

It is **not** allowed to make uncertainty disappear merely to produce a green status.

---

## 2. Product contract

The founder-facing contract is:

> **Upload an older Vault JSON and receive the completed upgraded current-spec JSON file back.**

A report, browser-local candidate, diagnostic state, or successful research request is not by itself the product outcome.

A useful file must remain obtainable even when the room cannot fully finalize it.

For genuine structural taxonomy questions:

> **Taxonomy uncertainty blocks finalization, not useful artifact delivery.**

That is why a decision-required file may still produce an unmistakably provisional upgraded JSON for downstream human or AI repair.

---

## 3. Durable Vault laws this room must preserve

### Missing data is safer than invented data

> **No penalty for missing data. Only a penalty for bad data.**

The room may leave a field unresolved. It must not manufacture a value simply because the current specification contains the field.

### Taxonomy is identity, not appearance

The hierarchy remains:

```text
Brand
→ Collection
→ Family
→ Variant / Collector Identity
→ Reference
```

Material, dial color, or similar execution differences do not automatically create hierarchy.

When an apparent hierarchy split is supported only by a prohibited material/dial distinction, the room must surface the structural decision rather than silently collapse, move, merge, or rewrite the hierarchy.

### Originals are source evidence

Uploaded source files are evidence.

The room may derive upgraded candidates from them, but it must not destructively rewrite the original source as part of the upgrade operation.

### Preserve useful work through failure

A failed retry must not erase a previously valid final or provisional result.

Failure should be visible while previously completed work remains recoverable.

### Determinism where determinism is possible

Safe structural upgrades, validation, artifact naming/packaging, and repeatable transformations should remain deterministic.

Research and judgment may be nondeterministic; the machinery surrounding them should not be.

---

## 4. What this room is NOT

### Not database reconciliation

A correct upgraded JSON file is **not automatically authorized to mutate an existing production Vault brand**.

File correctness and database reconciliation are separate problems.

### Not the legacy ingestion script

`scripts/ingest-vault.js` is not an update/reconciliation path for an existing brand.

Current hard boundary:

> **If the brand already exists, the importer refuses it.**

That refusal is deliberate protection against duplicate or partial hierarchy creation.

If a workflow assumes that an upgraded file can simply be re-run through `scripts/ingest-vault.js` over the existing corpus, that workflow is wrong.

### Not Galaxy publication

Upgrading or ingesting Vault data does not itself authorize Galaxy visibility or publication.

### Not Vault Enrichment

Vault Upgrade and Vault Enrichment are related but distinct machinery.

```text
Vault Upgrade
= canonical Vault specification / identity / taxonomy JSON

Vault Enrichment
= governed evidence-backed facts attached to known Vault references
```

The Enrichment Authoring room may produce data consumed downstream, but its authority and storage semantics are not inherited automatically by Vault Upgrade.

---

## 5. Current architecture direction

**Historical orientation — not current-state proof.** The milestones below explain how the room arrived at its present shape. Verify current repository/database/runtime behavior before relying on any milestone as proof that a capability still behaves the same way today.

The Upgrade room has matured substantially since early August.

Important capability milestones include:

- the completion engine being preserved from an uncommitted working tree;
- semantic v3.2 Material Rule / hierarchy detection;
- real downloadable candidate delivery;
- provisional delivery for decision-required taxonomy cases;
- queue/cancel truth during bulk work;
- continuation-response assembly fixes;
- failed-rerun preservation;
- portable unresolved-item handoff;
- provider usage accounting and prompt caching;
- the separate Vault Enrichment Authoring room;
- downstream ingestion changes so authored data is not silently discarded.

Do not infer current behavior from an older continuity snapshot merely because its broad design language still sounds right.

**Design intent ages more slowly than implementation state. Current repository and database truth must be re-read before changing this machinery.**

---

# 6. OPEN / UNRESOLVED ITEMS

This section is intentionally explicit.

Do not “clean it up” by converting uncertain items into settled facts. Remove an item only when repository/database/runtime evidence or an explicit product ruling closes it.

## 6.1 A. Lange source contradiction — UNRESOLVED

There is an unresolved contradiction involving the A. Lange source/benchmark lineage.

Older A. Lange material was intentionally useful as a structural-taxonomy test because it raises expected Material Rule decisions, while a later expanded/current-spec benchmark was used as a clean no-change control.

The unresolved question is not whether both artifacts have been useful in testing.

The unresolved question is:

> **Which A. Lange artifact/source lineage is authoritative for the current real-world Vault brand truth, and how should conflicting source generations be treated when upgrading or reconciling that brand?**

Until resolved:

- do not silently designate an older or newer A. Lange artifact as production authority merely because it is a convenient test fixture;
- do not use a benchmark artifact as proof of production source truth unless its lineage is verified;
- keep “test fixture / benchmark” and “authoritative brand source” as separate concepts.

## 6.2 Real production cost / cache measurement — NOT PROVEN IN PRESERVED RECORD

Provider-cost instrumentation and prompt caching were implemented.

The preserved measurement plan expected a small real run to prove:

```text
first eligible request
→ cache creation > 0

later eligible request
→ cache read > 0
```

The last preserved state did **not** prove that real cache reuse measurement had completed.

Therefore:

> **Do not claim the provider path is economically measured merely because caching code exists or tests pass.**

Before widening automated research across the corpus, verify from current production/runtime evidence whether this measurement was ever actually completed after the older credit blocker.

If no trustworthy production measurement exists, this remains open.

## 6.3 Vault v3.2 brand fields exceed current `vault_brands` storage — UNRESOLVED PRODUCT/DATA-MODEL QUESTION

The current v3.2 specification defines three brand-level fields for which `vault_brands` currently has no corresponding storage columns.

This gap is known.

It is **specified behavior, not evidence that the fields were accidentally forgotten during one import**.

The unresolved architectural question is:

> **Should the production Vault schema eventually grow to persist these v3.2 brand-level fields, or are they intentionally file/spec-only metadata?**

Until that is ruled:

- do not invent new columns simply to make schema and JSON visually match;
- do not drop the fields from v3.2 merely because the database does not currently store them;
- do not imply that ingestion persists them if it does not;
- preserve them in upgraded files according to the governing v3.2 specification;
- treat storage expansion as an explicit schema/product decision.

## 6.4 Existing-brand reconciliation path — DOES NOT YET EXIST AS A GENERAL APPROVED PATH

The legacy importer refuses existing brands.

That prevents one known class of destructive duplicate-tree behavior, but it also means there is no general approved path equivalent to:

```text
upgraded current-spec file
→ compare safely against existing production brand
→ produce field/row-specific operation plan
→ review
→ atomic apply
→ verify
```

This is a real architectural seam, not a reason to weaken the importer guard.

The required future reconciliation concept remains:

```text
trusted source artifact
→ exact source identity/hash
→ strict current-spec validation
→ identity reconciliation against immutable database IDs
→ deterministic non-mutating operation ledger
→ review/certification
→ approved plan hash
→ atomic apply
→ post-apply verification
→ reversible audit record
```

Until that machinery exists and is proven, **do not treat `scripts/ingest-vault.js` as an update tool.**

## 6.5 Provider/model choice — DEFERRED, NOT SETTLED

The room has used a research-provider path, but provider choice is not a product doctrine.

Any future comparison should use:

- finished JSON quality;
- provenance/source quality;
- unresolved-decision quality;
- wall-clock time;
- token usage;
- actual cost.

Do not preserve provider loyalty as architecture.

## 6.6 Concurrency / full-corpus automation — DEFERRED

Do not infer that because single-file or small-batch completion works, the full corpus should be run with broad concurrency.

Concurrency should be introduced only after the active provider path is:

1. reliable;
2. economically measured;
3. safe under retry/continuation behavior.

The goal is to eliminate repetitive manual work, not to spend money faster.

## 6.7 Hybrid repair path — VALID OPTION, NOT FINALIZED AS THE ONLY PATH

A legitimate operating model is:

```text
Upgrade room
→ deterministic/spec work
→ economical research
→ provisional output for genuine judgment cases
→ fresh repair agent handles only unresolved subset
→ complete strict-valid JSON
```

This is valid and useful, but should not be mistaken for a permanently locked provider or orchestration architecture.

---

## 7. Known settled behavior that should not be reopened casually

These decisions are durable unless explicitly superseded:

- A file already satisfying the current specification may legitimately return `CURRENT_SPEC_NO_CHANGE`.
- Structural Material Rule questions may block final certification without blocking provisional artifact delivery.
- The room must not automatically collapse or rewrite taxonomy to resolve a Material Rule violation.
- A failed rerun must preserve prior successful work.
- Unresolved decisions must be portable with enough context for another repair agent to act without reconstructing the problem.
- Browser-local staging is not certification, reconciliation, ingestion, or publication.
- The original source remains preserved.
- Bulk cancellation must stop queued work rather than merely changing the UI.
- A provider failure must be reported truthfully; it must not be disguised as malformed JSON or another unrelated error.
- The room is allowed to stop and ask for a decision.

---

## 8. Operating philosophy

The room should feel simpler than its internals.

The intended founder workflow is:

```text
upload
→ analyze
→ show the actual file issues
→ upgrade / research what is safely resolvable
→ receive final or clearly provisional JSON
→ download
→ remove the work item
```

The interface should answer:

1. **What do I do next?**
2. **Where is my file?**

before exposing internal state-machine vocabulary.

Do not grow a generalized job platform around this room unless a real product need requires it.

> **Build the smallest room that removes the repetitive work.**

---

## 9. How to change or repair this machinery safely

Before making a change:

1. Read this README for product intent and unresolved boundaries.
2. Read the current implementation; do not rely on old continuity for mechanics.
3. Read the current v3.2 governing specification.
4. Determine whether the change affects file transformation, taxonomy decisions, research/provider behavior, artifact delivery, browser-local persistence, database reconciliation, or downstream ingestion.
5. If it crosses into database mutation or existing-brand ingestion, stop and verify authority.
6. Preserve source-file safety and prior successful work.
7. Add or update behavioral proof for the actual failure mode, not merely source-shape assertions.
8. Run the room locally.
9. Perform a real representative workflow, not only unit tests.
10. After deployment, verify production behavior before calling the work closed.
11. Update this README if the architecture, product contract, or unresolved list changed.

A test is not useful evidence if the real bug can be reintroduced and the test still passes.

---

## 10. Live-truth verification checklist

When a future developer or AI instance needs to re-establish current truth, verify these directly rather than trusting historical release notes:

### Product output

- Can an older/incomplete Vault JSON still produce a usable current-spec candidate?
- Can the finished artifact actually be downloaded?
- Does a clean current-spec file return a truthful no-change result?
- Does a decision-required file still return a clearly provisional artifact without pretending it is final?

### Safety

- Is the original source preserved?
- Does retry failure preserve earlier successful work?
- Does cancellation actually stop queued work?
- Are structural taxonomy violations still non-destructive?

### Provider/research

- Which provider/model path is current?
- Is usage accounting still recorded?
- Has real production cache reuse actually been measured?
- What is the current measured cost of a representative upgrade?
- Is concurrency enabled anywhere, and if so, was it deliberately authorized?

### Database / ingestion boundary

- Does `scripts/ingest-vault.js` still refuse existing brands?
- Does any newer approved reconciliation path now exist?
- What fields emitted by current v3.2 have no live database destination?
- Does current ingestion preserve every field that the relevant authoring/upgrade room is supposed to hand downstream?

### Self-refreshing live-truth commands / queries

Use these as **starting points for current-state verification**, not as substitutes for reading the code around each result. The commands intentionally return live answers rather than preserving counts, line numbers, or other values that will rot.

From the repository root:

```bash
# Locate the Upgrade room and the machinery it currently depends on.
rg -n "vault-upgrade|Vault Upgrade|CURRENT_SPEC_NO_CHANGE|PROVISIONAL|DECISION_REQUIRED" app lib scripts

# Re-check the legacy first-ingestion guard and any current importer behavior.
rg -n "already exists|existing brand|refus|quarantine|ingest-vault" scripts/ingest-vault.js

# Look for any reconciliation machinery that may have been added since this README was last refreshed.
rg -n "reconcil|operation ledger|plan hash|approved plan|atomic apply" app lib scripts supabase

# Locate current provider/model, usage-accounting, cache, retry, continuation, and cancellation code.
rg -n "provider|model|usage|cache|retry|continuation|cancel" app/admin/vault-upgrade app/api lib
```

Against the current database, inspect the live `vault_brands` projection rather than relying on a remembered field list:

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

To re-check the Galaxy publication boundary without preserving a stale count:

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

To verify whether an approved reconciliation path now exists, do **both** of the following before concluding that it does or does not:

1. search the current repository for reconciliation/apply machinery;
2. inspect current database functions/tables whose names or definitions indicate Vault reconciliation.

A useful database starting query is:

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

If any command or query returns something materially different from the architecture described above, read the surrounding implementation and update this README in the same flight.

### Unresolved list

Re-read Section 6.

For each item, either:

- leave it unresolved;
- attach new evidence;
- or explicitly record the ruling that closes it.

Never close an architectural question by omission.

---

## 11. README maintenance law

Update this file whenever any of the following changes:

- the founder-facing product contract;
- the governing Vault specification;
- taxonomy decision behavior;
- final vs provisional artifact semantics;
- provider/research architecture;
- persistence/retry behavior;
- existing-brand reconciliation;
- ingestion boundaries;
- Vault database storage for v3.2 fields;
- an item in the unresolved list is settled;
- a new unresolved architectural question is discovered.

When adding a temporary implementation detail, label it as such.

When recording a durable product law, say why it exists.

When an unresolved question remains unresolved, **write that plainly**.

The point of this README is not to make the machinery look finished.

The point is to make sure the next person can safely understand **what the room is trying to accomplish, what is already law, what can age, and what nobody has actually decided yet.**
