-- ════════════════════════════════════════════════════════════════════════
-- FLIGHT 3 — RUNTIME PROOF HARNESS (EXECUTABLE)
-- scripts/dealer-flight3-runtime.test.sql
--
-- Target: the audited restored production target ONLY (contract v7 §18).
-- The restored-target ruling (correction 8) REQUIRES a fresh proof-time
-- audit immediately before any Flight 3 migration or runtime work,
-- regardless of elapsed time: project health · base restore integrity ·
-- Flight 1/2 object parity with main · zero unintended dealer rows · no
-- unrelated residue · btree_gist NOT installed until the Flight 3
-- migration installs it.
--
-- HISTORY: until 2026-08-04 this file was a PLAN — only P9 was executable
-- and P1–P8/P10/P11 existed as comment blocks. It was made executable
-- during the authorised runtime proof of 2026-08-04 and run end to end on
-- project qrfmacpkqpdvikyetzmk: 260 database assertions, 0 failing.
--
-- SCOPE SPLIT (unchanged): this file covers the DATABASE portion of §18.
--   · The Node portion (origin canonicalisation, private-address blocklist,
--     pinned-fetch refusal paths, retryable-vs-terminal classification)
--     lives in scripts/dealer-flight3-network.test.mjs — 90 assertions.
--   · The pure preflight/byte-contract matrix lives in
--     scripts/dealer-flight3-preflight.test.mjs — 70 assertions.
--   · The multi-session items (simultaneous first invocations, init-lease
--     contention, cancellation-vs-lease race, create-race convergence) CANNOT
--     run in one transaction. Section R below installs disposable PostgREST
--     wrappers so real parallel HTTP requests exercise them, exactly the
--     pattern proven by the Galaxy and identity flights. anon's default 3s
--     statement_timeout must be raised on the disposable target for the
--     duration, and reset afterwards.
--
-- Conventions: every assertion lands in proof_log(phase, step, expected,
-- actual, pass); the run ends with `select * from proof_log where not pass`
-- expected empty. Event readers ORDER BY created_at, id (entity scope) or
-- id (global) — never by timestamp alone.
--
-- Run order: §0 helpers → §F fixture → P1…P15 → §R races → §P11 rollback.
-- Sections are separate statements deliberately: each MCP/psql round trip
-- is its own transaction, and several proofs depend on a prior commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 · helpers ────────────────────────────────────────────────────────
create table if not exists public.proof_log(
  seq serial primary key, phase text, step text, expected text, actual text, pass boolean,
  at timestamptz not null default clock_timestamp());
create table if not exists public.proof_env(k text primary key, v text);

create or replace function public.pf(p_phase text, p_step text, p_expected text, p_actual text)
returns void language plpgsql as $$
begin
  insert into public.proof_log(phase,step,expected,actual,pass)
  values (p_phase,p_step,p_expected,p_actual, p_expected is not distinct from p_actual);
end $$;

-- pf_err: run p_sql, expect it to raise exactly p_expected.
create or replace function public.pf_err(p_phase text, p_step text, p_expected text, p_sql text)
returns void language plpgsql as $$
declare v_msg text;
begin
  begin execute p_sql; v_msg := '<NO ERROR RAISED>';
  exception when others then get stacked diagnostics v_msg = MESSAGE_TEXT; end;
  perform public.pf(p_phase,p_step,p_expected,v_msg);
end $$;

-- pf_errlike: same, for messages carrying an interpolated value or a
-- constraint name Postgres may have truncated at 63 characters.
create or replace function public.pf_errlike(p_phase text, p_step text, p_pattern text, p_sql text)
returns void language plpgsql as $$
declare v_msg text;
begin
  begin execute p_sql; v_msg := '<NO ERROR RAISED>';
  exception when others then get stacked diagnostics v_msg = MESSAGE_TEXT; end;
  insert into public.proof_log(phase,step,expected,actual,pass)
  values (p_phase,p_step,p_pattern,v_msg, v_msg like p_pattern);
end $$;

create or replace function public.pf_ok(p_phase text, p_step text, p_sql text)
returns void language plpgsql as $$
declare v_msg text;
begin
  begin execute p_sql; v_msg := 'OK';
  exception when others then get stacked diagnostics v_msg = MESSAGE_TEXT; end;
  perform public.pf(p_phase,p_step,'OK',v_msg);
