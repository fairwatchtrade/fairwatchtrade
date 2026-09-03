# Auction Operations — two jobs, two data domains, one room

`/admin/auctions` is the single obvious auction room, reached through the
**◈ Auctions →** doorway in Marketplace Control. It hosts two founder jobs
that share a page and **nothing else**.

## The misconception this file exists to kill

> "Auctions are one system."

They are two, and they never merge:

| | Upcoming Auctions | Auction Results |
| --- | --- | --- |
| Truth | future event / calendar | completed sale / historical evidence |
| Storage | `auction_events` | `auction_evidence_*` domain |
| Feeds | `/api/auctions` → the public MarketBar strip | Market Intel / comparables |
| Writer | `/api/admin/auctions/save` (explicit founder save) | `auction_evidence_create_or_correct_result()` — **the only result writer in the product** |

There is no shared table, no shared status, no shared lifecycle. A change to
one side must not assume anything about the other.

## Upcoming Auctions (the proven engine, untouched)

`paste → parse (AI drafts, blank-over-guess) → founder review → explicit
save → auction_events → /api/auctions → MarketBar`

- `data/auctions.json` still participates in `/api/auctions`; the table wins
  on identity collision and the endpoint fails open to JSON. Do not retire it.
- **No stored status.** Live/Upcoming/Past is computed from the dates at read
  time (`lib/auctions.ts` `statusOf`); a stored status is a lie waiting for
  its birthday. This is why the room shows no Public-strip eligibility and no
  publish/hide/delete controls — none of that state exists.
- Open/Edit populates the same draft editor and saves through the save
  route's existing `confirm_update_id` branch. One save path, no parallel
  update route.

## Auction Results — registered packets only

V1 is an operator doorway for **three registered, already-proven packets**,
allowlisted in `lib/auction-operations/registry.ts`:

1. `phillips-sale : NY080126` — founder stages the two pinned PDFs
2. `monaco-legend : sales-38-40-41` — server fetches the pinned URLs
3. `monaco-layer2 : et33-et35-et36` — founder stages the hash-pinned Layer 2
   corpus JSONL (821 verified historical lots)

A new sale or house is a **reviewed manifest + adapter registration in the
repository**, never a form field. No route accepts an arbitrary URL,
manifest, or adapter string.

### The flow, and where each rule is enforced

```
choose eligible packet → START PLANNING → durable run visible at birth
  → sources staged or fetched → plan (ZERO writes) or truthful refusal on
    that same run → founder reviews summary+hash → Apply (explicit, of that
    exact hash) → bounded slices → applied
```

### START PLANNING and run recovery (v8.22) — expose the run that exists

The misconception this section kills: *"the run is created when planning
starts, so a spinner is enough."* The run is durable the moment it is
inserted, and an operator who reloads mid-planning must find it again.

- **Registered-fetch birth is its own fast act:** `POST /api/admin/auctions/results/runs { packetId }`
  births ONE `planning` run bound to the exact active revision (id, hash,
  schema) and returns `runId, adapter, packetId, state, createdAt,
  reusedExisting`. The room then calls the existing `/plan { runId }`, which
  resolves by the run's bound revision. The browser authors nothing but a
  packet id. Staged packets are refused here by name — their run is born by
  `/uploads`, which binds before any token is issued (unchanged).
- **R1 — one live run per exact revision, enforced by the database.**
  Migration `20260902220000_auction_operations_one_live_run_per_revision.sql`
  (applied): partial unique index on `packet_revision_id WHERE state IN
  ('uploading','planning','applying')`. A check-then-insert is advisory;
  the index is authority. `birthOrReuseRun()` reads for a live run, attempts
  the insert, and on the index's refusal recovers the winner and returns it
  with `reusedExisting: true`; if the winner terminated before that read it
  retries the decision once rather than reporting a phantom conflict.
  `planned | applied | failed` never block a fresh START. Legacy NULL-bound
  rows are outside the guarantee by PostgreSQL NULL semantics — deliberately.
