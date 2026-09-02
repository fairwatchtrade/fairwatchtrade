/* Trade Offers V1 — cash-semantics behavior + two-object governance pins.

   Run: node --experimental-strip-types scripts/trade.test.mjs

   Two halves:
     · BEHAVIOR — cash direction is never a signed number, never NULL-or-0
       meaning "trade", and every sentence is written from the reader's own
       side of the table;
     · GOVERNANCE — the frozen purchase machinery, the deterministic lock
       order that prevents crossing-trade deadlock, and the atomicity the
       acceptance law demands. Source/SQL pins, because "we did not modify
       accept_purchase_request" is not type-checkable.                      */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CASH_DIRECTIONS,
  TRADE_STATUS_LABELS,
  buildCashTerms,
  cashSentence,
  dealNextStep,
  isTradeable,
  proposeBlocker,
  tradeSummary,
  watchIdentity,
} from "../lib/trade.ts";

let n = 0;
const ok = (label, cond) => {
  n += 1;
  assert.ok(cond, label);
};
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const money = (a, c) => (a == null ? "—" : `${c ?? ""}${a}`);
const strip = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ── 1 · cash terms: never a signed number, never 0-means-trade ─────────── */
{
  const even = buildCashTerms({ direction: "none" });
  ok("an even trade is accepted", even.ok);
  ok(
    "and carries NO amount and NO currency — not zero, not a bare null pair",
    even.ok &&
      even.terms.cash_amount === null &&
      even.terms.cash_currency === null &&
      even.terms.cash_direction === "none"
  );

  const adds = buildCashTerms({ direction: "proposer_pays", amount: "2,000", currency: "usd" });
  ok("a directed trade parses its amount", adds.ok && adds.terms.cash_amount === 2000);
  ok("and normalises the currency", adds.ok && adds.terms.cash_currency === "USD");

  ok(
    "a paying direction with no amount is refused, not coerced to zero",
    !buildCashTerms({ direction: "proposer_pays", currency: "USD" }).ok
  );
  ok(
    "zero is refused as an amount — 'transferred for nothing' is a different claim",
    !buildCashTerms({ direction: "recipient_pays", amount: "0", currency: "USD" }).ok
  );
  ok(
    "a negative amount cannot smuggle direction back in as a sign",
    !buildCashTerms({ direction: "proposer_pays", amount: "-500", currency: "USD" }).ok
  );
  ok(
    "an amount with no currency is refused",
    !buildCashTerms({ direction: "proposer_pays", amount: "500" }).ok
  );
  ok(
    "an unknown direction is refused rather than defaulted",
    !buildCashTerms({ direction: "seller_maybe_pays", amount: "5", currency: "USD" }).ok
  );
  ok("exactly three directions exist", CASH_DIRECTIONS.length === 3);
  ok(
    "and none of them is a sign or a number",
    CASH_DIRECTIONS.every((d) => Number.isNaN(Number(d)))
  );
}

/* ── 2 · every sentence is written from the reader's own side ───────────── */
{
  const terms = { cash_direction: "proposer_pays", cash_amount: 1500, cash_currency: "USD" };
  ok(
    "the proposer is told THEY add it",
    cashSentence(terms, "proposer", money) === "You add USD1500"
  );
  ok(
    "the recipient is told THEY do",
    cashSentence(terms, "recipient", money) === "They add USD1500"
  );

  const reverse = { cash_direction: "recipient_pays", cash_amount: 1500, cash_currency: "USD" };
  ok(
    "and the reverse direction reverses for both readers",
    cashSentence(reverse, "proposer", money) === "They add USD1500" &&
      cashSentence(reverse, "recipient", money) === "You add USD1500"
  );
  ok(
    "an even trade says so in words, with no figure at all",
    cashSentence({ cash_direction: "none", cash_amount: null, cash_currency: null }, "proposer", money) ===
      "Even trade — no cash either way"
  );

  /* The same stored row must read correctly from BOTH sides — this is the
     whole reason direction is a value and not a sign. */
  const input = {
    targetIdentity: "Parmigiani Kalpa",
    offeredIdentity: "Rolex Explorer 114270",
    terms,
  };
  const asProposer = tradeSummary(input, "proposer", money);
  const asRecipient = tradeSummary(input, "recipient", money);
  ok(
    "the proposer receives the target and gives the offered watch",
    asProposer.youReceive === "Parmigiani Kalpa" && asProposer.youGive === "Rolex Explorer 114270"
  );
  ok(
    "the recipient's view is the exact mirror",
    asRecipient.youReceive === "Rolex Explorer 114270" &&
      asRecipient.youGive === "Parmigiani Kalpa"
  );
  ok(
    "and the two never both claim to receive the same watch",
    asProposer.youReceive !== asRecipient.youReceive
  );
}