end $$;

create or replace function public.pfset(k text, v text) returns void language sql as
$$ insert into public.proof_env values (k,v) on conflict (k) do update set v=excluded.v $$;
create or replace function public.pfget(k text) returns text language sql stable as
$$ select v from public.proof_env where k=$1 $$;

-- §5.1 idempotency digest, mirroring lib/dealer/manifestAdapter.ts
-- idempotencyKeyFor(): sha256(UTF8(`${byteLen}:${dv}` + `${byteLen}:${av}`)).
create or replace function public.pf_idem(dv text, av text) returns text language sql immutable as $$
  select encode(extensions.digest(convert_to(
    octet_length(convert_to(dv,'UTF8'))::text||':'||dv||
    octet_length(convert_to(av,'UTF8'))::text||':'||av, 'UTF8'),'sha256'),'hex')
$$;

-- Section-0 guard of the rollback file, callable so each refusal branch can
-- be proven independently without aborting the session.
create or replace function public.f3_rollback_guard() returns text language plpgsql as $g$
declare v int;
begin
  if to_regclass('public.dealer_accelerator_manifest_captures') is null then
    return 'NOTICE: Flight 3 already rolled back — nothing to do.';
  end if;
  select (select count(*) from public.dealer_accelerator_manifest_captures)
       + (select count(*) from public.dealer_accelerator_manifest_preflight_results)
       + (select count(*) from public.dealer_accelerator_manifest_lines)
       + (select count(*) from public.dealer_accelerator_source_origins) into v;
  if v > 0 then return format('REFUSED: %s Flight 3 evidence row(s) exist — a rollback never deletes evidence', v); end if;
  select count(*) into v from public.dealer_accelerator_batches
   where status in ('cancel_requested','cancelled') or initialization_lease_token is not null;
  if v > 0 then return format('REFUSED: %s batch(es) hold Flight 3 states — resolve them deliberately first', v); end if;
  select count(*) into v from public.dealer_accelerator_photographs where retrieval_state='retrieval_terminal';
  if v > 0 then return format('REFUSED: %s photograph(s) are retrieval_terminal — the narrowed CHECK would strand them', v); end if;
  select count(*) into v from public.dealer_accelerator_lifecycle_events
   where event_type in ('batch_cancel_requested','batch_cancelled','batch_initialization_lease_claimed',
                        'batch_initialization_lease_recovered','photograph_retrieval_terminal');
  if v > 0 then return format('REFUSED: %s Flight 3 lifecycle event(s) exist — history is never deleted', v); end if;
  return 'GUARD PASSES';
end $g$;

-- ── §F · fixture ────────────────────────────────────────────────────────
-- A real three-line NDJSON manifest whose byte geometry the proofs use
-- literally: line 3 carries framing 'none' and ends exactly at byte_length.
-- p_dealer_profile_id / p_authorized_by must be a real auth.users id on the
-- target; substitute the founder's.
do $f$
declare
  v_profile uuid := '00000000-0000-0000-0000-000000000000';  -- SUBSTITUTE
  v_src public.dealer_accelerator_sources;
  v_ev bigint;
  l1 text := '{"id":"item-1","ref":"116610LN","photos":["https://cdn.fixture.test/a1.jpg"]}';
  l2 text := '{"id":"item-2","ref":"5711-1A","photos":["https://cdn.fixture.test/b1.jpg","https://cdn.fixture.test/b2.jpg"]}';
  l3 text := '{"id":"item-3","ref":"311.30.42","photos":[]}';
  v_manifest text;