- **The Apply consequence:** the same index governs `planned → applying`.
  A planned run may coexist with a newer planning run for its revision, so
  applying the older plan while that run is live is refused by the database.
  The apply route returns `409 active_run_conflict`, leaves both runs
  untouched, and the founder retries once the other run leaves the live
  states. Not a new state — the invariant working.
- **Post-birth failure lands on the run.** If `/uploads` births the run and
  then cannot issue a signed token, it `markFailed()`s that run
  (`staging_unavailable`) and returns the run id with the refusal. A browser
  direct-upload failure keeps the run and calls `/plan { runId }`, so the
  server inspects the staged objects and records its own `missing_source` /
  hash / byte truth; if the server is unreachable the run stays visible in
  its last true state. No client status mutation exists.
- **Current & Recent Runs** — `GET /api/admin/auctions/results/runs`:
  founder-gated, newest-first, bounded (`RECENT_RUNS_LIMIT`), strict
  projection: `runId, adapter, packetId, packetLabel, state, revisionBound,
  lastErrorCode, lastErrorDetail, createdAt, approvedAt, appliedAt`. No plan
  bytes, storage paths, source hashes or evidence content. Selecting a row
  hydrates through the existing by-id run route.
  - **R2 `revisionBound`** is derived server-side from `packet_revision_id IS
    NOT NULL`, never stored or backfilled. A legacy unbound run renders as
    **Legacy run — inspection only**: no re-plan, no Apply, and recovery
    never invokes the old active-revision `/plan` fallback for it. The two
    production legacy rows stay exactly NULL.
  - **R3 `packetLabel`** is catalog-owned: a bound run's own revision title;
    for a legacy unbound run, the currently active revision's title for that
    `packetId` as *present-day presentation only* (the row still says
    `revisionBound: false`), else the bare `packetId`. Never a client
    transformation of the slug.
- Persistent states remain exactly `uploading · planning · planned · applying
  · applied · failed`. "Creating…" is a pre-birth label in the room only.
- **Apply is unchanged as a separate exact-hash act.** START never applies;
  contradiction-bearing plans stay unapplyable; `monaco-portable` stays
  Apply-withheld by server truth and ET37 stays outside production
  selection. The room no longer claims that a family can be "registered,
  approved and activated here" — it cannot; it describes only what the
  operator can do.

- **Staging** (`results/uploads` route): create-only signed tokens into the
  private `auction-operations-staging` bucket, paths server-generated under
  `runs/<runId>/<kind>`. PDFs never cross a function body (4.5 MB ceiling).
  Staging bytes are **never** promoted into Auction Evidence retention —
  importer semantics stay `metadata_only`.
- **Planning** (`results/plan` route → `lib/auction-operations/planEngine.ts`):
  verifies every pinned hash and semantic gate, inspects live DB truth,
  persists the deterministic plan + SHA-256 on `auction_operations_run`.
  Writes nothing to the evidence layer — pinned by
  `scripts/auction-operations.test.mjs`.
- **Apply** (`results/apply` route): requires the reviewed `planSha256`,
  re-verifies the stored bytes against it, refuses contradictions, then runs
  bounded idempotent slices with durable cursor progress. `after()` continues
  slices in the same invocation; an interrupted run stays truthfully
  `applying` and the **same route resumes it** (the room polls and re-kicks;
  the founder can also just press Apply again). There is deliberately no
  standing cron worker: a founder-present operation that runs a few times a
  year does not earn permanent scheduled infrastructure — if unattended
  ingestion is ever ordered, mirror the Dealer Accelerator's DB-held-token
  worker pattern.
- **One engine, two entrances.** The plan/apply logic lives in the importer
  modules themselves — `scripts/phillips-sale-import.mjs` and
  `scripts/monaco-legend-import.mjs` export the same functions their CLIs
  run (`main()` is guarded), and `lib/auction-operations/monaco-layer2-core.mjs`
  emits plans in the exact shape the shared Monaco engine
  (`applyMonacoPlanSlice`) executes. The implementation preflight suggested
  physically relocating the engines into `lib/`; the smaller equivalent at current HEAD
  was to keep them where their 50 existing test assertions already point and
  export the seams. If you move them later, move the tests with them.

### `monaco-portable` — plan-only, Apply deliberately withheld (v8.18)

