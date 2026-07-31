-- ════════════════════════════════════════════════════════════════════════
-- FLIGHT A — LANG & HEYNE DUPLICATE REPAIR + HIERARCHY UNIQUENESS
-- supabase/migrations/20260731010000_vault_identity_constraints.sql
--
-- One transaction. Deletes the proven duplicate subtrees, then closes the
-- path that created them. If any constraint fails to build, the deletions
-- roll back with it — the database is never left cleaned but unguarded, nor
-- guarded but still dirty.
--
-- ── WHAT HAPPENED ──────────────────────────────────────────────────────
-- scripts/ingest-vault.js upserts vault_brands by slug but uses plain
-- INSERT for collections, families, variants and references. Re-running it
-- on an existing brand therefore appends a second, parallel subtree rather
-- than matching the first. Lang & Heyne was ingested twice and carries two
-- identical "Complications" and two identical "Time-Only" collections.
--
-- Deleting the copies without constraining the tables would leave the same
-- door open. Both halves belong in one transaction.
--
-- ── THE IDENTITY RULING THIS SERVES ────────────────────────────────────
-- Canonical identity is the immutable database id; (parent_id,
-- normalized_name) is only the source-resolution key. That key is sound
-- ONLY if it resolves to exactly one row, and ingestion is required to
-- REFUSE an ambiguous same-parent duplicate rather than guess. Refusal
-- needs something that detects — below vault_brands.slug the schema had
-- not one unique constraint, and Lang & Heyne is what that cost.
--
-- ── SAFETY ─────────────────────────────────────────────────────────────
-- Every precondition is re-proved HERE, at execution time, against live
-- rows. Nothing depends on an earlier out-of-band reading being still true.
-- The survivor is derived (lowest id) rather than hard-coded, so the
-- migration cannot delete a row a stale id happens to name.
-- ════════════════════════════════════════════════════════════════════════

begin;

-- ── 1 · PROVE, then delete ────────────────────────────────────────────
do $$
declare
  v_groups   int;
  v_refs     int;
  v_irk      int;
  v_mismatch int;
  v_dropped  int;
  v_r_before int; v_b_before int;
