-- ════════════════════════════════════════════════════════════════════════
-- AUCTION EVIDENCE — a privately retained keeper may have no URL     (v8.21)
-- supabase/migrations/20260902200000_auction_evidence_private_keeper_artifacts.sql
--
-- ⛔ NOT APPLIED TO PRODUCTION BY THE FLIGHT THAT WROTE IT.
--    Production application order, when the founder walks the gate:
--      1. 20260902140000_auction_operations_monaco_portable_adapter.sql
--      2. this file
--
-- THE MISCONCEPTION THIS FILE EXISTS TO KILL:
--
--   "Every source artifact is something we fetched from a URL."
--
-- The accepted, reconciled Monaco keeper is not an official webpage and its
-- hash must never be attached to one. It is the exact governed file FWT
-- reviewed and planned from, so it earns its own source-artifact row — one
-- that represents the private file itself. That row has no truthful URL.
-- Faking one to satisfy NOT NULL would be false provenance, which is the
-- thing this table exists to prevent.
--
-- ── WHAT ALREADY EXISTS AND IS NOT TOUCHED ─────────────────────────────
-- asa_retention_path_check   requires a storage path whenever retention is
--                            full_artifact_private / full_artifact_publishable.
--                            It governs every retained artifact and is
--                            already correct. PRESERVED UNCHANGED. Its rule is
--                            deliberately NOT repeated below.
-- asa_content_hash_check     enforces SHA-256 formatting when a hash is
--                            present. PRESERVED. This file adds a PRESENCE
--                            rule for the private-file state, not a weaker
--                            replacement for the format rule.
-- asa_intake_method_check    already admits 'founder_supplied_file'.
-- asa_retention_scope_check  already admits 'full_artifact_private'.
--
-- ── WHAT IS ACTUALLY NEW ───────────────────────────────────────────────
-- 1. source_url loses its unconditional NOT NULL.
-- 2. A narrow conditional invariant replaces it: a URL-less artifact is a
--    private founder-supplied file and must carry an exact content hash.
-- 3. A partial unique identity for that state: one sale + one exact keeper
--    hash. NULL-safe ONLY because (2) forbids a null hash in that state —
--    PostgreSQL unique indexes treat NULLs as distinct, so the CHECK and the
--    index are one unit and the CHECK comes first.
-- 4. A dedicated private bucket for the exact keeper bytes, content-
--    addressed by SHA-256. No client policy is created: there is no browser
--    path into it. The server-side writer is the only writer.
--
-- No grant changes. anon and authenticated keep no INSERT on this table;
-- service_role keeps the INSERT it already had, reachable only behind the
-- founder-gated Apply boundary — which remains withheld for monaco-portable.
-- ════════════════════════════════════════════════════════════════════════

-- 1 · the unconditional rule goes
alter table public.auction_evidence_source_artifact
  alter column source_url drop not null;

-- 2 · the conditional truth replaces it. Storage-path presence is NOT
--     restated here: asa_retention_path_check owns it and is unchanged.
alter table public.auction_evidence_source_artifact
  drop constraint if exists asa_source_identity_check;
alter table public.auction_evidence_source_artifact
  add constraint asa_source_identity_check check (
    source_url is not null
    or (
      source_url is null
      and artifact_retention_scope = 'full_artifact_private'
      and intake_method = 'founder_supplied_file'
      and content_hash is not null
    )
  );

comment on constraint asa_source_identity_check on public.auction_evidence_source_artifact is
  'A URL-less artifact is a privately retained founder-supplied file identified by its exact content hash. '
  'Never satisfy source_url with a fabricated URL. Storage-path presence is governed separately by asa_retention_path_check.';

-- 3 · one sale + one exact private keeper. Null-safe because the CHECK
--     above forbids a null hash in this state; created AFTER it on purpose.
create unique index if not exists asa_private_keeper_identity_uniq
  on public.auction_evidence_source_artifact (sale_id, content_hash)
  where source_url is null and artifact_retention_scope = 'full_artifact_private';

comment on index public.asa_private_keeper_identity_uniq is
  'Idempotent identity of a privately retained keeper: (sale, exact content hash) in the URL-less private-file state. '
  'The writer resolves an existing keeper row by this identity and reuses it; it never overwrites a disagreeing one.';

-- 4 · the durable private home for exact keeper bytes. Content-addressed:
--     sha256/<64hex>.json. Bounded to the portable staging limit. Private,
--     and deliberately without any storage.objects policy — the only writer
--     is the server-side portable writer behind the founder Apply gate.
insert into storage.buckets (id, name, public, file_size_limit)
values ('auction-evidence-private-keepers', 'auction-evidence-private-keepers', false, 20971520)
on conflict (id) do nothing;
