/* Admin Assistant — rendered room context, fail-closed reread, and the
   architecture-owned journey set.

   These prove product laws. The structural ones matter most: a law that
   depends on a future writer's restraint is a convention, and the whole
   point of these is that they survive somebody who has not read the files.

   Run: node scripts/assistant-context-and-journeys.test.mjs */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  resolveRoomContext,
  describeContext,
  couldNotVerify,
  isVerified,
} from "../lib/assistantRoomContext.ts";
import {
  REQUIRED_JOURNEYS,
  REQUIRED_EDGES,
  requiredEdgeCoverage,
  isRequiredEdge,
  edgeKey,
  ROOM_SPEC,
  ARCHITECTURE_ROOMS,
} from "../lib/assistantRooms.ts";
import { hoursSince, needsReorientation } from "../lib/assistantThreadTiming.ts";

let pass = 0;
const ok = (n, c) => { assert.ok(c, n); pass++; };

// ── Rendered context: passed, or refused ─────────────────────────────────
{
  const r = resolveRoomContext(
    { visibleIds: ["a", "b", "c"], selectedId: "b", view: "published", search: "tonda", page: 2 },
    "marketplace_control"
  );
  ok("a well-formed context resolves", r.state === "ok");
  ok("visible ids are preserved in render order", r.context.visibleIds.join(",") === "a,b,c");
  ok("selection is carried", r.context.selectedId === "b");
}
for (const [label, bad] of [
  ["absent", undefined],
  ["null", null],
  ["a string", "marketplace"],
  ["an array", []],
  ["an object with no visibleIds", { selectedId: "a" }],
  ["visibleIds not an array", { visibleIds: "a,b" }],
  ["visibleIds containing a non-string", { visibleIds: ["a", 7] }],
]) {
  const r = resolveRoomContext(bad, "marketplace_control");
  ok(`${label} context is refused`, r.state === "missing_room_context");
  ok(`${label} refusal carries a human sentence`, r.sentence.length > 60);
}
{
  // A selection the founder cannot see means the payload was assembled from
  // two different moments. That is a contradiction, not an edge case.
  const r = resolveRoomContext({ visibleIds: ["a", "b"], selectedId: "zzz" }, "marketplace_control");
  ok("a selection outside the visible set is refused", r.state === "missing_room_context");
}
{
  // An empty room is legitimate and must NOT be confused with a missing one.
  const r = resolveRoomContext({ visibleIds: [], selectedId: null }, "founder_review");
  ok("a genuinely empty room still resolves", r.state === "ok" && r.context.visibleIds.length === 0);
}

// The refusal must explicitly reject the substitute-query behaviour that
// caused the original defect, not merely decline to answer.
{
  const r = resolveRoomContext(undefined, "marketplace_control");
  ok("refusal names the separate-query failure mode", /separate query/i.test(r.sentence));
  ok("refusal promises not to guess the room", /guess/i.test(r.sentence));
}

// ── describeContext reflects change ──────────────────────────────────────
{
  const base = { visibleIds: ["a", "b"], selectedId: null };
  const one = resolveRoomContext({ ...base, search: "tonda", page: 1 }, "marketplace_control");
  const two = resolveRoomContext({ ...base, search: "datograph", page: 1 }, "marketplace_control");
  ok("a changed search produces a changed room description",
    describeContext(one.context) !== describeContext(two.context));

  const p1 = resolveRoomContext({ ...base, page: 1 }, "marketplace_control");
  const p2 = resolveRoomContext({ ...base, page: 2 }, "marketplace_control");
  ok("a changed page produces a changed room description",
    describeContext(p1.context) !== describeContext(p2.context));

  const s1 = resolveRoomContext({ visibleIds: ["a", "b"], selectedId: "a" }, "marketplace_control");
  const s2 = resolveRoomContext({ visibleIds: ["a", "b"], selectedId: null }, "marketplace_control");
  ok("a changed selection produces a changed room description",
    describeContext(s1.context) !== describeContext(s2.context));

  const v1 = resolveRoomContext({ visibleIds: ["a"], selectedId: null }, "marketplace_control");
  const v2 = resolveRoomContext({ visibleIds: ["a", "b", "c"], selectedId: null }, "marketplace_control");
  ok("a changed visible set produces a changed room description",
    describeContext(v1.context) !== describeContext(v2.context));
}

// ── Could not look is not nothing found ──────────────────────────────────
{
  const r = couldNotVerify("listings", "timeout");
  ok("a failed reread is COULD_NOT_VERIFY", r.state === "COULD_NOT_VERIFY");
  ok("a failed reread is not verified", !isVerified(r));
  ok("it refuses to answer from remembered state", /remembered state/i.test(r.sentence));
  ok("it says explicitly that it could not look", /could not look/i.test(r.sentence));
  ok("it never claims nothing was found", !/nothing (was )?found/i.test(r.sentence));
  ok("it names the failing source", r.source === "listings");
  const good = { state: "OK", value: [] };
  ok("an empty successful read IS verified", isVerified(good));
}

