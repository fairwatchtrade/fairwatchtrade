-- ════════════════════════════════════════════════════════════════════════
-- GALAXY PUBLICATION MODEL — DISPOSABLE PROOF
-- scripts/galaxy-publication.test.sql
--
-- Runs the full test matrix for
-- supabase/migrations/20260803120000_galaxy_publication_model.sql.
--
-- ── WHERE TO RUN THIS ──────────────────────────────────────────────────
-- A DISPOSABLE database only. It inserts a hidden fixture brand, inserts
-- descendants beneath live parents, and deliberately writes galaxy_visible
-- directly to simulate rows that were marked live by something other than
-- galaxy_activate. Never run it against production.
--
-- The 2026-08-03 run used a Supabase preview branch of the production
-- project. NOTE: a branch cannot replay production's migration history —
-- the vault_* base schema predates the migrations directory (it is older
-- than v2.21), so the branch's own migration run fails. The five tables
-- were therefore rebuilt column-for-column from production's live
-- information_schema, together with Flight A's four uniqueness indexes and
-- the unconditional public-read RLS policies, and seeded to production's
-- exact shape: 192 / 396 / 579 / 710 / 388 with 51 empty brands and 322
-- reference-carrying variants.
--
-- ── CONCURRENCY CORRECTIONS RUN (2026-08-03, second disposable branch) ─
-- After independent review found two races (operator functions could
-- interleave; the schema retreat could pass its guard against one state
-- and drop columns against another), both functions gained a
-- transaction-scoped blocking advisory lock on
-- hashtextextended('fwt.galaxy_publication', 0) as their FIRST statement,
-- and the retreat file acquires that same key plus ACCESS EXCLUSIVE on
-- all five hierarchy tables (brands → collections → families → variants
-- → references, always that order) before its guard count.
--
-- Proven with GENUINE multi-session tests (parallel PostgREST requests,
-- wall-clock interleavings recorded, timed via test-only helper functions
-- that pre-acquire the shared advisory key and sleep while holding it):
--   S1 same-row concurrent activations → loser blocks, lands as a clean
--      idempotent no-op;
--   S2 parent-activation ∥ child-activation → child blocks, then
--      SUCCEEDS against the committed live parent (unserialized it would
--      have refused or raced the ancestor rule);
--   S3 rollback ∥ same-row activation → revert commits, activation then
--      re-activates; no decision lost;
--   S4 ancestor-rollback ∥ child-activation → child blocks, then REFUSES
--      (hidden ancestor); no published child under a hidden parent;
--   S5 concurrent rollbacks of one event → second refuses
--      'already been rolled back'; no double revert;
--   S6/S7 audit seq reproduces the exact serialized order; no partial
--      state after any outcome;
--   R  retreat: locks acquired BEFORE the guard (3ms gap recorded), a
--      concurrent brand INSERT blocked 4.6s and landed only in the
--      post-retreat world, a concurrent activation blocked on the shared
--      advisory key and failed safely post-drop with zero partial writes,
--      hidden-rows refusal intact, taxonomy counts and identities exact.
-- Full prior matrix re-passed on the corrected functions: 32/32 logged
-- assertions plus the 8 recorded interleavings.
--
-- Note for re-runners: anon's default statement_timeout (3s) cancels
-- sessions that hold the lock longer — raise it on the DISPOSABLE branch
-- (`alter role anon set statement_timeout='60s'; notify pgrst, 'reload
-- config';`) for the timed scenarios.
--
-- ── RESULT OF THE FIRST 2026-08-03 RUN: 99 assertions, 99 passed ───────
-- Two defects were found and fixed in the migration as a result:
--   1. `set search_path = ''` broke every unqualified temp-table reference
--      inside the two plpgsql functions (fixed: pg_temp-qualified).
--   2. `revoke ... from public` did NOT remove anon/authenticated EXECUTE,
--      because Supabase grants those explicitly via ALTER DEFAULT
--      PRIVILEGES. anon could call galaxy_activate and
--      galaxy_rollback_event. Fixed by naming both roles in the REVOKE.
-- A third weakness was found and fixed: events written in one transaction
-- share occurred_at (now() is the transaction timestamp) and could not be
-- ordered, so a monotonic `seq` was added and rolling back an idempotent
-- no-op event is now refused.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.proof_log (
  seq serial primary key, phase text, step text, expected text, actual text, pass boolean);

