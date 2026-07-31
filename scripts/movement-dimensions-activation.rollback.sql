-- ============================================================================
-- ROLLBACK — Movement Dimensions activation (Flight 1)
--
-- Restores the pre-activation state of BOTH database gates:
--   1. vee_fact_type_check back to ('beat_rate','power_reserve')
--   2. enrich_vault_reference() back to its 9-argument, no-dry-run form
--
-- NON-DESTRUCTIVE to data: no fact and no audit event is removed.
--
-- PREFLIGHT REFUSES ON EITHER CONDITION, and runs BEFORE any destructive
-- statement:
--   (a) any STORED movement_dimensions fact on vault_references.metadata, or
--   (b) any movement_dimensions AUDIT EVENT.
-- Both are checked because they are independent: a stored fact can exist with
-- no audit row (an event removed by the table owner, or a fact written by any
-- path other than the RPC). Guarding only the audit table would let rollback
-- restore the narrowed CHECK and strand an orphaned fact whose type is no
-- longer allowlisted — unwritable, unauditable, and invisible to the
-- constraint that is supposed to govern it. Refusal is the correct outcome:
-- the data question must be answered before the mechanism is withdrawn.
--
-- The application gate (FACT_FORMATTERS in lib/vault/enrichmentFacts.ts) is
-- reverted by reverting the commit; a stale formatter entry is harmless on its
-- own (it renders nothing for a fact type that can no longer be written).
--
-- Grants are re-established in the Stage A pattern, matching the migration.
--
-- PFC274 = 62 — the evaluate route is untouched.
-- ============================================================================

-- ── PREFLIGHT — must run before ANY destructive statement below ────────────
-- Refuses if a stored fact OR an audit event exists. Checked independently so
-- that either alone blocks the rollback.
do $$
declare
  v_facts  bigint;
  v_events bigint;
begin
  select count(*) into v_facts
    from public.vault_references
   where coalesce(metadata -> 'enrichment', '{}'::jsonb) ? 'movement_dimensions';

  select count(*) into v_events
    from public.vault_enrichment_events
   where fact_type = 'movement_dimensions';

  if v_facts > 0 or v_events > 0 then
    raise exception
      'ROLLBACK REFUSED: % stored movement_dimensions fact(s) and % audit event(s) exist. Either alone blocks withdrawal — resolve the data before withdrawing the fact type.',
      v_facts, v_events;
  end if;
end $$;

alter table public.vault_enrichment_events
  drop constraint if exists vee_fact_type_check;

alter table public.vault_enrichment_events
  add constraint vee_fact_type_check
  check (fact_type in ('beat_rate','power_reserve'));

drop function if exists public.enrich_vault_reference(
  uuid, text, text, text, jsonb, text, text, text, text, boolean);

create function public.enrich_vault_reference(
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
  c_project_ref constant text := 'aqgjcezhdoianqmoknnu';
  v_row           public.vault_references%rowtype;
  v_brand         text;
  v_existing      jsonb;
  v_before        jsonb;
  v_after         jsonb;
  v_event_id      uuid;
begin
  if p_expected_env is distinct from c_project_ref then
    return jsonb_build_object('state','ENVIRONMENT_MISMATCH');
  end if;

  if p_computed_hash is null or p_authorized_hash is null
     or upper(p_computed_hash) is distinct from upper(p_authorized_hash) then
    return jsonb_build_object('state','HASH_MISMATCH');
  end if;

  if p_fact_type not in ('beat_rate','power_reserve') then
    return jsonb_build_object('state','FAILED','detail','unsupported fact_type');
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return jsonb_build_object('state','FAILED','detail','payload must be an object');
  end if;

  select * into v_row from public.vault_references where id = p_reference_id for update;
  if not found then
    return jsonb_build_object('state','TARGET_MISSING');
  end if;

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

revoke all on function public.enrich_vault_reference(uuid,text,text,text,jsonb,text,text,text,text) from public;
revoke all on function public.enrich_vault_reference(uuid,text,text,text,jsonb,text,text,text,text) from anon;
revoke all on function public.enrich_vault_reference(uuid,text,text,text,jsonb,text,text,text,text) from authenticated;
grant execute on function public.enrich_vault_reference(uuid,text,text,text,jsonb,text,text,text,text) to service_role;