// ── The architecture owns the journey set ────────────────────────────────
ok("there are four required journeys", REQUIRED_JOURNEYS.length === 4);
ok("there are eight required directional edges", REQUIRED_EDGES.length === 8);
for (const [from, to] of [
  ["dealer_accelerator", "founder_review"],
  ["founder_review", "dealer_accelerator"],
  ["founder_review", "watch_resolution"],
  ["watch_resolution", "founder_review"],
  ["founder_review", "marketplace_control"],
  ["marketplace_control", "founder_review"],
  ["auction_operations", "watch_resolution"],
  ["watch_resolution", "auction_operations"],
]) {
  ok(`${edgeKey(from, to)} is required`, isRequiredEdge(from, to));
}
ok("an invented edge is not required", !isRequiredEdge("watch_passport", "founder_review"));
ok("direction matters", isRequiredEdge("dealer_accelerator", "founder_review"));

// Coverage must report honestly which required edges are not yet buildable,
// and must never respond by shrinking the required set.
{
  const cov = requiredEdgeCoverage();
  ok("coverage reports all eight edges", cov.length === 8);
  const implementable = cov.filter((c) => c.implementable);
  ok("only the Founder Review ↔ Marketplace pair is implementable today",
    implementable.length === 2 &&
    implementable.every((c) => c.key.includes("founder_review") && c.key.includes("marketplace_control")));
  ok("every unimplementable edge names the missing room(s)",
    cov.filter((c) => !c.implementable).every((c) => c.missing.length > 0));
  ok("required edge count is unchanged by coverage", REQUIRED_EDGES.length === 8);
}

// ── Every required room names a room-native question ─────────────────────
for (const room of ARCHITECTURE_ROOMS) {
  const spec = ROOM_SPEC[room];
  ok(`${room} declares a target tier`, spec.target === "A" || spec.target === "B");
  ok(`${room} names a room-native question`, spec.nativeQuestion.trim().endsWith("?"));
  ok(`${room}'s question is operational, not generic`, spec.nativeQuestion.length > 30);
}

// ── Reorientation ────────────────────────────────────────────────────────
{
  const now = Date.parse("2026-08-30T12:00:00Z");
  const fresh = { last_activity_at: "2026-08-30T11:00:00Z" };
  const stale = { last_activity_at: "2026-08-28T12:00:00Z" };
  ok("an hour old needs no reorientation", !needsReorientation(fresh, now));
  ok("two days old needs reorientation", needsReorientation(stale, now));
  ok("hoursSince is finite for a real date", Number.isFinite(hoursSince(fresh.last_activity_at, now)));
  ok("hoursSince fails safe on garbage", hoursSince("not a date", now) === Number.POSITIVE_INFINITY);
  ok("garbage timestamps force reorientation",
    needsReorientation({ last_activity_at: "nonsense" }, now));
}

// ── STRUCTURAL: the server cannot rebuild the room ───────────────────────
// The original defect was a server-side query standing in for the founder's
// screen. This asserts the substitute path is gone and cannot be copied.
{
  const route = readFileSync("app/api/admin/assistant/route.ts", "utf8");
  ok("readMarketplaceSet no longer exists", !/async function readMarketplaceSet/.test(route));
  ok("readReviewSet no longer exists", !/async function readReviewSet/.test(route));
  /* The precise law: no query against `listings` may ORDER or LIMIT its own
     slice. Every listings read must be bound to ids the ROOM supplied.
     (Ordering the session table by recency is unrelated and legitimate —
     that picks up a conversation, not a working set.) */
  const listingQueries = route.split('.from("listings")').slice(1);
  ok("the route still reads listings", listingQueries.length > 0);
  for (const [i, q] of listingQueries.entries()) {
    const head = q.slice(0, 260);
    ok(`listings query ${i + 1} does not order its own slice`, !/\.order\(/.test(head));
    ok(`listings query ${i + 1} does not limit its own slice`, !/\.limit\(/.test(head));
    ok(`listings query ${i + 1} is bound to supplied ids`, /\.in\(\s*"id"|\.eq\(\s*"id"/.test(head));
  }
  ok("no pending_review queue slice remains", !/\.eq\("status", "pending_review"\)/.test(route));
  ok("the working set is built from the passed context",
    /readWorkingSet\(\s*service[\s\S]{0,80}ctx: RenderedRoomContext/.test(route) ||
    /ctx\.visibleIds/.test(route));
  ok("a missing context refuses the turn", /missing_room_context/.test(route));
  ok("a failed reread refuses the turn", /COULD_NOT_VERIFY/.test(route));
  ok("the old founder_review fallback is gone", !/:\s*"founder_review";/.test(route));
}

// ── STRUCTURAL: navigation must not resurrect a thread ───────────────────
{
  const route = readFileSync("app/api/admin/assistant/route.ts", "utf8");
  const thread = readFileSync("lib/assistantThread.ts", "utf8");
  // No code path may pick a thread by recency on the founder's behalf.
  ok("the route never auto-selects a thread",
    !/threads\[0\]|liveThreads\[0\]|\.limit\(1\)[\s\S]{0,120}assistant_operational_threads/.test(route));
  ok("thread selection always requires an explicit id",
    /body\.thread_id/.test(route));
  ok("the thread library documents navigation-is-not-handoff",
    /Navigation changes pages/.test(thread));
  ok("listLiveThreads is a listing, not a selection",
    /listLiveThreads/.test(thread) && !/function selectMostRecentThread/.test(thread));
}

console.log(`assistant-context-and-journeys: ${pass} assertions PASS`);
