/* Wanted / Looking For V1 — behavior + privacy boundary proofs.

   Run: node --experimental-strip-types scripts/wanted.test.mjs

   The privacy law is the reason this suite exists. Two halves:

     · BEHAVIOR — the pure comparison rules: coarse budget fit, honest
       required/failed/unknown, criteria carried from Browse;
     · BOUNDARY — structural pins proving the buyer's exact budget,
       identity and private note cannot reach a seller surface. These are
       source assertions because "no column selected" is not type-checkable,
       and a future edit that adds one must fail loudly here.               */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BUDGET_FITS,
  NEAR_BAND,
  ageLabel,
  availableActions,
  budgetFit,
  compareListingToWanted,
  compatibilitySentence,
  conditionRank,
  displayIdentity,
  draftFromBrowseParams,
  browseDraftHref,
} from "../lib/wanted.ts";

let n = 0;
const ok = (label, cond) => {
  n += 1;
  assert.ok(cond, label);
};
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ── 1 · the budget becomes three words, never a number ─────────────────── */
{
  ok("at the ceiling is within", budgetFit(7000, 7000) === "within");
  ok("under the ceiling is within", budgetFit(6500, 7000) === "within");
  ok("just over is near", budgetFit(7500, 7000) === "near");
  ok("at the top of the near band is still near", budgetFit(7000 * (1 + NEAR_BAND), 7000) === "near");
  ok("past the band is outside", budgetFit(7000 * (1 + NEAR_BAND) + 1, 7000) === "outside");
  ok("no ceiling yields no signal", budgetFit(6500, null) === null);
  ok("no price yields no signal", budgetFit(null, 7000) === null);
  ok("a zero ceiling is not a ceiling", budgetFit(100, 0) === null);
  ok(
    "the vocabulary is exactly three words",
    BUDGET_FITS.length === 3 && BUDGET_FITS.every((f) => typeof f === "string")
  );
  ok(
    "the near band is wide enough that one probe reveals little",
    NEAR_BAND >= 0.1
  );
  /* The signal must not be a disguised number: two very different prices
     inside the same bucket are indistinguishable to the seller. */
  ok(
    "prices far apart inside a bucket read identically",
    budgetFit(100, 7000) === budgetFit(6999, 7000)
  );
}

/* ── 2 · comparison is honest about what it does not know ───────────────── */
{
  const criteria = {
    minCondition: "Excellent",
    documentation: "full_set",
    mustHave: ["white guilloché dial"],
    preferred: ["unpolished"],
    ceiling: 7000,
    currency: "USD",
  };

  const good = compareListingToWanted(criteria, {
    condition: "Mint",
    text: "Parmigiani Kalpa with a white guilloché dial, unpolished case",
    hasPapers: true,
    hasFullSet: true,
    price: 6800,
    currency: "USD",
  });
  ok("a matching listing meets every requirement", good.meetsAllRequired);
  ok("and its preference is recorded as met", good.preferredMet.includes("unpolished"));
  ok("and its fit is within", good.budgetFit === "within");

  const wrongDial = compareListingToWanted(criteria, {
    condition: "Mint",
    text: "Parmigiani Kalpa, black dial",
    hasPapers: true,
    hasFullSet: true,
    price: 6800,
    currency: "USD",
  });
  ok("a missing must-have fails, loudly", !wrongDial.meetsAllRequired);
  ok("and names the exact criterion", wrongDial.requiredFailed.includes("white guilloché dial"));

  const poorCondition = compareListingToWanted(criteria, {
    condition: "Good",
    text: "white guilloché dial",
    hasPapers: true,
    hasFullSet: true,
    price: 5000,
    currency: "USD",
  });
  ok("a condition below the floor fails", !poorCondition.meetsAllRequired);
  ok(
    "and says which floor",
    poorCondition.requiredFailed.some((f) => f.includes("Excellent"))
  );

  const unknownDocs = compareListingToWanted(criteria, {
    condition: "Mint",
    text: "white guilloché dial",
    hasPapers: null,
    hasFullSet: null,
    price: 6800,
    currency: "USD",
  });
  ok("unverifiable documentation is UNKNOWN, never a silent pass", !unknownDocs.meetsAllRequired);
  ok("and it is reported as unknown, not failed", unknownDocs.requiredUnknown.length === 1);
  ok(
    "the sentence tells the seller it will show as unconfirmed",
    /unconfirmed/.test(compatibilitySentence(unknownDocs))
  );
  ok(
    "a contradiction is never described as a full match",
    /does not meet/.test(compatibilitySentence(wrongDial))
  );

  const otherCurrency = compareListingToWanted(criteria, {
    condition: "Mint",
    text: "white guilloché dial",
    hasPapers: true,
    hasFullSet: true,
    price: 6800,
    currency: "EUR",
  });
  ok("prices in another currency are not comparable, so no fit is claimed", otherCurrency.budgetFit === null);

  ok("an empty criterion is never counted as present",
    compareListingToWanted(
      { documentation: "any", mustHave: ["  "], preferred: [] },
      { text: "anything", price: null }
    ).requiredFailed.length === 0);

  ok("unknown condition vocabulary ranks as unknown", conditionRank("Fantastic") === null);
  ok("condition order runs worst to best", (conditionRank("Mint") ?? 0) > (conditionRank("Good") ?? 0));
}