-- ── P1 · Existing corpus preserved exactly ────────────────────────────
insert into public.proof_log (phase, step, expected, actual, pass)
select 'P1 preservation', s.step, s.expected, s.actual, s.expected = s.actual from (
  select 'brands visible' as step, '192' as expected, (select count(*)::text from public.vault_galaxy_brands) as actual
  union all select 'collections visible','396',(select count(*)::text from public.vault_galaxy_collections)
  union all select 'families visible','579',(select count(*)::text from public.vault_galaxy_families)
  union all select 'variants visible','710',(select count(*)::text from public.vault_galaxy_variants)
  union all select 'references visible','388',(select count(*)::text from public.vault_galaxy_references)
  union all select 'the 51 empty brands still render','51',
    (select count(*)::text from public.vault_galaxy_brands b
      where not exists (select 1 from public.vault_galaxy_collections c where c.brand_id=b.id))
  union all select 'no brand lost from view','0',
    (select count(*)::text from (select id from public.vault_brands except select id from public.vault_galaxy_brands) x)
  union all select 'no collection lost from view','0',
    (select count(*)::text from (select id from public.vault_collections except select id from public.vault_galaxy_collections) x)
  union all select 'no family lost from view','0',
    (select count(*)::text from (select id from public.vault_families except select id from public.vault_galaxy_families) x)
  union all select 'no variant lost from view','0',
    (select count(*)::text from (select id from public.vault_variants except select id from public.vault_galaxy_variants) x)
  union all select 'no reference lost from view','0',
    (select count(*)::text from (select id from public.vault_references except select id from public.vault_galaxy_references) x)
) s;

-- ── Fixtures ──────────────────────────────────────────────────────────
-- Snapshot a live brand's subtree so P3 can prove it is byte-identical
-- after new descendants are inserted beneath it.
create table public.proof_snapshot as
select (select id from public.vault_brands where name='TB-001') as tb001_id,
       md5(coalesce(public.galaxy_brand_subtree((select id from public.vault_brands where name='TB-001'))::text,'<null>')) as tb001_subtree_md5;

-- a wholly new brand with a full subtree beneath it
with b as (insert into public.vault_brands (slug,name) values ('zz-hidden','ZZ-HIDDEN') returning id),
     c as (insert into public.vault_collections (brand_id,name) select id,'HID-COLL' from b returning id),
     f as (insert into public.vault_families (collection_id,name) select id,'HID-FAM' from c returning id),
     v as (insert into public.vault_variants (family_id,name) select id,'HID-VAR' from f returning id)
insert into public.vault_references (variant_id,reference) select id,'HID-REF' from v;

-- one new row at EACH level beneath an already-live parent
insert into public.vault_collections (brand_id,name)
  select id,'NEW-COLL' from public.vault_brands where name='TB-001';
insert into public.vault_families (collection_id,name)
  select id,'NEW-FAM' from public.vault_collections where name='C-001';
insert into public.vault_variants (family_id,name)
  select id,'NEW-VAR' from public.vault_families where name='F-001';
insert into public.vault_references (variant_id,reference)
  select id,'NEW-REF' from public.vault_variants where name='V-001';
insert into public.vault_families (collection_id,name)
  select id,'NEWCOLL-FAM' from public.vault_collections where name='NEW-COLL';

-- ── P2 · New Brand defaults unpublished ───────────────────────────────
insert into public.proof_log (phase, step, expected, actual, pass)
select 'P2 hidden brand', s.step, s.expected, s.actual, s.expected = s.actual from (
  select 'new brand defaults unpublished' as step,'false' as expected,
         (select galaxy_visible::text from public.vault_brands where name='ZZ-HIDDEN') as actual
  union all select 'absent from Galaxy brand list','0',
    (select count(*)::text from public.vault_galaxy_brands where name='ZZ-HIDDEN')
  union all select 'Galaxy brand count unchanged','192',(select count(*)::text from public.vault_galaxy_brands)
  union all select 'direct-UUID subtree returns NULL','NULL',
    coalesce(public.galaxy_brand_subtree((select id from public.vault_brands where name='ZZ-HIDDEN'))::text,'NULL')
  union all select 'its whole subtree absent from views','0',
    ((select count(*) from public.vault_galaxy_collections where name='HID-COLL')
    +(select count(*) from public.vault_galaxy_families where name='HID-FAM')
    +(select count(*) from public.vault_galaxy_variants where name='HID-VAR')
    +(select count(*) from public.vault_galaxy_references where reference='HID-REF'))::text
) s;

