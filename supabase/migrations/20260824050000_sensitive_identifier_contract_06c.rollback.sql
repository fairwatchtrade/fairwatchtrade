-- Rollback for 20260824050000_sensitive_identifier_contract_06c.sql
--
-- ⚠ THIS DESTROYS IDENTIFIER EVIDENCE, AND IT IS UNRECOVERABLE IN A WAY
--   MOST ROLLBACKS ARE NOT.
--
-- V1 deliberately stores no raw identifier. There is therefore no source
-- from which these observations could ever be regenerated — not from the
-- database, not from a backup of some other table, not by asking the
-- application to recompute. Dropping this table does not "undo a
-- migration"; it deletes evidence that exists nowhere else.
--
-- Everything recorded through the write path — who observed what, when,
-- from which source, and every correction chain — goes with it.
--
-- Run this only while the table is genuinely empty, or with explicit
-- founder authorization to discard its contents.

begin;

drop function if exists public.record_identifier_observation(
  uuid, public.watch_identifier_type, text, integer, integer,
  public.identifier_source_class, uuid, text, timestamptz, uuid, uuid
);

drop table if exists public.physical_watch_identifier_observations;

drop type if exists public.identifier_source_class;
drop type if exists public.watch_identifier_type;

commit;
