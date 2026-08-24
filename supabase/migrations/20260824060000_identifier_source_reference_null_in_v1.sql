-- ════════════════════════════════════════════════════════════════════════
-- IDENTIFIER CONTRACT REPAIR — close the free-text storage channel
-- supabase/migrations/20260824060000_identifier_source_reference_null_in_v1.sql
--
-- THE DEFECT THIS CLOSES:
--
--   source_reference was caller-supplied free text, stored in plaintext on
--   the identifier observation row.
--
-- The tokens were fine. The column beside them was a second, unprotected
-- way to store exactly what the tokens exist to protect. Someone types
-- "serial 8Z12345" into a provenance note and the platform is holding a
-- recoverable serial in plaintext — the keyed one-way machinery intact and
-- entirely bypassed, sitting one column away.
--
-- ── WHY THE FIX IS REMOVAL, NOT FILTERING ──────────────────────────────
-- V1 does not attempt to detect identifiers in free text. No validator can
-- prove arbitrary prose contains no identifier, and a filter that is wrong
-- once is worse than no field at all — it fails while looking like it
-- worked, and by then the plaintext is stored.
--
-- So the route stops accepting the field, and this constraint makes that a
-- property of the database rather than a promise made by one route. Same
-- pattern as protected_value: the column survives for a future governed
-- provenance contract, and enabling it must be a deliberate migration.
--
-- A future named source integration may earn a NON-user-supplied opaque
-- reference — an auction lot id, a batch item id — under its own contract.
-- That round drops this constraint on purpose. Nothing drifts into it.
-- ════════════════════════════════════════════════════════════════════════

begin;

-- The only rows carrying this column are the proof observations written
-- during the round that introduced it, whose text is a build note rather
-- than provenance. Cleared so the constraint reflects a table that is
-- actually clean, rather than one grandfathered into compliance.
do $$
declare
  v_cleared int;
begin
  update public.physical_watch_identifier_observations
     set source_reference = null
   where source_reference is not null;
  get diagnostics v_cleared = row_count;
  raise notice 'cleared source_reference on % observation(s)', v_cleared;
end $$;

alter table public.physical_watch_identifier_observations
  add constraint identifier_observation_source_reference_unused_in_v1
  check (source_reference is null);

comment on column public.physical_watch_identifier_observations.source_reference is
  'Reserved for a future governed provenance contract carrying a NON-user-supplied opaque reference. A CHECK constraint keeps it NULL in V1 because caller-supplied free text is an unprotected channel for storing the very identifiers the equality token exists to protect.';

commit;