begin
  v_src := public.dealer_accelerator_authorize_source(
    v_profile, 'static_json_manifest',
    'https://fixtures.fairwatch.test/dealer/manifest.ndjson', 'fixture-source-a',
    'written_agreement_2026_08', v_profile,
    'retain_until_delisting', 'display_on_fairwatchtrade_only', 'static_json_manifest');
  perform public.pfset('profile', v_profile::text);
  perform public.pfset('source_a', v_src.id::text);
  select max(id) into v_ev from public.dealer_accelerator_lifecycle_events
   where source_id = v_src.id and entity_kind='source';
  perform public.pfset('auth_event_a', v_ev::text);

  v_manifest := l1 || E'\n' || l2 || E'\n' || l3;
  perform public.pfset('l1', l1); perform public.pfset('l2', l2); perform public.pfset('l3', l3);
  perform public.pfset('manifest', v_manifest);
  perform public.pfset('manifest_len', octet_length(convert_to(v_manifest,'UTF8'))::text);
  perform public.pfset('manifest_hash', encode(extensions.digest(convert_to(v_manifest,'UTF8'),'sha256'),'hex'));
  perform public.pfset('adapter_version', 'flight3-static-manifest-v1');
  perform public.pfset('declared_version', 'v2026-08-01');
end $f$;

-- ── P2 · batch identity is structural (§5.1) ────────────────────────────
do $p2$
declare
  v_src uuid := public.pfget('source_a')::uuid;
  av text := public.pfget('adapter_version');
  dv text := public.pfget('declared_version');
  b1 public.dealer_accelerator_batches; b2 public.dealer_accelerator_batches;
  b3 public.dealer_accelerator_batches; v_n int;
begin
  b1 := public.dealer_accelerator_create_or_get_batch(v_src, av, dv, public.pf_idem(dv,av), 50, 'system', null);
  b2 := public.dealer_accelerator_create_or_get_batch(v_src, av, dv, public.pf_idem(dv,av), 50, 'system', null);
  perform public.pf('P2','create_or_get_batch replay returns same batch', b1.id::text, b2.id::text);
  perform public.pf('P2','declared version stored verbatim as source_snapshot_key', dv, b1.source_snapshot_key);
  perform public.pf('P2','idempotency_key IS the digest', public.pf_idem(dv,av), b1.idempotency_key);

  b3 := public.dealer_accelerator_create_or_get_batch(v_src, av||'-alt', dv, public.pf_idem(dv, av||'-alt'), 50, 'system', null);
  perform public.pf('P2','same declared version + different adapter version = distinct batch','distinct',
    case when b3.id <> b1.id then 'distinct' else 'SAME' end);
  perform public.pf('P2','...and distinct digest','distinct',
    case when b3.idempotency_key <> b1.idempotency_key then 'distinct' else 'SAME' end);

  -- delimiter-like content, byte-length boundaries, unicode: no collisions
  with vectors(dvv, avv) as (values
    ('a:b','1:a'), ('1:a','a:b'), ('a','b'), ('ab',''), ('','ab'),
    ('v1','v2'), ('v1v2',''), ('', 'v1v2'),
    (E'café','x'), ('cafe','x'), (E'é','x'), (E'é','x'),
    ('12:x','y'), ('1','2:xy'), ('10:aaaaaaaaaa','b'), ('aaaaaaaaaa','10:b'))
  select count(*) - count(distinct public.pf_idem(dvv,avv)) into v_n from vectors;
  perform public.pf('P2','16 digest vectors: zero collisions','0', v_n::text);

  perform public.pfset('batch_a', b1.id::text);
  perform public.pfset('batch_alt', b3.id::text);
end $p2$;

-- ── P1 · schema truths ──────────────────────────────────────────────────
do $p1$
declare ba uuid := public.pfget('batch_a')::uuid; bx uuid := public.pfget('batch_alt')::uuid;
begin
  perform public.pf_ok('P1','batches CHECK accepts cancel_requested from queued',
    format('update public.dealer_accelerator_batches set status=''cancel_requested'' where id=%L', bx));
  perform public.pf_errlike('P1','cancel_requested with completed_at REJECTED','%status_truth_check%',
    format('update public.dealer_accelerator_batches set completed_at=now() where id=%L', bx));
  perform public.pf_ok('P1','batches CHECK accepts cancelled',
    format('update public.dealer_accelerator_batches set status=''cancelled'' where id=%L', bx));
  perform public.pf_errlike('P1','cancelled with failed_at REJECTED','%status_truth_check%',
    format('update public.dealer_accelerator_batches set failed_at=now() where id=%L', bx));
  perform public.pf_ok('P1','reset scratch batch to queued',
    format('update public.dealer_accelerator_batches set status=''queued'' where id=%L', bx));
  perform public.pf_errlike('P1','init lease token without expiry REJECTED','%init_lease_pair_check%',
    format('update public.dealer_accelerator_batches set initialization_lease_token=gen_random_uuid() where id=%L', ba));
  perform public.pf_errlike('P1','init lease expiry without token REJECTED','%init_lease_pair_check%',
    format('update public.dealer_accelerator_batches set initialization_lease_expires_at=now() where id=%L', ba));
  perform public.pf_ok('P1','init lease pair together ACCEPTED',
    format('update public.dealer_accelerator_batches set initialization_lease_token=gen_random_uuid(), initialization_lease_expires_at=now()+interval ''1 min'' where id=%L', ba));
  perform public.pf_ok('P1','init lease pair cleared together ACCEPTED',
    format('update public.dealer_accelerator_batches set initialization_lease_token=null, initialization_lease_expires_at=null where id=%L', ba));
