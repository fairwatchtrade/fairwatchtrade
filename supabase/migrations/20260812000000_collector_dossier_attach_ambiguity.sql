-- Collector Dossier production correction.
--
-- collector_dossier_attach_listing() returns a column named
-- vault_reference_id. In PL/pgSQL that output name is also a variable, so the
-- original ON CONFLICT (vault_reference_id) target was ambiguous at runtime
-- (42702). Name the table's generated unique constraint instead. No table,
-- trigger, policy, state-machine or qualification behavior changes.

create or replace function public.collector_dossier_attach_listing(
  p_listing_id uuid
)
returns table (
  dossier_id uuid,
  vault_reference_id uuid,
  dossier_status text,
  storage_url text
)
language plpgsql
security definer
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_listing_status text;
  v_decision_id uuid;
  v_fingerprint text;
  v_reference_id uuid;
  v_dossier public.collector_dossiers;
begin
  select l.status
    into v_listing_status
    from public.listings l
   where l.id = p_listing_id;

  if not found or v_listing_status <> 'published' then
    return;
  end if;

  select d.id, d.claim_fingerprint, c.vault_reference_id
    into v_decision_id, v_fingerprint, v_reference_id
    from public.identity_resolution_case k
    join public.identity_resolution_decision d
      on d.case_id = k.id
     and d.is_current
     and d.outcome = 'exact'
    join public.identity_resolution_candidate c
      on c.decision_id = d.id
     and c.candidate_role = 'selected'
     and c.vault_reference_id is not null
   where k.subject_type = 'listing'
     and k.listing_id = p_listing_id
     and d.claim_fingerprint =
       public.identity_resolution_claim_fingerprint('listing', p_listing_id)
   limit 1;

  if v_reference_id is null then
    return;
  end if;

  insert into public.collector_dossiers (vault_reference_id)
  values (v_reference_id)
  on conflict on constraint collector_dossiers_vault_reference_id_key do update
    set updated_at = now()
  returning * into v_dossier;

  insert into public.listing_collector_dossiers (
    listing_id,
    collector_dossier_id,
    identity_decision_id,
    identity_claim_fingerprint
  )
  values (
    p_listing_id,
    v_dossier.id,
    v_decision_id,
    v_fingerprint
  )
  on conflict (listing_id) do update set
    collector_dossier_id = excluded.collector_dossier_id,
    identity_decision_id = excluded.identity_decision_id,
    identity_claim_fingerprint = excluded.identity_claim_fingerprint,
    updated_at = now();

  return query
  select v_dossier.id, v_dossier.vault_reference_id, v_dossier.status, v_dossier.storage_url;
end;
$fn$;

revoke all on function public.collector_dossier_attach_listing(uuid)
  from public, anon, authenticated;
grant execute on function public.collector_dossier_attach_listing(uuid)
  to service_role;

-- PFC274 = 62 — app/api/evaluate/route.ts is untouched.
