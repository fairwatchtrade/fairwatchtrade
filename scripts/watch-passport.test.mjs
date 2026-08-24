/* Watch Passport — derivation, historical identity, privacy, zero writes.

   Run: node --experimental-strip-types scripts/watch-passport.test.mjs

   The Passport is a pure projection, so it is proven the way a projection
   should be: against a controlled source it cannot influence. The fake
   client below records EVERY operation, which makes "zero writes" a
   structural fact rather than a claim — any insert, update, delete, upsert
   or non-resolver RPC would be caught here.

   The load-bearing case is Case 5. A transfer recorded on a co-member at
   generation N, after the two records are split at N+1, must still be
   interpreted at N. If the composition ever reaches for current resolution
   instead, the withdrawn identity conclusion would look as though it had
   always been true — and that assertion is written to fail loudly. */

import assert from "node:assert/strict";
import { composeWatchPassport } from "../lib/passport/watchPassport.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";

/* Every mutation verb the client exposes. Touching one fails the run. */
const FORBIDDEN = ["insert", "update", "delete", "upsert"];
const ALLOWED_RPCS = new Set(["resolve_physical_watch", "resolve_physical_watch_as_of"]);

function fakeDb(world) {
  const ops = [];
  const table = (name) => {
    const q = {
      _table: name,
      select(cols) { ops.push({ kind: "select", table: name, cols: String(cols ?? "") }); return q; },
      eq() { return q; },
      in() { return q; },
      or() { return q; },
      order() { return q; },
      maybeSingle() {
        ops.push({ kind: "read", table: name });
        return Promise.resolve({ data: (world.tables[name] ?? [])[0] ?? null });
      },
      then(resolve) {
        ops.push({ kind: "read", table: name });
        return Promise.resolve({ data: world.tables[name] ?? [] }).then(resolve);
      },
    };
    for (const verb of FORBIDDEN) {
      q[verb] = () => {
        ops.push({ kind: "WRITE", table: name, verb });
        throw new Error(`Passport attempted a ${verb} on ${name}`);
      };
    }
    return q;
  };
  return {
    ops,
    from: (name) => table(name),
    rpc: (fn, args) => {
      ops.push({ kind: "rpc", fn, args });
      if (!ALLOWED_RPCS.has(fn)) throw new Error(`Passport called a non-resolver RPC: ${fn}`);
      return Promise.resolve({ data: world.rpc(fn, args) });
    },
  };
}

const baseTables = {
  physical_watches: [{ id: A, created_at: "2026-01-05T00:00:00Z" }],
  physical_watch_resolution_decisions: [],
  listings: [],
  listing_decision_events: [],
  physical_watch_transfer_events: [],
  physical_watch_identifier_observations: [],
};

const clone = (o) => JSON.parse(JSON.stringify(o));

console.log("\ncase 1 — bead-only Passport");

{
  const world = {
    tables: clone({
      ...baseTables,
      listings: [{ id: "L1", public_code: "a11111", brand: "Parmigiani", model: "Tonda",
                   reference: "PFC274", status: "published", removal_reason_code: null,
                   created_at: "2026-02-01T00:00:00Z", physical_watch_id: A }],
      listing_decision_events: [{ id: "E1", listing_id: "L1", decision: "approved",
                                  prior_status: "pending_review", resulting_status: "published",
                                  created_at: "2026-02-02T00:00:00Z" }],
    }),
    rpc: () => ({ state: "UNRESOLVED", generation: 0, members: [A], conflicted: false, resolved_watch_id: null }),
  };
  const db = fakeDb(world);
  const p = await composeWatchPassport(A, db);

  check("the header carries the FWT knowledge boundary", () => {
    assert.equal(p.knownToFwtSince, "2026-01-05T00:00:00Z");
  });
  check("and bead creation NEVER appears as a timeline event", () => {
    assert.ok(!p.timeline.some((i) => i.effectiveAt === "2026-01-05T00:00:00Z"));
    assert.ok(!JSON.stringify(p.timeline).toLowerCase().includes("known to"));
  });
  check("a genuinely published listing becomes one founder-admitted chapter", () => {
    const chapters = p.timeline.filter((i) => i.kind === "listing_chapter");
    assert.equal(chapters.length, 1);
    assert.equal(chapters[0].sourceId, "E1");
  });
  check("the Passport says what it does not claim", () => {
    assert.ok(p.disclosures.some((d) => /not evidence that no earlier history/i.test(d)));
    assert.ok(p.disclosures.some((d) => /not a complete ownership history/i.test(d)));
  });
}

console.log("\ncase 5 — adversarial historical identity replay");