/* ── 3 · identity and eligibility ───────────────────────────────────────── */
{
  ok(
    "identity joins what exists",
    watchIdentity({ brand: "Rolex", model: "Explorer", reference: "114270", publicCode: "X38205" }) ===
      "Rolex Explorer · 114270 · X38205"
  );
  ok(
    "and absent parts stay absent",
    watchIdentity({ brand: "Breguet" }) === "Breguet"
  );

  ok("a published watch can trade", isTradeable("published"));
  ok("a private_active watch can trade — that is the V1 non-public shape", isTradeable("private_active"));
  ok("a draft cannot", !isTradeable("draft"));
  ok("a reserved watch cannot — it is already spoken for", !isTradeable("reserved"));
  ok("a rejected or removed watch cannot", !isTradeable("rejected") && !isTradeable("removed"));

  const base = {
    listingStatus: "published",
    openToTrades: true,
    isOwner: false,
    signedIn: true,
    hasPendingOffer: false,
  };
  ok("a clear case has no blocker", proposeBlocker(base) === null);
  ok("a seller who did not opt in blocks first", proposeBlocker({ ...base, openToTrades: false }) === "not_open");
  ok("the owner cannot trade with themselves", proposeBlocker({ ...base, isOwner: true }) === "own_listing");
  ok("an unavailable watch blocks", proposeBlocker({ ...base, listingStatus: "reserved" }) === "not_available");
  ok("a signed-out collector is asked to sign in", proposeBlocker({ ...base, signedIn: false }) === "sign_in");
  ok(
    "a live proposal blocks a second one",
    proposeBlocker({ ...base, hasPendingOffer: true }) === "already_proposed"
  );
}

/* ── 4 · vocabulary honesty ─────────────────────────────────────────────── */
{
  ok(
    "superseded keeps its own meaning, distinct from declined",
    TRADE_STATUS_LABELS.superseded === "Superseded" && TRADE_STATUS_LABELS.declined === "Declined"
  );
  ok(
    "a pending deal says both watches are reserved and where to go next",
    /reserved/.test(dealNextStep("pending")) && /conversation/.test(dealNextStep("pending"))
  );
  ok("a completed deal says so plainly", /complete/i.test(dealNextStep("completed")));
}

/* ══════════════════════════════════════════════════════════════════════════
   GOVERNANCE — the two-object laws
   ══════════════════════════════════════════════════════════════════════════ */

const migration = read("supabase/migrations/20260823230000_trade_offers_v1.sql");
/* Statements only. The migration deliberately EXPLAINS what it refuses to
   build, so an absence pin must read the SQL, never the prose. */
const migrationSql = migration
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*--.*$/gm, "");
const proposeRoute = read("app/api/trade-offers/route.ts");
const actRoute = read("app/api/trade-offers/[id]/route.ts");
const transferRoute = read("app/api/trade/transfer/route.ts");

/* The Slice 1 authority repair. Same discipline as `migrationSql` above and
   for the same reason, doubled: this file EXPLAINS the two defects it closes,
   naming every error code in prose. Counting or ordering against the raw text
   would let a comment satisfy a pin about executable SQL. */
const authoritySql = read("supabase/migrations/20260902120000_trade_authority_repair_slice_1.sql")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*--.*$/gm, "");

/* Step 2 of 2 (v8.19): lifecycle truth and authoritative event history.
   Comment-stripped for the same reason - the file names every refusal and
   every writer in prose before it declares them in SQL. */
const step2Raw = read("supabase/migrations/20260902160000_trade_lifecycle_truth_step_2.sql");
const step2Sql = step2Raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "");