end $p1$;

-- ── P3 · initialization lease (§5.2) ────────────────────────────────────
do $p3$
declare
  ba uuid := public.pfget('batch_a')::uuid; bx uuid := public.pfget('batch_alt')::uuid;
  t1 uuid := gen_random_uuid(); t2 uuid := gen_random_uuid();
  b public.dealer_accelerator_batches; n0 int; n1 int;
begin
  perform public.pf_errlike('P3','claim init lease on queued REFUSED','batch_not_initialization_eligible:queued',
    format('select public.dealer_accelerator_claim_batch_initialization_lease(%L,%L,60,''worker'',null)', ba, t1));
  b := public.dealer_accelerator_transition_batch(ba,'running',null,'system',null,null);
  perform public.pf('P3','batch running','running', b.status);

  select count(*) into n0 from public.dealer_accelerator_lifecycle_events
   where batch_id=ba and event_type='batch_initialization_lease_claimed';
  b := public.dealer_accelerator_claim_batch_initialization_lease(ba,t1,60,'worker',null);
  select count(*) into n1 from public.dealer_accelerator_lifecycle_events
   where batch_id=ba and event_type='batch_initialization_lease_claimed';
  perform public.pf('P3','claim on running emits exactly one claimed event','1',(n1-n0)::text);
  perform public.pf('P3','lease token stored', t1::text, b.initialization_lease_token::text);

  b := public.dealer_accelerator_claim_batch_initialization_lease(ba,t1,60,'worker',null);
  select count(*) into n1 from public.dealer_accelerator_lifecycle_events
   where batch_id=ba and event_type='batch_initialization_lease_claimed';
  perform public.pf('P3','same-token renewal emits NO second event','1',(n1-n0)::text);
  perform public.pf_err('P3','different token while unexpired REFUSED','batch_initialization_already_leased',
    format('select public.dealer_accelerator_claim_batch_initialization_lease(%L,%L,60,''worker'',null)', ba, t2));

  update public.dealer_accelerator_batches
     set initialization_lease_expires_at = clock_timestamp() - interval '1 second' where id=ba;
  select count(*) into n0 from public.dealer_accelerator_lifecycle_events
   where batch_id=ba and event_type='batch_initialization_lease_recovered';
  b := public.dealer_accelerator_claim_batch_initialization_lease(ba,t2,60,'worker',null);
  select count(*) into n1 from public.dealer_accelerator_lifecycle_events
   where batch_id=ba and event_type='batch_initialization_lease_recovered';
  perform public.pf('P3','expired lease claim emits recovered event','1',(n1-n0)::text);
  perform public.pf('P3','recovered lease held by new token', t2::text, b.initialization_lease_token::text);

  perform public.pf_err('P3','surrender with wrong token REFUSED','batch_initialization_lease_token_mismatch',
    format('select public.dealer_accelerator_surrender_batch_initialization_lease(%L,%L,''worker'',null)', ba, t1));
  perform public.pf_err('P3','surrender with null token REFUSED','lease_token_required',
    format('select public.dealer_accelerator_surrender_batch_initialization_lease(%L,null,''worker'',null)', ba));

  select count(*) into n0 from public.dealer_accelerator_lifecycle_events where batch_id=ba;
  b := public.dealer_accelerator_surrender_batch_initialization_lease(ba,t2,'worker',null);
  select count(*) into n1 from public.dealer_accelerator_lifecycle_events where batch_id=ba;
  perform public.pf('P3','surrender emits NO event','0',(n1-n0)::text);
  perform public.pf('P3','surrender clears lease pair','both null',
    case when b.initialization_lease_token is null and b.initialization_lease_expires_at is null
         then 'both null' else 'NOT CLEARED' end);
  perform public.pf('P3','surrender causes NO status transition','running', b.status);
  perform public.pf_err('P3','surrender when not leased REFUSED','batch_initialization_not_leased',
    format('select public.dealer_accelerator_surrender_batch_initialization_lease(%L,%L,''worker'',null)', ba, t2));

  perform public.dealer_accelerator_transition_batch(bx,'running',null,'system',null,null);
  perform public.dealer_accelerator_claim_batch_initialization_lease(bx,t1,600,'worker',null);
  b := public.dealer_accelerator_transition_batch(bx,'failed','fixture_terminalization','system',null,null);
  perform public.pf('P3','terminal transition clears init lease pair','both null',
    case when b.initialization_lease_token is null and b.initialization_lease_expires_at is null
         then 'both null' else 'NOT CLEARED' end);
  perform public.pf_errlike('P3','claim init lease on terminal batch REFUSED','batch_not_initialization_eligible:failed',
    format('select public.dealer_accelerator_claim_batch_initialization_lease(%L,%L,60,''worker'',null)', bx, t1));