-- ── P3 · New descendants beneath LIVE parents default unpublished ─────
insert into public.proof_log (phase, step, expected, actual, pass)
select 'P3 new descendants', s.step, s.expected, s.actual, s.expected = s.actual from (
  select 'new Collection under live Brand defaults hidden' as step,'false' as expected,
         (select galaxy_visible::text from public.vault_collections where name='NEW-COLL') as actual
  union all select 'new Family under live Collection defaults hidden','false',
    (select galaxy_visible::text from public.vault_families where name='NEW-FAM')
  union all select 'new Variant under live Family defaults hidden','false',
    (select galaxy_visible::text from public.vault_variants where name='NEW-VAR')
  union all select 'new Reference under live Variant defaults hidden','false',
    (select galaxy_visible::text from public.vault_references where reference='NEW-REF')
  union all select 'none of the four appear in any Galaxy view','0',
    ((select count(*) from public.vault_galaxy_collections where name='NEW-COLL')
    +(select count(*) from public.vault_galaxy_families where name='NEW-FAM')
    +(select count(*) from public.vault_galaxy_variants where name='NEW-VAR')
    +(select count(*) from public.vault_galaxy_references where reference='NEW-REF'))::text
  union all select 'Galaxy view counts unchanged','396/579/710/388',
    (select count(*)::text from public.vault_galaxy_collections)||'/'||(select count(*)::text from public.vault_galaxy_families)||'/'||
    (select count(*)::text from public.vault_galaxy_variants)||'/'||(select count(*)::text from public.vault_galaxy_references)
  union all select 'live Brand subtree byte-identical to before',
    (select tb001_subtree_md5 from public.proof_snapshot),
    md5(public.galaxy_brand_subtree((select tb001_id from public.proof_snapshot))::text)
) s;

-- ── P4 · A hidden ancestor suppresses a live-marked descendant ────────
-- Written directly, NOT through galaxy_activate — this is the "row is
-- wrong in the database" case the view layer must survive.
update public.vault_collections set galaxy_visible=true where name='HID-COLL';
update public.vault_families    set galaxy_visible=true where name='HID-FAM';
update public.vault_variants    set galaxy_visible=true where name='HID-VAR';
update public.vault_references  set galaxy_visible=true where reference='HID-REF';
update public.vault_families    set galaxy_visible=true where name='NEWCOLL-FAM';

insert into public.proof_log (phase, step, expected, actual, pass)
select 'P4 ancestor suppression', s.step, s.expected, s.actual, s.expected=s.actual from (
  select 'rows really are marked live in the base tables' as step,'true/true/true/true' as expected,
    (select galaxy_visible::text from public.vault_collections where name='HID-COLL')||'/'||
    (select galaxy_visible::text from public.vault_families where name='HID-FAM')||'/'||
    (select galaxy_visible::text from public.vault_variants where name='HID-VAR')||'/'||
    (select galaxy_visible::text from public.vault_references where reference='HID-REF') as actual
  union all select 'hidden Brand suppresses its live-marked Collection','0',
    (select count(*)::text from public.vault_galaxy_collections where name='HID-COLL')
  union all select 'hidden Brand suppresses its live-marked Family','0',
    (select count(*)::text from public.vault_galaxy_families where name='HID-FAM')
  union all select 'hidden Brand suppresses its live-marked Variant','0',
    (select count(*)::text from public.vault_galaxy_variants where name='HID-VAR')
  union all select 'hidden Brand suppresses its live-marked Reference','0',
    (select count(*)::text from public.vault_galaxy_references where reference='HID-REF')
  union all select 'hidden Collection suppresses its live-marked Family (mid-tree)','0',
    (select count(*)::text from public.vault_galaxy_families where name='NEWCOLL-FAM')
  union all select 'direct-UUID Galaxy route still NULL for hidden Brand','NULL',
    coalesce(public.galaxy_brand_subtree((select id from public.vault_brands where name='ZZ-HIDDEN'))::text,'NULL')
  union all select 'all Galaxy view counts still unchanged','192/396/579/710/388',
    (select count(*)::text from public.vault_galaxy_brands)||'/'||(select count(*)::text from public.vault_galaxy_collections)||'/'||
    (select count(*)::text from public.vault_galaxy_families)||'/'||(select count(*)::text from public.vault_galaxy_variants)||'/'||
    (select count(*)::text from public.vault_galaxy_references)
) s;