/* ── 5 · purchase machinery stays frozen ────────────────────────────────── */
{
  /* SQL comments are stripped: the header explains WHY purchase_requests
     cannot be reused and names its indexes to do so. The guarantee is that
     no STATEMENT touches them. */
  const sql = migration.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "");
  ok(
    "no migration statement redefines accept_purchase_request",
    !/create or replace function public\.accept_purchase_request/.test(sql)
  );
  ok(
    "purchase_requests is not altered",
    !/alter table public\.purchase_requests/.test(sql)
  );
  ok(
    "its unique indexes are not touched",
    !/purchase_requests_one_accepted_per_listing|purchase_requests_one_pending_per_buyer/.test(sql)
  );
  /* Same reasoning for the routes: the act route's header states plainly
     that it does not touch the cash path. Read the CODE. */
  const proposeCode = strip(proposeRoute);
  const actCode = strip(actRoute);
  ok(
    "the trade routes never call the cash acceptance function",
    !/accept_purchase_request/.test(proposeCode) && !/accept_purchase_request/.test(actCode)
  );
  ok(
    "trade_offers is a SIBLING table, not a column bolted onto purchase_requests",
    /create table if not exists public\.trade_offers/.test(sql)
  );
}

/* ── 6 · cash semantics are enforced by the database too ────────────────── */
{
  ok(
    "an even trade cannot carry an amount, and a directed one cannot omit it",
    /cash_direction = 'none' and cash_amount is null and cash_currency is null/.test(migration) &&
      /cash_direction <> 'none' and cash_amount is not null and cash_currency is not null/.test(migration)
  );
  ok(
    "zero is not a legal amount",
    /cash_amount is null or cash_amount > 0/.test(migration)
  );
  ok(
    "the same pairing law guards the DEAL, not just the offer",
    (migration.match(/cash_direction = 'none' and cash_amount is null/g) ?? []).length >= 2
  );
  ok(
    "there is no signed-amount column anywhere",
    !/cash_delta|signed_amount|net_cash/.test(migrationSql)
  );
}

/* ── 7 · the deadlock guard — the most likely production defect ─────────── */
{
  ok(
    "both listings are locked in deterministic sorted id order",
    /if v_offer\.target_listing_id < v_offer\.offered_listing_id then/.test(migration) &&
      /perform 1 from public\.listings where id = v_first  for update/.test(migration) &&
      /perform 1 from public\.listings where id = v_second for update/.test(migration)
  );
  ok(
    "the reason is written down where the next editor will see it",
    /DEADLOCK PREVENTION/.test(migration) && /crossing/i.test(migration)
  );
  ok(
    "the ordering is by id, never by role — target-then-offered would deadlock",
    !/for update[\s\S]{0,80}target_listing_id[\s\S]{0,80}for update[\s\S]{0,80}offered_listing_id/.test(
      migrationSql
    )
  );
}

/* ── 8 · acceptance is atomic across BOTH objects ───────────────────────── */
{
  ok(
    "both watches must still be acquirable inside the boundary",
    /target_not_available/.test(migration) && /offered_not_available/.test(migration)
  );
  ok(
    "control is re-verified on both sides",
    /target_not_controlled_by_recipient/.test(migration) &&
      /offered_not_controlled_by_proposer/.test(migration)
  );
  ok(
    "the seller's posture must still permit trades",
    /target_not_open_to_trades/.test(migration)
  );
  ok(
    "a watch already committed elsewhere refuses the trade",
    /listing_already_accepted/.test(migration) && /listing_already_in_accepted_trade/.test(migration)
  );
  ok(
    "competing cash requests on EITHER watch are superseded, not declined",
    /update public\.purchase_requests[\s\S]{0,200}status = 'superseded'/.test(migration)
  );
  ok(
    "BOTH listings are reserved in one statement — never one at a time",
    /update public\.listings\s*\n\s*set status = 'reserved'[\s\S]{0,120}where id in \(v_target\.id, v_offered\.id\)/.test(
      migration
    )
  );
  ok(
    "no traded_pending_* state is invented for the UI's convenience",
    !/traded_pending/.test(migrationSql)
  );
  ok(
    "the accepted consideration is frozen into event history",
    /trade_offer_events[\s\S]{0,400}'accepted'[\s\S]{0,400}cash_direction/.test(migration)
  );
}