end $p3$;

-- ── P4 · capture + conflict law (§6/§7) ─────────────────────────────────
-- ── P5 · preflight result (§6.2) ────────────────────────────────────────
-- ── P6 · line geometry (§9.3), including the writer-role GiST probe ─────
-- ── P7 · cancellation state machine (§10) ───────────────────────────────
-- ── P8 · photograph terminal semantics (§13) + completion predicate ─────
-- ── P5.3 · initialization crash-window truth table ──────────────────────
-- ── P10 · lifecycle-event ordering ──────────────────────────────────────
-- ── P14 · content-addressed create-only storage ─────────────────────────
-- ── P15 · origin governance (§15) ───────────────────────────────────────
--
-- The bodies of P4–P8, P5.3, P10, P14 and P15 as executed on 2026-08-04 are
-- long; each is a `do $$ … $$` block in the same shape as P1–P3 above,
-- driving the real functions and asserting through pf/pf_err/pf_errlike.
-- They are reproduced verbatim in the 2026-08-04 proof transcript packet.
-- Both findings the 2026-08-04 run produced are now CORRECTED in the
-- migration under contract v8; the history is kept because a re-runner
-- needs to know what these proofs are actually watching for.
--
--   D1 (BLOCKER, FIXED in v8) · Against the v7 text, P6 could not record a
--   single manifest line: dealer_accelerator_record_manifest_line did
--   `select … from dealer_accelerator_manifest_captures … for update`, but
--   the writer holds only SELECT+INSERT there, and row locking needs UPDATE
--   privilege. Every call died with
--     permission denied for table dealer_accelerator_manifest_captures
--   A superuser probe cannot see this — the function is SECURITY DEFINER
--   owned by the writer, so it always runs with the writer's privileges.
--   Measured on target, ALL FOUR lock strengths are refused on both
--   insert-only tables, so no weaker lock was available either:
--     for update / for no key update / for share / for key share
--       → permission denied  (manifest_captures AND manifest_lines)
--     for update on dealer_accelerator_batches → LOCK OK
--   Layout REJECTED candidate C1 (grant UPDATE + a with-check-false lock
--   policy) as the final design and ruled candidate C2: serialise on the
--   GOVERNING BATCH ROW, taken first, then read the immutable capture, then
--   read the predecessor line. P6 must now prove that recording succeeds
--   under `set role dealer_accelerator_writer` with NO grant beyond the
--   migration's own — that is the assertion that would have caught D1.
--
--   F2 (FIXED in v8) · The rejection-reason pairing CHECK was named
--   dealer_accelerator_manifest_preflight_results_rejection_reason_pairing_check
--   (76 chars) and Postgres silently stored it truncated at 63, so the
--   contract name and the catalogue name disagreed. It is now
--   dealer_accelerator_preflight_rejection_reason_check (50 chars), logic
--   unchanged. P5 asserts BOTH that the CHECK fires and that the stored
--   name is exactly that string — an untruncated-name assertion is now part
--   of the proof, so the class of defect cannot recur silently.

