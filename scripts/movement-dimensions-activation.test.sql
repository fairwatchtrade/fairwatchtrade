-- ============================================================================
-- MOVEMENT DIMENSIONS ACTIVATION — Flight 1 database harness
--
-- Target: a DISPOSABLE production-derived database with the activation
-- migration applied. NEVER production.
--
-- Proves the two database gates and the dry-run contract:
--   · unsupported fact types still refused
--   · invalid payloads refused (non-numeric, zero/negative, uncertified fields)
--   · every existing guard still fires IN DRY-RUN (env, hash, identity, target)
--   · dry run returns the exact projected mutation as WOULD_APPLY and writes
--     nothing — no fact, no audit event
--   · a real apply still works, is idempotent, and detects conflict
--   · the stored value and audit row are correct
--   · no sibling reference changed
--   · the table CHECK itself refuses an unlisted fact type
--
-- Discovers its own target (first un-enriched reference + its true identity),
-- so it is portable across restores. Every write is reverted in place and the
-- final assertions prove zero residue.
--
-- The THIRD gate — FACT_FORMATTERS in lib/vault/enrichmentFacts.ts — is proven
-- separately by scripts/vault-enrichment-facts.test.mjs, which asserts the
-- locked display "⌀ 30.0 mm", the spoken form, and that the symbol is
-- U+2300 DIAMETER SIGN rather than Ø (U+00D8) or ∅ (U+2205). A write that lands
-- with no visible representation is not completion.
--
-- PFC274 = 62 — the evaluate route is untouched.
-- ============================================================================

do $$
declare
  H constant text  := 'AAAA1111BBBB2222';
  E constant text  := 'aqgjcezhdoianqmoknnu';
  P constant jsonb := '{"movement_diameter_mm":30.0,"evidence":{"source_type":"manufacturer","verified":true}}'::jsonb;
  v_ref uuid; v_brand text; v_reference text; v_meta jsonb;
  b_events bigint; b_enriched bigint; r jsonb; n int := 0;
