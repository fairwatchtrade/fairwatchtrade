-- ============================================================================
-- VAULT ENRICHMENT — MOVEMENT DIMENSIONS ACTIVATION (Flight 1, infrastructure)
--
-- Activates the `movement_dimensions` fact type across the coordinated gates
-- that must move together, and adds a production-safe dry-run mode.
--
-- THE THREE GATES (this migration owns two; the third is application code):
--   1. public.vault_enrichment_events.vee_fact_type_check   — here
--   2. enrich_vault_reference()'s internal fact allowlist    — here
--   3. FACT_FORMATTERS in lib/vault/enrichmentFacts.ts       — application
-- A write that lands with no visible representation is NOT completion, so the
-- formatter gate is verified explicitly by scripts/vault-enrichment-facts.test.mjs.
--
-- APPROVED CONTRACT (DataMan, 2026-07-30):
--   fact_type : movement_dimensions
--   payload   : { "movement_diameter_mm": 30.0, "evidence": { …unchanged… } }
--   display   : ⌀ 30.0 mm      (U+2300 DIAMETER SIGN — never Ø U+00D8)
--   meaning   : Movement diameter, 30.0 millimetres
-- The fact type is PLURAL deliberately: separately certified dimensional fields
-- may join the payload later without minting a second fact type. This flight
-- certifies ONLY movement_diameter_mm — height and thickness are refused.
--
-- STORAGE SCOPE (ruling): movement_dimensions is a REFERENCE-level fact. There
-- is no calibre entity in this system, so there is no propagation, no
-- calibre-family inheritance, and no copying a value because two references
-- share a calibre. Each reference carries its own certified evidence.
--
-- WHY DROP + CREATE RATHER THAN CREATE OR REPLACE: the signature gains
-- p_dry_run. CREATE OR REPLACE cannot change arity — it would create a second,
-- overloaded function and leave 9-argument calls ambiguous. The old signature
-- is dropped and the new one created, which also means the ACL must be
-- re-established below (a DROP takes the grants with it).
--
-- GRANTS: the v2.73 migration intended service_role-only execute but revoked
-- from PUBLIC alone; Supabase's default privileges grant EXECUTE to anon and
-- authenticated as explicit ROLE grants, which a PUBLIC revoke does not remove.
-- Because this migration drops and recreates the function, the grants are
-- written fresh here in the Stage A pattern — revoking public, anon, AND
-- authenticated explicitly — which is required for correctness after a DROP and
-- also closes that gap. This is a privileged write path, never a public one.
--
-- Rollback: scripts/movement-dimensions-activation.rollback.sql
-- PFC274 = 62 — app/api/evaluate/route.ts is untouched.
-- ============================================================================

-- ── GATE 1 · fact-type allowlist on the append-only audit table ─────────────
alter table public.vault_enrichment_events
  drop constraint if exists vee_fact_type_check;

alter table public.vault_enrichment_events
  add constraint vee_fact_type_check
  check (fact_type in ('beat_rate','power_reserve','movement_dimensions'));

-- ── GATE 2 · the controlled apply RPC: allowlist + dry-run mode ─────────────
drop function if exists public.enrich_vault_reference(
  uuid, text, text, text, jsonb, text, text, text, text);