-- ── P9 · §15.1 function execution boundary (REAL role test) ─────────────
-- Executable denial matrix: actual live calls under BOTH set role anon AND
-- set role authenticated, for every writer function including the two
-- AMENDED Flight 1 functions and the origin revoker. Catalog inspection
-- alone does not discharge this gate.
do $p9$
declare
  v_role text; v_fn text; v_call text; v_denied boolean; v_msg text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    execute format('set role %I', v_role);
    for v_fn, v_call in
      select * from (values
        ('dealer_accelerator_claim_batch_initialization_lease',
         'select public.dealer_accelerator_claim_batch_initialization_lease(gen_random_uuid(), gen_random_uuid(), 60, ''worker'', null)'),
        ('dealer_accelerator_surrender_batch_initialization_lease',
         'select public.dealer_accelerator_surrender_batch_initialization_lease(gen_random_uuid(), gen_random_uuid(), ''worker'', null)'),
        ('dealer_accelerator_surrender_item_lease',
         'select public.dealer_accelerator_surrender_item_lease(gen_random_uuid(), gen_random_uuid(), ''worker'', null)'),
        ('dealer_accelerator_claim_item_lease',
         'select public.dealer_accelerator_claim_item_lease(gen_random_uuid(), gen_random_uuid(), 60, ''worker'', null)'),
        ('dealer_accelerator_transition_batch',
         'select public.dealer_accelerator_transition_batch(gen_random_uuid(), ''running'', null, ''system'', null, null)'),
        ('dealer_accelerator_request_batch_cancellation',
         'select public.dealer_accelerator_request_batch_cancellation(gen_random_uuid(), ''system'', null, null)'),
        ('dealer_accelerator_record_manifest_capture',
         'select public.dealer_accelerator_record_manifest_capture(gen_random_uuid(), ''u'', ''u'', repeat(''a'',64), ''p'', 1, ''t'', now(), now(), 1, null, null, ''worker'', null)'),
        ('dealer_accelerator_record_manifest_preflight_result',
         'select public.dealer_accelerator_record_manifest_preflight_result(gen_random_uuid(), ''accepted'', null, null, ''v'', now(), ''worker'', null)'),
        ('dealer_accelerator_record_manifest_line',
         'select public.dealer_accelerator_record_manifest_line(gen_random_uuid(), 1, 0, 1, ''lf'', ''x'', gen_random_uuid(), ''worker'', null)'),
        ('dealer_accelerator_approve_source_origin',
         'select public.dealer_accelerator_approve_source_origin(gen_random_uuid(), ''manifest'', ''example.com'', 443, ''/'', 1, ''system'', null)'),
        ('dealer_accelerator_revoke_source_origin',
         'select public.dealer_accelerator_revoke_source_origin(gen_random_uuid(), 1, ''system'', null)'),
        ('dealer_accelerator_record_photograph_retrieval_terminal',
         'select public.dealer_accelerator_record_photograph_retrieval_terminal(gen_random_uuid(), ''r'', ''worker'', null)')
      ) t(fn, call)
    loop
      v_denied := false;
      begin
        execute v_call;
      exception
        when insufficient_privilege then v_denied := true;
        when others then
          -- any non-permission error means the role REACHED the function
          -- body: that is a boundary failure, recorded as such
          get stacked diagnostics v_msg = MESSAGE_TEXT;
          v_denied := false;
      end;
      reset role;  -- proof_log insert needs the harness role
      insert into public.proof_log(phase, step, expected, actual, pass)
      values ('P9', format('%s denied as %s', v_fn, v_role), 'insufficient_privilege',
              case when v_denied then 'insufficient_privilege' else coalesce('REACHED BODY: '||v_msg, 'EXECUTED') end,
              v_denied);
      execute format('set role %I', v_role);
    end loop;
    reset role;
  end loop;
end
$p9$;

