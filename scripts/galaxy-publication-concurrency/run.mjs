#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════════════
   GALAXY PUBLICATION — EXECUTABLE MULTI-SESSION CONCURRENCY HARNESS
   scripts/galaxy-publication-concurrency/run.mjs

   Every scenario uses genuinely independent PostgREST HTTP requests: each
   request is its own database transaction on its own pooled backend.
   Nothing here is sequential-statements-in-one-connection dressed up as
   concurrency.

   Usage (see README.md for full reproduction):
     SUPABASE_URL=https://<branch-ref>.supabase.co \
     SUPABASE_ANON_KEY=<branch anon key> \
     node run.mjs [--negative-control] [--out transcript.json]

   Exit code: 0 iff every scenario met its expectation. In
   --negative-control mode S1's expectation INVERTS (the harness must
   detect the removed lock); all other scenarios are skipped, because a
   lockless implementation has no serialized behaviour left to assert.

   Locks under test (recorded in the transcript):
     operator: pg_advisory_xact_lock(hashtextextended('fwt.galaxy_publication', 0))
               — FIRST statement of galaxy_activate and galaxy_rollback_event
     retreat:  same advisory key, then ACCESS EXCLUSIVE on vault_brands →
               vault_collections → vault_families → vault_variants →
               vault_references, held guard-through-commit
   ════════════════════════════════════════════════════════════════════════ */

import { writeFileSync } from "node:fs";

const PRODUCTION_REF_DENYLIST = ["aqgjcezhdoianqmoknnu"];

const URL_BASE = process.env.SUPABASE_URL?.replace(/\/$/, "");
const KEY = process.env.SUPABASE_ANON_KEY;
const NEGATIVE = process.argv.includes("--negative-control");
const OUT = (() => {
  const i = process.argv.indexOf("--out");
  return i >= 0 ? process.argv[i + 1] : null;
})();

if (!URL_BASE || !KEY) {
  console.error("SUPABASE_URL and SUPABASE_ANON_KEY are required (environment only).");
  process.exit(2);
}
if (PRODUCTION_REF_DENYLIST.some((ref) => URL_BASE.includes(ref))) {
  console.error("REFUSED: target is the production project. This harness only runs on a disposable branch.");
  process.exit(2);
}

const transcript = {
  harness: "scripts/galaxy-publication-concurrency/run.mjs",
  mode: NEGATIVE ? "negative-control" : "proof",
  target_branch: URL_BASE.replace("https://", "").replace(".supabase.co", ""),
  run_at: new Date().toISOString(),
  locks_under_test: {
    operator: "pg_advisory_xact_lock(hashtextextended('fwt.galaxy_publication', 0)) — first statement of both operator functions",
    retreat: "same advisory key + ACCESS EXCLUSIVE on vault_brands→vault_collections→vault_families→vault_variants→vault_references, guard-through-commit",
  },
  scenarios: [],
  production_untouched: true,
};

let failures = 0;

async function rpc(fn, args = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text === "" ? null : JSON.parse(text);
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, json, text };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ms = (a, b) => new Date(b).getTime() - new Date(a).getTime();

