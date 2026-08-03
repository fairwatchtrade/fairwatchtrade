#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════════════
   GALAXY PUBLICATION — EXECUTABLE MULTI-SESSION CONCURRENCY HARNESS
   scripts/galaxy-publication-concurrency/run.mjs

   SIX concurrent interleavings (I1–I5 operator races + I6 three-session
   schema retreat) and TWO postcondition suites (P1 exact audit, P2
   five-level pre-cleanup state) — eight test groups total. Interleavings
   use genuinely independent PostgREST HTTP requests; postcondition suites
   assert exact database facts and are never described as races.

   Usage (see README.md):
     SUPABASE_URL=https://<branch-ref>.supabase.co \
     SUPABASE_ANON_KEY=<branch anon key> \
     GALAXY_PROOF_BRANCH_REF=<branch-ref> \
     node run.mjs [--negative-control] [--out transcript.json]

   TARGET GUARD (non-circular): the operator declares the disposable branch
   identity twice through independent channels — once to guarded
   fixture.sql (session setting, stored in the marker it mints) and once to
   this harness (GALAXY_PROOF_BRANCH_REF). The harness verifies, before any
   write: the env identity is present, is not the production ref, is
   exactly the SUPABASE_URL host's project ref, and equals the identity the
   marker stored. The harness never creates the marker and never trusts an
   identity it minted itself.

   The transcript claims only what the execution proves. Whether production
   was untouched is an OPERATOR statement supported by branch inventory,
   not a harness claim.

   Exit code: 0 iff every group met its expectation. --negative-control
   inverts I1's expectation (missing lock must be DETECTED via
   serialization-order inversion) and skips the remaining groups.
   ════════════════════════════════════════════════════════════════════════ */

import { writeFileSync } from "node:fs";

const PRODUCTION_REF = "aqgjcezhdoianqmoknnu";

const URL_BASE = process.env.SUPABASE_URL?.replace(/\/$/, "");
const KEY = process.env.SUPABASE_ANON_KEY;
const DECLARED_REF = process.env.GALAXY_PROOF_BRANCH_REF;
const NEGATIVE = process.argv.includes("--negative-control");
const OUT = (() => {
  const i = process.argv.indexOf("--out");
  return i >= 0 ? process.argv[i + 1] : null;
})();

if (!URL_BASE || !KEY || !DECLARED_REF) {
  console.error("SUPABASE_URL, SUPABASE_ANON_KEY and GALAXY_PROOF_BRANCH_REF are required (environment only).");
  process.exit(2);
}
if (DECLARED_REF === PRODUCTION_REF) {
  console.error("REFUSED: the declared branch identity is the production project ref.");
  process.exit(2);
}
const urlRef = (() => {
  try {
    const host = new URL(URL_BASE).hostname; // <ref>.supabase.co
    return host.split(".")[0];
  } catch {
    return null;
  }
})();
if (urlRef !== DECLARED_REF) {
  console.error(`REFUSED: SUPABASE_URL project ref (${urlRef}) does not equal the declared identity (${DECLARED_REF}).`);
  process.exit(2);
}

const transcript = {
  harness: "scripts/galaxy-publication-concurrency/run.mjs",
  mode: NEGATIVE ? "negative-control" : "proof",
  declared_branch_ref: DECLARED_REF,
  run_at: new Date().toISOString(),
  test_groups: "6 concurrent interleavings (I1-I6) + 2 postcondition suites (P1-P2)",
  locks_under_test: {
    operator: "pg_advisory_xact_lock(hashtextextended('fwt.galaxy_publication', 0)) — first statement of both operator functions",
    retreat: "same advisory key + ACCESS EXCLUSIVE on vault_brands→vault_collections→vault_families→vault_variants→vault_references, guard-through-commit",
  },
  target_guard: {}, // filled after verification; execution-supported claims only
  groups: [],
};

let failures = 0;
/** Every scenario-created audit event, in creation order, with the exact
    facts P1 must find in the audit log. Never reconciled by timestamp. */
const expectedEvents = [];

async function rpc(fn, args = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text === "" ? null : JSON.parse(text);
  } catch { /* non-JSON */ }
  return { status: res.status, json, text };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ms = (a, b) => new Date(b).getTime() - new Date(a).getTime();

