import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  applyConfirmed,
  applyRead,
  established,
  provenEmpty,
  LOADING,
} from "../lib/accountWorkspace/readTruth.ts";
import { ACCOUNT_ROOM_BODY } from "../lib/accountWorkspace/roomGeography.ts";
import {
  archiveEligibility,
  ARCHIVABLE_DEAL_STATUSES,
  ARCHIVABLE_OFFER_STATUSES,
  DEAL_STATUSES,
  TRADE_STATUSES,
  LEG_STATUSES,
} from "../lib/trade.ts";

/* ── Account Workspace: Requests + Trades + bounded LS-4 truth ─────────
   The laws, exercised; then source pins on every seam the order names.
   Run: node scripts/account-workspace-collector-demand-trades.test.mjs
   ─────────────────────────────────────────────────────────────────────── */

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
/** Source with comments stripped, so a pin on CODE never matches prose. */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");

const rail = read("components/AccountRail.tsx");
const shell = read("components/AccountDashboard.tsx");
const demand = read("components/WantedRequestsModule.tsx");
const trades = read("components/TradeOffersModule.tsx");
const workspace = read("components/WantedWorkspace.tsx");
const offersRoute = read("app/api/trade-offers/route.ts");
const archiveRoute = read("app/api/trades/archive/route.ts");
const peekRoute = read("app/api/wanted/[id]/peek/route.ts");
const migration = read("supabase/migrations/20260912090000_trade_archive_preferences.sql");

/* ════════ 1 · READ TRUTH — the law itself ════════════════════════════ */

test("a failed read never becomes an empty success", () => {
  const failed = applyRead(LOADING, { ok: false });
  assert.equal(failed.phase, "unavailable");
  assert.equal(established(failed), null);
  assert.equal(provenEmpty(failed), false, "unavailable is not empty");
});

test("a successful zero read is genuinely empty", () => {
  const empty = applyRead(LOADING, { ok: true, data: [] });
  assert.equal(empty.phase, "ready");
  assert.equal(provenEmpty(empty), true);
});

test("a failed refresh keeps established rows and marks them stale", () => {
  const ready = applyRead(LOADING, { ok: true, data: [{ id: "a" }, { id: "b" }] });
  const stale = applyRead(ready, { ok: false });
  assert.equal(stale.phase, "stale");
  assert.deepEqual(established(stale), [{ id: "a" }, { id: "b" }], "rows are not erased");
  assert.equal(provenEmpty(stale), false);
  const recovered = applyRead(stale, { ok: true, data: [{ id: "a" }] });
  assert.equal(recovered.phase, "ready");
  assert.deepEqual(established(recovered), [{ id: "a" }]);
});

test("a confirmed mutation survives a failing refresh", () => {
  const ready = applyRead(LOADING, { ok: true, data: [{ id: "a", status: "active" }] });
  const confirmed = applyConfirmed(ready, (rows) =>
    rows.map((r) => (r.id === "a" ? { ...r, status: "paused" } : r))
  );
  const afterFailedRefresh = applyRead(confirmed, { ok: false });
  assert.equal(afterFailedRefresh.phase, "stale");
  assert.deepEqual(established(afterFailedRefresh), [{ id: "a", status: "paused" }],
    "the confirmed act is not visually undone");
});

test("a confirmed mutation cannot invent data the room never established", () => {
  assert.equal(applyConfirmed(LOADING, () => [{ id: "x" }]).phase, "loading");
  assert.equal(applyConfirmed({ phase: "unavailable" }, () => [{ id: "x" }]).phase, "unavailable");
});

/* ════════ 2 · ARCHIVE ELIGIBILITY — who governs ═══════════════════════ */

test("where a deal exists the deal governs, and the offer cannot override it", () => {
  for (const status of DEAL_STATUSES) {
    const e = archiveEligibility({ dealStatus: status, offerStatus: "accepted" });
    assert.equal(e.governedBy, "deal");
    assert.equal(e.eligible, ARCHIVABLE_DEAL_STATUSES.includes(status), `deal ${status}`);
  }
  assert.equal(archiveEligibility({ dealStatus: "completed", offerStatus: "accepted" }).eligible, true);
  assert.equal(archiveEligibility({ dealStatus: "cancelled", offerStatus: "accepted" }).eligible, true,
    "an accepted offer whose deal was cancelled is finished");
  assert.equal(archiveEligibility({ dealStatus: "settling", offerStatus: "accepted" }).eligible, false);
  assert.equal(archiveEligibility({ dealStatus: "pending", offerStatus: "accepted" }).eligible, false);
});