/* ── 3 · identity, honest ambiguity ─────────────────────────────────────── */
{
  ok(
    "a full identity joins its parts",
    displayIdentity({ brand: "Parmigiani Fleurier", modelText: "Kalpa", referenceText: "PF-1" }) ===
      "Parmigiani Fleurier · Kalpa · PF-1"
  );
  ok(
    "an unknown reference is simply absent — never guessed or padded",
    displayIdentity({ brand: "Parmigiani Fleurier", modelText: "Kalpa Hebdomadaire" }) ===
      "Parmigiani Fleurier · Kalpa Hebdomadaire"
  );
  ok("brand alone is a legitimate request", displayIdentity({ brand: "Breguet" }) === "Breguet");
}

/* ── 4 · lifecycle ──────────────────────────────────────────────────────── */
{
  ok("a paused request is invisible to sellers", !availableActions("paused").visibleToSellers);
  ok("a closed request is invisible to sellers", !availableActions("closed").visibleToSellers);
  ok("a draft is invisible to sellers", !availableActions("draft").visibleToSellers);
  ok("an ANSWERED request is still visible — answering never closed it",
    availableActions("answered").visibleToSellers);
  ok("an answered request can still be paused", availableActions("answered").canPause);
  ok("a closed request cannot be edited or re-closed",
    !availableActions("closed").canEdit && !availableActions("closed").canClose);
  ok("only a paused request offers resume",
    availableActions("paused").canResume && !availableActions("active").canResume);
  ok("age reads in the room's voice", ageLabel(new Date(Date.now() - 86_400_000).toISOString(), Date.now()) === "Yesterday");
}

/* ── 5 · the Browse hand-off carries intent, not filter noise ───────────── */
{
  const one = new URLSearchParams("brand=Breguet&condition=Excellent&q=Classique&sort=price_asc&pageSize=48");
  const seed = draftFromBrowseParams(one);
  ok("a single brand becomes the request's maker", seed.brand === "Breguet");
  ok("the text query seeds the model", seed.modelText === "Classique");
  ok("a single condition seeds the floor", seed.minCondition === "Excellent");

  const many = new URLSearchParams("brand=Breguet&brand=Rolex&q=chrono");
  ok(
    "several brands seed NO brand — a Wanted request is for one watch",
    draftFromBrowseParams(many).brand === ""
  );

  const href = browseDraftHref(one);
  ok("the hand-off opens the composer", /[?&]new=1/.test(href));
  ok("and carries only what Wanted can honestly represent",
    !/sort=/.test(href) && !/pageSize=/.test(href));
  ok("it lands on the Wanted room", href.startsWith("/wanted?"));
}

/* ══════════════════════════════════════════════════════════════════════════
   PRIVACY BOUNDARY — structural pins
   ══════════════════════════════════════════════════════════════════════════ */