{
  /* A and B were one watch at generation 5. A transfer was recorded on B at
     generation 5. At generation 6 they were split. Rendering A's Passport
     now must interpret that event at 5, not at 6. */
  const world = {
    tables: clone({
      ...baseTables,
      physical_watch_resolution_decisions: [
        { left_physical_watch_id: A, right_physical_watch_id: B },
      ],
      physical_watch_transfer_events: [
        { id: "T-B", physical_watch_id: B, event_type: "TRANSFERRED",
          provenance_class: "party_confirmed_recipient", occurred_at: "2026-03-01T00:00:00Z",
          recorded_at: "2026-03-02T00:00:00Z", decision_generation: 5,
          supersedes_event_id: null, trade_deal_id: "D1" },
      ],
    }),
    rpc: (fn, args) => {
      if (fn === "resolve_physical_watch") {
        // CURRENT (generation 6): split. A is alone.
        return { state: "UNRESOLVED", generation: 6, members: [A], conflicted: false, resolved_watch_id: null };
      }
      // AS OF generation 5: merged.
      if (Number(args.p_generation) <= 5) {
        return { state: "RESOLVED", generation: 5, members: [A, B], conflicted: false,
                 resolved_watch_id: "RW-old" };
      }
      return { state: "UNRESOLVED", generation: args.p_generation, members: [args.p_bead],
               conflicted: false, resolved_watch_id: null };
    },
  };
  const db = fakeDb(world);
  const p = await composeWatchPassport(A, db);

  check("the two resolvers genuinely disagree — the fixture is adversarial", () => {
    const asOf = world.rpc("resolve_physical_watch_as_of", { p_bead: B, p_generation: 5 });
    const now = world.rpc("resolve_physical_watch", { p_bead: A });
    assert.deepEqual(asOf.members, [A, B]);
    assert.deepEqual(now.members, [A]);
  });

  const t = p.timeline.find((i) => i.sourceId === "T-B");

  check("the co-member's event still appears in A's Passport", () => {
    assert.ok(t, "the transfer recorded on B at generation 5 must remain reachable");
  });
  check("and is interpreted at ITS OWN generation, not the current one", () => {
    assert.equal(t.identityAtEvent.generation, 5);
    assert.deepEqual(t.identityAtEvent.members, [A, B]);
    assert.notEqual(t.identityAtEvent.generation, p.currentIdentity.generation);
  });
  check("it is labelled as resting on a withdrawn identity conclusion", () => {
    assert.equal(t.identityBasis, "historical_prior_resolution");
    assert.ok(p.timeline.some((i) => i.kind === "identity_note" && /no longer stands/i.test(i.detail)));
  });
  check("while the CURRENT header reflects the split at generation 6", () => {
    assert.equal(p.currentIdentity.generation, 6);
    assert.deepEqual(p.currentIdentity.members, [A]);
  });
  check("the composition asked the as-of resolver for that event's generation", () => {
    assert.ok(db.ops.some((o) => o.fn === "resolve_physical_watch_as_of" && o.args.p_generation === 5));
  });
}

console.log("\ncase 4 / 6 — retraction and conflict");

{
  const world = {
    tables: clone({
      ...baseTables,
      physical_watch_transfer_events: [
        { id: "T1", physical_watch_id: A, event_type: "TRANSFERRED",
          provenance_class: "founder_asserted", occurred_at: null,
          recorded_at: "2026-04-01T00:00:00Z", decision_generation: 0,
          supersedes_event_id: null, trade_deal_id: "D1" },
        { id: "T2", physical_watch_id: A, event_type: "TRANSFER_RETRACTED",
          provenance_class: "founder_asserted", occurred_at: null,
          recorded_at: "2026-04-05T00:00:00Z", decision_generation: 0,
          supersedes_event_id: "T1", trade_deal_id: "D1" },
      ],
    }),
    rpc: (fn) =>
      fn === "resolve_physical_watch"
        ? { state: "CONFLICTED", generation: 9, members: [A, B], conflicted: true, resolved_watch_id: null }
        : { state: "UNRESOLVED", generation: 0, members: [A], conflicted: false, resolved_watch_id: null },
  };
  const p = await composeWatchPassport(A, fakeDb(world));

  check("both the assertion and its retraction remain visible", () => {
    assert.ok(p.timeline.some((i) => i.sourceId === "T1" && i.kind === "transfer"));
    assert.ok(p.timeline.some((i) => i.sourceId === "T2" && i.kind === "transfer_retraction"));
  });
  check("the retraction is worded as a correction, not as a transfer back", () => {
    const r = p.timeline.find((i) => i.sourceId === "T2");
    assert.ok(/withdrawn as mistaken/i.test(r.detail));
    assert.ok(/does not mean the watch was transferred back/i.test(r.detail));
  });
  check("a recorded-only date is labelled honestly", () => {
    assert.equal(p.timeline.find((i) => i.sourceId === "T1").effectiveAtIsRecordedAt, true);
  });
  check("conflict still renders, stops aggregation, and explains itself", () => {
    assert.equal(p.currentIdentity.conflicted, true);
    assert.equal(p.currentIdentity.aggregationStopped, true);
    assert.deepEqual(p.currentIdentity.members, [A]);
    assert.ok(p.timeline.some((i) => /under review/i.test(i.title)));
  });
  check("no transfer is presented as verified or authenticated", () => {
    const s = JSON.stringify(p.timeline).toLowerCase();
    assert.ok(!s.includes("package verified"));
    assert.ok(!s.includes("authenticity verified"));
    assert.ok(!s.includes("independently verified by fwt"));
    assert.ok(/did not independently verify/.test(JSON.stringify(p.timeline)));
  });
}