create function public.enrich_vault_reference(
  p_reference_id    uuid,
  p_manufacturer    text,
  p_reference       text,
  p_fact_type       text,
  p_payload         jsonb,
  p_computed_hash   text,
  p_authorized_hash text,
  p_expected_env    text,
  p_applied_by      text    default 'apply-enrichment-import.mjs',
  p_dry_run         boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  c_project_ref constant text := 'aqgjcezhdoianqmoknnu';  -- this Supabase project
  v_row           public.vault_references%rowtype;
  v_brand         text;
  v_existing      jsonb;
  v_before        jsonb;
  v_after         jsonb;
  v_event_id      uuid;
  v_mm            numeric;
  v_dry           boolean := coalesce(p_dry_run, false);
begin
  -- Environment binding: the caller declares which project it intends; refuse
  -- unless it is THIS project. A misconfigured target fails closed.
  if p_expected_env is distinct from c_project_ref then
    return jsonb_build_object('state','ENVIRONMENT_MISMATCH','dry_run',v_dry);
  end if;

  -- Plan hash: the script proves computed = sha256(plan file bytes); refuse
  -- unless it equals the authorized hash it was given. Defense in depth.
  if p_computed_hash is null or p_authorized_hash is null
     or upper(p_computed_hash) is distinct from upper(p_authorized_hash) then
    return jsonb_build_object('state','HASH_MISMATCH','dry_run',v_dry);
  end if;

  -- Fact type allowlist (GATE 2).
  if p_fact_type not in ('beat_rate','power_reserve','movement_dimensions') then
    return jsonb_build_object('state','FAILED','dry_run',v_dry,
                              'detail','unsupported fact_type');
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return jsonb_build_object('state','FAILED','dry_run',v_dry,
                              'detail','payload must be an object');
  end if;

  -- Payload contract for movement_dimensions. Only movement_diameter_mm is
  -- certified in this flight; height/thickness are refused rather than stored
  -- uncertified, and a malformed value is refused rather than written into a
  -- fact the renderer would silently drop.
  if p_fact_type = 'movement_dimensions' then
    if jsonb_typeof(p_payload -> 'movement_diameter_mm') is distinct from 'number'
       or (p_payload ->> 'movement_diameter_mm')::numeric <= 0 then
      return jsonb_build_object('state','FAILED','dry_run',v_dry,
        'detail','movement_diameter_mm must be a positive number');
    end if;

    -- The two bounds below exist for DIFFERENT reasons; conflating them was an
    -- error caught by the formatter's own round-trip test.
    --
    -- RANGE is about plausibility, not rendering. lib/vault/enrichmentFacts.ts
    -- renders any two-decimal value faithfully at any magnitude (0.01 → "0.01"),
    -- so nothing here protects the display. It protects the CERTIFICATION: a
    -- movement diameter of 0.01 mm or 900 mm is not a fact, it is a data error,
    -- and a store whose whole premise is certified truth should refuse it rather
    -- than attest to it. 1–100 mm spans every real movement, from the smallest
    -- ladies' calibre to the largest pocket-watch ébauche.
    --
    -- PRECISION is about rendering, and is the bound that actually protects it.
    -- The renderer uses toFixed(1..2), so a third decimal is silently discarded
    -- (30.12345 → "30.12") and a value below 0.005 would display as "0.00" —
    -- zero for a non-zero fact. Refusing >2 decimals at the door means the
    -- stored value and the shown value can never disagree.
    v_mm := (p_payload ->> 'movement_diameter_mm')::numeric;
    if v_mm < 1 or v_mm > 100 then
      return jsonb_build_object('state','FAILED','dry_run',v_dry,
        'detail','movement_diameter_mm must be between 1 and 100 mm');
    end if;
    if scale(trim_scale(v_mm)) > 2 then
      return jsonb_build_object('state','FAILED','dry_run',v_dry,
        'detail','movement_diameter_mm supports at most 2 decimal places');
    end if;

    -- Named refusals keep their specific message: these are the dimensions a
    -- later flight is expected to certify, and the caller deserves to know the
    -- difference between "not yet" and "not a field".
    if p_payload ?| array['movement_height_mm','movement_thickness_mm','height_mm','thickness_mm'] then
      return jsonb_build_object('state','FAILED','dry_run',v_dry,
        'detail','height/thickness are not certified in this flight');
    end if;

    -- Strict allowlist. Anything not named here is refused rather than merged
    -- into the stored fact, where it would sit uncertified and invisible — the
    -- renderer ignores unknown keys, so an unrecognised field would persist
    -- forever without ever being shown or validated.
    if exists (
      select 1 from jsonb_object_keys(p_payload) as k
       where k not in ('movement_diameter_mm','evidence')
    ) then
      return jsonb_build_object('state','FAILED','dry_run',v_dry,
        'detail','unknown payload field for movement_dimensions');
    end if;

    -- Evidence is the entire basis of a certified fact. It is written to the
    -- append-only audit row as p_payload -> 'evidence'; absent or malformed, the
    -- event records NULL and the fact becomes unfalsifiable after the fact.
    if jsonb_typeof(p_payload -> 'evidence') is distinct from 'object'
       or p_payload -> 'evidence' = '{}'::jsonb then
      return jsonb_build_object('state','FAILED','dry_run',v_dry,
        'detail','evidence must be a non-empty object');
    end if;
  end if;

  -- Lock the exact target row (compare-and-set safety). Dry run takes the same
  -- path so its answer reflects the same row state a real apply would see.
  select * into v_row from public.vault_references where id = p_reference_id for update;
  if not found then
    return jsonb_build_object('state','TARGET_MISSING','dry_run',v_dry);
  end if;

  -- Exact identity: manufacturer (brand name up the hierarchy) + reference.
  select b.name into v_brand
  from public.vault_variants v
  join public.vault_families f on f.id = v.family_id
  join public.vault_collections c on c.id = f.collection_id
  join public.vault_brands b on b.id = c.brand_id
  where v.id = v_row.variant_id;

  if v_brand is distinct from p_manufacturer or v_row.reference is distinct from p_reference then
    return jsonb_build_object('state','IDENTITY_MISMATCH','dry_run',v_dry,
                              'detail', jsonb_build_object('brand',v_brand,'reference',v_row.reference));
  end if;

  v_before  := coalesce(v_row.metadata, '{}'::jsonb);
  v_existing := v_before #> array['enrichment', p_fact_type];

  -- Target fact already present? Compare VALUES only (evidence excluded).
  if v_existing is not null then
    if (v_existing - 'evidence') = (p_payload - 'evidence') then
      return jsonb_build_object('state','ALREADY_PRESENT','dry_run',v_dry,'event_id',null,
                                'metadata_before',v_before,'metadata_after',v_before);
    else
      return jsonb_build_object('state','CONFLICT','dry_run',v_dry,
                                'existing',(v_existing - 'evidence'),
                                'incoming',(p_payload - 'evidence'));
    end if;
  end if;

  -- Immutable merge: preserve all root keys AND all sibling enrichment facts.
  v_after := v_before
    || jsonb_build_object(
         'enrichment',
         coalesce(v_before -> 'enrichment', '{}'::jsonb)
           || jsonb_build_object(p_fact_type, p_payload)
       );

  -- DRY RUN: every check above has run against real row state; return the exact
  -- mutation that would be made and write NOTHING. The state is deliberately
  -- WOULD_APPLY, never APPLIED, so a dry run can never be logged or mistaken
  -- for a completed write.
  if v_dry then
    return jsonb_build_object('state','WOULD_APPLY','dry_run',true,'event_id',null,
                              'metadata_before',v_before,'metadata_after',v_after);
  end if;

  update public.vault_references set metadata = v_after where id = p_reference_id;

  insert into public.vault_enrichment_events
    (reference_id, fact_type, plan_hash, evidence, metadata_before, metadata_after, applied_by)
  values
    (p_reference_id, p_fact_type, p_authorized_hash, p_payload -> 'evidence', v_before, v_after, p_applied_by)
  returning id into v_event_id;

  return jsonb_build_object('state','APPLIED','dry_run',false,'event_id',v_event_id,
                            'metadata_before',v_before,'metadata_after',v_after);
end
$fn$;

-- Privileged write authority only — never public. Required after the DROP:
-- Supabase default privileges would otherwise grant EXECUTE to anon and
-- authenticated on the newly created function.
revoke all on function public.enrich_vault_reference(uuid,text,text,text,jsonb,text,text,text,text,boolean) from public;
revoke all on function public.enrich_vault_reference(uuid,text,text,text,jsonb,text,text,text,text,boolean) from anon;
revoke all on function public.enrich_vault_reference(uuid,text,text,text,jsonb,text,text,text,text,boolean) from authenticated;
grant execute on function public.enrich_vault_reference(uuid,text,text,text,jsonb,text,text,text,text,boolean) to service_role;

comment on function public.enrich_vault_reference(uuid,text,text,text,jsonb,text,text,text,text,boolean) is
  'Controlled single-fact Vault enrichment write. security definer (owner postgres), '
  'fixed empty search_path, no dynamic SQL. Verifies environment, plan hash, fact '
  'allowlist (beat_rate | power_reserve | movement_dimensions), per-fact payload '
  'contract, exact identity, and target-absent compare-and-set; merges immutably; '
  'writes an append-only vault_enrichment_events row atomically. p_dry_run runs every '
  'check against real row state, returns the exact mutation as WOULD_APPLY, and writes '
  'nothing. States: APPLIED/WOULD_APPLY/ALREADY_PRESENT/CONFLICT/TARGET_MISSING/'
  'IDENTITY_MISMATCH/HASH_MISMATCH/ENVIRONMENT_MISMATCH/FAILED. PFC274 = 62.';