const migration = read("supabase/migrations/20260823210000_wanted_requests_v1.sql");
const sellerRoute = read("app/api/wanted/seller/route.ts");
const answerRoute = read("app/api/wanted/[id]/answer/route.ts");
const peekRoute = read("app/api/wanted/[id]/peek/route.ts");
const sellerModule = read("components/WantedRequestsModule.tsx");
const workspace = read("components/WantedWorkspace.tsx");

/* ── 6 · the database refuses sellers, it does not merely filter them ───── */
{
  ok(
    "wanted_requests carries an own-row SELECT policy and no seller policy",
    /create policy wanted_requests_select_own[\s\S]{0,160}requester_id = auth\.uid\(\)/.test(migration) &&
      !/for select using \(true\)/.test(migration)
  );
  ok(
    "the seller projection is SECURITY DEFINER, because sellers hold no row access",
    /create or replace function public\.wanted_requests_for_seller\(\)[\s\S]{0,900}security definer/.test(
      migration
    )
  );
  const returnsBlock = migration.slice(
    migration.indexOf("returns table (", migration.indexOf("wanted_requests_for_seller")),
    migration.indexOf("language sql", migration.indexOf("wanted_requests_for_seller"))
  );
  ok(
    "its RETURN SHAPE contains no budget column, no requester, no note",
    !/target_price|max_price|collector_note|requester_id/.test(returnsBlock)
  );
  ok(
    "it returns only open demand and never the seller's own request",
    /w\.status in \('active', 'answered'\)/.test(migration) &&
      /w\.requester_id <> me\.uid/.test(migration)
  );
  ok(
    "the coarse signal leaves Postgres as a word",
    /then 'within'/.test(migration) && /then 'near'/.test(migration) && /else 'outside'/.test(migration)
  );
  ok("anon cannot execute the projection", /revoke all on function public\.wanted_requests_for_seller\(\) from public, anon/.test(migration));
  ok(
    "answers are deduped by CONSTRAINT, not by application politeness",
    /constraint wanted_request_answers_one_per_listing unique \(wanted_request_id, listing_id\)/.test(
      migration
    )
  );
  ok(
    "there is no client INSERT policy on answers — sending is server-side",
    !/create policy[\s\S]{0,200}wanted_request_answers[\s\S]{0,120}for insert/.test(migration)
  );
  ok("an answer has no message column — a freeform reply does not exist", !/message\s+text/.test(migration));
}

