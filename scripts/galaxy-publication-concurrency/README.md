# Galaxy Publication — Executable Multi-Session Concurrency Proof

Reproducible harness for the serialization corrections in
`supabase/migrations/20260803120000_galaxy_publication_model.sql`
(operator advisory lock) and
`supabase/rollbacks/20260803120000_galaxy_publication_model.down.sql`
(advisory lock + five-table `ACCESS EXCLUSIVE` retreat ordering).

**Six concurrent interleavings (I1–I6) and two postcondition suites
(P1 exact-audit, P2 five-level state) — eight test groups.** Interleavings
run as genuinely independent PostgREST HTTP sessions (each request is its
own transaction on its own pooled backend); the postcondition suites are
exact database assertions and are never described as races.

P2 reconciles each of the five publication views against its ancestor-closed
expected id set as a **set**: omissions (entitled but absent), extras (served
without entitlement) and the symmetric difference, all required to be zero at
all five levels. Per-row flags speak only for named scenario rows and
closure checks read only base tables — neither can see a row a view omits.

## Files

| File | Role |
|---|---|
| `fixture.sql` | **The target-guard root**: verifies the operator's session-declared branch identity (`set galaxy_proof.declared_branch_ref = '<ref>';`), refuses production or any pre-existing state, then mints the marker storing that identity. Also builds the production-shaped fixture (192/396/579/710/388). Contamination is swept through `pg_class` across **every relkind** — ordinary, partitioned, view, **materialized view**, sequence, foreign table, composite, index — because `information_schema.tables`/`.views` between them omit several of those entirely. The identity re-validates **at mint time**, and the target artifact is created with a **single-row primary key**, `NOT NULL` and a ref-shape CHECK. |
| `helpers.sql` | Branch-local test helpers (timed lock-holding wrappers, audit reader, five-level state inspector, anon grants, `statement_timeout` raise). **Never creates the marker.** Refuses unless: the target artifact is an ordinary table holding **exactly one row**; marker, artifact and declared identity agree **null-safely** (`is distinct from` — a NULL identity makes `<>` NULL, and `if NULL then raise` does not raise); the three operator functions exist at their **exact signatures** (`to_regprocedure`, not `to_regproc`, which cannot prove an argument list and returns NULL on any overload); the five publication views are **relkind `v`**; the audit table is an ordinary table with the exact column set and types and an **owned sequence** behind `seq`; and `galaxy_visible` is `boolean NOT NULL` with `uuid` parent keys — types, not merely names. |
| `negative-control.sql` | **Disposable, NOT the implementation.** Same non-circular guard as helpers, then redefines `galaxy_activate` *without* the advisory lock so the harness can prove it detects a missing lock. |
| `run.mjs` | The executable harness. Node ≥ 22, no dependencies. Emits a JSON transcript, exits non-zero on any scenario failure. |

## Reproduction (clean checkout → proof)

1. Create a disposable Supabase branch of the project. Note its ref.
2. Against that branch's SQL channel (SQL editor / psql / MCP), declare the
   identity **in each session** and apply in order:

   ```sql
   set galaxy_proof.declared_branch_ref = '<branch-ref>';
   ```

   1. `fixture.sql` (mints the marker holding that identity)
   2. `supabase/migrations/20260803120000_galaxy_publication_model.sql` (verbatim, from the commit under review)
   3. `helpers.sql`
3. Run the harness — the identity is supplied AGAIN, independently, via
   environment, and must equal both the URL's project ref and the identity
   stored in the fixture's marker:

   ```bash
   SUPABASE_URL=https://<branch-ref>.supabase.co \
   SUPABASE_ANON_KEY=<branch anon key> \
   GALAXY_PROOF_BRANCH_REF=<branch-ref> \
   GALAXY_PROOF_COMMIT=$(git rev-parse HEAD) \
   node scripts/galaxy-publication-concurrency/run.mjs \
     --out galaxy-concurrency.transcript.json
   ```

   `SUPABASE_URL` must be **byte-identical** to
   `https://<branch-ref>.supabase.co`. It is judged exactly as supplied and
   is never normalised first — a trailing slash, an uppercase host, a port,
   userinfo, a path, a query or an extra label is a refusal, not something
   the harness quietly repairs. `GALAXY_PROOF_COMMIT` is recorded in the
   transcript so a reviewer can bind the run to a commit.

   Secrets come only from the environment. The harness additionally reads
   its **own directory** — `fixture.sql`, `helpers.sql`,
   `negative-control.sql`, `run.mjs`, `README.md` — read-only, to record
   each input's sha256 in the transcript under `source_hashes_sha256`;
   nothing else is read, and nothing is written beyond `--out`.
4. **Negative control — use a FRESH SECOND disposable branch.**

   The positive suite's final interleaving (I6) is a schema retreat: it
   drops the publication functions, views, audit table and every
   `galaxy_visible` column. Applying `negative-control.sql` to that branch
   afterwards cannot work — there is no publication layer left to break,
   and `helpers.sql`'s exact-target guard would (correctly) refuse the
   post-retreat shape. So:

   - create a **second** disposable branch;
   - repeat steps 2 and 3's *setup* on it — declare the identity, run
     guarded `fixture.sql`, the committed migration, guarded `helpers.sql`;
   - declare the identity once more and apply `negative-control.sql`
     (it enforces the same exact-target guard and never mints the marker);
   - then run:

   ```bash
   SUPABASE_URL=https://<second-branch-ref>.supabase.co \
   SUPABASE_ANON_KEY=<second branch anon key> \
   GALAXY_PROOF_BRANCH_REF=<second-branch-ref> \
   node scripts/galaxy-publication-concurrency/run.mjs --negative-control \
     --out scripts/galaxy-publication-concurrency/galaxy-concurrency.negative.transcript.json
   ```

   Expected: interleaving I1 reports `MISSING_SERIALIZATION_DETECTED`
   (serialization-order inversion: the later session publishes while the
   lock holder finds nothing), and the run exits 0 **only because**
   `--negative-control` inverts I1's expectation; without the flag the same
   state exits non-zero.

   (A complete guarded rebuild of the first branch — drop the fixture and
   all proof objects, then re-run guarded `fixture.sql`, the migration and
   guarded `helpers.sql` from scratch — is an acceptable alternative, but a
   second branch is simpler and leaves the positive evidence untouched.)
5. **Delete every disposable branch used.** The harness writes nothing
   anywhere else.

## Safety

- The guard is non-circular: the operator declares the branch identity
  through two independent channels (SQL session -> stored in the marker by
  `fixture.sql`; environment -> `run.mjs`), and every consumer verifies the
  declarations agree. No file trusts an identity it minted itself. The
  production ref is additionally denylisted in both `fixture.sql` and
  `run.mjs`.
- The transcript claims only what execution proves (guard passed, target
  matched the declared identity, no operation outside it). "Production
  untouched" is an operator statement supported by branch inventory.
- The scenarios' expected refusals (`REFUSED: …`) are asserted as
  *expected refusals*; any other error is an assertion failure.
- Event identity is tracked by exact `event_id` / `seq` values returned by
  the operator functions — never selected by timestamp.

## Locks under test (recorded in each transcript)

- Operator serialization: `pg_advisory_xact_lock(hashtextextended('fwt.galaxy_publication', 0))`,
  first statement of `galaxy_activate` and `galaxy_rollback_event`.
- Retreat stability: same advisory key, then `ACCESS EXCLUSIVE` on
  `vault_brands → vault_collections → vault_families → vault_variants →
  vault_references`, held from guard through column drop and commit.
