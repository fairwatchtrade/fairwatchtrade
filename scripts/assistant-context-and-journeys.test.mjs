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
  availableHandoffs,
  roomRoute,
  roomNeedsAnchor,
  edgeKey,
  ROOM_SPEC,
  ROOM_OPERATION,
  ROOM_SUBJECT,
  ROOM_CONTROLS,
  IMPLEMENTED_ROOMS,
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

// ── Needs Attention and exact-match are ROOM truth ───────────────────────
{
  const r = resolveRoomContext(
    {
      visibleIds: ["a", "b"],
      selectedId: null,
      attention: { a: ["no photographs", "price missing"], b: [] },
      exactMatch: { id: "zz", inCurrentFilters: false },
    },
    "marketplace_control"
  );
  ok("attention reasons are carried", r.context.attention.a.length === 2);
  ok("an empty reason list is dropped rather than kept as a flag",
    r.context.attention.b === undefined);
  ok("exact match is carried", r.context.exactMatch?.id === "zz");
  ok("out-of-filter exact match is marked", r.context.exactMatch?.inCurrentFilters === false);

  const desc = describeContext(r.context);
  ok("the description reports the flagged count", /1 record\(s\) flagged/.test(desc));
  ok("the description says the exact match is outside the filters",
    /OUTSIDE the current filters/.test(desc));
}
{
  // Attention is never invented when the room reports none.
  const r = resolveRoomContext({ visibleIds: ["a"], selectedId: null }, "marketplace_control");
  ok("no attention reported means none carried", Object.keys(r.context.attention).length === 0);
  ok("no exact match reported means null", r.context.exactMatch === null);
  ok("the description does not claim flags that were not reported",
    !/flagged/.test(describeContext(r.context)));
}
{
  // A changed attention set must change the room description — otherwise the
  // context-change proof cannot detect it.
  const a = resolveRoomContext({ visibleIds: ["a"], selectedId: null, attention: { a: ["x"] } }, "marketplace_control");
  const b = resolveRoomContext({ visibleIds: ["a"], selectedId: null, attention: {} }, "marketplace_control");
  ok("a changed attention set changes the description",
    describeContext(a.context) !== describeContext(b.context));
}
{
  // Malformed attention must degrade, never throw or half-populate.
  const r = resolveRoomContext(
    { visibleIds: ["a"], selectedId: null, attention: { a: "not an array", b: [7, "ok"] }, exactMatch: "nope" },
    "marketplace_control"
  );
  ok("non-array attention entries are dropped", r.context.attention.a === undefined);
  ok("non-string reasons are filtered out", r.context.attention.b.join() === "ok");
  ok("a malformed exact match becomes null", r.context.exactMatch === null);
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
  /* Three rooms attached ⇒ ROJ-03 (both directions) and ROJ-01 (both
     directions) are now buildable. The other four still terminate in rooms
     that do not exist, and coverage must say so rather than drop them. */
  ok("four edges are implementable with three rooms attached", implementable.length === 4);
  ok("ROJ-01 is now implementable in both directions",
    implementable.some((c) => c.key === "dealer_accelerator→founder_review") &&
    implementable.some((c) => c.key === "founder_review→dealer_accelerator"));
  ok("ROJ-03 remains implementable in both directions",
    implementable.some((c) => c.key === "founder_review→marketplace_control") &&
    implementable.some((c) => c.key === "marketplace_control→founder_review"));
  ok("the four edges touching unbuilt rooms are still reported as required",
    cov.filter((c) => !c.implementable).length === 4);
  ok("every unimplementable edge names the missing room(s)",
    cov.filter((c) => !c.implementable).every((c) => c.missing.length > 0));
  ok("required edge count is unchanged by coverage", REQUIRED_EDGES.length === 8);
}

// ── Handoffs: implemented edges, and honest absence ──────────────────────
{
  ok("Founder Review can hand off to both attached partners",
    availableHandoffs("founder_review").sort().join() === "dealer_accelerator,marketplace_control");
  ok("Marketplace hands back to Founder Review",
    availableHandoffs("marketplace_control").join() === "founder_review");
  ok("Dealer Accelerator hands off to Founder Review",
    availableHandoffs("dealer_accelerator").join() === "founder_review");
  ok("Watch Passport has no required outbound edge in this version",
    availableHandoffs("watch_passport").length === 0);

  /* Absence from the offer list is NOT a downgrade. Watch Resolution is
     unbuilt, so Founder Review cannot offer it — and the coverage function
     must still report that edge as required. */
  ok("the unoffered Founder Review → Watch Resolution edge is still required",
    isRequiredEdge("founder_review", "watch_resolution"));
  ok("it is reported as required-and-unbuildable",
    requiredEdgeCoverage().some(
      (c) => c.key === "founder_review→watch_resolution" && !c.implementable
    ));
  ok("no room offers an edge that is not architecture-required",
    ["founder_review", "marketplace_control", "dealer_accelerator", "watch_passport"].every((r) =>
      availableHandoffs(r).every((d) => isRequiredEdge(r, d))
    ));
}