/* ── 7 · no seller-facing surface can name a number or a person ─────────── */
{
  ok(
    "the seller queue route only calls the projection — it selects no columns",
    /rpc\("wanted_requests_for_seller"\)/.test(sellerRoute) &&
      !/from\("wanted_requests"\)/.test(sellerRoute)
  );
  ok(
    "the seller queue component never mentions a budget field",
    !/target_price|max_price|collector_note|requester_id/.test(strip(sellerModule))
  );
  ok(
    "the only budget it can render is the three-word label",
    /BUDGET_FIT_LABELS\[/.test(sellerModule) && !/formatMoney\(\s*r\./.test(sellerModule)
  );
  ok(
    "the peek route returns no requester id, budget, or note",
    /requester_id was needed for the own-request check and stops here/.test(peekRoute) &&
      !/target_price|max_price|collector_note/.test(strip(peekRoute))
  );
  ok(
    "the answer route reads the ceiling server-side and emits only a verdict",
    /Requester-private: consumed here, never emitted/.test(answerRoute) &&
      /report: reportFor/.test(answerRoute)
  );
  const answerBody = strip(answerRoute);
  ok(
    "the answer route never puts a price into its response",
    !/json\(\{[^}]*max_price/.test(answerBody) && !/json\(\{[^}]*target_price/.test(answerBody)
  );
  ok(
    "the collector notification names the watch, never a figure",
    /A listing has answered your Wanted request/.test(answerRoute) &&
      !/notifications[\s\S]{0,300}(max_price|target_price)/.test(answerRoute)
  );
  ok(
    "the seller cannot answer with a listing that is not theirs",
    /\.eq\("seller_id", sellerId\)/.test(answerRoute)
  );
  ok(
    "a private listing may answer only the buyer it is bound to",
    /private_buyer_mismatch/.test(answerRoute)
  );
  ok(
    "duplicate answers are refused by the constraint, reported as 409",
    /error\.code === "23505"/.test(answerRoute) && /already_answered/.test(answerRoute)
  );
  ok(
    "answering never closes a request — it only moves active to answered",
    /update\(\{ status: "answered" \}\)/.test(answerRoute) &&
      !/status: "closed"/.test(answerBody)
  );
}

/* ── 8 · the collector is told who can read what ────────────────────────── */
{
  ok(
    "the composer says plainly that the figure stays private",
    /never the figure itself/.test(workspace)
  );
  ok(
    "the ledger repeats it beside each request that has a budget",
    /Your figure stays private/.test(workspace)
  );
  ok(
    "the private note is described as the collector's alone",
    /only you ever see this/i.test(workspace)
  );
  /* JSX wraps prose across lines — collapse whitespace before reading it,
     the same way a person reads the rendered sentence. */
  const workspaceProse = workspace.replace(/\s+/g, " ");
  ok(
    "the room states it is not a public board",
    /not a public advertisement/.test(workspaceProse) &&
      /no contact details/.test(workspaceProse)
  );
}

/* ── 9 · the entrances are real, and New Arrivals stays dead ────────────── */
{
  const rail = read("components/CatalogueRail.tsx");
  const mobile = read("components/MobileNav.tsx");
  const browse = read("components/BrowseClient.tsx");
  const accountRail = read("components/AccountRail.tsx");
  const dashboard = read("components/AccountDashboard.tsx");
  const sell = read("app/sell/page.tsx");

  ok(
    "Wanted joins the EXISTING Discover section",
    /RailSection label="Discover"[\s\S]{0,900}label="Wanted"\s+href="\/wanted"/.test(rail)
  );
  ok("New Arrivals is still absent from the rail", !/New Arrivals/.test(strip(rail)));
  ok(
    "the rail's other sections are untouched",
    /label="Seller" exit/.test(rail) && /RailSection label="Collection"/.test(rail)
  );
  ok(
    "mobile reaches Wanted through the existing drawer, not a new primitive",
    /\{ label: "Wanted", href: "\/wanted" \}/.test(mobile)
  );
  ok(
    "Browse's zero-result offers the request and seeds it",
    /Create Wanted Request/.test(browse) && /browseDraftHref\(searchParams\)/.test(browse)
  );
  ok(
    "Seller Workspace owns the seller entrance",
    /\{ id: "wanted", label: "Wanted Requests"/.test(accountRail) &&
      /activeModule === "wanted"[\s\S]{0,400}<WantedRequestsModule \/>/.test(dashboard)
  );
  ok(
    "and it is reachable as a deep link on mobile too",
    /"wanted",\n\] as const;/.test(dashboard)
  );
  /* Source prose wraps; read it the way it is written, not the way it is
     line-broken. */
  const sellProse = (sell + read("components/WantedRequestsModule.tsx")).replace(/\s+/g, " ");
  ok(
    "the Wanted private path needs no message thread",
    /No message thread is needed|no message thread was needed/.test(sellProse)
  );
  ok(
    "and it does not reuse the privateThread hydration path",
    /does not reuse the privateThread resolution/.test(sellProse)
  );
  ok(
    "an unopen request refuses rather than becoming a public listing",
    /no longer open for answers/.test(sellProse)
  );
}

/* ── 10 · the server binds the buyer, the browser never names one ───────── */
{
  const listings = read("app/api/listings/route.ts");
  ok(
    "the buyer is re-derived from the request row",
    /the buyer\s*\n?\s*is re-derived here from the request row/.test(listings)
  );
  ok(
    "a seller cannot answer their own request",
    /wanted\.requester_id === user\.id/.test(listings)
  );
  ok(
    "a private answer is refused when the collector did not accept one",
    /private_not_accepted/.test(listings)
  );
  ok(
    "the request must be open",
    /invalid_wanted_request/.test(listings)
  );
  ok(
    "the answer notification is deduped",
    /dedupe_key: `wanted_answer:/.test(listings)
  );
  ok(
    "answer bookkeeping can never fail the seller's submission",
    /Non-fatal by construction[\s\S]{0,1200}catch \(e\)/.test(listings)
  );
}

console.log(`wanted: ${n} assertions passed`);