test("with no deal the offer governs", () => {
  for (const status of TRADE_STATUSES) {
    const e = archiveEligibility({ dealStatus: null, offerStatus: status });
    assert.equal(e.governedBy, "offer");
    assert.equal(e.eligible, ARCHIVABLE_OFFER_STATUSES.includes(status), `offer ${status}`);
  }
  assert.equal(archiveEligibility({ dealStatus: null, offerStatus: "pending" }).eligible, false);
  assert.equal(archiveEligibility({ dealStatus: null, offerStatus: "accepted" }).eligible, false);
});

test("leg status never governs archive — it is not even an input", () => {
  assert.equal(archiveEligibility.length, 1, "one argument object");
  const src = code("lib/trade.ts");
  const fn = src.slice(src.indexOf("export function archiveEligibility"));
  const body = fn.slice(0, fn.indexOf("\n}"));
  assert.ok(!/leg/i.test(body), "no leg vocabulary inside the eligibility decision");
  for (const leg of LEG_STATUSES) {
    /* Every leg state, against a deal that is NOT finished: still refused. */
    assert.equal(archiveEligibility({ dealStatus: "settling", offerStatus: "accepted" }).eligible, false, leg);
  }
});

/* ════════ 3 · COLLECTOR DEMAND ════════════════════════════════════════ */

test("the seller room is called Requests everywhere its name is shown", () => {
  assert.match(rail, /\{ id: "wanted", label: "Requests", icon: "wanted" \}/);
  assert.match(shell, /activeModule === "wanted"\s*\?\s*"Requests"/);
  assert.match(read("components/AccountRoomSelector.tsx"), /\{ id: "wanted", label: "Requests" \}/);
  assert.match(read("app/sell/(entry)/page.tsx"), /Back to Requests/);
  assert.match(demand, /Requests could not be loaded just now\. Nothing has changed\./,
    "the failure state carries the room's current name and keeps its LS-4 meaning");
  /* The retired name is gone from every surface a person reads, including
     the comments that describe the current room. */
  for (const [name, src] of [["rail", rail], ["shell", shell], ["room", demand], ["selector", read("components/AccountRoomSelector.tsx")], ["sell", read("app/sell/(entry)/page.tsx")]]) {
    assert.ok(!/Collector Demand/.test(src), `${name} still says Collector Demand`);
  }
  for (const [name, src] of [["rail", code("components/AccountRail.tsx")], ["shell", code("components/AccountDashboard.tsx")], ["room", code("components/WantedRequestsModule.tsx")], ["selector", code("components/AccountRoomSelector.tsx")]]) {
    assert.ok(!/Wanted Requests/.test(src), `${name} still renders the retired label`);
  }
});

