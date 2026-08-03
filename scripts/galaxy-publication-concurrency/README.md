# Galaxy Publication — Executable Multi-Session Concurrency Proof

Reproducible harness for the serialization corrections in
`supabase/migrations/20260803120000_galaxy_publication_model.sql`
(operator advisory lock) and
`supabase/rollbacks/20260803120000_galaxy_publication_model.down.sql`
(advisory lock + five-table `ACCESS EXCLUSIVE` retreat ordering).

Every scenario runs as **genuinely independent PostgREST HTTP sessions**
(each request is its own database transaction on its own pooled backend).
Sequential statements inside one connection are never used as concurrency
evidence.

## Files

| File | Role |
|---|---|
| `fixture.sql` | Disposable-branch fixture: production-shaped `vault_*` tables + seed (192/396/579/710/388). **Refuses to run where `vault_brands` already exists** — the not-production guard. |
| `helpers.sql` | Branch-local test helpers: timed lock-holding wrappers, security-definer audit reader, test-only anon grants, anon `statement_timeout` raise. Disposable; never production objects. |
| `negative-control.sql` | **Disposable, NOT the implementation.** Redefines `galaxy_activate` *without* the advisory lock so the harness can prove it detects a missing lock. |
| `run.mjs` | The executable harness. Node ≥ 22, no dependencies. Emits a JSON transcript, exits non-zero on any scenario failure. |

## Reproduction (clean checkout → proof)

1. Create a disposable Supabase branch of the project. Note its ref.
2. Against that branch's SQL channel (SQL editor / psql / MCP), apply in order:
   1. `fixture.sql`
   2. `supabase/migrations/20260803120000_galaxy_publication_model.sql` (verbatim, from the commit under review)
   3. `helpers.sql`
3. Run the harness:

   ```bash
   SUPABASE_URL=https://<branch-ref>.supabase.co \
   SUPABASE_ANON_KEY=<branch anon key> \
   node scripts/galaxy-publication-concurrency/run.mjs \
     --out galaxy-concurrency.transcript.json
   ```

   Secrets come only from the environment; nothing is read from or written
   to the repository beyond the `--out` transcript.
4. Negative control (proves the harness detects a removed lock):
   apply `negative-control.sql`, then

   ```bash
   ... node scripts/galaxy-publication-concurrency/run.mjs --negative-control \
     --out galaxy-concurrency.negative.transcript.json
   ```

   Expected: scenario S1 reports `MISSING_SERIALIZATION_DETECTED`, and the
   run exits 0 **only because** `--negative-control` inverts S1's
   expectation; without the flag the same state exits non-zero.
5. **Delete the disposable branch.** The harness writes nothing anywhere else.

## Safety

- `run.mjs` refuses to run against the production project ref (denylisted)
  and refuses any target where the branch marker installed by `helpers.sql`
  is absent.
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