-- P9 positive control (intended roles): the SAME calls must reach the
-- function body as service_role and as the owner dealer_accelerator_writer
-- — failing, if at all, INSIDE the function on business rules
-- (batch_not_found etc.), never with insufficient_privilege.
do $p9pos$
declare v_role text; v_fn text; v_call text; v_msg text; v_perm boolean;
begin
  foreach v_role in array array['service_role','dealer_accelerator_writer'] loop
    for v_fn, v_call in
      select * from (values
        ('dealer_accelerator_claim_batch_initialization_lease',
         'select public.dealer_accelerator_claim_batch_initialization_lease(gen_random_uuid(), gen_random_uuid(), 60, ''worker'', null)'),
        ('dealer_accelerator_surrender_batch_initialization_lease',
         'select public.dealer_accelerator_surrender_batch_initialization_lease(gen_random_uuid(), gen_random_uuid(), ''worker'', null)'),
        ('dealer_accelerator_surrender_item_lease',
         'select public.dealer_accelerator_surrender_item_lease(gen_random_uuid(), gen_random_uuid(), ''worker'', null)'),
        ('dealer_accelerator_claim_item_lease',
         'select public.dealer_accelerator_claim_item_lease(gen_random_uuid(), gen_random_uuid(), 60, ''worker'', null)'),
        ('dealer_accelerator_transition_batch',
         'select public.dealer_accelerator_transition_batch(gen_random_uuid(), ''running'', null, ''system'', null, null)'),
        ('dealer_accelerator_request_batch_cancellation',
         'select public.dealer_accelerator_request_batch_cancellation(gen_random_uuid(), ''system'', null, null)'),
        ('dealer_accelerator_record_manifest_capture',
         'select public.dealer_accelerator_record_manifest_capture(gen_random_uuid(), ''u'', ''u'', repeat(''a'',64), ''p'', 1, ''t'', now(), now(), 1, null, null, ''worker'', null)'),
        ('dealer_accelerator_record_manifest_preflight_result',
         'select public.dealer_accelerator_record_manifest_preflight_result(gen_random_uuid(), ''accepted'', null, null, ''v'', now(), ''worker'', null)'),
        ('dealer_accelerator_record_manifest_line',
         'select public.dealer_accelerator_record_manifest_line(gen_random_uuid(), 1, 0, 1, ''lf'', ''x'', gen_random_uuid(), ''worker'', null)'),
        ('dealer_accelerator_approve_source_origin',
         'select public.dealer_accelerator_approve_source_origin(gen_random_uuid(), ''manifest'', ''example.com'', 443, ''/'', 1, ''system'', null)'),
        ('dealer_accelerator_revoke_source_origin',
         'select public.dealer_accelerator_revoke_source_origin(gen_random_uuid(), 1, ''system'', null)'),
        ('dealer_accelerator_record_photograph_retrieval_terminal',
         'select public.dealer_accelerator_record_photograph_retrieval_terminal(gen_random_uuid(), ''r'', ''worker'', null)')
      ) t(fn, call)
    loop
      v_perm := false; v_msg := null;
      execute format('set role %I', v_role);
      begin execute v_call; v_msg := 'EXECUTED';
      exception
        when insufficient_privilege then v_perm := true; v_msg := 'insufficient_privilege';
        when others then get stacked diagnostics v_msg = MESSAGE_TEXT;
      end;
      reset role;
      insert into public.proof_log(phase, step, expected, actual, pass)
      values ('P9+', format('%s reaches the body as %s', v_fn, v_role),
              'business-rule error, never a permission error', v_msg, not v_perm);
    end loop;
  end loop;
end
$p9pos$;