test("exactly one Requests title, owned by the shared shell", () => {
  assert.ok(!/<h2[^>]*>\s*\{?\s*Wanted Requests/.test(demand));
  assert.ok(!/Requests<\/h2>/.test(demand), "the room renders no page-level title");
  assert.ok(!/<h1/.test(demand), "no page-level heading in the module at all");
  /* The shell's one title element. */
  assert.match(shell, /<h2 className="hidden font-display text-\[20px\][^"]*md:block">\s*\{moduleTitle\}/);
});

test("the locked Requests intro and privacy line ship exactly, and leak nothing", () => {
  /* Both lines are read with whitespace collapsed: the source wraps them,
     the person reads one sentence. */
  const flat = demand.replace(/\s+/g, " ");
  assert.ok(
    flat.includes(
      "Watches people are looking for that you may be able to answer with a listing you already have, a new one, or a private listing made for them alone."
    ),
    "the locked intro ships verbatim"
  );
  assert.ok(
    flat.includes(
      "You&rsquo;re never shown their exact budget or who they are — only whether a watch sits within, near, or outside their range. Every answer is a real FairWatchTrade listing, never a message."
    ),
    "the locked privacy line ships verbatim"
  );
  /* The footing rule, on the two lines that prompted it: the room never
     narrates its own reader as a role. */
  const flatCode = code("components/WantedRequestsModule.tsx").replace(/\s+/g, " ");
  assert.ok(!/requests from collectors/i.test(flatCode), "the retired third-person intro is gone from the rendered copy");
  assert.ok(!/The collector&rsquo;s exact budget/i.test(flatCode), "the retired third-person privacy line is gone");
  /* Governed seller privacy: none of these ever reach this room. */
  for (const forbidden of ["max_price", "target_price", "requester_id", "private_note", "buyer_email"]) {
    assert.ok(!demand.includes(forbidden), `${forbidden} must never appear in the seller room`);
  }
  assert.match(demand, /budget_fit/, "the only budget surface is the three-word projection");
});

test("Create Wanted Request is a door into the collector's own room, never a second composer", () => {
  assert.match(demand, /href="\/wanted\?new=1"/);
  assert.match(demand, /data-create-wanted-request=""/);
  assert.ok(!/WantedWorkspace/.test(demand), "the collector workspace is not embedded in Account");
  assert.ok(!/method:\s*"POST"[\s\S]{0,200}\/api\/wanted"/.test(demand), "no Wanted write from this room");
  /* The collector room still owns creation from that URL. */
  assert.match(workspace, /params\.get\("new"\) === "1"/);
});

test("Requests cannot claim an empty queue from a failed read", () => {
  assert.match(demand, /queue\.phase === "unavailable" \?/);
  assert.match(demand, /data-queue-unavailable=""/);
  assert.match(demand, /\) : provenEmpty\(queue\) \? \(/, "genuine-empty is gated on proven emptiness");
  const src = code("components/WantedRequestsModule.tsx");
  assert.ok(!/return \[\];/.test(src), "no read path returns an empty array on failure");
  /* The one sentence that must never come from an error. */
  const emptyBranch = demand.slice(demand.indexOf("provenEmpty(queue)"));
  assert.match(emptyBranch.slice(0, 400), /No open Wanted requests right now\./);
});

test("the answer inventory cannot claim no listings from a failed query", () => {
  assert.match(demand, /const \{ data, error \} = await supabase/);
  assert.match(demand, /if \(!error\) next = \{ ok: true, data: \(data \?\? \[\]\) as OwnListing\[\] \};/);
  assert.match(demand, /inventory\.phase === "unavailable" \?/);
  assert.match(demand, /data-inventory-unavailable=""/);
  assert.match(demand, /\) : provenEmpty\(inventory\) \? \(/);
});

test("the Wanted peek refuses honestly instead of inventing not-found", () => {
  assert.match(peekRoute, /const \{ data, error \} = await service/);
  assert.match(peekRoute, /if \(error\) \{[\s\S]*?error: "read_failed"[\s\S]*?status: 503/);
  /* not_found survives, but only AFTER a successful read found nothing. */
  const afterError = peekRoute.slice(peekRoute.indexOf('error: "read_failed"'));
  assert.match(afterError, /if \(!data\) \{[\s\S]*?error: "not_found"/);
});

test("the collector's own Wanted room keeps its rows through a failed refresh", () => {
  assert.match(workspace, /useState<LoadState<WantedRow\[\]>>\(LOADING\)/);
  assert.match(workspace, /requests\.phase === "unavailable" \?/);
  assert.match(workspace, /data-requests-unavailable=""/);
  assert.match(workspace, /confirm\(data\?\.request as WantedRow \| undefined\)/);
  assert.match(workspace, /provenEmpty\(requests\)/);
  const src = code("components/WantedWorkspace.tsx");
  assert.ok(!/if \(!res\.ok\) return \[\];/.test(src), "the array-only read contract is gone");
});

/* ════════ 4 · TRADES ══════════════════════════════════════════════════ */

test("one room content origin governs subtitle, views and records", () => {
  assert.equal(ACCOUNT_ROOM_BODY, "px-6 pb-10");
  assert.match(trades, /<div className=\{ACCOUNT_ROOM_BODY\}>/);
  assert.match(demand, /<div className=\{ACCOUNT_ROOM_BODY\}>/);
  /* The split geography is retired: no record and no empty state carries
     its own left offset any more. */
  assert.ok(!/md:ml-\[30px\]/.test(code("components/TradeOffersModule.tsx")), "records no longer sit on a second origin");
  assert.ok(!/md:ml-\[30px\]/.test(code("components/WantedRequestsModule.tsx")));
  /* And the shell did not grow a geometry change to achieve it. */
  assert.ok(!/px-4 pb-6 md:px-0 md:pb-0/.test(code("components/AccountDashboard.tsx")), "the old Trades mount gutter is gone");
  assert.match(shell, /className="flex-shrink-0 border-b border-\[var\(--border-faint\)\] px-6 pt-5 pb-0"/,
    "the shared workspace header keeps its own inset, unchanged");
});

test("Active and Archived are views of one room, with no new rail door", () => {
  assert.match(trades, /data-trade-view="?\{?v\}?"?/);
  assert.match(trades, /useState<"active" \| "archived">\("active"\)/, "Active is the default");
  assert.match(trades, /role="tablist"/);
  assert.ok(!/Archived/.test(code("components/AccountRail.tsx")), "no Archived rail item");
  assert.ok(!/Delete|purge/i.test(trades.slice(trades.indexOf("data-archive-control"), trades.indexOf("data-archive-control") + 600)),
    "archive offers no delete");
});

test("Archive is offered only on a currently eligible record, and Restore reverses it", () => {
  assert.match(trades, /const canArchive = archiveOk && !!eligibility\?\.eligible;/);
  assert.match(trades, /\{canArchive && \(/);
  assert.match(trades, /data-archive-control=\{isArchived \? "restore" : "archive"\}/);
  assert.match(trades, /isArchived \? "Restore" : "Archive"/);
  assert.match(trades, /setArchived\(archiveKind, archiveId, !isArchived\)/);
  /* Eligibility comes from the shared law, not a local copy. */
  assert.match(trades, /archiveEligibility\(\{ dealStatus: deal\?\.status \?\? null, offerStatus: o\.status \}\)/);
  assert.ok(!/status === "completed" \|\| .*status === "cancelled"/.test(code("components/TradeOffersModule.tsx")),
    "no second eligibility rule in the component");
});

test("a deal read failure cannot downgrade an accepted exchange to an ordinary offer", () => {
  assert.match(trades, /const dealTruthMissing = !dealsOk && o\.status === "accepted" && !deal;/);
  assert.match(trades, /dealTruthMissing\s*\?\s*"Trade state unavailable"/);
  assert.match(trades, /data-deals-unavailable=""/);
  assert.match(trades, /\{deal && dealsOk && \(/, "the transfer ledger renders only from established deal truth");
  /* And eligibility is withheld rather than guessed. */
  assert.match(trades, /const eligibility = dealsOk\s*\n?\s*\? archiveEligibility/);
});

test("an archive-state read failure never fabricates Active/Archived classification", () => {
  assert.match(trades, /if \(!archiveOk\) return true;/);
  assert.match(trades, /data-archive-unavailable=""/);
  assert.match(trades, /offers !== null && offers\.length > 0 && archiveOk && \(/, "the view control hides when it cannot classify");
});

test("the trades offer list cannot render genuine-empty from a failed read", () => {
  assert.match(trades, /workspace\.phase === "unavailable" \?/);
  assert.match(trades, /data-trades-unavailable=""/);
  const src = code("components/TradeOffersModule.tsx");
  assert.ok(!/return \{ offers: \[\], viewerId: null, counterpartNames: \{\} \};/.test(src));
  assert.ok(!/\} catch \{\s*return \{\};\s*\}/.test(src), "the deal read no longer swallows failure as {}");
});

/* ════════ 5 · THE READ ROUTE AND THE MUTATION ════════════════════════ */

test("the trades read route reports what it established, per part", () => {
  assert.match(offersRoute, /let dealsOk = true;/);
  assert.match(offersRoute, /dealsOk = false;/);
  assert.match(offersRoute, /let archiveOk = true;/);
  assert.match(offersRoute, /archiveOk = false;/);
  assert.match(offersRoute, /\{ offers, viewerId: user\.id, counterpartNames, deals, dealsOk, archived, archiveOk \}/);
  /* The generation comparison that retires a stale preference. */
  assert.match(offersRoute, /new Date\(current\)\.getTime\(\) === new Date\(p\.record_updated_at\)\.getTime\(\)/);
});

test("the archive mutation accepts only a record and an intent", () => {
  assert.match(archiveRoute, /body\.recordKind === "deal" \|\| body\.recordKind === "offer"/);
  assert.match(archiveRoute, /typeof body\.archived !== "boolean"/);
  assert.match(archiveRoute, /rpc\("trade_archive_set"/);
  /* Nothing the browser could forge is read. */
  for (const forged of ["participantId", "userId", "party_a_id", "status:", "eligible"]) {
    assert.ok(!archiveRoute.includes(`body.${forged}`), `${forged} must not be accepted from the browser`);
  }
  assert.match(archiveRoute, /error: "not_found"[\s\S]*?status: 404/);
  assert.match(archiveRoute, /error: "not_eligible"[\s\S]*?status: 409/);
});

/* ════════ 6 · THE MIGRATION ══════════════════════════════════════════ */

test("archive preference is a narrow own-user table that owns no commercial truth", () => {
  assert.match(migration, /create table if not exists public\.trade_archive_preferences/);
  assert.match(migration, /primary key \(user_id, record_kind, record_id\)/);
  assert.match(migration, /check \(record_kind in \('deal', 'offer'\)\)/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /for select\s*\n\s*using \(user_id = auth\.uid\(\)\)/);
  assert.match(migration, /revoke all on public\.trade_archive_preferences from anon, authenticated;/);
  assert.match(migration, /grant select on public\.trade_archive_preferences to authenticated;/);
  /* No commercial column can exist here. */
  const table = migration.slice(migration.indexOf("create table"), migration.indexOf("comment on table"));
  for (const f of ["status", "cash", "leg", "listing", "price", "transfer"]) {
    assert.ok(!table.includes(f), `${f} must not be a column of a preference table`);
  }
});

test("the mutation derives authority and recomputes eligibility in the database", () => {
  assert.match(migration, /security definer/);
  assert.match(migration, /v_caller\s+uuid := auth\.uid\(\)/);
  assert.match(migration, /and \(d\.party_a_id = v_caller or d\.party_b_id = v_caller\)/);
  assert.match(migration, /and \(o\.proposer_id = v_caller or o\.recipient_id = v_caller\)/);
  assert.match(migration, /raise exception 'not_found'/);
  assert.match(migration, /v_status in \('completed', 'cancelled'\)/);
  assert.match(migration, /v_status in \('declined', 'superseded', 'withdrawn'\)/);
  assert.match(migration, /raise exception 'not_eligible/);
  /* Leg status is never consulted, and nothing commercial is written. */
  const fn = migration.slice(migration.indexOf("create or replace function"));
  assert.ok(!/trade_deal_legs|leg_status/.test(fn), "leg status never governs archive");
  assert.ok(!/update public\.trade_deals|update public\.trade_offers|update public\.listings/.test(fn),
    "the mutation writes no commercial truth");
  assert.match(fn, /on conflict \(user_id, record_kind, record_id\) do update/, "archive is idempotent");
  assert.match(fn, /if p_archived is not true then[\s\S]*?delete from public\.trade_archive_preferences/,
    "restore is idempotent and never blocked by eligibility");
});

test("the generation column is what returns a reactivated trade to Active", () => {
  assert.match(migration, /record_updated_at timestamptz not null/);
  assert.match(migration, /values \(v_caller, p_record_kind, p_record_id, now\(\), v_updated\)/);
  assert.match(migration, /trg_trade_deals_updated_at/, "the existing governed generation is named, not invented");
});

/* ════════ 7 · SCOPE ═══════════════════════════════════════════════════ */

test("LS1 typography and the shared Account shell are untouched by this run", () => {
  /* The rooms consume the shared recipes and declare no local sub-floor. */
  for (const [name, src] of [["demand", demand], ["trades", trades]]) {
    assert.match(src, /fw-(compact-control|lifecycle-label|validity-state|functional-copy|btn-primary)/, `${name} uses LS1 recipes`);
    assert.ok(!/text-\[(9|10)px\]/.test(src), `${name} introduces no sub-floor size`);
  }
  /* No global Account-shell redesign: the rail, header and mobile selector
     changed one label each and nothing structural. */
  assert.match(shell, /<AccountRail/);
  assert.match(shell, /max-w-\[1280px\]/, "the workspace width cap is unchanged");
});

test("Catalogue keeps Wanted; Account keeps Trades", () => {
  const catalogueRail = read("components/CatalogueRail.tsx");
  assert.match(catalogueRail, /Wanted/);
  assert.ok(!/Requests/.test(catalogueRail), "the seller room name never enters the Catalogue family");
  assert.match(rail, /\{ id: "trades", label: "Trades", icon: "trades" \}/);
});