function record(id, title, sessions, expected, actual, pass, evidence) {
  transcript.scenarios.push({ id, title, sessions, expected, actual, pass, evidence });
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}  ${title}`);
  if (!pass) console.log(`      expected: ${expected}\n      actual:   ${actual}`);
}

/* A timed helper call = one independent session. The wrapper's pre-hold
   acquires the SAME advisory key the operator functions take, so a
   lock-holding session and a plain operator session genuinely contend. */
const timedActivate = (manifest, actor, hold = 0) =>
  rpc("test_timed_activate", { p_manifest: manifest, p_actor: actor, p_hold_secs: hold });
const timedRollback = (event, actor, hold = 0) =>
  rpc("test_timed_rollback", { p_event: event, p_actor: actor, p_hold_secs: hold });

async function main() {
  // ── target guards ──
  const marker = await rpc("test_branch_marker");
  if (marker.status !== 200 || marker.json !== "galaxy-concurrency-proof-branch") {
    console.error("REFUSED: branch marker absent — apply helpers.sql to the disposable branch first.");
    process.exit(2);
  }

  const stage = await rpc("test_stage", { p_step: "fresh_fixture" });
  if (stage.status !== 200) {
    console.error(`fixture staging failed: ${stage.text}`);
    process.exit(2);
  }
  const COLL = stage.json.coll_id;
  const FAM = stage.json.fam_id;
  // Baseline is captured at start, never assumed: the harness stays valid
  // on a branch that has already hosted a run (extra published brands from
  // a prior S8 shift the absolute counts, not the invariants).
  const BASELINE = stage.json.view_counts;

  const HOLD = 5; // seconds session A holds the serialization lock
  const GAP = 2000; // ms before session B is launched

  /* ═ S1 · same-row activation ∥ activation ═ */
  {
    const pA = timedActivate([{ entity_type: "collection", entity_id: COLL }], "sessA", HOLD);
    await sleep(GAP);
    const t0B = Date.now();
    const pB = timedActivate([{ entity_type: "collection", entity_id: COLL }], "sessB", 0);
    const [A, B] = await Promise.all([pA, pB]);
    const bElapsed = Date.now() - t0B;
    const a = A.json, b = B.json;
    /* Serialization evidence is DATABASE-side, never HTTP latency (pool
       queueing can delay a request without any lock involved):
       · correct: A (lock holder, started first) publishes (changed=1); B,
         though launched second, observes A's committed work → idempotent
         no-op (changed=0), and B's DB completion follows A's.
       · removed lock: the ORDER INVERTS — B's write wins while A sleeps,
         so B changed=1 and A later finds nothing to do (changed=0). */
    const blocked = b && a && ms(b.t_start, b.t_end) > 1500 && new Date(b.t_end) >= new Date(a.t_end);
    const serialized =
      a?.ok === true && a?.result?.changed_rows === 1 &&
      b?.ok === true && b?.result?.changed_rows === 0 && b?.result?.idempotent_noop === true &&
      blocked;
    const detectedMissing =
      a?.ok === true && b?.ok === true &&
      b.result?.changed_rows === 1 && a.result?.changed_rows === 0; // later session won

    const sessions = [
      { session: "A", role: "activate NEW-COLL, holding the advisory lock", t_lock: a?.t_lock, t_end: a?.t_end, outcome: a?.ok ? `changed=${a.result?.changed_rows}` : a?.error },
      { session: "B", role: `same-row activate, launched +${GAP}ms`, t_start: b?.t_start, t_end: b?.t_end, elapsed_ms: bElapsed, outcome: b?.ok ? `changed=${b.result?.changed_rows} noop=${b.result?.idempotent_noop}` : b?.error },
    ];

    if (NEGATIVE) {
      record("S1", "same-row activation ∥ activation — NEGATIVE CONTROL (lock removed)", sessions,
        "MISSING_SERIALIZATION_DETECTED: serialization order inverts (later session B publishes, A finds nothing)",
        detectedMissing
          ? `MISSING_SERIALIZATION_DETECTED (A changed=${a?.result?.changed_rows}, B changed=${b?.result?.changed_rows})`
          : `order held (A changed=${a?.result?.changed_rows}, B changed=${b?.result?.changed_rows}) — lock present`,
        detectedMissing,
        { a_changed: a?.result?.changed_rows, b_changed: b?.result?.changed_rows, detection: detectedMissing });
      return finish();
    }
    record("S1", "same-row activation ∥ activation", sessions,
      "B blocks until A commits, then lands as idempotent no-op (changed=0)",
      `B elapsed ${bElapsed}ms; A changed=${a?.result?.changed_rows}; B changed=${b?.result?.changed_rows} noop=${b?.result?.idempotent_noop}`,
      serialized, { b_elapsed_ms: bElapsed, blocked });
  }

  /* ═ S2 · ancestor activation ∥ descendant activation ═ */
  let famEvent = null;
  {
    await rpc("test_stage", { p_step: "reset_rows" });
    const pA = timedActivate([{ entity_type: "collection", entity_id: COLL }], "sessA", HOLD);
    await sleep(GAP);
    const pB = timedActivate([{ entity_type: "family", entity_id: FAM }], "sessB", 0);
    const [A, B] = await Promise.all([pA, pB]);
    const a = A.json, b = B.json;
    famEvent = b?.result?.event_id ?? null;
    const pass =
      a?.ok === true && a?.result?.changed_rows === 1 &&
      b?.ok === true && b?.result?.changed_rows === 1 &&
      ms(b.t_start, b.t_end) > 2000; // child waited for the parent commit
    record("S2", "ancestor activation ∥ descendant activation", [
      { session: "A", role: "activate parent NEW-COLL, holding lock", t_lock: a?.t_lock, t_end: a?.t_end, outcome: a?.ok ? `changed=${a.result?.changed_rows} event=${a.result?.event_id}` : a?.error },
      { session: "B", role: "activate child NEWCOLL-FAM, +2s", t_start: b?.t_start, t_end: b?.t_end, outcome: b?.ok ? `changed=${b.result?.changed_rows} event=${b.result?.event_id}` : b?.error },
    ],
      "child blocks, then SUCCEEDS against the committed live parent (unserialized it would race the ancestor rule)",
      `A ok=${a?.ok} changed=${a?.result?.changed_rows}; B ok=${b?.ok} changed=${b?.result?.changed_rows} waited=${b ? ms(b.t_start, b.t_end) : "?"}ms`,
      pass, { parent_event: a?.result?.event_id, child_event: famEvent });
  }

  /* ═ stage S3: revert the child so the parent rollback is clean ═ */
  {
    const r = await timedRollback(famEvent, "staging", 0);
    if (r.json?.ok !== true) {
      record("S3-stage", "revert child release (staging)", [], "reverted", r.json?.error ?? "failed", false, {});
      return finish();
    }
  }

  /* ═ S3 · rollback ∥ same-row activation ═ */
  let collEventB = null;
  {
    // the parent is live via S2-A's event; find that exact event id from S2's transcript entry
    const parentEvent = transcript.scenarios.find((s) => s.id === "S2").evidence.parent_event;
    const pA = timedRollback(parentEvent, "sessA", HOLD);
    await sleep(GAP);
    const pB = timedActivate([{ entity_type: "collection", entity_id: COLL }], "sessB", 0);
    const [A, B] = await Promise.all([pA, pB]);
    const a = A.json, b = B.json;
    collEventB = b?.result?.event_id ?? null;
    const pass =
      a?.ok === true && a?.result?.changed_rows === 1 &&
      b?.ok === true && b?.result?.changed_rows === 1 && // re-activation, not lost
      ms(b.t_start, b.t_end) > 2000;
    record("S3", "rollback ∥ activation of the same row", [
      { session: "A", role: `rollback event ${parentEvent}, holding lock`, t_lock: a?.t_lock, t_end: a?.t_end, outcome: a?.ok ? `reverted changed=${a.result?.changed_rows}` : a?.error },
      { session: "B", role: "activate same row, +2s", t_start: b?.t_start, t_end: b?.t_end, outcome: b?.ok ? `changed=${b.result?.changed_rows} event=${collEventB}` : b?.error },
    ],
      "revert commits first; activation then RE-activates as a new event — no decision lost",
      `A ok=${a?.ok} changed=${a?.result?.changed_rows}; B ok=${b?.ok} changed=${b?.result?.changed_rows} waited=${b ? ms(b.t_start, b.t_end) : "?"}ms`,
      pass, { rolled_back_event: parentEvent, new_event: collEventB });
  }

  /* ═ S4 · ancestor rollback ∥ descendant activation ═ */
  {
    const pA = timedRollback(collEventB, "sessA", HOLD);
    await sleep(GAP);
    const pB = timedActivate([{ entity_type: "family", entity_id: FAM }], "sessB", 0);
    const [A, B] = await Promise.all([pA, pB]);
    const a = A.json, b = B.json;
    const refused = b?.ok === false && /REFUSED: .*suppressed by a hidden ancestor/.test(b?.error ?? "");
    const pass = a?.ok === true && refused && ms(b.t_start, b.t_end) > 2000;
    record("S4", "ancestor rollback ∥ descendant activation", [
      { session: "A", role: `rollback parent event ${collEventB}, holding lock`, t_lock: a?.t_lock, t_end: a?.t_end, outcome: a?.ok ? "reverted" : a?.error },
      { session: "B", role: "activate child, +2s", t_start: b?.t_start, t_end: b?.t_end, outcome: b?.ok ? "ACTIVATED (wrong)" : `expected refusal: ${(b?.error ?? "").slice(0, 80)}` },
    ],
      "child blocks, then is REFUSED (hidden ancestor) — no published child under a hidden parent",
      `A ok=${a?.ok}; B refused=${refused} waited=${b ? ms(b.t_start, b.t_end) : "?"}ms`,
      pass, { distinguishes_expected_refusal: refused });
  }

  /* ═ S5 · two rollbacks competing for one event ═ */
  {
    const act = await timedActivate([{ entity_type: "collection", entity_id: COLL }], "staging", 0);
    const ev = act.json?.result?.event_id;
    const pA = timedRollback(ev, "sessA", HOLD);
    await sleep(GAP);
    const pB = timedRollback(ev, "sessB", 0);
    const [A, B] = await Promise.all([pA, pB]);
    const a = A.json, b = B.json;
    const refused = b?.ok === false && /REFUSED: event .* has already been rolled back/.test(b?.error ?? "");
    const pass = a?.ok === true && a?.result?.changed_rows === 1 && refused && ms(b.t_start, b.t_end) > 2000;
    record("S5", "two rollbacks competing for one event", [
      { session: "A", role: `rollback ${ev}, holding lock`, t_lock: a?.t_lock, t_end: a?.t_end, outcome: a?.ok ? "reverted" : a?.error },
      { session: "B", role: "rollback same event, +2s", t_start: b?.t_start, t_end: b?.t_end, outcome: b?.ok ? "REVERTED TWICE (wrong)" : `expected refusal: ${(b?.error ?? "").slice(0, 70)}` },
    ],
      "second blocks, then is REFUSED 'already rolled back' — no double revert",
      `A ok=${a?.ok}; B refused=${refused}`,
      pass, { event_id: ev });
  }

  /* ═ S6 · audit sequence matches the observed serialized order ═ */
  {
    const audit = await rpc("test_read_audit");
    const rows = audit.json ?? [];
    const seqsStrict = rows.every((r, i) => i === 0 || r.seq > rows[i - 1].seq);
    const rollbackAfterTarget = rows
      .filter((r) => r.operation === "rollback" && r.reverted_event_id)
      .every((r) => {
        const target = rows.find((t) => t.event_id === r.reverted_event_id);
        return target && target.seq < r.seq;
      });
    const noDouble = new Set(rows.filter((r) => r.reverted_event_id).map((r) => r.reverted_event_id)).size
      === rows.filter((r) => r.reverted_event_id).length;
    const pass = seqsStrict && rollbackAfterTarget && noDouble && rows.length > 0;
    record("S6", "audit-event sequence matches observed serialized order", [
      { session: "reader", role: "test_read_audit() — exact seq + event ids, never timestamps" },
    ],
      "seq strictly increasing; every rollback follows its exact target event; no event reverted twice",
      `rows=${rows.length} strict=${seqsStrict} rollbackAfterTarget=${rollbackAfterTarget} noDouble=${noDouble}`,
      pass, { audit_rows: rows });
  }

  /* ═ S7 · no partial publication state after commit or failure ═ */
  {
    const s = await rpc("test_stage", { p_step: "reset_rows" });
    const counts = s.json?.view_counts;
    const pass =
      Array.isArray(counts) && Array.isArray(BASELINE) &&
      counts.every((c, i) => c === BASELINE[i]);
    record("S7", "no partial publication state after commit or failure", [
      { session: "reader", role: "ancestor-closed view counts after all S1–S5 outcomes + fixture reset" },
    ],
      `views return to the run's captured baseline ${JSON.stringify(BASELINE)} — every scenario's net effect is a whole, serial state`,
      `views=${JSON.stringify(counts)}`,
      pass, { baseline: BASELINE, view_counts: counts });
  }

  /* ═ S8 · schema retreat ∥ insert ∥ operator mutation + hidden-row refusal ═ */
  {
    // hidden-row refusal FIRST (hidden fixture rows still exist)
    const refusal = await rpc("test_timed_retreat", { p_hold_secs: 0 });
    const refusedHidden = refusal.status !== 200 && /REFUSED: \d+ row\(s\) are currently unpublished/.test(refusal.text);

    // then publish everything and race three sessions
    await rpc("test_stage", { p_step: "publish_all" });
    const pA = rpc("test_timed_retreat", { p_hold_secs: 6 });
    await sleep(GAP);
    const t0B = Date.now();
    const raceSlug = `race-brand-${Date.now()}`; // unique per run — reruns must not collide
    const pB = rpc("test_insert_brand", { p_slug: raceSlug, p_name: "RACE-BRAND" });
    const t0C = Date.now();
    const pC = timedActivate([{ entity_type: "collection", entity_id: COLL }], "sessC", 0);
    const [A, B, C] = await Promise.all([pA, pB, pC]);
    const bElapsed = Date.now() - t0B;
    const cElapsed = Date.now() - t0C;
    const a = A.json;
    const guardAfterLocks = a && ms(a.t_locked, a.t_guard) >= 0 && ms(a.t_locked, a.t_guard) < 1000;
    const insertBlocked = B.status === 200 && bElapsed > 2500; // blocked through the hold
    const activateFailedSafely = C.json?.ok === false && cElapsed > 2500;
    const pass = refusedHidden && a?.retreated === true && guardAfterLocks && insertBlocked && activateFailedSafely;
    record("S8", "schema retreat ∥ hierarchy insert ∥ operator mutation + hidden-row refusal", [
      { session: "pre", role: "retreat with hidden rows", outcome: refusedHidden ? "REFUSED (expected)" : "proceeded (wrong)" },
      { session: "A", role: "retreat: advisory key + 5× ACCESS EXCLUSIVE (fixed order) + 6s hold", t_locked: a?.t_locked, t_guard: a?.t_guard, t_end: a?.t_end, outcome: a?.retreated ? "retreated" : "failed" },
      { session: "B", role: "INSERT vault_brands, +2s", elapsed_ms: bElapsed, outcome: B.status === 200 ? "inserted post-retreat" : B.text.slice(0, 60) },
      { session: "C", role: "galaxy_activate, +2s", elapsed_ms: cElapsed, outcome: C.json?.ok === false ? `failed safely: ${(C.json?.error ?? "").slice(0, 50)}` : "SUCCEEDED (wrong)" },
    ],
      "hidden rows refuse; locks precede guard; insert blocks through drops and lands only post-retreat; operator call blocks on the shared key then fails safely with no partial write",
      `refusedHidden=${refusedHidden} guard-after-locks=${a ? ms(a.t_locked, a.t_guard) : "?"}ms insertBlocked=${bElapsed}ms activateBlocked=${cElapsed}ms`,
      pass, { b_elapsed_ms: bElapsed, c_elapsed_ms: cElapsed });
  }

  finish();
}

function finish() {
  transcript.total = transcript.scenarios.length;
  transcript.passed = transcript.scenarios.filter((s) => s.pass).length;
  transcript.failed = failures;
  transcript.cleanup = "delete the disposable branch after this run (management console or MCP); the harness itself writes nothing outside the branch";
  const body = JSON.stringify(transcript, null, 2);
  if (OUT) writeFileSync(OUT, body); // synchronous: must land before exit
  console.log(`\n${transcript.passed}/${transcript.total} scenarios passed (mode: ${transcript.mode})`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("HARNESS ERROR:", e);
  process.exit(2);
});