The fourth code-owned family, for the accepted, reconciled Monaco keeper
artifacts. **It has no writer.** Its plan is generated, hashed and reviewed
through the normal room; Apply is refused for it by name, server-side, and the
room draws no Apply button for it.

The misconception to kill here: *"this is the ET37 importer."* It is a
**profile** — `monaco-portable-reconciled-sale-v1`, the artifact shape the
accepted ET37 keeper proved — and the profile does not know what ET37 is.
`lib/auction-operations/monaco-portable-core.mjs` reads no sale code, no lot
count and no total; those are **packet gates** in the catalog descriptor. The
suite carries a synthetic non-ET37 keeper that passes the profile and is
refused by the ET37 gates, which is the evidence the adapter is reusable rather
than a one-sale importer wearing a family name.

Where each rule lives:

- **Byte authority** — `verifyKeeperBytes()`: the descriptor pins the keeper's
  SHA-256; the exact staged bytes are downloaded, hashed, compared, and only
  the verified bytes are parsed. Byte-different JSON that parses identically
  is refused.
- **Profile vs packet** — `validatePortableProfile()` (structural, reusable)
  and `reconcilePortableGates()` (sale-specific, from the descriptor). A
  keeper whose own summary counts disagree with its own lots is refused by
  the profile before any gate is consulted.
- **The refusal, and why it comes first** — `applyDispatchFor()` in
  `packetContract.ts`. `applySlice.ts` used to route "everything that is not
  Phillips" into the Monaco writer, so a new adapter id inherited a writer by
  existing. Dispatch is now by name, withheld is evaluated first, and the
  Monaco writer is the last branch. `APPLY_WITHHELD_ADAPTERS` is declared
  before `RUNTIME_REGISTERABLE_ADAPTERS` because the refusal is the
  **precondition** of registering the family, not a sibling task. The apply
  route refuses earlier still, so a withheld run stays truthfully `planned`.
- **Staging kind** — `portable_json`, magic `{`, bounded; same v8.04 laws
  (server paths, run bound to the exact revision before any token).
- **Evidence completeness** — `evidenceCompletenessDelta()`: every keeper
  category is classified *carried / retained privately / not carried with
  reason* in the plan, so nothing accepted can vanish silently between
  validation and planning. Estimates, year, specs, session and per-lot
  canonical URLs have **no Auction Evidence column today**; they ride in the
  plan rows and are retained in the private keeper. Do not add columns merely
  to empty the delta.
- **Source-artifact identity** — the keeper's hash describes the keeper. The
  plan's one artifact spec is the official sale page with `content_hash: null`
  (never fetched here). The keeper hash sits on the plan's `keeper` block and
  on no artifact row. A private keeper has no truthful `source_url`, and that
  column is NOT NULL — representing it honestly needs a schema decision, which
  is an Apply blocker, not something to fake with a scheme.

The ET37 packet descriptor is `scripts/monaco-legend/portable-et37.descriptor.json`
— the exact registration body, pinning the keeper hash and the gates
(166 / 156 / 9 / 1, CHF 8,029,125, `hammer_plus_premium`). The keeper itself is
private evidence and is **not in this repository**.

**The Apply foundation (v8.21) — built and proven behind the gate, still
withheld.** The three blockers above are now answered in code:

- **Durable private retention** — bucket `auction-evidence-private-keepers`
  (private, 20 MB, no client policy), object path `sha256/<hash>.json`. The
  object identity *is* the keeper hash. `ensureKeeperRetained()` rehashes the
  staged bytes, compares to the plan **and** the artifact spec, then: object
  present → rehash, must match, never overwrite; absent → upload, read back,
  verify. Only then may a row point at it.
- **A truthful row for a private file** — migration
  `20260902200000_auction_evidence_private_keeper_artifacts.sql` (**unapplied**):
  `source_url` loses its unconditional NOT NULL and gains
  `asa_source_identity_check` — a URL-less artifact must be
  `full_artifact_private` + `founder_supplied_file` + non-null `content_hash`.
  `asa_retention_path_check` (storage path presence) and
  `asa_content_hash_check` (hash format) are **preserved unchanged** and not
  restated. Partial unique `asa_private_keeper_identity_uniq (sale_id,
  content_hash) WHERE source_url IS NULL AND full_artifact_private` — null-safe
  only because the CHECK forbids a null hash in that state, so the two are one
  unit and the CHECK comes first. No grant changes: `service_role` keeps the
  INSERT it had; `anon`/`authenticated` still have none.