-- restore to the sanctioned state before testing activation
update public.vault_collections set galaxy_visible=false where name='HID-COLL';
update public.vault_families    set galaxy_visible=false where name='HID-FAM';
update public.vault_variants    set galaxy_visible=false where name='HID-VAR';
update public.vault_references  set galaxy_visible=false where reference='HID-REF';
update public.vault_families    set galaxy_visible=false where name='NEWCOLL-FAM';

-- ── P5 · Activation refusals ──────────────────────────────────────────
do $$
declare v_id uuid; v_msg text;
begin
  begin perform public.galaxy_activate('[]'::jsonb,'seven');
    insert into public.proof_log(phase,step,expected,actual,pass) values ('P5 refusals','empty manifest','REFUSED','ACCEPTED',false);
  exception when others then get stacked diagnostics v_msg = MESSAGE_TEXT;
    insert into public.proof_log(phase,step,expected,actual,pass) values ('P5 refusals','empty manifest refused','REFUSED',left(v_msg,90),v_msg like 'REFUSED%'); end;

  begin perform public.galaxy_activate('[{"entity_type":"planet","entity_id":"00000000-0000-0000-0000-000000000001"}]'::jsonb,'seven');
    insert into public.proof_log(phase,step,expected,actual,pass) values ('P5 refusals','unknown entity_type','REFUSED','ACCEPTED',false);
  exception when others then get stacked diagnostics v_msg = MESSAGE_TEXT;
    insert into public.proof_log(phase,step,expected,actual,pass) values ('P5 refusals','unknown entity_type refused','REFUSED',left(v_msg,90),v_msg like 'REFUSED%'); end;

  begin perform public.galaxy_activate('[{"entity_type":"brand","entity_id":"TB-001"}]'::jsonb,'seven');
    insert into public.proof_log(phase,step,expected,actual,pass) values ('P5 refusals','non-UUID target','REFUSED','ACCEPTED',false);
  exception when others then get stacked diagnostics v_msg = MESSAGE_TEXT;
    insert into public.proof_log(phase,step,expected,actual,pass) values ('P5 refusals','non-UUID target refused','REFUSED',left(v_msg,90),v_msg like 'REFUSED%'); end;

  begin perform public.galaxy_activate('[{"entity_type":"brand","entity_id":"11111111-2222-3333-4444-555555555555"}]'::jsonb,'seven');
    insert into public.proof_log(phase,step,expected,actual,pass) values ('P5 refusals','missing target','REFUSED','ACCEPTED',false);
  exception when others then get stacked diagnostics v_msg = MESSAGE_TEXT;
    insert into public.proof_log(phase,step,expected,actual,pass) values ('P5 refusals','missing target refused','REFUSED',left(v_msg,90),v_msg like 'REFUSED%'); end;

  begin perform public.galaxy_activate('[{"entity_type":"brand","entity_id":"11111111-2222-3333-4444-555555555555"}]'::jsonb,'  ');
    insert into public.proof_log(phase,step,expected,actual,pass) values ('P5 refusals','unnamed actor','REFUSED','ACCEPTED',false);
  exception when others then get stacked diagnostics v_msg = MESSAGE_TEXT;
    insert into public.proof_log(phase,step,expected,actual,pass) values ('P5 refusals','unnamed actor refused','REFUSED',left(v_msg,90),v_msg like 'REFUSED%'); end;

  -- the governing refusal: a real row whose ancestor is hidden and unnamed
  select id into v_id from public.vault_collections where name='HID-COLL';
  begin perform public.galaxy_activate(jsonb_build_array(jsonb_build_object('entity_type','collection','entity_id',v_id)),'seven');
    insert into public.proof_log(phase,step,expected,actual,pass) values ('P5 refusals','descendant of hidden ancestor','REFUSED','ACCEPTED',false);
  exception when others then get stacked diagnostics v_msg = MESSAGE_TEXT;
    insert into public.proof_log(phase,step,expected,actual,pass) values ('P5 refusals','descendant of hidden ancestor refused','REFUSED',left(v_msg,120),v_msg like 'REFUSED%'); end;