/* ── 9 · one deal, two legs — the founder ruling, in the schema ─────────── */
{
  ok(
    "the deal owns state, cash and completion",
    /create table if not exists public\.trade_deals/.test(migration) &&
      /status in \('pending', 'settling', 'completed', 'cancelled'\)/.test(migration) &&
      /completed_at/.test(migration)
  );
  ok(
    "exactly one deal per accepted offer",
    /trade_offer_id uuid not null unique references public\.trade_offers/.test(migration)
  );
  ok(
    "each leg is ONE watch moving ONE direction",
    /create table if not exists public\.trade_deal_legs/.test(migration) &&
      /from_user_id uuid not null/.test(migration) &&
      /to_user_id   uuid not null/.test(migration)
  );
  ok(
    "a leg owns its own physical-object progress",
    /leg_status[\s\S]{0,140}'in_transit'[\s\S]{0,60}'verified'[\s\S]{0,60}'transferred'/.test(migration)
  );
  ok(
    "the same watch cannot move twice inside one deal",
    /constraint trade_deal_legs_one_per_listing unique \(trade_deal_id, listing_id\)/.test(migration)
  );
  ok(
    "acceptance writes exactly two legs",
    (migration.match(/insert into public\.trade_deal_legs/g) ?? []).length === 2
  );
  ok(
    "cash lives on the deal, never as a third transaction",
    !/insert into public\.transactions/.test(migrationSql)
  );
}

/* ── 10 · a bound watch cannot be quietly deleted ───────────────────────── */
{
  ok(
    "delete-eligibility learns about live trade legs",
    /active_trade_deal/.test(migration) &&
      /from public\.trade_deal_legs l[\s\S]{0,200}d\.status not in \('completed', 'cancelled'\)/i.test(
        migration
      )
  );
  ok(
    "and every pre-existing blocker survives unchanged",
    /accepted_purchase_request/.test(migration) &&
      /active_transaction/.test(migration) &&
      /active_wizard_session/.test(migration)
  );
}