- **Rights posture for the keeper row** — `permission_status unresolved ·
  publication_status internal_only · public_use_scope normalized_facts_only ·
  artifact_retention_scope full_artifact_private · automation_status
  not_applicable · intake_method founder_supplied_file`. Bytes stay private;
  normalized facts may join the governed Monaco factual lane; nothing raw
  becomes public through this row.
- **The plan now carries two artifact specs:** `sale_page` (URL-backed,
  `content_hash` NULL, `metadata_only`) and `portable_keeper` (URL-less, the
  keeper hash, the ruled posture, the content-addressed path). Lot and result
  rows point at `portable_keeper` — the byte artifact the adapter parsed —
  never at the sale page.
- **An explicit writer** — `lib/auction-operations/monaco-portable-writer.mjs`,
  `applyPortablePlanSlice()`: house → sale → sale-page artifact → **retain
  keeper object** → keeper artifact row (resolved by `(sale_id, content_hash,
  URL-less, private)`, reused if it agrees, refused if it disagrees) → lots →
  results through the protected RPC. Same cursor/slice contract as the Monaco
  writer. Idempotent replay, contradiction refusal, storage-before-row ordering
  all pinned. **It is not wired into `applySlice.ts`** and the route/room
  cannot reach it.
- **Dispatch is explicit by family:** withheld → `withheld`; `phillips-sale`
  → Phillips; `monaco-legend` / `monaco-layer2` → Monaco; **anything else →
  `unsupported`**, refused by the slice before any engine. No family inherits
  a writer by elimination any more. The release that lifts `monaco-portable`
  from the withheld set must add its `portable` branch at the same time.

**Production application order, when the founder walks the gate:**
1. `20260902140000_auction_operations_monaco_portable_adapter.sql`
2. `20260902200000_auction_evidence_private_keeper_artifacts.sql`

then register → approve → activate ET37 → stage the keeper → Generate Plan →
founder SEE-it. Apply stays withheld until a separate explicit release.

### Registered-fetch Monaco (38 / 40 / 41) result basis — v6.51, restated

The Monaco website displays sold figures as **"Result (Premium)"** and does
not state what that figure is composed of. The v6.51 law (`387407e`): the
value is trusted and stored **exactly as displayed**, in the sale's currency
(EUR for 38/40, CHF for 41), under
`price_basis = reported_result_basis_unverified` — no arithmetic, no VAT or
TTC/ex-VAT inference, no basis inherited from another source. Generic `other`
was retired then; it collapsed "known but different" and "trustworthy but
unresolved" into one bucket. Non-sold rows carry no price triplet.

**The drift this section exists to prevent recurring (v8.23):** the
registered-fetch adapter's `wantedResult()` in `scripts/monaco-legend-import.mjs`
still emitted `other` after v6.51 had backfilled production to
`reported_result_basis_unverified`. The first real START PLANNING against
`sales-38-40-41` (run `a5c39656`) therefore stopped truthfully on "Sale 38
Lot 1: existing result differs" — the production row was correct, the adapter
was stale. The mapping is now `MONACO_WEBSITE_RESULT_BASIS`, `wantedResult` and
`sameResult` are exported and pinned, and a current row carrying the governed
basis compares as **reuse**. That failed run stays failed; it is history.

### The ET36 price quarantine (do not "fix" this)

ET36 has no official result sheet. Its prices are current-website
"Result (Premium)" values on a **different premium basis** (the documented
1.04 relationship: 1.30 TTC vs 1.25 ex-VAT — a caveat, never a transform to
apply). Acquisition law: those values are never mapped to a realized-result
field without a labelled column making the difference visible.
`auction_evidence_result` has no such column, so ET36 sold rows carry their
**outcome with a NULL price** — the schema allows it, the plan summary counts
it (`et36_sold_prices_withheld`), the room shows "N unpriced", and the detail
page prints "withheld". Release path when the founder semantics ruling lands:
the governed correction chain, one corrected result per lot, never an UPDATE.
Enforcement lives in `wantedLayer2Result()` in the layer2 core.