function record(id, kind, title, sessions, expected, actual, pass, evidence) {
  transcript.groups.push({ id, kind, title, sessions, expected, actual, pass, evidence });
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${id} [${kind}]  ${title}`);
  if (!pass) console.log(`      expected: ${expected}\n      actual:   ${actual}`);
}

/** Track an operator result's audit event for P1's exact assertions. */
function expectEvent(res, actor, operation, changedRows, revertedEventId = null) {
  const r = res?.result;
  if (r?.event_id) {
    expectedEvents.push({
      event_id: r.event_id,
      operation,
      actor,
      changed_rows: changedRows,
      reverted_event_id: revertedEventId,
    });
  }
}

const timedActivate = (manifest, actor, hold = 0) =>
  rpc("test_timed_activate", { p_manifest: manifest, p_actor: actor, p_hold_secs: hold });
const timedRollback = (event, actor, hold = 0) =>
  rpc("test_timed_rollback", { p_event: event, p_actor: actor, p_hold_secs: hold });

async function main() {
  // ── target guard, completed against the CONNECTED database ──
  const marker = await rpc("test_branch_marker");
  if (marker.status !== 200) {
    console.error("REFUSED: no disposable-target marker on the connected database — run guarded fixture.sql first.");
    process.exit(2);
  }
  if (marker.json !== DECLARED_REF) {
    console.error(`REFUSED: marker identity (${marker.json}) does not equal the declared identity (${DECLARED_REF}).`);
    process.exit(2);
  }
  transcript.target_guard = {
    declared_identity_supplied: true,
    declared_identity_not_production: true,
    url_project_ref_equals_declared: true,
    marker_present_and_equals_declared: true,
    statement: "the disposable-target guard passed; the connected target matched the explicitly supplied disposable branch identity; the harness performed no operation outside that verified target",
  };

  const stage = await rpc("test_stage", { p_step: "fresh_fixture" });
  if (stage.status !== 200) {
    console.error(`fixture staging failed: ${stage.text}`);
    process.exit(2);
  }
  const COLL = stage.json.coll_id;
  const FAM = stage.json.fam_id;
  const BASELINE = stage.json.view_counts;

  const HOLD = 5;
  const GAP = 2000;

  /* ═ I1 · same-row activation ∥ activation ═ */
  {
    const pA = timedActivate([{ entity_type: "collection", entity_id: COLL }], "sessA", HOLD);
    await sleep(GAP);
    const pB = timedActivate([{ entity_type: "collection", entity_id: COLL }], "sessB", 0);
    const [A, B] = await Promise.all([pA, pB]);
    const a = A.json, b = B.json;
    const blocked = b && a && ms(b.t_start, b.t_end) > 1500 && new Date(b.t_end) >= new Date(a.t_end);
    const serialized =
      a?.ok === true && a?.result?.changed_rows === 1 &&
      b?.ok === true && b?.result?.changed_rows === 0 && b?.result?.idempotent_noop === true &&
      blocked;
    const detectedMissing =
      a?.ok === true && b?.ok === true &&
      b.result?.changed_rows === 1 && a.result?.changed_rows === 0;

    const sessions = [
      { session: "A", role: "activate NEW-COLL, holding the advisory lock", t_lock: a?.t_lock, t_end: a?.t_end, outcome: a?.ok ? `changed=${a.result?.changed_rows}` : a?.error },
      { session: "B", role: `same-row activate, +${GAP}ms`, t_start: b?.t_start, t_end: b?.t_end, outcome: b?.ok ? `changed=${b.result?.changed_rows} noop=${b.result?.idempotent_noop}` : b?.error },
    ];

    if (NEGATIVE) {
      record("I1", "concurrent-interleaving", "same-row activation ∥ activation — NEGATIVE CONTROL (lock removed)", sessions,
        "MISSING_SERIALIZATION_DETECTED: serialization order inverts (later session B publishes, A finds nothing)",
        detectedMissing
          ? `MISSING_SERIALIZATION_DETECTED (A changed=${a?.result?.changed_rows}, B changed=${b?.result?.changed_rows})`
          : `order held (A changed=${a?.result?.changed_rows}, B changed=${b?.result?.changed_rows}) — lock present`,
        detectedMissing,
        { a_changed: a?.result?.changed_rows, b_changed: b?.result?.changed_rows });
      return finish();
    }
    expectEvent(a, "sessA", "activate", 1);
    expectEvent(b, "sessB", "activate", 0);
    record("I1", "concurrent-interleaving", "same-row activation ∥ activation", sessions,
      "B blocks until A commits, then lands as idempotent no-op (changed=0)",
      `A changed=${a?.result?.changed_rows}; B changed=${b?.result?.changed_rows} noop=${b?.result?.idempotent_noop} blocked=${blocked}`,
      serialized, { db_side_blocking: blocked });
  }

  /* ═ I2 · ancestor activation ∥ descendant activation ═ */
  let parentEvent = null, famEvent = null;
  {
    await rpc("test_stage", { p_step: "reset_rows" });
    const pA = timedActivate([{ entity_type: "collection", entity_id: COLL }], "sessA", HOLD);
    await sleep(GAP);
    const pB = timedActivate([{ entity_type: "family", entity_id: FAM }], "sessB", 0);
    const [A, B] = await Promise.all([pA, pB]);
    const a = A.json, b = B.json;
    parentEvent = a?.result?.event_id ?? null;
    famEvent = b?.result?.event_id ?? null;
    expectEvent(a, "sessA", "activate", 1);
    expectEvent(b, "sessB", "activate", 1);
    const pass =
      a?.ok === true && a?.result?.changed_rows === 1 &&
      b?.ok === true && b?.result?.changed_rows === 1 &&
      ms(b.t_start, b.t_end) > 2000;
    record("I2", "concurrent-interleaving", "ancestor activation ∥ descendant activation", [
      { session: "A", role: "activate parent NEW-COLL, holding lock", t_lock: a?.t_lock, t_end: a?.t_end, outcome: a?.ok ? `changed=${a.result?.changed_rows} event=${parentEvent}` : a?.error },
      { session: "B", role: "activate child NEWCOLL-FAM, +2s", t_start: b?.t_start, t_end: b?.t_end, outcome: b?.ok ? `changed=${b.result?.changed_rows} event=${famEvent}` : b?.error },
    ],
      "child blocks, then SUCCEEDS against the committed live parent",
      `A ok=${a?.ok} changed=${a?.result?.changed_rows}; B ok=${b?.ok} changed=${b?.result?.changed_rows} waited=${b ? ms(b.t_start, b.t_end) : "?"}ms`,
      pass, { parent_event: parentEvent, child_event: famEvent });
  }

  /* staging for I3: revert the child so the parent rollback is clean */
  {
    const r = await timedRollback(famEvent, "staging", 0);
    if (r.json?.ok !== true) {
      record("I3-stage", "staging", "revert child release", [], "reverted", r.json?.error ?? "failed", false, {});
      return finish();
    }
    expectEvent(r.json, "staging", "rollback", 1, famEvent);
  }

  /* ═ I3 · rollback ∥ same-row activation ═ */
  let collEventB = null;
  {
    const pA = timedRollback(parentEvent, "sessA", HOLD);
    await sleep(GAP);
    const pB = timedActivate([{ entity_type: "collection", entity_id: COLL }], "sessB", 0);
    const [A, B] = await Promise.all([pA, pB]);
    const a = A.json, b = B.json;
    collEventB = b?.result?.event_id ?? null;
    expectEvent(a, "sessA", "rollback", 1, parentEvent);
    expectEvent(b, "sessB", "activate", 1);
    const pass =
      a?.ok === true && a?.result?.changed_rows === 1 &&
      b?.ok === true && b?.result?.changed_rows === 1 &&
      ms(b.t_start, b.t_end) > 2000;
    record("I3", "concurrent-interleaving", "rollback ∥ activation of the same row", [
      { session: "A", role: `rollback event ${parentEvent}, holding lock`, t_lock: a?.t_lock, t_end: a?.t_end, outcome: a?.ok ? `reverted changed=${a.result?.changed_rows}` : a?.error },
      { session: "B", role: "activate same row, +2s", t_start: b?.t_start, t_end: b?.t_end, outcome: b?.ok ? `changed=${b.result?.changed_rows} event=${collEventB}` : b?.error },
    ],
      "revert commits first; activation then RE-activates as a new event — no decision lost",
      `A ok=${a?.ok} changed=${a?.result?.changed_rows}; B ok=${b?.ok} changed=${b?.result?.changed_rows}`,
      pass, { rolled_back_event: parentEvent, new_event: collEventB });
  }

  /* ═ I4 · ancestor rollback ∥ descendant activation ═ */
  {
    const pA = timedRollback(collEventB, "sessA", HOLD);
    await sleep(GAP);
    const pB = timedActivate([{ entity_type: "family", entity_id: FAM }], "sessB", 0);
    const [A, B] = await Promise.all([pA, pB]);
    const a = A.json, b = B.json;
    expectEvent(a, "sessA", "rollback", 1, collEventB);
    const refused = b?.ok === false && /REFUSED: .*suppressed by a hidden ancestor/.test(b?.error ?? "");
    const pass = a?.ok === true && refused && ms(b.t_start, b.t_end) > 2000;
    record("I4", "concurrent-interleaving", "ancestor rollback ∥ descendant activation", [
      { session: "A", role: `rollback parent event ${collEventB}, holding lock`, t_lock: a?.t_lock, t_end: a?.t_end, outcome: a?.ok ? "reverted" : a?.error },
      { session: "B", role: "activate child, +2s", t_start: b?.t_start, t_end: b?.t_end, outcome: b?.ok ? "ACTIVATED (wrong)" : `expected refusal: ${(b?.error ?? "").slice(0, 80)}` },
    ],
      "child blocks, then is REFUSED (hidden ancestor) — no event appended",
      `A ok=${a?.ok}; B refused=${refused}`,
      pass, { distinguishes_expected_refusal: refused });
  }

  /* ═ I5 · two rollbacks competing for one event ═ */
  {
    const act = await timedActivate([{ entity_type: "collection", entity_id: COLL }], "staging", 0);
    const ev = act.json?.result?.event_id;
    expectEvent(act.json, "staging", "activate", 1);
    const pA = timedRollback(ev, "sessA", HOLD);
    await sleep(GAP);
    const pB = timedRollback(ev, "sessB", 0);
    const [A, B] = await Promise.all([pA, pB]);
    const a = A.json, b = B.json;
    expectEvent(a, "sessA", "rollback", 1, ev);
    const refused = b?.ok === false && /REFUSED: event .* has already been rolled back/.test(b?.error ?? "");
    const pass = a?.ok === true && a?.result?.changed_rows === 1 && refused && ms(b.t_start, b.t_end) > 2000;
    record("I5", "concurrent-interleaving", "two rollbacks competing for one event", [
      { session: "A", role: `rollback ${ev}, holding lock`, t_lock: a?.t_lock, t_end: a?.t_end, outcome: a?.ok ? "reverted" : a?.error },
      { session: "B", role: "rollback same event, +2s", t_start: b?.t_start, t_end: b?.t_end, outcome: b?.ok ? "REVERTED TWICE (wrong)" : `expected refusal: ${(b?.error ?? "").slice(0, 70)}` },
    ],
      "second blocks, then is REFUSED 'already rolled back' — no double revert, no event",
      `A ok=${a?.ok}; B refused=${refused}`,
      pass, { event_id: ev });
  }

  /* ═ P1 · postcondition suite: exact audit assertions ═ */
  {
    const audit = await rpc("test_read_audit");
    const rows = audit.json ?? [];
    const problems = [];

    if (rows.length !== expectedEvents.length) {
      problems.push(`row count ${rows.length} != expected ${expectedEvents.length}`);
    }
    // one-to-one, in serialized creation order, by EXACT event id
    for (let i = 0; i < Math.min(rows.length, expectedEvents.length); i++) {
      const r = rows[i], e = expectedEvents[i];
      if (r.event_id !== e.event_id) problems.push(`position ${i}: event ${r.event_id} != expected ${e.event_id}`);
      if (r.operation !== e.operation) problems.push(`event ${e.event_id}: operation ${r.operation} != ${e.operation}`);
      if (r.actor !== e.actor) problems.push(`event ${e.event_id}: actor ${r.actor} != ${e.actor}`);
      if (r.changed_rows !== e.changed_rows) problems.push(`event ${e.event_id}: changed_rows ${r.changed_rows} != ${e.changed_rows}`);
      if ((r.reverted_event_id ?? null) !== (e.reverted_event_id ?? null))
        problems.push(`event ${e.event_id}: reverted_event_id ${r.reverted_event_id} != ${e.reverted_event_id}`);
    }
    // no duplicates; every revert strictly after its exact target
    const ids = rows.map((r) => r.event_id);
    if (new Set(ids).size !== ids.length) problems.push("duplicate event ids in audit");
    for (const r of rows.filter((x) => x.reverted_event_id)) {
      const t = rows.find((x) => x.event_id === r.reverted_event_id);
      if (!t) problems.push(`revert ${r.event_id}: target ${r.reverted_event_id} missing from audit`);
      else if (!(t.seq < r.seq)) problems.push(`revert ${r.event_id} does not follow its target in seq`);
    }
    const seqStrict = rows.every((r, i) => i === 0 || r.seq > rows[i - 1].seq);
    if (!seqStrict) problems.push("seq not strictly increasing");

    record("P1", "postcondition-suite", "exact audit assertions over every scenario-created event", [
      { session: "reader", role: "test_read_audit() — exact ids and seq, never timestamps" },
    ],
      `all ${expectedEvents.length} scenario events present once, in serialized order, with exact operation/actor/changed_rows/reverted_event_id; every revert after its exact target`,
      problems.length === 0 ? "all exact assertions held" : problems.join("; "),
      problems.length === 0,
      { expected_events: expectedEvents, audit_rows: rows });
  }

  /* ═ P2 · postcondition suite: five-level state inspection BEFORE cleanup ═ */
  {
    const insp = await rpc("test_inspect_state");
    const s = insp.json ?? {};
    const problems = [];
    const sr = s.scenario_rows ?? {};

    // exact expected end-state after I1–I5: NEW-COLL hidden (I5 reverted),
    // NEWCOLL-FAM hidden (I3-stage reverted), ZZ-HIDDEN hidden; identities
    // unchanged (same ids as staged); exactly one copy of each.
    if (!sr.new_coll || sr.new_coll.id !== COLL) problems.push("NEW-COLL identity changed or missing");
    if (sr.new_coll?.visible !== false || sr.new_coll?.in_view !== false) problems.push(`NEW-COLL not hidden (${JSON.stringify(sr.new_coll)})`);
    if (sr.new_coll?.copies !== 1) problems.push("NEW-COLL duplicated");
    if (!sr.newcoll_fam || sr.newcoll_fam.id !== FAM) problems.push("NEWCOLL-FAM identity changed or missing");
    if (sr.newcoll_fam?.visible !== false || sr.newcoll_fam?.in_view !== false) problems.push("NEWCOLL-FAM not hidden");
    if (sr.newcoll_fam?.copies !== 1) problems.push("NEWCOLL-FAM duplicated");
    if (sr.zz_hidden?.visible !== false || sr.zz_hidden?.in_view !== false) problems.push("ZZ-HIDDEN not hidden");
    if (sr.tb001?.visible !== true || sr.tb001?.in_view !== true) problems.push("TB-001 lost visibility");
    if (sr.tb001?.copies !== 1) problems.push("TB-001 duplicated");

    // visible-descendant-under-hidden-ancestor: structurally zero at every level
    if (!(s.closure_violations ?? [1]).every((v) => v === 0)) problems.push(`closure violations ${JSON.stringify(s.closure_violations)}`);
    // duplicates at all five levels
    if (!(s.duplicates ?? [1]).every((v) => v === 0)) problems.push(`duplicates ${JSON.stringify(s.duplicates)}`);
    // view counts back to the captured baseline (partial publication detector)
    if (!(Array.isArray(s.view_counts) && s.view_counts[0] === BASELINE[0]
          && s.view_counts[1] === BASELINE[1] && s.view_counts[2] === BASELINE[2]))
      problems.push(`view counts ${JSON.stringify(s.view_counts)} != baseline ${JSON.stringify(BASELINE)}`);

    record("P2", "postcondition-suite", "five-level exact state inspection BEFORE any cleanup", [
      { session: "reader", role: "test_inspect_state() — Brand/Collection/Family/Variant/Reference identities, visibility, closure, duplicates" },
    ],
      "exact ids stable; NEW-COLL/NEWCOLL-FAM/ZZ-HIDDEN hidden; TB-001 live; zero closure violations; zero duplicates; views at baseline",
      problems.length === 0 ? "all five-level assertions held (pre-cleanup)" : problems.join("; "),
      problems.length === 0,
      { inspection: s });

    // cleanup only AFTER the assertions completed
    await rpc("test_stage", { p_step: "reset_rows" });
  }

  /* ═ I6 · schema retreat ∥ hierarchy insert ∥ operator mutation ═ */
  {
    const refusal = await rpc("test_timed_retreat", { p_hold_secs: 0 });
    const refusedHidden = refusal.status !== 200 && /REFUSED: \d+ row\(s\) are currently unpublished/.test(refusal.text);

    await rpc("test_stage", { p_step: "publish_all" });
    const pA = rpc("test_timed_retreat", { p_hold_secs: 6 });
    await sleep(GAP);
    const t0B = Date.now();
    const raceSlug = `race-brand-${Date.now()}`;
    const pB = rpc("test_insert_brand", { p_slug: raceSlug, p_name: "RACE-BRAND" });
    const t0C = Date.now();
    const pC = timedActivate([{ entity_type: "collection", entity_id: COLL }], "sessC", 0);
    const [A, B, C] = await Promise.all([pA, pB, pC]);
    const bElapsed = Date.now() - t0B;
    const cElapsed = Date.now() - t0C;
    const a = A.json;
    const guardAfterLocks = a && ms(a.t_locked, a.t_guard) >= 0 && ms(a.t_locked, a.t_guard) < 1000;
    const insertBlocked = B.status === 200 && bElapsed > 2500;
    const activateFailedSafely = C.json?.ok === false && cElapsed > 2500;
    const pass = refusedHidden && a?.retreated === true && guardAfterLocks && insertBlocked && activateFailedSafely;
    record("I6", "concurrent-interleaving", "schema retreat ∥ hierarchy insert ∥ operator mutation (+ hidden-row refusal precheck)", [
      { session: "pre", role: "retreat with hidden rows", outcome: refusedHidden ? "REFUSED (expected)" : "proceeded (wrong)" },
      { session: "A", role: "retreat: advisory key + 5× ACCESS EXCLUSIVE (fixed order) + 6s hold", t_locked: a?.t_locked, t_guard: a?.t_guard, t_end: a?.t_end, outcome: a?.retreated ? "retreated" : "failed" },
      { session: "B", role: "INSERT vault_brands, +2s", elapsed_ms: bElapsed, outcome: B.status === 200 ? "inserted post-retreat" : B.text.slice(0, 60) },
      { session: "C", role: "galaxy_activate, +2s", elapsed_ms: cElapsed, outcome: C.json?.ok === false ? `failed safely: ${(C.json?.error ?? "").slice(0, 50)}` : "SUCCEEDED (wrong)" },
    ],
      "hidden rows refuse; locks precede guard; insert blocks through drops and lands only post-retreat; operator call blocks on the shared key then fails safely",
      `refusedHidden=${refusedHidden} guard-after-locks=${a ? ms(a.t_locked, a.t_guard) : "?"}ms insertBlocked=${bElapsed}ms activateBlocked=${cElapsed}ms`,
      pass, { b_elapsed_ms: bElapsed, c_elapsed_ms: cElapsed });
  }

  finish();
}

function finish() {
  const interleavings = transcript.groups.filter((g) => g.kind === "concurrent-interleaving");
  const suites = transcript.groups.filter((g) => g.kind === "postcondition-suite");
  transcript.summary = {
    concurrent_interleavings: { total: interleavings.length, passed: interleavings.filter((g) => g.pass).length },
    postcondition_suites: { total: suites.length, passed: suites.filter((g) => g.pass).length },
    failed_groups: failures,
  };
  transcript.cleanup = "operator action: delete the disposable branch after this run; the harness performed no operation outside the verified target";
  const body = JSON.stringify(transcript, null, 2);
  if (OUT) writeFileSync(OUT, body);
  console.log(`\n${transcript.summary.concurrent_interleavings.passed}/${transcript.summary.concurrent_interleavings.total} concurrent interleavings + ${transcript.summary.postcondition_suites.passed}/${transcript.summary.postcondition_suites.total} postcondition suites passed (mode: ${transcript.mode})`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("HARNESS ERROR:", e);
  process.exit(2);
});
