-- ════════════════════════════════════════════════════════════════════════
-- FLIGHT A — NARROW RESTORE
-- scripts/flight-a-lang-heyne.restore.sql
--
-- Recreates the exact pre-migration state of the Lang & Heyne subtree,
-- including the ORIGINAL UUIDs, from scripts/flight-a-captured-rows.json.
--
-- ── READ THIS BEFORE RUNNING ───────────────────────────────────────────
-- This deliberately restores KNOWN DUPLICATES. Running it puts two identical
-- "Complications" and two identical "Time-Only" collections back under Lang
-- & Heyne, and drops the four indexes that prevent that from recurring. It
-- is a recovery path, not a maintenance tool. It should never be run
-- casually, and never on a hunch that "something looks wrong" — check what
-- actually changed first.
--
-- Why it exists anyway: the forward migration's deletion is otherwise
-- irreversible except by a full point-in-time restore of the entire
-- database. A precise recovery path for twelve known rows is better than
-- rolling the whole Vault back to recover them.
--
-- ── ORDER MATTERS ──────────────────────────────────────────────────────
-- Indexes first (the collection insert violates the very constraint the
-- forward migration added), then collections, then families, then variants
-- — each level's foreign key requires its parent to exist already.
--
-- ── WHAT IT DOES NOT RESTORE ───────────────────────────────────────────
-- Nothing else was touched by Flight A, so nothing else needs restoring.
-- The doomed rows carried zero references, zero identity-resolution links
-- and zero enrichment events — verified before capture and recorded in the
-- artifact's dependency_proof.
--
-- Source commit : 6eb52dde0d436c06e3411079da97be443548de5d
-- Migration sha : 0158f509d538dba8a42b06794fcf093855958447bc8edea7f190002738d604d1
-- ════════════════════════════════════════════════════════════════════════

begin;

-- ── 0 · Refuse if the rows are already present ────────────────────────
-- Restoring twice would either fail on the primary key or, worse, succeed
-- partially. Fail early and say so.
do $$
declare v_present int;
begin
  select count(*) into v_present from public.vault_collections
   where id in ('6c9ecfe3-91d1-4dad-a929-5cba87f0eb63'::uuid,
                'bc67dfdf-069c-4595-9c8a-c713728daa0d'::uuid);
  if v_present > 0 then
    raise exception 'RESTORE REFUSED: % of the 2 captured collections already exist — state is not post-migration', v_present;
  end if;
end $$;

-- ── 1 · Drop the four uniqueness indexes ──────────────────────────────
-- The duplicate collections cannot be reinserted while these exist. This is
-- the step that makes the restore genuinely a rollback rather than a patch.
drop index if exists public.vault_collections_brand_id_name_key;
drop index if exists public.vault_families_collection_id_name_key;
drop index if exists public.vault_variants_family_id_name_key;
drop index if exists public.vault_references_variant_id_reference_key;

-- ── 2 · Collections ───────────────────────────────────────────────────
insert into public.vault_collections (id, brand_id, name, description, sort_order) values
  ('6c9ecfe3-91d1-4dad-a929-5cba87f0eb63','1a32286c-ceef-4ef3-bc61-c0bc9aa75bf0',$$Time-Only$$,null,0),
  ('bc67dfdf-069c-4595-9c8a-c713728daa0d','1a32286c-ceef-4ef3-bc61-c0bc9aa75bf0',$$Complications$$,null,1);

-- ── 3 · Families ──────────────────────────────────────────────────────
insert into public.vault_families (id, collection_id, name, description, sort_order) values
  ('517d30ba-9ef5-4ffc-a445-4027057c86fc','6c9ecfe3-91d1-4dad-a929-5cba87f0eb63',$$Friedrich August I$$,null,1),
  ('67c1638d-d958-48ae-9d3b-fe0a6ded0557','bc67dfdf-069c-4595-9c8a-c713728daa0d',$$Anton$$,null,0),
  ('972e00d8-4847-45d6-8ea4-d5acd0d8e2c8','bc67dfdf-069c-4595-9c8a-c713728daa0d',$$Georg$$,null,1),
  ('aae3bfea-7aff-4834-9190-58a97856ecfe','6c9ecfe3-91d1-4dad-a929-5cba87f0eb63',$$Albert von Sachsen$$,null,0),
  ('d800d6d6-0ef7-4667-8f93-dad07e14bf70','bc67dfdf-069c-4595-9c8a-c713728daa0d',$$Hektor$$,null,2);

