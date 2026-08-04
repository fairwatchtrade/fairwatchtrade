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

## Files

| File | Role |
|---|---|
| `fixture.sql` | **The target-guard root**: verifies the operator's session-declared branch identity (`set galaxy_proof.declared_branch_ref = '<ref>';`), refuses production or any pre-existing state, then mints the marker storing that identity. Also builds the production-shaped fixture (192/396/579/710/388). |
| `helpers.sql` | Branch-local test helpers (timed lock-holding wrappers, audit reader, five-level state inspector, anon grants, `statement_timeout` raise). **Never creates the marker**; refuses unless the fixture's marker equals the session-declared identity and the fixture shape is present. |
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
   node scripts/galaxy-publication-concurrency/run.mjs \
     --out galaxy-concurrency.transcript.json
   ```

   Secrets come only from the environment; nothing is read from or written
   to the repository beyond the `--out` transcript.
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
