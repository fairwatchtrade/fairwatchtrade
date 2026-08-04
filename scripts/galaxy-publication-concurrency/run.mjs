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

import { writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PRODUCTION_REF = "aqgjcezhdoianqmoknnu";

/* The URL is captured EXACTLY as supplied and is never rewritten before it
   is judged. The previous revision stripped a trailing slash off the raw
   value first, so a non-canonical input was silently repaired into a
   canonical one and then "validated" — the check could only ever see input
   it had already corrected. Refusal, never transformation. */
const RAW_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_ANON_KEY;
const DECLARED_REF = process.env.GALAXY_PROOF_BRANCH_REF;
const DECLARED_COMMIT = process.env.GALAXY_PROOF_COMMIT;
const NEGATIVE = process.argv.includes("--negative-control");
const OUT = (() => {
  const i = process.argv.indexOf("--out");
  return i >= 0 ? process.argv[i + 1] : null;
})();

if (!RAW_URL || !KEY || !DECLARED_REF || !DECLARED_COMMIT) {
  console.error("SUPABASE_URL, SUPABASE_ANON_KEY, GALAXY_PROOF_BRANCH_REF and GALAXY_PROOF_COMMIT are required (environment only).");
  process.exit(2);
}

/* ── CANONICAL URL GUARD — runs BEFORE any credential leaves this process.
   The URL must be exactly https://<declared-ref>.supabase.co: exact
   protocol, exact whole hostname, no port, no userinfo, no path-derived
   identity, no alternate suffix, no extra subdomain, and no hostname whose
   FIRST LABEL merely matches. The declared ref must independently satisfy
   the plausible-ref rule and the production denylist. Any deviation exits
   before a single authenticated request is made. ── */
function refuseTarget(reason) {
  console.error(`REFUSED (before any credential was sent): ${reason}`);
  process.exit(2);
}
if (!/^[a-z]{20}$/.test(DECLARED_REF)) {
  refuseTarget(`declared identity ${DECLARED_REF} is not a plausible Supabase branch ref`);
}
if (DECLARED_REF === PRODUCTION_REF) {
  refuseTarget("the declared branch identity is the production project ref");
}
/* UNTOUCHED-INPUT CHECK, FIRST. The raw environment value must ALREADY be
   the one canonical string, byte for byte — no trailing slash, no case
   variation, no port, no userinfo, no path, no query, no fragment, no extra
   label. Judging the string before any parser touches it is what makes the
   check meaningful: WHATWG `new URL()` silently lowercases the host, drops
   a default port, resolves dot-segments and percent-decodes, so a parser-
   first check grades the parser's repairs rather than the operator's input. */
const CANONICAL_URL = `https://${DECLARED_REF}.supabase.co`;
if (RAW_URL !== CANONICAL_URL) {
  refuseTarget(
    `SUPABASE_URL is not byte-identical to the one canonical form.\n` +
    `           supplied:  ${JSON.stringify(RAW_URL)}\n` +
    `           canonical: ${JSON.stringify(CANONICAL_URL)}\n` +
    `           (the input is judged exactly as given and is never normalised first)`
  );
}
/* Second, independent pass: parse the (already exact) string and re-assert
   every component, so a future change to the canonical template cannot
   quietly admit userinfo, a port, a path or a query. */
let parsed;
try {
  parsed = new URL(RAW_URL);
} catch {
  refuseTarget(`SUPABASE_URL is not a valid URL`);
}
if (parsed.protocol !== "https:") refuseTarget(`protocol ${parsed.protocol} is not https:`);
if (parsed.username !== "" || parsed.password !== "") refuseTarget("URL carries userinfo");
if (parsed.port !== "") refuseTarget(`URL carries an explicit port (${parsed.port})`);
if (parsed.pathname !== "/") refuseTarget(`URL carries a path (${parsed.pathname})`);
if (parsed.search !== "" || parsed.hash !== "") refuseTarget("URL carries a query or fragment");
// WHOLE-hostname equality — not a prefix, not a first-label match.
if (parsed.hostname !== `${DECLARED_REF}.supabase.co`) {
  refuseTarget(`hostname ${parsed.hostname} is not exactly ${DECLARED_REF}.supabase.co`);
}
const URL_BASE = RAW_URL;

/* ── SOURCE HASHES — every SQL and harness input this proof rests on ──
   Read-only, from this file's own directory; no secret is ever read from
   disk. The transcript records the sha256 of each input actually used plus
   the operator-supplied commit, so a reviewer can bind the transcript to
   exact bytes instead of to a filename. */
const HERE = dirname(fileURLToPath(import.meta.url));
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const hashInputs = () => {
  const names = ["fixture.sql", "helpers.sql", "negative-control.sql", "run.mjs", "README.md"];
  const out = {};
  for (const n of names) {
    try { out[n] = sha256(readFileSync(join(HERE, n))); }
    catch (e) { out[n] = `UNREADABLE: ${e.code ?? "error"}`; }
  }
  return out;
};

const transcript = {
  harness: "scripts/galaxy-publication-concurrency/run.mjs",
  mode: NEGATIVE ? "negative-control" : "proof",
  declared_branch_ref: DECLARED_REF,
  run_at: new Date().toISOString(),
  /* Bind this transcript to exact bytes, not to filenames: the commit the
     run was performed from, and the sha256 of every SQL and harness input
     it rests on. The publication migration is hashed on the database side
     via the target guard's shape assertions; these are the harness's own. */
  source_commit: DECLARED_COMMIT,
  source_hashes_sha256: hashInputs(),
  supabase_url_verified_untouched: CANONICAL_URL,
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
    declared_identity_plausible_and_not_production: true,
    canonical_https_host_verified_before_credentials: `exactly https://${DECLARED_REF}.supabase.co (no port, userinfo, path, query or extra label)`,
    marker_present_and_equals_declared: true,
    statement: "the canonical-URL guard passed before any credential was sent; the connected target's independently minted marker matched the explicitly supplied disposable branch identity; the harness performed no operation outside that verified target",
  };

  const stage = await rpc("test_stage", { p_step: "fresh_fixture" });
  if (stage.status !== 200) {
    console.error(`fixture staging failed: ${stage.text}`);
    process.exit(2);
  }
  const BRAND = stage.json.brand_id;
  const ZZ = stage.json.zz_id;
  const COLL = stage.json.coll_id;
  const FAM = stage.json.fam_id;
  const VAR = stage.json.var_id;
  const REF = stage.json.ref_id;
  // Complete baselines: ALL FIVE base counts and ALL FIVE view counts.
  const BASE_BASELINE = stage.json.base_counts;
  const VIEW_BASELINE = stage.json.view_counts;
  if (!Array.isArray(BASE_BASELINE) || BASE_BASELINE.length !== 5
      || !Array.isArray(VIEW_BASELINE) || VIEW_BASELINE.length !== 5) {
    console.error("REFUSED: staging did not return all five base_counts and view_counts.");
    process.exit(2);
  }
  if (!BRAND || !ZZ || !COLL || !FAM || !VAR || !REF) {
    console.error("REFUSED: staging did not create scenario rows at all five hierarchy levels (incl. the hidden ZZ brand).");
    process.exit(2);
  }

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

    /* Exact per-level assertion: identity, PARENT identity, visibility,
       publication-view membership, copy count. Applied to all five levels —
       Brand, Collection, Family, Variant, Reference. Any missing, extra,
       duplicated, partially changed or wrongly visible row fails. */
    const assertRow = (label, row, expectedId, expectedParentId, expectedVisible) => {
      if (!row) return problems.push(`${label}: row missing entirely`);
      if (row.id !== expectedId) problems.push(`${label}: identity mutated (${row.id} != ${expectedId})`);
      if (expectedParentId !== null && row.parent_id !== expectedParentId)
        problems.push(`${label}: parent identity mutated (${row.parent_id} != ${expectedParentId})`);
      if (row.visible !== expectedVisible)
        problems.push(`${label}: galaxy_visible ${row.visible} != ${expectedVisible}`);
      if (row.in_view !== expectedVisible)
        problems.push(`${label}: view membership ${row.in_view} != ${expectedVisible}`);
      if (row.copies !== 1) problems.push(`${label}: copy count ${row.copies} != 1`);
    };

    // Expected end-state after I1–I5, per level:
    assertRow("L1 Brand TB-001", sr.tb001, BRAND, null, true);        // live baseline brand
    // ZZ is the id captured at STAGING time, not re-read from the row being
    // asserted — comparing a row's id to itself proves nothing.
    assertRow("L1 Brand ZZ-HIDDEN", sr.zz_hidden, ZZ, null, false);
    assertRow("L2 Collection NEW-COLL", sr.new_coll, COLL, BRAND, false);  // I5 reverted
    assertRow("L3 Family NEWCOLL-FAM", sr.newcoll_fam, FAM, COLL, false);  // I3-stage reverted
    assertRow("L4 Variant NEWFAM-VAR", sr.newfam_var, VAR, FAM, false);    // never activated
    assertRow("L5 Reference NEWVAR-REF", sr.newvar_ref, REF, VAR, false);  // never activated

    // visible-descendant-under-hidden-ancestor: structurally zero at every level
    if (!(s.closure_violations ?? [1]).every((v) => v === 0))
      problems.push(`closure violations ${JSON.stringify(s.closure_violations)}`);

    /* SET-LEVEL RECONCILIATION at all five levels. The per-row checks above
       speak only for named scenario rows, and closure_violations reads only
       base tables — neither can see a row the view OMITS, nor one it serves
       without entitlement. Each level is reconciled as a set: ancestor-closed
       expected ids vs the ids the view actually serves. Omissions, extras
       and the symmetric difference must all be zero, at every level. */
    const LEVELS = ["brand", "collection", "family", "variant", "reference"];
    const diffs = s.view_set_diff;
    if (!Array.isArray(diffs) || diffs.length !== 5) {
      problems.push(`view_set_diff absent or not five levels: ${JSON.stringify(diffs)}`);
    } else {
      for (const level of LEVELS) {
        const d = diffs.find((x) => x.level === level);
        if (!d) { problems.push(`view_set_diff missing level ${level}`); continue; }
        if (d.omitted !== 0)
          problems.push(`${level}: ${d.omitted} entitled row(s) OMITTED from the publication view`);
        if (d.extra !== 0)
          problems.push(`${level}: ${d.extra} row(s) served by the view without entitlement`);
        if (d.symmetric_difference !== 0)
          problems.push(`${level}: symmetric difference ${d.symmetric_difference} (expected ${d.expected}, view served ${d.actual})`);
        if (d.expected !== d.actual)
          problems.push(`${level}: expected-set size ${d.expected} != view size ${d.actual}`);
      }
    }
    // duplicates at all five levels
    if (!(s.duplicates ?? [1]).every((v) => v === 0))
      problems.push(`duplicates ${JSON.stringify(s.duplicates)}`);
    // ALL FIVE base counts and ALL FIVE view counts against the baseline
    if (!(Array.isArray(s.base_counts) && s.base_counts.length === 5
          && s.base_counts.every((c, i) => c === BASE_BASELINE[i])))
      problems.push(`base_counts ${JSON.stringify(s.base_counts)} != baseline ${JSON.stringify(BASE_BASELINE)}`);
    if (!(Array.isArray(s.view_counts) && s.view_counts.length === 5
          && s.view_counts.every((c, i) => c === VIEW_BASELINE[i])))
      problems.push(`view_counts ${JSON.stringify(s.view_counts)} != baseline ${JSON.stringify(VIEW_BASELINE)}`);

    record("P2", "postcondition-suite", "exact five-level state inspection BEFORE any cleanup", [
      { session: "reader", role: "test_inspect_state() — Brand/Collection/Family/Variant/Reference: identity, parent identity, visibility, view membership, copy count; all five base_counts and view_counts" },
    ],
      "every one of the five levels asserted for exact identity, exact parent identity, galaxy_visible, view membership and copy count = 1; zero closure violations; zero duplicates; zero omissions, zero extras and zero symmetric difference between each publication view and its ancestor-closed expected id set, at all five levels; all five base_counts and all five view_counts at the captured baseline",
      problems.length === 0
        ? "all five levels (Brand, Collection, Family, Variant, Reference) asserted and held pre-cleanup; every view reconciled set-wise against its expected id set with zero omissions, zero extras and zero symmetric difference; all five base_counts and all five view_counts matched baseline"
        : problems.join("; "),
      problems.length === 0,
      { levels_asserted: ["brand", "collection", "family", "variant", "reference"],
        base_baseline: BASE_BASELINE, view_baseline: VIEW_BASELINE,
        view_set_reconciliation: s.view_set_diff, inspection: s });

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