console.log("\ncase 7 / 8 / 9 — listing admission law");

{
  const world = {
    tables: clone({
      ...baseTables,
      listings: [
        { id: "L-mistake", public_code: "m00001", brand: "X", model: null, reference: null,
          status: "removed", removal_reason_code: "listing_mistake",
          created_at: "2026-02-01T00:00:00Z", physical_watch_id: A },
        { id: "L-legit", public_code: "g00002", brand: "X", model: null, reference: null,
          status: "removed", removal_reason_code: "sold_in_store",
          created_at: "2026-02-01T00:00:00Z", physical_watch_id: A },
        { id: "L-draft", public_code: null, brand: "X", model: null, reference: null,
          status: "draft", removal_reason_code: null,
          created_at: "2026-02-01T00:00:00Z", physical_watch_id: A },
        { id: "L-private", public_code: "p00003", brand: "X", model: null, reference: null,
          status: "private_active", removal_reason_code: null,
          created_at: "2026-02-03T00:00:00Z", physical_watch_id: A },
      ],
      listing_decision_events: [
        { id: "E-mistake", listing_id: "L-mistake", decision: "approved",
          prior_status: "pending_review", resulting_status: "published",
          created_at: "2026-02-02T00:00:00Z" },
        { id: "E-legit", listing_id: "L-legit", decision: "approved",
          prior_status: "pending_review", resulting_status: "published",
          created_at: "2026-02-02T00:00:00Z" },
      ],
    }),
    rpc: () => ({ state: "UNRESOLVED", generation: 0, members: [A], conflicted: false, resolved_watch_id: null }),
  };
  const admissionDb = fakeDb(world);
  const p = await composeWatchPassport(A, admissionDb);
  const dbOps = admissionDb.ops;
  const ids = p.timeline.map((i) => i.sourceId);

  check("a listing_mistake never becomes a chapter, even having been published", () => {
    assert.ok(!ids.includes("E-mistake"));
  });
  check("a legitimately removed public episode stays founder-admitted", () => {
    assert.ok(ids.includes("E-legit"));
  });
  check("a draft is never a chapter", () => {
    assert.ok(!ids.some((i) => String(i).includes("draft")));
  });
  check("a private-only episode is admitted for the founder, metadata only", () => {
    const priv = p.timeline.find((i) => i.sourceId === "L-private");
    assert.ok(priv);
    assert.ok(/permanently excluded from collector\/public provenance/i.test(priv.detail));
  });
  check("and no private column is ever even REQUESTED from the source", () => {
    /* Structural, not a word search: the earlier version flagged the
       Passport's own disclaimer sentence, which proves nothing. What matters
       is which columns the projection asks for. */
    const requested = dbOps.filter((o) => o.kind === "select").map((o) => o.cols.toLowerCase()).join(" ");
    for (const col of ["private_buyer_id", "seller_id", "description", "provenance_note",
                       "asking_price", "score_state", "details", "photos"]) {
      assert.ok(!requested.includes(col), `private column requested: ${col}`);
    }
  });
  check("and no private value reaches the payload", () => {
    const keys = new Set();
    JSON.stringify(p, (k, v) => { keys.add(k); return v; });
    for (const k of ["private_buyer_id", "seller_id", "from_user_id", "to_user_id",
                     "asserted_by_user_id", "cash_amount", "note"]) {
      assert.ok(!keys.has(k), `private key in payload: ${k}`);
    }
  });
  check("the private→public transition gap is SURFACED, not guessed around", () => {
    assert.ok(p.sourceGovernanceGaps.some((g) => /not recorded in listing_decision_events/i.test(g)));
  });
}