end $$;

insert into public.proof_log(phase,step,expected,actual,pass)
select 'P5 refusals','no refusal left a partial write','0/0',
  (select count(*)::text from public.vault_collections where name='HID-COLL' and galaxy_visible)||'/'||
  (select count(*)::text from public.galaxy_publication_event),
  (select count(*) from public.vault_collections where name='HID-COLL' and galaxy_visible)=0
  and (select count(*) from public.galaxy_publication_event)=0;

-- ── P6 · Exact activation, non-cascade, idempotence ───────────────────
do $$
declare v_coll uuid; v_r1 jsonb; v_r2 jsonb;
begin
  select id into v_coll from public.vault_collections where name='NEW-COLL';
  v_r1 := public.galaxy_activate(
    jsonb_build_array(jsonb_build_object('entity_type','collection','entity_id',v_coll)),'seven','exact activation');

  insert into public.proof_log(phase,step,expected,actual,pass) values
    ('P6 activation','changed_rows = exactly 1','1',(v_r1->>'changed_rows'),(v_r1->>'changed_rows')='1'),
    ('P6 activation','before_state recorded as hidden','false',
      (v_r1->'before_state'->0->>'galaxy_visible'),(v_r1->'before_state'->0->>'galaxy_visible')='false'),
    ('P6 activation','after_state recorded as live','true',
      (v_r1->'after_state'->0->>'galaxy_visible'),(v_r1->'after_state'->0->>'galaxy_visible')='true'),
    ('P6 activation','activated Collection now in Galaxy view','1',
      (select count(*)::text from public.vault_galaxy_collections where name='NEW-COLL'),
      (select count(*) from public.vault_galaxy_collections where name='NEW-COLL')=1),
    ('P6 activation','Galaxy collection count 396 -> 397','397',
      (select count(*)::text from public.vault_galaxy_collections),
      (select count(*) from public.vault_galaxy_collections)=397),
    ('P6 activation','child Family NOT auto-published by parent activation','false/0',
      (select galaxy_visible::text from public.vault_families where name='NEWCOLL-FAM')||'/'||
      (select count(*)::text from public.vault_galaxy_families where name='NEWCOLL-FAM'),
      (select galaxy_visible from public.vault_families where name='NEWCOLL-FAM')=false
      and (select count(*) from public.vault_galaxy_families where name='NEWCOLL-FAM')=0),
    ('P6 activation','other Galaxy levels untouched','192/579/710/388',
      (select count(*)::text from public.vault_galaxy_brands)||'/'||(select count(*)::text from public.vault_galaxy_families)||'/'||
      (select count(*)::text from public.vault_galaxy_variants)||'/'||(select count(*)::text from public.vault_galaxy_references),
      (select count(*) from public.vault_galaxy_brands)=192 and (select count(*) from public.vault_galaxy_families)=579
      and (select count(*) from public.vault_galaxy_variants)=710 and (select count(*) from public.vault_galaxy_references)=388);

  v_r2 := public.galaxy_activate(
    jsonb_build_array(jsonb_build_object('entity_type','collection','entity_id',v_coll)),'seven','repeat');
  insert into public.proof_log(phase,step,expected,actual,pass) values
    ('P6 idempotence','second identical call changes nothing','0',(v_r2->>'changed_rows'),(v_r2->>'changed_rows')='0'),
    ('P6 idempotence','reported as a no-op','true',(v_r2->>'idempotent_noop'),(v_r2->>'idempotent_noop')='true'),
    ('P6 idempotence','Galaxy state identical after repeat','397',
      (select count(*)::text from public.vault_galaxy_collections),
      (select count(*) from public.vault_galaxy_collections)=397),
    ('P6 idempotence','both calls audited','2',
      (select count(*)::text from public.galaxy_publication_event),
      (select count(*) from public.galaxy_publication_event)=2);