/* ── 11 · admission is verified INSIDE the governed mutation ─────────────
   These assertions used to read the route, because the route was where the
   rules lived. v8.17 moved them into propose_trade_offer(), so they are
   pinned against the migration now — the boundary, not a caller of it.
   Behavioural proof of these rules is not source text and does not live
   here; it is recorded in app/api/trade-offers/README.md. ───────────────── */
{
  ok(
    "the recipient is DERIVED from the locked target listing, never sent by the browser",
    /v_caller, v_target\.seller_id, 'pending'/.test(authoritySql) &&
      !/body\.recipientId|body\.proposerId/.test(proposeRoute)
  );
  ok("the target must be open to trades", /not_open_to_trades/.test(authoritySql));
  ok("the target cannot be the caller's own", /own_listing/.test(authoritySql));
  ok(
    "the offered watch must be the caller's",
    /v_offered\.seller_id <> v_caller/.test(authoritySql) &&
      /offered_not_yours/.test(authoritySql)
  );
  ok(
    "both watches must be in a tradeable status",
    (
      authoritySql.match(/status not in \('published', 'private_active'\)/g) ?? []
    ).length === 2
  );

  /* THE SLICE 1 REPAIR. A private_active TARGET admits only its designated
     buyer; the caller's own private_active watch may still be offered as
     consideration. Two different rules, and collapsing them in either
     direction is a defect - so the gate must appear exactly once, and it
     must be `is distinct from` (a NULL private_buyer_id designates nobody,
     and `<>` against NULL falls through the guard). */
  ok(
    "a private_active TARGET admits only its designated buyer",
    /v_target\.status = 'private_active'[\s\S]{0,120}v_target\.private_buyer_id is distinct from v_caller/.test(
      authoritySql
    ) && /target_private_not_designated/.test(authoritySql)
  );
  ok(
    "the designated-buyer gate is NOT applied to the offered watch",
    (authoritySql.match(/private_buyer_id is distinct from v_caller/g) ?? []).length === 1 &&
      !/v_offered\.private_buyer_id/.test(authoritySql)
  );
  ok(
    "both listings are locked in deterministic id order before anything is judged",
    /if p_target_listing_id < p_offered_listing_id/.test(authoritySql) &&
      /where id = v_first {2}for update/.test(authoritySql) &&
      /where id = v_second for update/.test(authoritySql)
  );
  ok(
    "the proposal and its authoritative lifecycle event are one transaction",
    /insert into public\.trade_offer_events[\s\S]{0,400}'proposed'/.test(authoritySql) &&
      /* Stripped: the route's comment explains that it no longer writes the
         event, and the word appearing in that explanation must not satisfy
         an absence pin about what the route executes. */
      !/trade_offer_events/.test(strip(proposeRoute))
  );
  ok(
    "a duplicate live proposal is refused by the index, surfaced as 409",
    /unique_violation/.test(authoritySql) &&
      /already_proposed/.test(authoritySql) &&
      /already_proposed/.test(proposeRoute)
  );

  /* The route is no longer the boundary and must not drift back into being
     one: it calls the function and renders errors, and it must not reach
     for the service client to decide admission for itself. */
  ok(
    "the route calls the governed mutation on the SESSION client",
    /supabase\.rpc\("propose_trade_offer"/.test(proposeRoute)
  );
  ok(
    "a non-designated caller cannot tell a private listing from a missing one",
    /target_private_not_designated"\) \|\| says\("target_not_found/.test(proposeRoute)
  );

  /* ── the transfer producer: authorization before replay ──────────────── */
  ok(
    "authorization is evaluated BEFORE the idempotency lookup",
    authoritySql.indexOf("only_the_recipient_may_confirm_receipt") <
      authoritySql.indexOf("where idempotency_key = p_idempotency_key")
  );
  ok(
    "a replay is the tuple (leg, actor, event type, key) — never the raw string",
    /v_existing\.trade_deal_leg_id {2}= v_leg\.id[\s\S]{0,200}asserted_by_user_id = p_actor_user_id[\s\S]{0,200}event_type {5}= p_event_type/.test(
      authoritySql
    )
  );
  ok(
    "a key under a different tuple is refused, never returned as a replay",
    /idempotency_key_conflict/.test(authoritySql) &&
      /idempotency_key_conflict/.test(transferRoute)
  );
  ok(
    "retraction authority is decided before any state answer about the transfer",
    authoritySql.indexOf("not_authorized_to_retract") <
      authoritySql.indexOf("superseded_event_not_found")
  );
  ok(
    "acceptance is ONE atomic RPC call — the route assembles nothing",
    /rpc\("accept_trade_offer"/.test(actRoute) &&
      !/insert[\s\S]{0,60}trade_deal_legs/.test(actRoute) &&
      !/update[\s\S]{0,60}listings/.test(actRoute)
  );
  /* v8.19 moved decline/withdraw into resolve_trade_offer(). The actor rule
     is now decided in SQL from auth.uid(); the route only calls it. */
  ok(
    "decline belongs to the recipient and withdraw to the proposer - decided in the governed function",
    /p_action = 'decline' and v_offer\.recipient_id <> v_caller/.test(step2Sql) &&
      /p_action = 'withdraw' and v_offer\.proposer_id <> v_caller/.test(step2Sql) &&
      /rpc\("resolve_trade_offer"/.test(actRoute)
  );
  ok(
    "every refusal says nothing was changed",
    /Nothing was changed/.test(actRoute)
  );
}

/* ── 11b · STEP 2 OF 2 — lifecycle truth and authoritative event history ──
   Structural pins on the migration and routes. The behavioural proofs for
   this step are database proofs run against production inside rolled-back
   transactions and are recorded in app/api/trade-offers/README.md; nothing
   here claims them. What this section guards is that the SHAPE cannot
   regress: every writer authors its event in the same function, the
   history table is structurally append-only, and the completion boundary
   is decided before replay. ─────────────────────────────────────────────── */
{
  /* every trade_offers.status writer is a governed function that also inserts its event */
  ok("decline/withdraw: status and event in one function",
    /create or replace function public\.resolve_trade_offer\(p_offer_id uuid, p_action text\)/.test(step2Sql) &&
      /update public\.trade_offers[\s\S]{0,120}set status = v_next[\s\S]{0,400}insert into public\.trade_offer_events[\s\S]{0,200}v_next/.test(step2Sql));
  ok("acceptance authors one superseded event PER losing trade offer, from the exact RETURNING set",
    /returning id\s*\)\s*select coalesce\(array_agg\(id\), '\{\}'\) into v_superseded_offers/.test(step2Sql) &&
      /select unnest\(v_superseded_offers\), 'superseded', v_caller, 'pending', 'superseded'/.test(step2Sql) &&
      /'cause', 'trade_offer_accepted'/.test(step2Sql));
  /* The phrase appears in the LOCK statement too, so a presence test alone
     was satisfied by the lock while the UPDATE had lost a direction - found
     by mutation. The pin now reads the UPDATE itself. */
  ok("purchase-request acceptance retires pending trade offers as TARGET or as OFFERED consideration, one event each",
    /with losers as \(\s*update public\.trade_offers\s*set status = 'superseded', updated_at = now\(\)\s*where status = 'pending'\s*and \(target_listing_id = v_listing_id or offered_listing_id = v_listing_id\)\s*returning id/.test(step2Sql) &&
      /'cause', 'purchase_request_accepted'/.test(step2Sql) &&
      (step2Sql.match(/select unnest\(v_superseded_offers\), 'superseded'/g) ?? []).length === 2);
  ok("purchase-request acceptance keeps its own product semantics - transaction row, reserve, sibling requests",
    /insert into public\.transactions/.test(step2Sql) &&
      /set status = 'superseded', updated_at = now\(\)\s*where listing_id = v_listing_id\s*and id <> p_request_id/.test(step2Sql));
  ok("no superseded vocabulary is invented for purchase_request_events",
    !/purchase_request_events/.test(step2Sql));

  /* the route no longer writes status or history for decline/withdraw */
  const actCode2 = strip(actRoute);
  ok("the [id] route calls resolve_trade_offer on the session client and touches no trade_offers row itself",
    /supabase\.rpc\("resolve_trade_offer"/.test(actCode2) &&
      !/\.update\(\{ status/.test(actCode2) &&
      !/trade_offer_events/.test(actCode2));

  /* lock discipline: listing rows first in BOTH mechanisms, sorted in Trade */
  ok("trade acceptance keeps the sorted listing-row lock order",
    /if v_offer\.target_listing_id < v_offer\.offered_listing_id then/.test(step2Sql) &&
      step2Sql.indexOf("perform 1 from public.listings where id = v_first  for update") <
        step2Sql.indexOf("update public.trade_offers\n     set status = 'accepted'"));
  ok("purchase-request acceptance locks the listing before any sibling row of either mechanism",
    step2Sql.indexOf("from public.listings\n  where id = v_listing_id\n  for update") <
      step2Sql.indexOf("from public.purchase_requests\n  where listing_id = v_listing_id\n  for update") &&
    step2Sql.indexOf("from public.purchase_requests\n  where listing_id = v_listing_id\n  for update") <
      step2Sql.indexOf("from public.trade_offers\n  where status = 'pending'\n    and (target_listing_id = v_listing_id or offered_listing_id = v_listing_id)\n  for update"));

  /* private commitment closure: capture BEFORE clear, clear WITH reserve, notify through notifications */
  const captureAt = step2Sql.indexOf("v_target_private_buyer  := case when v_target.status  = 'private_active'");
  const clearAt = step2Sql.indexOf("set status = 'reserved', private_buyer_id = null");
  ok("the pre-commit private_buyer_id is captured from the locked row BEFORE the closure clears it",
    captureAt >= 0 && clearAt >= 0 && captureAt < clearAt);
  ok("closure and reservation are one statement, and the named buyer is notified through the existing notifications seam in the same transaction",
    /set status = 'reserved', private_buyer_id = null, updated_at = now\(\)/.test(step2Sql) &&
      /insert into public\.notifications \(user_id, type, message, listing_id, dedupe_key\)/.test(step2Sql) &&
      /'private_listing_closed'/.test(step2Sql) &&
      !/create table[\s\S]{0,80}notif/.test(step2Sql));
  ok("the acquirer of each watch is derived from the offer, never from the request",
    /\(v_target\.id,  v_target_private_buyer,  v_offer\.proposer_id/.test(step2Sql) &&
      /\(v_offered\.id, v_offered_private_buyer, v_offer\.recipient_id/.test(step2Sql));
  ok("acceptance honours Slice 1 private admission at the second door",
    /target_private_not_designated/.test(step2Sql));

  /* completion: the trigger authors the event; the wrapper no longer does */
  ok("completion authors its own event from a trigger on trade_deals, whichever path completed it",
    /create trigger trade_deals_completed_event/.test(step2Sql) &&
      /when \(new\.status = 'completed' and old\.status is distinct from 'completed'\)/.test(step2Sql) &&
      /'authored_by', 'trade_deals_completed_event'/.test(step2Sql));
  ok("the completion event is idempotent by construction",
    /not exists \(\s*select 1 from public\.trade_offer_events\s*where trade_offer_id = NEW\.trade_offer_id and event_type = 'completed'/.test(step2Sql));
  const wrapperStart = step2Sql.indexOf("create or replace function public.confirm_trade_leg_receipt");
  const wrapperEnd = step2Sql.indexOf("$function$;", wrapperStart);
  ok("confirm_trade_leg_receipt no longer inserts the completed event itself",
    wrapperStart >= 0 && !/trade_offer_events/.test(step2Sql.slice(wrapperStart, wrapperEnd)));
  ok("the producer names the actor for the completion trigger before it recomputes",
    step2Sql.indexOf("set_config('fwt.transfer_actor', p_actor_user_id::text, true)") >= 0 &&
      step2Sql.indexOf("set_config('fwt.transfer_actor', p_actor_user_id::text, true)") <
        step2Sql.indexOf("perform public.recompute_trade_transfer_status(v_deal.id)"));

  /* post-completion retraction: authorization < completion refusal < replay */
  /* Ordering alone cannot see a guard that was neutered in place (found by
     mutation), so the exact guard must sit INSIDE the retraction branch:
     after retraction_must_supersede, before the branch's else. */
  const authAt = step2Sql.indexOf("raise exception 'not_authorized_to_retract'");
  const replayAt = step2Sql.indexOf("where idempotency_key = p_idempotency_key");
  const guard = /raise exception 'retraction_must_supersede'; end if;\s*if v_deal\.status = 'completed' then\s*raise exception 'deal_completed_retraction_refused'; end if;\s*else\s*raise exception 'unsupported_event_type';/;
  const guardAt = step2Sql.search(guard);
  ok("a completed deal refuses retraction inside the retraction branch, after authorization and BEFORE the replay lookup",
    authAt >= 0 && guardAt >= 0 && replayAt >= 0 && authAt < guardAt && guardAt < replayAt &&
      (step2Sql.match(/deal_completed_retraction_refused/g) ?? []).length === 1);
  const transferRoute2 = read("app/api/trade/transfer/route.ts");
  ok("the transfer route can surface the completion refusal truthfully",
    /"deal_completed_retraction_refused"/.test(transferRoute2));

  /* Slice 1 invariants survive verbatim in the re-issued producer */
  ok("Slice 1 replay tuple and conflict refusal are preserved",
    /v_existing\.trade_deal_leg_id {2}= v_leg\.id[\s\S]{0,200}asserted_by_user_id = p_actor_user_id[\s\S]{0,200}event_type {5}= p_event_type/.test(step2Sql) &&
      /idempotency_key_conflict/.test(step2Sql) &&
      step2Sql.indexOf("only_the_recipient_may_confirm_receipt") < replayAt);
  ok("propose_trade_offer is not re-issued by this step",
    !/create or replace function public\.propose_trade_offer/.test(step2Sql));

  /* append-only structure */
  ok("UPDATE and DELETE are refused by a row trigger, TRUNCATE by a statement trigger",
    /create trigger trade_offer_events_no_update_delete\s*before update or delete on public\.trade_offer_events\s*for each row/.test(step2Sql) &&
      /create trigger trade_offer_events_no_truncate\s*before truncate on public\.trade_offer_events\s*for each statement/.test(step2Sql));
  ok("INSERT/UPDATE/DELETE/TRUNCATE are revoked from anon, authenticated AND service_role - privilege is not permission",
    /revoke insert, update, delete, truncate, references, trigger\s*on public\.trade_offer_events from anon, authenticated, service_role/.test(step2Sql));
  ok("the FK to trade_offers no longer cascades a delete into history",
    /foreign key \(trade_offer_id\) references public\.trade_offers\(id\) on delete restrict/.test(step2Sql));
  ok("the append-only structure is installed BEFORE any function in this file can write",
    step2Sql.indexOf("create trigger trade_offer_events_no_update_delete") <
      step2Sql.indexOf("create or replace function public.accept_trade_offer"));

  /* historical reconciliation: one evidenced row, idempotent, self-labelled */
  ok("the only historical reconciliation is a proposed event derived from the offer row's own columns, idempotently",
    /select o\.id, 'proposed', o\.proposer_id, null, 'pending', o\.created_at/.test(step2Sql) &&
      /'reconciled',\s+true/.test(step2Sql) &&
      /not exists \(\s*select 1 from public\.trade_offer_events e\s*where e\.trade_offer_id = o\.id and e\.event_type = 'proposed'/.test(step2Sql) &&
      (step2Sql.match(/insert into public\.trade_offer_events/g) ?? []).length >= 6);
}

/* ── 11c · CANCELLATION RESTORE — a closed private opportunity pauses ──────
   After v8.19 a closed private opportunity and an originally public watch
   are identical at the listing row (reserved, private_buyer_id null). The
   restore must therefore read the accepted event's closure record, and a
   closed opportunity lands on Paused - never Published, never the old
   invitation. Behavioural proof is a database proof (see the README);
   these pins guard the shape. ────────────────────────────────────────────── */
{
  const cancelSql = read("supabase/migrations/20260902180000_trade_cancel_restores_closed_private_to_paused.sql")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "");
  ok("the closure evidence is read from the winning offer's accepted event, never inferred from the row",
    /FROM public\.trade_offer_events e\s*CROSS JOIN LATERAL jsonb_array_elements\(coalesce\(e\.metadata->'private_opportunities_closed', '\[\]'::jsonb\)\) c\s*WHERE e\.trade_offer_id = v_deal\.trade_offer_id\s*AND e\.event_type = 'accepted'/.test(cancelSql));
  ok("three outcomes in one CASE, in this order: designation kept → private, closed → removed, else → published",
    /SET status = CASE\s*WHEN li\.private_buyer_id IS NOT NULL\s*THEN 'private_active'\s*WHEN li\.id = ANY \(v_closed_listings\)\s*THEN 'removed'\s*ELSE\s*'published'\s*END/.test(cancelSql));
  ok("Paused means Paused: removed_at is stamped and a note says why; no seller reason code is invented",
    /removed_at = CASE\s*WHEN li\.private_buyer_id IS NULL AND li\.id = ANY \(v_closed_listings\) THEN now\(\)/.test(cancelSql) &&
      /removal_reason_note = CASE/.test(cancelSql) && !/removal_reason_code/.test(cancelSql));
  ok("only reserved listings of this deal's legs are touched",
    /WHERE li\.id IN \(SELECT listing_id FROM public\.trade_deal_legs\s*WHERE trade_deal_id = p_deal_id\)\s*AND li\.status = 'reserved'/.test(cancelSql));
  ok("the cancelled event records what each listing was restored to",
    /'listings_restored', v_restored/.test(cancelSql) && /jsonb_build_object\('listing_id', id, 'restored_to', status\)/.test(cancelSql));
  ok("every existing refusal survives verbatim",
    /RAISE EXCEPTION 'not_allowed'/.test(cancelSql) && /RAISE EXCEPTION 'already_cancelled'/.test(cancelSql) &&
      /RAISE EXCEPTION 'deal_completed'/.test(cancelSql) && /RAISE EXCEPTION 'cannot_cancel_after_transfer'/.test(cancelSql) &&
      /physical_watch_live_transfers/.test(cancelSql));
  ok("no other function is re-issued by this repair",
    (cancelSql.match(/create or replace function/gi) ?? []).length === 1);
}

/* ── 12 · no second messaging product ───────────────────────────────────── */
{
  const offersModule = read("components/TradeOffersModule.tsx");
  const dialog = read("components/ProposeTradeDialog.tsx");
  ok(
    "trade offers carry an optional note, not a thread",
    /note text check/.test(migration) && !/create table[\s\S]{0,200}trade_messages/.test(migrationSql)
  );
  ok(
    "the workspace has no reply box, no inbox, no chat",
    !/Trade Inbox|Trade Messages|reply|sendMessage/i.test(offersModule.replace(/\/\*[\s\S]*?\*\//g, ""))
  );
  ok(
    "the exchange itself is directed to the existing listing conversation",
    // The copy wraps in source, so match across the line break.
    /listing\s+conversation/.test(offersModule)
  );
  ok(
    "and the proposal surface avoids exchange-styling theatre",
    !/swap|↔|🔄/.test(dialog.replace(/\/\*[\s\S]*?\*\//g, ""))
  );
}

console.log(`trade: ${n} assertions passed`);