begin
  select count(*) into b_events   from public.vault_enrichment_events;
  select count(*) into b_enriched from public.vault_references where metadata ? 'enrichment';

  select r2.id, r2.reference, b.name into v_ref, v_reference, v_brand
  from public.vault_references r2
  join public.vault_variants v   on v.id = r2.variant_id
  join public.vault_families f   on f.id = v.family_id
  join public.vault_collections c on c.id = f.collection_id
  join public.vault_brands b     on b.id = c.brand_id
  where not (coalesce(r2.metadata,'{}'::jsonb) ? 'enrichment') limit 1;
  select metadata into v_meta from public.vault_references where id = v_ref;
  raise notice 'target: % / %', v_brand, v_reference;

  -- 1 · unsupported fact type still refused
  r := public.enrich_vault_reference(v_ref,v_brand,v_reference,'case_diameter',P,H,H,E,'t',true);
  if r->>'state' <> 'FAILED' then raise exception 'FAIL 1 unsupported type: %', r; end if; n:=n+1;

  -- 2..4 · invalid payload contract
  r := public.enrich_vault_reference(v_ref,v_brand,v_reference,'movement_dimensions','{"movement_diameter_mm":"30"}'::jsonb,H,H,E,'t',true);
  if r->>'state' <> 'FAILED' then raise exception 'FAIL 2 string diameter: %', r; end if; n:=n+1;
  r := public.enrich_vault_reference(v_ref,v_brand,v_reference,'movement_dimensions','{"movement_diameter_mm":0}'::jsonb,H,H,E,'t',true);
  if r->>'state' <> 'FAILED' then raise exception 'FAIL 3 zero: %', r; end if; n:=n+1;
  r := public.enrich_vault_reference(v_ref,v_brand,v_reference,'movement_dimensions','{"movement_diameter_mm":30.0,"movement_height_mm":4.2}'::jsonb,H,H,E,'t',true);
  if r->>'state' <> 'FAILED' or r->>'detail' not like '%height/thickness%' then raise exception 'FAIL 4 height: %', r; end if; n:=n+1;

  -- 4a..4h · PRECISION, RANGE, UNKNOWN FIELDS, EVIDENCE (Vision review).
  -- Each boundary asserts the DETAIL too, so a value rejected for the wrong
  -- reason cannot pass as a correct refusal.

  -- Precision beyond what the renderer can state: toFixed(1..2) would display
  -- 30.12345 as "30.12", silently truncating certified data.
  r := public.enrich_vault_reference(v_ref,v_brand,v_reference,'movement_dimensions','{"movement_diameter_mm":30.123,"evidence":{"source_type":"manufacturer"}}'::jsonb,H,H,E,'t',true);
  if r->>'state' <> 'FAILED' or r->>'detail' not like '%2 decimal%' then raise exception 'FAIL 4a precision: %', r; end if; n:=n+1;

  -- Below range. NOT a rendering problem — 0.01 renders faithfully as "0.01".
  -- It is refused because it is not a credible movement diameter, and a store
  -- of certified facts should not attest to one.
  r := public.enrich_vault_reference(v_ref,v_brand,v_reference,'movement_dimensions','{"movement_diameter_mm":0.01,"evidence":{"source_type":"manufacturer"}}'::jsonb,H,H,E,'t',true);
  if r->>'state' <> 'FAILED' or r->>'detail' not like '%between 1 and 100%' then raise exception 'FAIL 4b under-range: %', r; end if; n:=n+1;

  r := public.enrich_vault_reference(v_ref,v_brand,v_reference,'movement_dimensions','{"movement_diameter_mm":150,"evidence":{"source_type":"manufacturer"}}'::jsonb,H,H,E,'t',true);
  if r->>'state' <> 'FAILED' or r->>'detail' not like '%between 1 and 100%' then raise exception 'FAIL 4c over-range: %', r; end if; n:=n+1;

  -- Unknown field: the renderer ignores it, so it would persist uncertified.
  r := public.enrich_vault_reference(v_ref,v_brand,v_reference,'movement_dimensions','{"movement_diameter_mm":30.0,"movement_diameter_inches":1.18,"evidence":{"source_type":"manufacturer"}}'::jsonb,H,H,E,'t',true);
  if r->>'state' <> 'FAILED' or r->>'detail' not like '%unknown payload field%' then raise exception 'FAIL 4d unknown field: %', r; end if; n:=n+1;

  -- Evidence absent / empty / wrong type — the audit row would record NULL.
  r := public.enrich_vault_reference(v_ref,v_brand,v_reference,'movement_dimensions','{"movement_diameter_mm":30.0}'::jsonb,H,H,E,'t',true);
  if r->>'state' <> 'FAILED' or r->>'detail' not like '%evidence%' then raise exception 'FAIL 4e evidence missing: %', r; end if; n:=n+1;
  r := public.enrich_vault_reference(v_ref,v_brand,v_reference,'movement_dimensions','{"movement_diameter_mm":30.0,"evidence":{}}'::jsonb,H,H,E,'t',true);
  if r->>'state' <> 'FAILED' or r->>'detail' not like '%evidence%' then raise exception 'FAIL 4f evidence empty: %', r; end if; n:=n+1;
  r := public.enrich_vault_reference(v_ref,v_brand,v_reference,'movement_dimensions','{"movement_diameter_mm":30.0,"evidence":"manufacturer"}'::jsonb,H,H,E,'t',true);
  if r->>'state' <> 'FAILED' or r->>'detail' not like '%evidence%' then raise exception 'FAIL 4g evidence not object: %', r; end if; n:=n+1;

  -- 4h · the boundaries themselves must be ACCEPTED, or the guard is too tight:
  -- exactly 1 mm, exactly 100 mm, and exactly two decimals.
  r := public.enrich_vault_reference(v_ref,v_brand,v_reference,'movement_dimensions','{"movement_diameter_mm":1,"evidence":{"source_type":"manufacturer"}}'::jsonb,H,H,E,'t',true);
  if r->>'state' <> 'WOULD_APPLY' then raise exception 'FAIL 4h min bound rejected: %', r; end if; n:=n+1;
  r := public.enrich_vault_reference(v_ref,v_brand,v_reference,'movement_dimensions','{"movement_diameter_mm":100,"evidence":{"source_type":"manufacturer"}}'::jsonb,H,H,E,'t',true);
  if r->>'state' <> 'WOULD_APPLY' then raise exception 'FAIL 4h max bound rejected: %', r; end if; n:=n+1;
  r := public.enrich_vault_reference(v_ref,v_brand,v_reference,'movement_dimensions','{"movement_diameter_mm":30.25,"evidence":{"source_type":"manufacturer"}}'::jsonb,H,H,E,'t',true);
  if r->>'state' <> 'WOULD_APPLY' then raise exception 'FAIL 4h two decimals rejected: %', r; end if; n:=n+1;

  -- 5 · every guard still fires in dry-run mode
  r := public.enrich_vault_reference(v_ref,v_brand,v_reference,'movement_dimensions',P,H,H,'wrong-project','t',true);
  if r->>'state' <> 'ENVIRONMENT_MISMATCH' then raise exception 'FAIL 5a env: %', r; end if; n:=n+1;
  r := public.enrich_vault_reference(v_ref,v_brand,v_reference,'movement_dimensions',P,'X','Y',E,'t',true);
  if r->>'state' <> 'HASH_MISMATCH' then raise exception 'FAIL 5b hash: %', r; end if; n:=n+1;
  r := public.enrich_vault_reference(v_ref,'Not The Brand',v_reference,'movement_dimensions',P,H,H,E,'t',true);
  if r->>'state' <> 'IDENTITY_MISMATCH' then raise exception 'FAIL 5c identity: %', r; end if; n:=n+1;
  r := public.enrich_vault_reference('00000000-0000-0000-0000-000000000000'::uuid,v_brand,v_reference,'movement_dimensions',P,H,H,E,'t',true);
  if r->>'state' <> 'TARGET_MISSING' then raise exception 'FAIL 5d missing: %', r; end if; n:=n+1;

  -- 6 · dry run returns the exact mutation as WOULD_APPLY
  r := public.enrich_vault_reference(v_ref,v_brand,v_reference,'movement_dimensions',P,H,H,E,'t',true);
  if r->>'state' <> 'WOULD_APPLY' then raise exception 'FAIL 6a state: %', r; end if;
  if (r->>'dry_run')::boolean is not true then raise exception 'FAIL 6b dry_run flag: %', r; end if;
  if r->'metadata_after'#>>'{enrichment,movement_dimensions,movement_diameter_mm}' <> '30.0' then
    raise exception 'FAIL 6c projected mutation: %', r->'metadata_after'; end if;
  if r->>'event_id' is not null then raise exception 'FAIL 6d event_id set'; end if;
  n:=n+1;

  -- 7 · dry run wrote nothing
  if (select count(*) from public.vault_enrichment_events) <> b_events then raise exception 'FAIL 7a event written'; end if;
  if (select metadata from public.vault_references where id=v_ref) ? 'enrichment' then
    raise exception 'FAIL 7b metadata mutated by dry run'; end if;
  n:=n+1;

  -- 8 · real apply, idempotency, conflict
  r := public.enrich_vault_reference(v_ref,v_brand,v_reference,'movement_dimensions',P,H,H,E,'harness',false);
  if r->>'state' <> 'APPLIED' then raise exception 'FAIL 8a apply: %', r; end if;
  if (r->>'dry_run')::boolean is not false then raise exception 'FAIL 8b dry_run false'; end if; n:=n+1;
  r := public.enrich_vault_reference(v_ref,v_brand,v_reference,'movement_dimensions',P,H,H,E,'harness',false);
  if r->>'state' <> 'ALREADY_PRESENT' then raise exception 'FAIL 8c idempotency: %', r; end if; n:=n+1;
  -- 8d · a DIFFERENT certified value must be reported as CONFLICT, never
  --      silently overwritten. Evidence is supplied because the payload
  --      contract now requires it — without it this call would be refused at
  --      validation and would never reach the compare-and-set, testing nothing.
  r := public.enrich_vault_reference(v_ref,v_brand,v_reference,'movement_dimensions','{"movement_diameter_mm":31.0,"evidence":{"source_type":"manufacturer"}}'::jsonb,H,H,E,'harness',false);
  if r->>'state' <> 'CONFLICT' then raise exception 'FAIL 8d conflict: %', r; end if; n:=n+1;

  -- 9 · stored value and audit row
  if (select metadata#>>'{enrichment,movement_dimensions,movement_diameter_mm}' from public.vault_references where id=v_ref) <> '30.0' then
    raise exception 'FAIL 9a stored value'; end if;
  if (select count(*) from public.vault_enrichment_events where reference_id=v_ref and fact_type='movement_dimensions') <> 1 then
    raise exception 'FAIL 9b audit row'; end if; n:=n+1;

  -- 10 · no sibling reference changed
  if (select count(*) from public.vault_references where metadata ? 'enrichment') <> b_enriched + 1 then
    raise exception 'FAIL 10 sibling changed'; end if; n:=n+1;

  -- 11a · POSITIVE CONTROL. The identical insert with an ALLOWED fact_type must
  --       SUCCEED. Without this, 11b proves only "the insert failed somehow" —
  --       it establishes that every column, type, and NOT NULL is satisfied, so
  --       the sole remaining variable in 11b is fact_type.
  --
  --       (The previous form of this test named prior_state, attestation_basis
  --       and actor_uid — none of which are columns on this table. It failed on
  --       undefined_column, the handler swallowed it, and the test reported PASS
  --       without ever reaching the CHECK. Caught by Vision on review.)
  insert into public.vault_enrichment_events
    (reference_id, fact_type, plan_hash, metadata_before, metadata_after)
  values (v_ref, 'beat_rate', H, '{}'::jsonb, '{}'::jsonb);
  delete from public.vault_enrichment_events
   where reference_id = v_ref and fact_type = 'beat_rate' and plan_hash = H;
  n:=n+1;

  -- 11b · the table CHECK itself refuses an unlisted fact type. ONLY
  --       check_violation is caught — a schema drift, a NOT NULL slip or an FK
  --       failure now fails the suite loudly instead of masquerading as a pass.
  begin
    insert into public.vault_enrichment_events
      (reference_id, fact_type, plan_hash, metadata_before, metadata_after)
    values (v_ref, 'case_diameter', H, '{}'::jsonb, '{}'::jsonb);
    raise exception 'FAIL 11b CHECK accepted unlisted fact_type';
  exception when check_violation then null;
  end; n:=n+1;

  -- ── revert the applied fact + its event before the rollback-preflight tests ──
  delete from public.vault_enrichment_events where reference_id=v_ref and fact_type='movement_dimensions';
  update public.vault_references set metadata = v_meta where id = v_ref;

  -- 12 · ROLLBACK PREFLIGHT — a STORED FACT WITH NO AUDIT EVENT must still
  --      block. This is the case a preflight guarding only the audit table
  --      would miss: rollback would restore the narrowed CHECK and strand an
  --      orphaned fact whose type is no longer allowlisted.
  --      This block MIRRORS the preflight in
  --      scripts/movement-dimensions-activation.rollback.sql — the two must
  --      stay in step.
  update public.vault_references
     set metadata = coalesce(v_meta,'{}'::jsonb) || jsonb_build_object('enrichment',
           coalesce(coalesce(v_meta,'{}'::jsonb) -> 'enrichment','{}'::jsonb)
             || jsonb_build_object('movement_dimensions', P))
   where id = v_ref;
  if (select count(*) from public.vault_enrichment_events where fact_type='movement_dimensions') <> 0 then
    raise exception 'FAIL 12 setup: an audit event exists, this case requires none'; end if;

  declare
    v_facts bigint; v_events bigint; v_refused boolean := false;
  begin
    select count(*) into v_facts from public.vault_references
     where coalesce(metadata -> 'enrichment','{}'::jsonb) ? 'movement_dimensions';
    select count(*) into v_events from public.vault_enrichment_events
     where fact_type = 'movement_dimensions';
    if v_facts <> 1 then raise exception 'FAIL 12a expected exactly 1 orphan fact, found %', v_facts; end if;
    if v_events <> 0 then raise exception 'FAIL 12b expected 0 events, found %', v_events; end if;
    if v_facts > 0 or v_events > 0 then v_refused := true; end if;
    if not v_refused then raise exception 'FAIL 12c preflight would have ALLOWED rollback with an orphaned fact'; end if;
  end;
  n:=n+1;

  -- 13 · the same preflight PERMITS rollback once the fact is gone
  update public.vault_references set metadata = v_meta where id = v_ref;
  declare
    v_facts bigint; v_events bigint;
  begin
    select count(*) into v_facts from public.vault_references
     where coalesce(metadata -> 'enrichment','{}'::jsonb) ? 'movement_dimensions';
    select count(*) into v_events from public.vault_enrichment_events
     where fact_type = 'movement_dimensions';
    if v_facts > 0 or v_events > 0 then
      raise exception 'FAIL 13 preflight still blocking with nothing present (facts=%, events=%)', v_facts, v_events; end if;
  end;
  n:=n+1;

  if (select count(*) from public.vault_enrichment_events) <> b_events then raise exception 'RESIDUE events'; end if;
  if (select count(*) from public.vault_references where metadata ? 'enrichment') <> b_enriched then raise exception 'RESIDUE enrichment'; end if;

  raise notice 'movement-dimensions Flight 1 harness: ALL PASS (% checks), zero residue', n;
end $$;