end $$;

-- ── P7 · Rollback: exact revert + three refusal conditions ────────────
-- Event ids are captured from each call's return value. Do NOT order by
-- occurred_at to find them: now() is the transaction timestamp, so events
-- written in one transaction tie. Order by seq if you must order.
delete from public.galaxy_publication_event;
update public.vault_collections set galaxy_visible=false where name='NEW-COLL';

do $$
declare v_coll uuid; v_fam uuid; vA uuid; vB uuid; vC uuid; vD uuid; vE uuid; r jsonb; v_msg text;
begin
  select id into v_coll from public.vault_collections where name='NEW-COLL';
  select id into v_fam  from public.vault_families    where name='NEWCOLL-FAM';

  r := public.galaxy_activate(jsonb_build_array(jsonb_build_object('entity_type','collection','entity_id',v_coll)),'seven','A');
  vA := (r->>'event_id')::uuid;
  r := public.galaxy_rollback_event(vA,'seven');
  insert into public.proof_log(phase,step,expected,actual,pass) values
    ('P7 rollback','revert changed exactly 1 row','1',(r->>'changed_rows'),(r->>'changed_rows')='1'),
    ('P7 rollback','Collection restored to hidden','false',
      (select galaxy_visible::text from public.vault_collections where id=v_coll),
      (select galaxy_visible from public.vault_collections where id=v_coll)=false),
    ('P7 rollback','Galaxy collection count back to 396','396',
      (select count(*)::text from public.vault_galaxy_collections),
      (select count(*) from public.vault_galaxy_collections)=396),
    ('P7 rollback','revert audited against the exact event','true',
      (select (count(*)=1)::text from public.galaxy_publication_event where reverted_event_id=vA),
      (select count(*) from public.galaxy_publication_event where reverted_event_id=vA)=1);

  begin perform public.galaxy_rollback_event(vA,'seven');
    insert into public.proof_log(phase,step,expected,actual,pass) values ('P7 rollback','double rollback','REFUSED','ACCEPTED',false);
  exception when others then get stacked diagnostics v_msg = MESSAGE_TEXT;
    insert into public.proof_log(phase,step,expected,actual,pass) values
      ('P7 rollback','double rollback refused','REFUSED',left(v_msg,70),v_msg like 'REFUSED: event % has already been rolled back'); end;

  r := public.galaxy_activate(jsonb_build_array(jsonb_build_object('entity_type','collection','entity_id',v_coll)),'seven','B');
  vB := (r->>'event_id')::uuid;
  r := public.galaxy_activate(jsonb_build_array(jsonb_build_object('entity_type','collection','entity_id',v_coll)),'seven','C repeat');
  vC := (r->>'event_id')::uuid;
  begin perform public.galaxy_rollback_event(vC,'seven');
    insert into public.proof_log(phase,step,expected,actual,pass) values ('P7 rollback','revert a no-op event','REFUSED','ACCEPTED',false);
  exception when others then get stacked diagnostics v_msg = MESSAGE_TEXT;
    insert into public.proof_log(phase,step,expected,actual,pass) values
      ('P7 rollback','revert of idempotent no-op refused','REFUSED',left(v_msg,80),v_msg like 'REFUSED: event % changed no rows%'); end;
  r := public.galaxy_rollback_event(vB,'seven');
  insert into public.proof_log(phase,step,expected,actual,pass) values
    ('P7 rollback','the real activation still reverts cleanly','1/false',
      (r->>'changed_rows')||'/'||(select galaxy_visible::text from public.vault_collections where id=v_coll),
      (r->>'changed_rows')='1' and (select galaxy_visible from public.vault_collections where id=v_coll)=false);

  r := public.galaxy_activate(jsonb_build_array(jsonb_build_object('entity_type','collection','entity_id',v_coll)),'seven','D');
  vD := (r->>'event_id')::uuid;
  update public.vault_collections set galaxy_visible=false where id=v_coll;   -- somebody else decides
  begin perform public.galaxy_rollback_event(vD,'seven');
    insert into public.proof_log(phase,step,expected,actual,pass) values ('P7 rollback','drifted state','REFUSED','ACCEPTED',false);
  exception when others then get stacked diagnostics v_msg = MESSAGE_TEXT;
    insert into public.proof_log(phase,step,expected,actual,pass) values
      ('P7 rollback','drifted state refused','REFUSED',left(v_msg,80),v_msg like 'REFUSED: state has drifted%'); end;

  r := public.galaxy_activate(jsonb_build_array(jsonb_build_object('entity_type','collection','entity_id',v_coll)),'seven','E parent');
  vE := (r->>'event_id')::uuid;
  perform public.galaxy_activate(jsonb_build_array(jsonb_build_object('entity_type','family','entity_id',v_fam)),'seven','F later child');
  begin perform public.galaxy_rollback_event(vE,'seven');
    insert into public.proof_log(phase,step,expected,actual,pass) values ('P7 rollback','orphaning revert','REFUSED','ACCEPTED',false);
  exception when others then get stacked diagnostics v_msg = MESSAGE_TEXT;
    insert into public.proof_log(phase,step,expected,actual,pass) values
      ('P7 rollback','revert that would orphan a later release refused','REFUSED',left(v_msg,90),v_msg like 'REFUSED: unsafe to revert%'); end;

  insert into public.proof_log(phase,step,expected,actual,pass) values
    ('P7 rollback','refused revert left both rows live','true/true',
      (select galaxy_visible::text from public.vault_collections where id=v_coll)||'/'||
      (select galaxy_visible::text from public.vault_families where id=v_fam),
      (select galaxy_visible from public.vault_collections where id=v_coll)
      and (select galaxy_visible from public.vault_families where id=v_fam)),
    ('P7 rollback','same-transaction events are strictly orderable by seq','true',
      (select (count(distinct seq)=count(*))::text from public.galaxy_publication_event),
      (select count(distinct seq)=count(*) from public.galaxy_publication_event));