console.log("\ncase 12 / 13 / 14 / 15 — privacy, ordering, dedupe, zero writes");

{
  const world = {
    tables: clone({
      ...baseTables,
      listings: [{ id: "L1", public_code: "a11111", brand: "X", model: null, reference: null,
                   status: "published", removal_reason_code: null,
                   created_at: "2026-02-01T00:00:00Z", physical_watch_id: A }],
      listing_decision_events: [{ id: "TIE-A", listing_id: "L1", decision: "approved",
                                  prior_status: "pending_review", resulting_status: "published",
                                  created_at: "2026-05-01T00:00:00Z" }],
      // Same effective timestamp as the listing chapter, different source class.
      physical_watch_transfer_events: [
        { id: "TIE-B", physical_watch_id: A, event_type: "TRANSFERRED",
          provenance_class: "party_confirmed_recipient", occurred_at: "2026-05-01T00:00:00Z",
          recorded_at: "2026-05-09T00:00:00Z", decision_generation: 0,
          supersedes_event_id: null, trade_deal_id: "D1" },
        // The SAME row reachable twice — duplicated in the source result set.
        { id: "TIE-B", physical_watch_id: A, event_type: "TRANSFERRED",
          provenance_class: "party_confirmed_recipient", occurred_at: "2026-05-01T00:00:00Z",
          recorded_at: "2026-05-09T00:00:00Z", decision_generation: 0,
          supersedes_event_id: null, trade_deal_id: "D1" },
      ],
      physical_watch_identifier_observations: [
        { identifier_type: "serial_number", source_class: "seller_stated" },
        { identifier_type: "serial_number", source_class: "seller_stated" },
      ],
    }),
    rpc: () => ({ state: "UNRESOLVED", generation: 0, members: [A], conflicted: false, resolved_watch_id: null }),
  };

  const db = fakeDb(world);
  const p1 = await composeWatchPassport(A, db);
  const p2 = await composeWatchPassport(A, fakeDb(world));

  check("dedupe is by immutable source id — one row, one item", () => {
    assert.equal(p1.timeline.filter((i) => i.sourceId === "TIE-B").length, 1);
  });
  check("a timestamp tie orders identically on every render", () => {
    assert.deepEqual(p1.timeline.map((i) => i.sourceId), p2.timeline.map((i) => i.sourceId));
    const tie = p1.timeline.filter((i) => i.effectiveAt === "2026-05-01T00:00:00Z");
    assert.equal(tie.length, 2);
    assert.deepEqual(tie.map((i) => i.sourceId), ["TIE-A", "TIE-B"]); // stable id tie-break
  });
  check("identifier evidence is presence, type and source class ONLY", () => {
    assert.deepEqual(p1.identifierEvidence, [
      { identifierType: "serial_number", sourceClass: "seller_stated", observations: 2 },
    ]);
  });
  check("the payload carries no token, value, fragment or equality relationship", () => {
    const s = JSON.stringify(p1).toLowerCase();
    for (const leak of ["equality_token", "equalitytoken", "protected_value", "raw_value",
                        "normalization_version", "token_key_version", "masked"]) {
      assert.ok(!s.includes(leak), `identifier leak: ${leak}`);
    }
  });
  check("and never implies authenticity or verification of the identifier", () => {
    const s = JSON.stringify(p1.identifierEvidence).toLowerCase();
    assert.ok(!s.includes("verified") && !s.includes("authentic"));
  });
  check("composing a Passport performs ZERO writes", () => {
    assert.equal(db.ops.filter((o) => o.kind === "WRITE").length, 0);
  });
  check("and calls only the two identity resolvers, never a write RPC", () => {
    const rpcs = new Set(db.ops.filter((o) => o.kind === "rpc").map((o) => o.fn));
    for (const fn of rpcs) {
      assert.ok(["resolve_physical_watch", "resolve_physical_watch_as_of"].includes(fn), fn);
    }
  });
  check("a corrected source changes the next render with no Passport-side write", () => {
    // Remove the transfer from the source and re-render: it simply is gone.
    const corrected = clone(world.tables);
    corrected.physical_watch_transfer_events = [];
    const db2 = fakeDb({ tables: corrected, rpc: world.rpc });
    return composeWatchPassport(A, db2).then((p3) => {
      assert.ok(!p3.timeline.some((i) => i.sourceId === "TIE-B"));
      assert.equal(db2.ops.filter((o) => o.kind === "WRITE").length, 0);
    });
  });
}

console.log(`\n${passed} assertions passed\n`);
