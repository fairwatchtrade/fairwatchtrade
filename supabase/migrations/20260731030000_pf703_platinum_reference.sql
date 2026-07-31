-- ════════════════════════════════════════════════════════════════════════
-- PF703 PLATINUM — EXACT PRODUCTION REFERENCE CREATION (Flight 2, Phase B)
-- supabase/migrations/20260731030000_pf703_platinum_reference.sql
--
-- Creates exactly two rows:
--
--   Parmigiani Fleurier → Tonda → Tonda PF → Micro-Rotor Platinum
--                                            → PFC914-2020002-200182
--
-- Nothing else. This is deliberately a one-purpose migration rather than the
-- legacy Vault ingester: that script upserts the brand but plain-INSERTs
-- everything beneath it, so pointing it at an existing brand appends a
-- duplicate subtree. It is quarantined as of v3.5 and must not be used here.
--
-- ── WHY A MIGRATION AND NOT A CONSOLE INSERT ───────────────────────────
-- An unrecorded console insert leaves no reviewable artifact, cannot be
-- rehearsed, and cannot refuse. This runs atomically, proves its own
-- preconditions, and is idempotent — running it twice creates nothing and
-- errors nothing.
--
-- ── WHAT IT DOES NOT DO ────────────────────────────────────────────────
-- No fact is written. movement_dimensions is Phase C and is a separate,
-- separately-authorized action through enrich_vault_reference. This
-- migration creates the identity the fact will later attach to, and stops.
--
-- No Galaxy activation. No sibling substitution. No calibre propagation.
-- The steel sibling PFC914-1020001-100182 is read for verification only and
-- never written.
--
-- Canary: PFC274 = 62 — app/api/evaluate/route.ts untouched.
-- ════════════════════════════════════════════════════════════════════════

begin;

do $$
declare
  v_family_id   uuid;
  v_variant_id  uuid;
  v_steel_ref   text;
  v_steel_var   uuid;
  v_paths       int;
  v_v_before    int; v_r_before int; v_c_before int; v_f_before int;
  v_v_after     int; v_r_after  int; v_c_after  int; v_f_after  int;
  v_created_var int := 0;
  v_created_ref int := 0;