-- ── 4 · Variants ──────────────────────────────────────────────────────
-- Dollar-quoted so apostrophes in the descriptions need no escaping and
-- cannot be corrupted by a careless edit.
insert into public.vault_variants (id, family_id, name, description, notes, search_aliases, sort_order) values
  ('33ecd730-4f63-4bc6-9caa-76f3f7be7925','972e00d8-4847-45d6-8ea4-d5acd0d8e2c8',$$Georg$$,
   $$A sophisticated rectangular timepiece that draws inspiration from historical marine chronometers. It features a large, elegant movement architecture designed specifically to fit the rectangular case geometry, maintaining high-end finishing standards throughout.$$,
   $$Manual wind, rectangular case, proprietary caliber$$,'{}',0),
  ('4ec2618f-d73c-4806-b407-9dbebe9f919c','d800d6d6-0ef7-4667-8f93-dad07e14bf70',$$Hektor$$,
   $$A grand chronograph model that showcases the brand's ability to execute complex mechanical functions. Its movement architecture is designed for visual impact, with deeply angled bridges and traditional decoration that distinguish it as a high-horology chronograph.$$,
   $$Manual wind, chronograph complication, proprietary caliber$$,'{}',0),
  ('aa66ddc6-9a22-4df7-a784-169e97f9bcb1','aae3bfea-7aff-4834-9190-58a97856ecfe',$$Albert von Sachsen$$,
   $$A refined, time-only timepiece that showcases the brand's signature movement architecture featuring grand, curved bridges. It emphasizes elegance and legibility, often paired with traditional enamel or metal dials that highlight the Saxon aesthetic.$$,
   $$Manual wind, time-only, proprietary caliber$$,'{}',0),
  ('ab5bae3f-9b93-4b07-911d-572074140978','517d30ba-9ef5-4ffc-a445-4027057c86fc',$$Friedrich August I$$,
   $$An elegant model featuring a sub-seconds display at 6 o'clock. It is renowned for its harmonious dial proportions and meticulous movement finishing, reflecting the brand’s dedication to classical 19th-century Saxon design principles.$$,
   $$Manual wind, sub-seconds, proprietary caliber$$,'{}',0),
  ('c95c0b1a-1ef8-417c-b593-87511618f164','67c1638d-d958-48ae-9d3b-fe0a6ded0557',$$Anton$$,
   $$A unique jump-hour complication that integrates a rotating disc for hour indications, providing a clean yet dynamic dial presence. The movement is finished to an exceptional level, highlighting the interplay between modern technical solutions and traditional craftsmanship.$$,
   $$Manual wind, jump hour complication, proprietary caliber$$,'{}',0);

-- ── 5 · Verify the original state is back, exactly ────────────────────
do $$
declare
  v_colls int; v_fams int; v_vars int; v_dups int;
  v_fp_comp int; v_fp_time int;
begin
  select count(*) into v_colls from public.vault_collections c
    join public.vault_brands b on b.id = c.brand_id where b.name = 'Lang & Heyne';
  select count(*) into v_fams from public.vault_families f
    join public.vault_collections c on c.id = f.collection_id
    join public.vault_brands b on b.id = c.brand_id where b.name = 'Lang & Heyne';
  select count(*) into v_vars from public.vault_variants v
    join public.vault_families f on f.id = v.family_id
    join public.vault_collections c on c.id = f.collection_id
    join public.vault_brands b on b.id = c.brand_id where b.name = 'Lang & Heyne';

  if v_colls <> 4 then raise exception 'RESTORE FAILED: expected 4 Lang & Heyne collections, found %', v_colls; end if;
  if v_fams  <> 10 then raise exception 'RESTORE FAILED: expected 10 families, found %', v_fams; end if;
  if v_vars  <> 10 then raise exception 'RESTORE FAILED: expected 10 variants, found %', v_vars; end if;

  -- The duplicate groups must be back — that is the point of this file.
  select count(*) into v_dups from (
    select brand_id, name from public.vault_collections group by 1,2 having count(*)>1) d;
  if v_dups <> 2 then raise exception 'RESTORE FAILED: expected 2 duplicate groups, found %', v_dups; end if;

  -- And the restored copies must fingerprint-match their survivors, proving
  -- the captured content came back byte-for-byte rather than approximately.
  select count(distinct fp) into v_fp_comp from (
    select md5(coalesce(string_agg(
             coalesce(f.name,'~')||'|'||coalesce(f.description,'~')||'|'||
             coalesce(v.name,'~')||'|'||coalesce(v.description,'~')||'|'||
             coalesce(v.notes,'~')||'|'||coalesce(array_to_string(v.search_aliases,','),'~'),
             E'\n' order by f.name, v.name),'(empty)')) as fp
      from public.vault_collections c
      left join public.vault_families f on f.collection_id = c.id
      left join public.vault_variants v on v.family_id = f.id
     where c.name = 'Complications'
       and c.brand_id = '1a32286c-ceef-4ef3-bc61-c0bc9aa75bf0'
     group by c.id) x;
  if v_fp_comp <> 1 then raise exception 'RESTORE FAILED: Complications copies do not fingerprint-match (% distinct)', v_fp_comp; end if;

  select count(distinct fp) into v_fp_time from (
    select md5(coalesce(string_agg(
             coalesce(f.name,'~')||'|'||coalesce(f.description,'~')||'|'||
             coalesce(v.name,'~')||'|'||coalesce(v.description,'~')||'|'||
             coalesce(v.notes,'~')||'|'||coalesce(array_to_string(v.search_aliases,','),'~'),
             E'\n' order by f.name, v.name),'(empty)')) as fp
      from public.vault_collections c
      left join public.vault_families f on f.collection_id = c.id
      left join public.vault_variants v on v.family_id = f.id
     where c.name = 'Time-Only'
       and c.brand_id = '1a32286c-ceef-4ef3-bc61-c0bc9aa75bf0'
     group by c.id) y;
  if v_fp_time <> 1 then raise exception 'RESTORE FAILED: Time-Only copies do not fingerprint-match (% distinct)', v_fp_time; end if;

  raise notice 'Restore complete — pre-migration state recreated with original UUIDs, fingerprints match.';
end $$;

commit;