end $$;

-- ── P8 · Unrelated systems ────────────────────────────────────────────
do $$
declare v_tb uuid;
begin
  select id into v_tb from public.vault_brands where name='TB-001';
  insert into public.proof_log(phase,step,expected,actual,pass) values
    ('P8 seller flow','seller Brand typeahead still sees the hidden Brand','193',
      (select count(*)::text from public.vault_brands),(select count(*) from public.vault_brands)=193),
    ('P8 seller flow','seller model suggestions still include the unpublished Collection','1',
      (select count(*)::text from public.vault_collections where brand_id=v_tb and name='NEW-COLL'),
      (select count(*) from public.vault_collections where brand_id=v_tb and name='NEW-COLL')=1),
    ('P8 seller flow','seller sees MORE than Galaxy (gate is Galaxy-only)','true',
      ((select count(*) from public.vault_collections) > (select count(*) from public.vault_galaxy_collections))::text,
      (select count(*) from public.vault_collections) > (select count(*) from public.vault_galaxy_collections)),
    ('P8 Flight A','all four uniqueness indexes still present','4',
      (select count(*)::text from pg_indexes where schemaname='public' and indexname in
        ('vault_collections_brand_id_name_key','vault_families_collection_id_name_key',
         'vault_variants_family_id_name_key','vault_references_variant_id_reference_key')),
      (select count(*) from pg_indexes where schemaname='public' and indexname in
        ('vault_collections_brand_id_name_key','vault_families_collection_id_name_key',
         'vault_variants_family_id_name_key','vault_references_variant_id_reference_key'))=4),
    ('P8 privileges','anon may read the Galaxy views','true',
      has_table_privilege('anon','public.vault_galaxy_brands','select')::text,
      has_table_privilege('anon','public.vault_galaxy_brands','select')),
    ('P8 privileges','anon may call the subtree function','true',
      has_function_privilege('anon','public.galaxy_brand_subtree(uuid)','execute')::text,
      has_function_privilege('anon','public.galaxy_brand_subtree(uuid)','execute')),
    ('P8 privileges','anon may NOT activate','false',
      has_function_privilege('anon','public.galaxy_activate(jsonb,text,text)','execute')::text,
      has_function_privilege('anon','public.galaxy_activate(jsonb,text,text)','execute')=false),
    ('P8 privileges','authenticated may NOT activate','false',
      has_function_privilege('authenticated','public.galaxy_activate(jsonb,text,text)','execute')::text,
      has_function_privilege('authenticated','public.galaxy_activate(jsonb,text,text)','execute')=false),
    ('P8 privileges','anon may NOT roll back','false',
      has_function_privilege('anon','public.galaxy_rollback_event(uuid,text)','execute')::text,
      has_function_privilege('anon','public.galaxy_rollback_event(uuid,text)','execute')=false),
    ('P8 privileges','service_role retains both','true',
      (has_function_privilege('service_role','public.galaxy_activate(jsonb,text,text)','execute')
       and has_function_privilege('service_role','public.galaxy_rollback_event(uuid,text)','execute'))::text,
      has_function_privilege('service_role','public.galaxy_activate(jsonb,text,text)','execute')
      and has_function_privilege('service_role','public.galaxy_rollback_event(uuid,text)','execute')),
    ('P8 RLS boundary','base-table public read UNCHANGED (presentation gate, not secrecy)','5',
      (select count(*)::text from pg_policy p join pg_class c on c.oid=p.polrelid
        where c.relname like 'vault_%' and p.polname like 'Public read%'),
      (select count(*) from pg_policy p join pg_class c on c.oid=p.polrelid
        where c.relname like 'vault_%' and p.polname like 'Public read%')=5);
