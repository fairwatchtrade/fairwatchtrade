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
  ok(
    "decline belongs to the recipient and withdraw to the proposer",
    /action === "decline" \? offer\.recipient_id === user\.id : offer\.proposer_id === user\.id/.test(
      actRoute
    )
  );
  ok(
    "every refusal says nothing was changed",
    /Nothing was changed/.test(actRoute)
  );
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