// ── Where a handoff lands ────────────────────────────────────────────────
{
  ok("Marketplace has a route with no anchor", roomRoute("marketplace_control") === "/admin");
  ok("Dealer Accelerator has a route with no anchor",
    roomRoute("dealer_accelerator") === "/admin/dealer-accelerator");
  /* Rooms that are ABOUT one object must refuse to be entered without it,
     rather than opening a page that cannot show the carried work. */
  ok("Founder Review needs an anchor", roomRoute("founder_review", null) === null);
  ok("Founder Review opens around its record", roomRoute("founder_review", "abc") === "/admin/listings/abc");
  ok("Passport needs an anchor", roomRoute("watch_passport", null) === null);
  ok("Passport opens around its bead", roomRoute("watch_passport", "bead1") === "/admin/passport/bead1");
  ok("anchor-needing rooms are declared as such",
    roomNeedsAnchor("founder_review") && roomNeedsAnchor("watch_passport"));
  ok("queue rooms do not need an anchor",
    !roomNeedsAnchor("marketplace_control") && !roomNeedsAnchor("dealer_accelerator"));
}

// ── STRUCTURAL: arrival is explicit, and does not replay ─────────────────
{
  const fa = readFileSync("components/FounderAssistant.tsx", "utf8");
  ok("arrival reads an explicit thread parameter", /searchParams\.get\("thread"\)/.test(fa));
  ok("arrival resumes deliberately rather than auto-attaching",
    /action: "thread_resume", thread_id: arriving/.test(fa));
  ok("the parameter is consumed so a reload is ordinary navigation",
    /searchParams\.delete\("thread"\)/.test(fa));
  ok("history state is spread, never replaced",
    /replaceState\(\{ \.\.\.window\.history\.state \}/.test(fa));
  ok("handoff records a reason", /action: "thread_handoff"[\s\S]{0,300}reason:/.test(fa));
  ok("a room needing an anchor refuses to be entered without one",
    /needsAnchor && !listingId/.test(fa));
}

// ── Every required room names a room-native question ─────────────────────
for (const room of ARCHITECTURE_ROOMS) {
  const spec = ROOM_SPEC[room];
  ok(`${room} declares a target tier`, spec.target === "A" || spec.target === "B");
  ok(`${room} names a room-native question`, spec.nativeQuestion.trim().endsWith("?"));
  ok(`${room}'s question is operational, not generic`, spec.nativeQuestion.length > 30);
}

// ── Tier A rooms have NO governed action, structurally ───────────────────
// Inventing a mutation to reach a tier is forbidden; the absence must be a
// lookup the confirm seam consults, not a promise the prompt makes.
{
  ok("Founder Review can confirm approvals", ROOM_OPERATION.founder_review === "approve_listings");
  ok("Marketplace can confirm a removal", ROOM_OPERATION.marketplace_control === "remove_listing");
  ok("Dealer Accelerator has NO operation", !ROOM_OPERATION.dealer_accelerator);
  ok("Dealer Accelerator's target tier is A", ROOM_SPEC.dealer_accelerator.target === "A");
  ok("Watch Passport has NO operation", !ROOM_OPERATION.watch_passport);
  ok("Watch Passport's target tier is A", ROOM_SPEC.watch_passport.target === "A");

  /* Passport's subject is a bead, not a listing. Getting this wrong would
     send a physical-watch id to the listings table and report the founder's
     own record as missing. */
  ok("Passport's subject is a physical watch", ROOM_SUBJECT.watch_passport === "physical_watch");
  ok("the listing rooms declare a listing subject",
    ROOM_SUBJECT.founder_review === "listing" &&
    ROOM_SUBJECT.marketplace_control === "listing" &&
    ROOM_SUBJECT.dealer_accelerator === "listing");
  ok("every implemented room declares a subject",
    IMPLEMENTED_ROOMS.every((r) => ROOM_SUBJECT[r] === "listing" || ROOM_SUBJECT[r] === "physical_watch"));
  ok("the route only runs the listings reread for listing rooms",
    /ROOM_SUBJECT\[room\] === "listing"[\s\S]{0,120}readWorkingSet/.test(
      readFileSync("app/api/admin/assistant/route.ts", "utf8")
    ));

  const route = readFileSync("app/api/admin/assistant/route.ts", "utf8");
  const confirmBlock = route.slice(route.indexOf('action === "confirm"'));
  ok("confirm refuses a room with no governed action",
    /if \(!OPERATION_FOR_ROOM\[room\]\)/.test(confirmBlock));
  const refusalIdx = confirmBlock.indexOf("room_has_no_governed_action");
  ok("that refusal precedes the approve machinery",
    refusalIdx > 0 && refusalIdx < confirmBlock.indexOf("executeListingStatusTransition"));
  ok("that refusal precedes the remove machinery",
    refusalIdx < confirmBlock.indexOf('rpc("remove_listing_assistant"'));
  ok("a Tier A room cannot form a plan at all",
    /if \(!OPERATION_FOR_ROOM\[room\]\) \{[\s\S]{0,200}pendingPlan = null/.test(route));
}

// ── Self-description: answer plainly, and never hardcode a lie ───────────
{
  const route = readFileSync("app/api/admin/assistant/route.ts", "utf8");

  ok("a self-description exists", /function selfDescription/.test(route));
  ok("it is prepended to every room's prompt",
    /system: `\$\{selfDescription\(room\)\}/.test(route));

  /* The model name must be INTERPOLATED from the constant actually called,
     so it cannot drift into a lie when the constant changes. */
  ok("the model name is injected from the MODEL constant", /\$\{MODEL\}/.test(route));
  const decl = /const MODEL = "([^"]+)"/.exec(route);
  ok("MODEL is a real constant", !!decl && decl[1].length > 3);
  ok("the model name is not hardcoded in prose",
    !new RegExp(`from Anthropic[^\`]*${decl[1]}`).test(route.replace(/\$\{MODEL\}/g, "«injected»")));

  ok("it says evasion is a defect", /Evasion here is a defect/.test(route));
  ok("it instructs a direct answer about the model", /what model you are/i.test(route));
  ok("it states it holds no credential of its own", /no credential and no privilege/.test(route));
  ok("it states it keeps no memory of product state", /no memory of product state/.test(route));

  /* The capability sentence is generated from the same map the confirm seam
     enforces, so it cannot claim an action the room does not have. */
  ok("the DO sentence derives from the operation map",
    /const op = OPERATION_FOR_ROOM\[room\]/.test(route));
  ok("a room with no operation says it can do nothing",
    /This room has no governed action/.test(route));
}

// ── Room knowledge: know the controls, or say you weren't told ───────────
{
  const route = readFileSync("app/api/admin/assistant/route.ts", "utf8");
  const mc = ROOM_CONTROLS.marketplace_control ?? "";

  ok("Marketplace Control has briefed control semantics", mc.length > 400);
  ok("it explains Operational", /Operational/.test(mc));
  ok("it explains Detailed", /Detailed/.test(mc));
  ok("it says both are one room with the same state",
    /two views of ONE room/i.test(mc) && /Same inventory, same state/i.test(mc));
  ok("it says switching never mutates product truth", /NEVER mutates product truth/i.test(mc));
  ok("it names what Detailed adds", /Columns control/.test(mc));
  ok("it names what is identical in both", /filters, search, sort, pagination/.test(mc));
  ok("it covers the lifecycle scopes",
    /Current/.test(mc) && /Off Market/.test(mc) && /History/.test(mc) && /All/.test(mc));
  ok("it uses the product's own words for History",
    /cold retained truth you deliberately went looking for/i.test(mc));
  ok("it covers selection stickiness", /sticky WITHIN a result context/i.test(mc));
  ok("it forbids inferring attention from a status word",
    /never infer why something is flagged from its status word/i.test(mc));

  /* A room nobody has briefed must SAY it wasn't briefed. The defect being
     fixed was calling a room-control question "outside the working set",
     which sounds like a boundary and is actually ignorance. */
  ok("unbriefed rooms admit it rather than deflecting",
    /you have not been briefed on this room's control semantics/.test(route));
  ok("unbriefed rooms are told not to call it outside the working set",
    /rather than calling it outside your working set/.test(route));
  ok("unbriefed rooms are told never to guess", /Never guess at what a control does/.test(route));
  ok("rooms without briefed controls exist to exercise that path",
    IMPLEMENTED_ROOMS.some((r) => !ROOM_CONTROLS[r]));
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