begin
  select count(*) into v_c_before from public.vault_collections;
  select count(*) into v_f_before from public.vault_families;
  select count(*) into v_v_before from public.vault_variants;
  select count(*) into v_r_before from public.vault_references;

  -- ── 1 · Resolve exactly ONE parent path ─────────────────────────────
  -- Ambiguity here is the whole risk: two "Tonda PF" families would make
  -- "which parent" a guess. The uniqueness indexes from v3.4 make that
  -- impossible now, but the migration proves it rather than assuming it.
  select count(*) into v_paths
    from public.vault_brands b
    join public.vault_collections c on c.brand_id = b.id
    join public.vault_families f    on f.collection_id = c.id
   where b.slug = 'parmigiani-fleurier' and c.name = 'Tonda' and f.name = 'Tonda PF';

  if v_paths <> 1 then
    raise exception 'REFUSED: expected exactly 1 parent path Parmigiani/Tonda/Tonda PF, found %', v_paths;
  end if;

  select f.id into v_family_id
    from public.vault_brands b
    join public.vault_collections c on c.brand_id = b.id
    join public.vault_families f    on f.collection_id = c.id
   where b.slug = 'parmigiani-fleurier' and c.name = 'Tonda' and f.name = 'Tonda PF';

  -- ── 2 · Capture the steel sibling BEFORE, to prove it after ─────────
  select v.id, r.reference into v_steel_var, v_steel_ref
    from public.vault_variants v
    join public.vault_references r on r.variant_id = v.id
   where v.family_id = v_family_id and v.name = 'Micro-Rotor Steel';

  if v_steel_ref is distinct from 'PFC914-1020001-100182' then
    raise exception 'REFUSED: steel sibling not in the expected state (found %)', coalesce(v_steel_ref,'<none>');
  end if;

  -- ── 3 · Create the variant, idempotently ────────────────────────────
  select id into v_variant_id
    from public.vault_variants
   where family_id = v_family_id and name = 'Micro-Rotor Platinum';

  if v_variant_id is null then
    insert into public.vault_variants (family_id, name, notes, search_aliases, sort_order)
    values (
      v_family_id,
      'Micro-Rotor Platinum',
      'Platinum-case Tonda PF Micro-Rotor configuration powered by the ultra-thin Caliber PF703 with platinum micro-rotor.',
      array['Platinum Micro-Rotor'],
      (select coalesce(max(sort_order), -1) + 1 from public.vault_variants where family_id = v_family_id)
    )
    returning id into v_variant_id;
    v_created_var := 1;
  else
    raise notice 'Variant already present — reusing % (idempotent).', v_variant_id;
  end if;

  -- ── 4 · Create the reference, idempotently ──────────────────────────
  if not exists (
    select 1 from public.vault_references
     where variant_id = v_variant_id and reference = 'PFC914-2020002-200182'
  ) then
    insert into public.vault_references (variant_id, reference, sort_order)
    values (v_variant_id, 'PFC914-2020002-200182', 0);
    v_created_ref := 1;
  else
    raise notice 'Reference already present (idempotent).';
  end if;

  -- ── 5 · Prove the exact bounded outcome ─────────────────────────────
  select count(*) into v_c_after from public.vault_collections;
  select count(*) into v_f_after from public.vault_families;
  select count(*) into v_v_after from public.vault_variants;
  select count(*) into v_r_after from public.vault_references;

  if v_c_after <> v_c_before then
    raise exception 'REFUSED: collection count changed (% -> %)', v_c_before, v_c_after;
  end if;
  if v_f_after <> v_f_before then
    raise exception 'REFUSED: family count changed (% -> %)', v_f_before, v_f_after;
  end if;
  if v_v_after <> v_v_before + v_created_var then
    raise exception 'REFUSED: variant count moved by more than the one intended addition (% -> %)', v_v_before, v_v_after;
  end if;
  if v_r_after <> v_r_before + v_created_ref then
    raise exception 'REFUSED: reference count moved by more than the one intended addition (% -> %)', v_r_before, v_r_after;
  end if;

  -- the target must resolve exactly once, in the right place
  if (select count(*) from public.vault_references where reference = 'PFC914-2020002-200182') <> 1 then
    raise exception 'REFUSED: target reference does not resolve exactly once';
  end if;
  if not exists (
    select 1 from public.vault_references r
      join public.vault_variants v on v.id = r.variant_id
     where r.reference = 'PFC914-2020002-200182'
       and v.name = 'Micro-Rotor Platinum'
       and v.family_id = v_family_id
  ) then
    raise exception 'REFUSED: target reference is not attached to Micro-Rotor Platinum under Tonda PF';
  end if;

  -- the steel sibling must be exactly as it was
  if not exists (
    select 1 from public.vault_variants v
      join public.vault_references r on r.variant_id = v.id
     where v.id = v_steel_var and v.name = 'Micro-Rotor Steel'
       and r.reference = 'PFC914-1020001-100182'
  ) then
    raise exception 'REFUSED: steel sibling changed';
  end if;

  -- no Parmigiani descendant may have been duplicated
  if (select count(*) from (
        select v.family_id, v.name from public.vault_variants v
          join public.vault_families f on f.id = v.family_id
          join public.vault_collections c on c.id = f.collection_id
          join public.vault_brands b on b.id = c.brand_id
         where b.slug = 'parmigiani-fleurier'
         group by 1,2 having count(*) > 1) d) > 0 then
    raise exception 'REFUSED: duplicate Parmigiani variant detected';
  end if;

  -- and NO fact may exist yet — that is Phase C, separately authorized
  if exists (
    select 1 from public.vault_references
     where reference = 'PFC914-2020002-200182'
       and coalesce(metadata -> 'enrichment', '{}'::jsonb) ? 'movement_dimensions'
  ) then
    raise exception 'REFUSED: a movement_dimensions fact is present — this migration must not write one';
  end if;

  raise notice 'Phase B complete — variant created: %, reference created: %. Target resolves once under Micro-Rotor Platinum.',
    v_created_var, v_created_ref;
end $$;

commit;
