-- ════════════════════════════════════════════════════════════════════════
-- VAULT ENRICHMENT — controlled apply RPC + append-only audit  (v2.73)
--
-- The smallest schema addition that lets an approved enrichment PLAN_ADD write
-- exactly one verified fact into vault_references.metadata.enrichment.<fact>,
-- atomically with an append-only audit event, and NOTHING else. It reuses the
-- proven FairWatchTrade mutation pattern (SECURITY DEFINER function, dedicated
-- write authority, compare-and-set, append-only *_events with before/after
-- snapshots — cf. auction_evidence_update_artifact_rights_state).
--
-- Canonical storage law (config/fact-types.mjs, enrichment repo):
--   metadata.enrichment.<fact_type> = { <value fields>, evidence:{6 fields} }
-- The merge is immutable: unrelated root keys AND sibling enrichment facts are
-- preserved; the fact is composed from canonical Vault truth (no second copy).
--
-- Values are compared SEPARATELY from evidence (the locked rule): identical
-- fact values with different evidence is ALREADY_PRESENT, not a CONFLICT.
--
-- Authority: SECURITY DEFINER, owner postgres (owns the tables, FORCE RLS off,
-- so no new RLS policy). Execute is granted ONLY to service_role — the trusted
-- apply path. No anon/authenticated/PUBLIC execute; this is a privileged write,
-- never a public one. The apply script calls ONLY this function; it never issues
-- a direct table UPDATE.
--
-- Refusals return a state and write NOTHING (no partial mutation). Only APPLIED
-- performs the UPDATE + audit insert, in one transaction.
--
-- PFC274 = 62 — the evaluate route is untouched by this migration.
-- ════════════════════════════════════════════════════════════════════════

-- ── Append-only audit / provenance ──────────────────────────────────────
create table if not exists public.vault_enrichment_events (
  id              uuid        primary key default gen_random_uuid(),
  reference_id    uuid        not null references public.vault_references(id),
  fact_type       text        not null,
  plan_hash       text        not null,
  evidence        jsonb,
  metadata_before jsonb       not null,
  metadata_after  jsonb       not null,
  applied_by      text,
  created_at      timestamptz not null default now(),
  constraint vee_fact_type_check check (fact_type in ('beat_rate','power_reserve'))
);

comment on table public.vault_enrichment_events is
  'Append-only audit of controlled Vault enrichment writes: one row per APPLIED '
  'fact, carrying the plan hash, evidence envelope, and full metadata before/after. '
  'Written atomically inside enrich_vault_reference(). Never updated or deleted.';

alter table public.vault_enrichment_events enable row level security;
-- No policies: the definer function (postgres) writes it; service_role reads via
-- bypassrls. anon/authenticated get nothing. Append-only: revoke UPDATE/DELETE.
revoke update, delete, truncate on public.vault_enrichment_events from service_role;

create index if not exists vault_enrichment_events_reference_idx
  on public.vault_enrichment_events (reference_id, created_at desc);

-- ── Controlled apply function ────────────────────────────────────────────
create or replace function public.enrich_vault_reference(
  p_reference_id   uuid,
  p_manufacturer   text,
  p_reference      text,
  p_fact_type      text,
  p_payload        jsonb,
  p_computed_hash  text,
  p_authorized_hash text,
  p_expected_env   text,
  p_applied_by     text default 'apply-enrichment-import.mjs'
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
begin
  -- Environment binding: the caller declares which project it intends; refuse
  -- unless it is THIS project. A misconfigured target fails closed.
  if p_expected_env is distinct from c_project_ref then
    return jsonb_build_object('state','ENVIRONMENT_MISMATCH');
  end if;

  -- Plan hash: the script proves computed = sha256(plan file bytes); refuse
  -- unless it equals the authorized hash it was given. Defense in depth.
  if p_computed_hash is null or p_authorized_hash is null
     or upper(p_computed_hash) is distinct from upper(p_authorized_hash) then
    return jsonb_build_object('state','HASH_MISMATCH');
  end if;

  -- Fact type allowlist.
  if p_fact_type not in ('beat_rate','power_reserve') then
    return jsonb_build_object('state','FAILED','detail','unsupported fact_type');
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return jsonb_build_object('state','FAILED','detail','payload must be an object');
  end if;

  -- Lock the exact target row (compare-and-set safety).
  select * into v_row from public.vault_references where id = p_reference_id for update;
  if not found then
    return jsonb_build_object('state','TARGET_MISSING');
  end if;

  -- Exact identity: manufacturer (brand name up the hierarchy) + reference.
  select b.name into v_brand
  from public.vault_variants v
  join public.vault_families f on f.id = v.family_id
  join public.vault_collections c on c.id = f.collection_id
  join public.vault_brands b on b.id = c.brand_id
  where v.id = v_row.variant_id;

  if v_brand is distinct from p_manufacturer or v_row.reference is distinct from p_reference then
    return jsonb_build_object('state','IDENTITY_MISMATCH',
                              'detail', jsonb_build_object('brand',v_brand,'reference',v_row.reference));
  end if;

  v_before  := coalesce(v_row.metadata, '{}'::jsonb);
  v_existing := v_before #> array['enrichment', p_fact_type];

  -- Target fact already present? Compare VALUES only (evidence excluded).
  if v_existing is not null then
    if (v_existing - 'evidence') = (p_payload - 'evidence') then
      return jsonb_build_object('state','ALREADY_PRESENT','event_id',null,
                                'metadata_before',v_before,'metadata_after',v_before);
    else
      return jsonb_build_object('state','CONFLICT',
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

  update public.vault_references set metadata = v_after where id = p_reference_id;

  insert into public.vault_enrichment_events
    (reference_id, fact_type, plan_hash, evidence, metadata_before, metadata_after, applied_by)
  values
    (p_reference_id, p_fact_type, p_authorized_hash, p_payload -> 'evidence', v_before, v_after, p_applied_by)
  returning id into v_event_id;

  return jsonb_build_object('state','APPLIED','event_id',v_event_id,
                            'metadata_before',v_before,'metadata_after',v_after);
end
$fn$;

-- Privileged write authority only — never public.
revoke all     on function public.enrich_vault_reference(uuid,text,text,text,jsonb,text,text,text,text) from public;
grant  execute on function public.enrich_vault_reference(uuid,text,text,text,jsonb,text,text,text,text) to service_role;

comment on function public.enrich_vault_reference(uuid,text,text,text,jsonb,text,text,text,text) is
  'Controlled single-fact Vault enrichment write. security definer (owner postgres), '
  'fixed empty search_path, no dynamic SQL. Verifies environment, plan hash, fact '
  'allowlist, exact identity, and target-absent compare-and-set; merges immutably '
  '(root + sibling facts preserved); writes an append-only vault_enrichment_events '
  'row atomically. Returns state in APPLIED/ALREADY_PRESENT/CONFLICT/TARGET_MISSING/'
  'IDENTITY_MISMATCH/HASH_MISMATCH/ENVIRONMENT_MISMATCH/FAILED. PFC274 = 62.';