### Where the behaviour actually lives (the parts that cost hours)

- **The only result writer** is the `auction_evidence_create_or_correct_result`
  RPC (SECURITY DEFINER, service_role-execute only; direct INSERT/UPDATE/
  DELETE on results is revoked even from service_role). Everything here
  funnels through it; `applySlice.ts` is a dispatcher, not a writer.
- **Identity state** on the Results list comes from
  `auction_operations_results_read_model()` in Postgres, which compares each
  current decision's stored fingerprint against
  `identity_resolution_claim_fingerprint('auction_lot', lot_id)`. **A stale
  exact decision is not Resolved** — the label logic is
  `identityStateOf()` in `lib/auction-operations/resultsPresentation.ts`.
- **Run state** is `auction_operations_run` — private operational machinery,
  revoked from every client role. It is *not* a sale fact: there is
  deliberately no `ingestion_status` on `auction_evidence_sale`, because
  expected counts live only in repo manifests and `lots == results` proves
  nothing.
- **Monaco chronology** is explicit, never inferred: the six known sales
  arrive in run order, and each Layer 2 sale's
  `chronological_position_among_known_six` marker rides into its artifact
  attribution notes from the corpus itself.
- **Rights** ride through ingestion unresolved: Layer 2 artifacts land
  `permission_status=unresolved / publication_status=internal_only /
  public_use_scope=none / retention=metadata_only`. Whether Monaco's
  normalized facts may ever surface publicly is an **open founder ruling**
  (`public_use_scope='normalized_facts_only'` is the value that would permit
  it); nothing in this room or its ingestion decides that.

## What is deliberately NOT built

- No arbitrary-house intake, no manifest upload, no URL field.
- No second result writer, no direct evidence inserts from any route.
- No identity adjudication controls — the detail page inspects; no founder
  identity-review UI exists anywhere yet, and this room must not invent one.
- No Upcoming delete/cancel/publish/hide, no Public-strip eligibility.
- No completed-sale ingestion status column.
- No standing worker cron (see Apply above).
- No retention of staged source bytes as evidence.
- No writer for `monaco-portable`. No ET37 sale/lot/result rows. Its
  production adapter-CHECK migration
  (`20260902140000_auction_operations_monaco_portable_adapter.sql`) ships in
  the repo **unapplied** — applying it is a separately authorised act.

## Verify current state

```sql
-- the sales the room lists, with rollups
select sale_name, lot_count, current_result_count, sold_count, priced_result_count
  from auction_operations_results_read_model() order by sale_date;

-- runs and their outcomes
select adapter_id, packet_id, state, summary->>'results_create' as created,
       last_error_code
  from auction_operations_run order by created_at desc limit 10;

-- the quarantine held: ET36 sold rows carry no price
select count(*) from auction_evidence_result r
  join auction_evidence_lot l on l.id = r.lot_id
  join auction_evidence_sale s on s.id = l.sale_id
 where s.sale_name = 'Exclusive Timepieces 36'
   and r.is_current and r.sale_outcome = 'sold' and r.price_realized is not null;
-- must be 0 until the founder semantics ruling releases them

-- the adapter CHECK: three names until the v8.18 migration is applied, four after
select pg_get_constraintdef(oid) from pg_constraint
 where conrelid = 'public.auction_operations_packet_revision'::regclass
   and pg_get_constraintdef(oid) ilike '%adapter_id%';

-- ET37 must remain absent from Auction Evidence until a writer is authorised
select count(*) from auction_evidence_sale where source_url ilike '%exclusive-timepieces-37%';
```

```bash
node scripts/phillips-import.test.mjs
node scripts/phillips-sale-import.test.mjs
node scripts/monaco-legend-import.test.mjs
node --experimental-strip-types scripts/auction-operations.test.mjs
```

`PFC274 = 62` — the evaluate route is untouched by anything in this room.