begin
  select count(*) into v_r_before from public.vault_references;
  select count(*) into v_b_before from public.vault_brands;

  -- Survivor is DERIVED (lowest id), never hard-coded, so this cannot delete
  -- a row that some stale identifier happens to name.
  create temp table _dup on commit drop as
  select brand_id, name, keep_id from (
    select c.brand_id, c.name, min(c.id::text)::uuid as keep_id, count(*) as n
      from public.vault_collections c
     group by c.brand_id, c.name
  ) g where n > 1;

  create temp table _drop on commit drop as
  select c.id as coll_id
    from public.vault_collections c
    join _dup d on d.brand_id = c.brand_id and d.name = c.name
   where c.id <> d.keep_id;

  select count(*) into v_groups from _dup;
  if v_groups = 0 then
    raise notice 'No duplicate collections present — nothing to delete.';
  else
    -- (a) no references may hang beneath anything being deleted
    select count(*) into v_refs
      from public.vault_references r
      join public.vault_variants v on v.id = r.variant_id
      join public.vault_families f on f.id = v.family_id
     where f.collection_id in (select coll_id from _drop);
    if v_refs > 0 then
      raise exception 'REFUSED: % reference(s) live under a subtree marked for deletion', v_refs;
    end if;

    -- (b) no identity-resolution candidate may point at a doomed variant.
    --     This FK is ON DELETE RESTRICT, so it would abort us anyway — but
    --     failing here names the reason instead of surfacing a raw FK error.
    select count(*) into v_irk
      from public.identity_resolution_candidate k
      join public.vault_variants v on v.id = k.vault_variant_id
      join public.vault_families f on f.id = v.family_id
     where f.collection_id in (select coll_id from _drop);
    if v_irk > 0 then
      raise exception 'REFUSED: % identity-resolution candidate(s) reference a doomed variant', v_irk;
    end if;

    -- (c) the copies must be genuinely equivalent, not merely same-named.
    --     Fingerprint every attribute that carries meaning; a difference
    --     means one copy holds work the other does not, and choosing
    --     between them is a human decision, not a migration's.
    select count(*) into v_mismatch from (
      select d.brand_id, d.name, count(distinct fp) as distinct_fingerprints from (
        select d2.brand_id, d2.name, c.id as coll_id,
               md5(coalesce(string_agg(
                 coalesce(f.name,'~')||'|'||coalesce(f.description,'~')||'|'||
                 coalesce(v.name,'~')||'|'||coalesce(v.description,'~')||'|'||
                 coalesce(v.notes,'~')||'|'||coalesce(array_to_string(v.search_aliases,','),'~'),
                 E'\n' order by f.name, v.name),'(empty)')) as fp
          from _dup d2
          join public.vault_collections c on c.brand_id = d2.brand_id and c.name = d2.name
          left join public.vault_families f on f.collection_id = c.id
          left join public.vault_variants v on v.family_id = f.id
         group by d2.brand_id, d2.name, c.id
      ) per_copy
      join _dup d on d.brand_id = per_copy.brand_id and d.name = per_copy.name
     group by d.brand_id, d.name
    having count(distinct fp) > 1
    ) _y;
    if v_mismatch > 0 then
      raise exception 'REFUSED: % duplicate group(s) are NOT equivalent — a human must choose the survivor', v_mismatch;
    end if;

    delete from public.vault_collections where id in (select coll_id from _drop);
    get diagnostics v_dropped = ROW_COUNT;
    raise notice 'Deleted % duplicate collection subtree(s) across % group(s).', v_dropped, v_groups;
  end if;

  -- (d) nothing outside the doomed subtrees may have moved. Brands and
  --     references must be untouched; families/variants may only shrink by
  --     what cascaded from the deleted collections.
  if (select count(*) from public.vault_brands) <> v_b_before then
    raise exception 'REFUSED: brand count changed (% -> %)', v_b_before, (select count(*) from public.vault_brands);
  end if;
  if (select count(*) from public.vault_references) <> v_r_before then
    raise exception 'REFUSED: reference count changed (% -> %)', v_r_before, (select count(*) from public.vault_references);
  end if;
end $$;

-- ── 2 · Same-parent uniqueness, all four levels ───────────────────────
-- If any of these cannot build, the deletions above roll back with it.

create unique index if not exists vault_collections_brand_id_name_key
  on public.vault_collections (brand_id, name);

create unique index if not exists vault_families_collection_id_name_key
  on public.vault_families (collection_id, name);

create unique index if not exists vault_variants_family_id_name_key
  on public.vault_variants (family_id, name);

-- Scope is (variant_id, reference), NOT brand-wide. A brand-scoped rule
-- would reject legitimate data: Kuoe Kyoto's 90-002 is one model number
-- offered in 35mm and 38mm, so the same reference string correctly appears
-- on two sibling variants. Per-variant is the tightest scope that admits
-- that and still forbids a true duplicate. NULL references are permitted
-- and not compared, which is the desired behaviour.
create unique index if not exists vault_references_variant_id_reference_key
  on public.vault_references (variant_id, reference);

-- ── 3 · Final proof ───────────────────────────────────────────────────
do $$
declare v_dups int;
begin
  select
    (select count(*) from (select brand_id, name from public.vault_collections group by 1,2 having count(*)>1) a)
  + (select count(*) from (select collection_id, name from public.vault_families group by 1,2 having count(*)>1) b)
  + (select count(*) from (select family_id, name from public.vault_variants group by 1,2 having count(*)>1) c)
  + (select count(*) from (select variant_id, reference from public.vault_references
       where reference is not null group by 1,2 having count(*)>1) d)
  into v_dups;
  if v_dups > 0 then
    raise exception 'REFUSED: % same-parent duplicate group(s) remain after cleanup', v_dups;
  end if;
  raise notice 'Flight A complete — hierarchy is duplicate-free and constrained at all four levels.';
end $$;

commit;