end $$;

-- ── P9 · The same, as the real anon role ──────────────────────────────
do $$
declare
  v_brands int; v_hidden_sub text; v_tb uuid; v_zz uuid; v_coll uuid;
  v_act_blocked boolean := false; v_rb_blocked boolean := false; v_audit_blocked boolean := false;
  v_audit_rows int := -1;
begin
  select id into v_tb from public.vault_brands where name='TB-001';
  select id into v_zz from public.vault_brands where name='ZZ-HIDDEN';
  select id into v_coll from public.vault_collections where name='NEW-COLL';

  set local role anon;
  select count(*) into v_brands from public.vault_galaxy_brands;
  v_hidden_sub := coalesce(public.galaxy_brand_subtree(v_zz)::text,'NULL');
  begin perform public.galaxy_activate(jsonb_build_array(jsonb_build_object('entity_type','collection','entity_id',v_coll)),'anon-attacker');
  exception when others then v_act_blocked := true; end;
  begin perform public.galaxy_rollback_event(gen_random_uuid(),'anon-attacker');
  exception when others then v_rb_blocked := true; end;
  begin select count(*) into v_audit_rows from public.galaxy_publication_event;
  exception when others then v_audit_blocked := true; end;
  reset role;

  insert into public.proof_log(phase,step,expected,actual,pass) values
    ('P9 as anon','anon really reads the Galaxy brand view','192',v_brands::text,v_brands=192),
    ('P9 as anon','anon gets NULL for the hidden Brand','NULL',v_hidden_sub,v_hidden_sub='NULL'),
    ('P9 as anon','anon CANNOT activate','blocked',case when v_act_blocked then 'blocked' else 'EXECUTED' end,v_act_blocked),
    ('P9 as anon','anon CANNOT roll back','blocked',case when v_rb_blocked then 'blocked' else 'EXECUTED' end,v_rb_blocked),
    ('P9 as anon','anon cannot read the audit log','blocked-or-empty',
      case when v_audit_blocked then 'blocked' else v_audit_rows::text end, v_audit_blocked or v_audit_rows=0),
    ('P9 as anon','anon''s attempt wrote no audit event','0',
      (select count(*)::text from public.galaxy_publication_event where actor='anon-attacker'),
      (select count(*) from public.galaxy_publication_event where actor='anon-attacker')=0);
end $$;

-- ── Result ────────────────────────────────────────────────────────────
select phase, count(*) filter (where pass) as passed, count(*) as total,
       count(*) filter (where not pass) as failed
  from public.proof_log group by phase order by min(seq);

select * from public.proof_log where not pass order by seq;   -- must be empty