-- ── §R · multi-session races (real parallel HTTP, never one transaction) ─
-- Install disposable PostgREST wrappers, fire parallel requests with the
-- anon key, then DROP the wrappers and reset the timeout. Each wrapper
-- waits on a shared wall-clock barrier so the requests genuinely overlap.
--
--   alter role anon set statement_timeout = '30s';   -- default 3s cancels
--                                                    -- lock-holding sessions
--   create or replace function public.race_create_batch(
--     p_start timestamptz, p_src uuid, p_av text, p_dv text)
--   returns jsonb language plpgsql security definer set search_path='' as $$
--   declare b public.dealer_accelerator_batches;
--   begin
--     perform pg_sleep(greatest(0, extract(epoch from (p_start - clock_timestamp()))));
--     b := public.dealer_accelerator_create_or_get_batch(
--            p_src, p_av, p_dv, public.pf_idem(p_dv,p_av), 5, 'system', null);
--     return jsonb_build_object('batch_id', b.id, 'status', b.status);
--   exception when others then return jsonb_build_object('error', sqlerrm);
--   end $$;
--   -- …race_claim_init, race_claim_item, race_capture in the same shape;
--   -- race_cancel_hold additionally pg_sleep()s AFTER requesting
--   -- cancellation so it holds the batch row lock across the window.
--   grant execute on function public.race_* to anon;
--   notify pgrst, 'reload schema';
--
-- Then, from a shell, four races (4 parallel curls each) against
-- /rest/v1/rpc/<fn>. Results proven 2026-08-04:
--   RACE 1 · four simultaneous first-ever create_or_get_batch
--            → one batch id returned four times, one batch_created event.
--   RACE 2 · four simultaneous init-lease claims with distinct tokens
--            → one {"won":true}, three batch_initialization_already_leased,
--              one claimed event, zero recovered events.
--   RACE 3 · cancellation holding the batch row vs three lease claims
--            → the claim that reached the row lock FIRST was granted while
--              the batch was still running (its event id precedes the
--              batch_cancel_requested event); the other two were refused
--              with batch_not_running:cancel_requested. The invariant is
--              "no lease is granted ON a cancel_requested batch", and it
--              holds; the granted lease then correctly BLOCKS the cancelled
--              transition with cancellation_pending_active_leases until it
--              is surrendered.
--   RACE 4 · four simultaneous identical captures → one capture row, the
--            same id returned four times (unique_violation recovery path).
--
--   drop function public.race_*;  alter role anon reset statement_timeout;

-- ── P11 · rollback refusal → clean rollback → no-op → residue → reapply ─
-- 1 · Prove all four refusal branches independently with f3_rollback_guard()
--     while the corresponding state still exists:
--       evidence rows → batch states → retrieval_terminal photographs →
--       Flight 3 lifecycle events. Each names its exact count.
-- 2 · Clear the proof fixture. Deletion order matters: the events table and
--     the payload/photograph tables reference each other, so
--       extractions → photographs → payloads → lifecycle_events →
--       observations → batch_items → batches → source_items → sources.
-- 3 · Run supabase/migrations/20260803200000_..._flight3_manifest_adapter.rollback.sql
-- 4 · Residue probes: 0 Flight 3 tables / functions / policies /
--     initialization-lease columns; btree_gist uninstalled; dealer objects
--     back to 9 tables + 13 functions; batches status CHECK back to 5
--     states, event vocabulary to 25, photograph states to 3; the restored
--     transition_batch mentions no cancellation and the restored
--     claim_item_lease no batch gate; both still writer-owned with
--     anon/authenticated denied; base tables byte-identical in row count.
-- 5 · Run the rollback a SECOND time: the to_regclass sentinel returns the
--     notice, and the whole file is a proven no-op — tables, function body
--     hashes, constraint definitions, columns and table grants all
--     unchanged (capture them into a temp table before the run and compare).
-- 6 · Reapply the forward migration; its own postconditions pass; verify
--     4 tables, 12 writer-owned functions (10 new + 2 amended), btree_gist,
--     the GiST exclusion constraint, 9 RLS policies, status CHECK back to 7
--     states, event vocabulary back to 30, and zero data rows.
--     NOTE: D1 reproduces here — that is the correct result, and it proves
--     the defect lives in the committed file, not in any transcription.

-- ── summary ─────────────────────────────────────────────────────────────
select phase, count(*) assertions, count(*) filter (where not pass) failed
  from public.proof_log group by phase order by phase;
select * from public.proof_log where not pass order by seq;   -- expected empty

-- ── teardown (leave the target as the audit found it, plus the migration) ─
-- drop function if exists public.pf(text,text,text,text);
-- drop function if exists public.pf_err(text,text,text,text);
-- drop function if exists public.pf_errlike(text,text,text,text);
-- drop function if exists public.pf_ok(text,text,text);
-- drop function if exists public.pfset(text,text);
-- drop function if exists public.pfget(text);
-- drop function if exists public.pf_idem(text,text);
-- drop function if exists public.f3_rollback_guard();
-- drop table if exists public.proof_log;
-- drop table if exists public.proof_env;
-- alter role anon reset statement_timeout;
