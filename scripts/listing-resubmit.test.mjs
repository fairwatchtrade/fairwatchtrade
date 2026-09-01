/* Resubmitting a returned listing corrects the same watch.

   Run: node --experimental-strip-types scripts/listing-resubmit.test.mjs

   THE DEFECT THIS PINS. Publishing INSERTS, and an insert mints a fresh
   public_code and a fresh physical_watch_id. Sending a watch the founder handed
   back down that road puts a SECOND listing on the site for an object already
   on it — which is exactly how two Rolex Datejusts, same reference, same style
   number, byte-identical description, came to exist at two different prices.

   Guards:
     · the listing is derived from the DRAFT binding, never named by the client;
     · ownership is established before a trusted-client write;
     · the watch columns come from the one shared mapping creation also uses;
     · the write is conditional, so a founder adjudicating mid-flight wins;
     · the status transition belongs to the governed function, not to this route;
     · triage still runs, so a standing founder decision is not bypassed. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let pass = 0;
const ok = (label, cond) => {
  assert.ok(cond, label);
  pass++;
};
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const route = read("app/api/listings/resubmit/route.ts");
const create = read("app/api/listings/route.ts");
const mapper = read("lib/listingWriteColumns.ts");

/* ── 1 · The client never names the watch ──────────────────────────────── */
{
  ok("the request carries a draft id", /body\.draftId/.test(route));
  ok(
    "and the listing is read off the draft binding",
    route.includes("draft.listing_id") || /listing_id as string \| null/.test(route)
  );
  ok(
    "a draft with no binding is refused rather than quietly creating one",
    /not_a_returned_listing/.test(route)
  );
  ok(
    "the draft is read through the seller's own session, so RLS scopes it",
    /supabase\s*\n?\s*\.from\("listing_drafts"\)/.test(route)
  );
}

/* ── 2 · Ownership before a trusted write ──────────────────────────────── */
{
  ok(
    "the route establishes ownership itself",
    /listing\.seller_id !== user\.id/.test(route) && /not_allowed/.test(route)
  );
  ok(
    "and says why it must, because the write carries no RLS",
    /carries no RLS of its own/.test(route)
  );
  ok(
    "only a listing the seller may still change is correctable",
    /CORRECTABLE = \["draft", "rejected"\]/.test(route)
  );
}

/* ── 3 · One mapping, not two ──────────────────────────────────────────── */
{
  ok("resubmit uses the shared column mapping", /listingWatchColumns\(/.test(route));
  ok("and so does creation", /listingWatchColumns\(/.test(create));
  ok(
    "neither writer re-implements the column list inline",
    !/asking_price_raw:/.test(route) && !/asking_price_raw:/.test(create)
  );
  ok(
    "money is parsed through the same governed contract in both",
    /resolveAskingMoney\(/.test(route) && /resolveAskingMoney\(/.test(create)
  );
  ok(
    "and the mapping owns neither identity column",
    !/public_code:/.test(mapper) && !/physical_watch_id:/.test(mapper)
  );
}

/* ── 4 · Identity survives, because UPDATE cannot re-mint it ───────────── */
{
  ok("resubmit updates rather than inserts", /\.update\(/.test(route) && !/\.insert\(/.test(route));
  ok(
    "the mapping records why that preserves the object",
    /DEFAULT, which does not fire on\s+UPDATE/.test(mapper)
  );
  ok(
    "canonical identity is re-resolved from the reference the seller submitted",
    /resolveCanonicalForPersistence\(/.test(route)
  );
  ok(
    "and the browser's canonical id is corroboration only",
    /never taken\s*\n?\s*from the browser/.test(route)
  );
}

/* ── 5 · The founder wins a race, as everywhere else ───────────────────── */
{
  ok(
    "the update is conditional on the status it read",
    /\.in\("status", \[\.\.\.CORRECTABLE\]\)/.test(route)
  );
  ok(
    "and zero rows changed is reported rather than assumed successful",
    /This listing changed while you were working on it/.test(route)
  );
  ok("the seller is also scoped into the write", /\.eq\("seller_id", user\.id\)/.test(route));
}

/* ── 6 · Transitions and gates stay where they live ────────────────────── */
{
  ok(
    "the status transition belongs to the governed function",
    /submit_listing_for_review/.test(route)
  );
  ok(
    "this route never writes the status itself",
    !/status: "pending_review"/.test(route)
  );
  ok(
    "a failed transition says the work was saved, not lost",
    /savedButNotSubmitted/.test(route)
  );
  ok("the ordinary triage seam still runs", /runReviewTriageForListing\(/.test(route));
  ok(
    "so a standing founder decision is not bypassed by resubmitting",
    /outstanding founder\s*\n?\s*decision/.test(route)
  );
  ok(
    "and the draft is closed so a corrected watch leaves Saved Listings",
    /listing_draft_mark_published/.test(route)
  );
}

/* ── 7 · The wizard sends it down the right road ───────────────────────── */
{
  const review = read("components/ReviewStep.tsx");
  ok(
    "a correcting draft posts to resubmit",
    /correcting \? "\/api\/listings\/resubmit" : "\/api\/listings"/.test(review)
  );
  /* v7.98 — the draft id now rides BOTH paths, not only when this client
     believes it is correcting. That is not a weakening of "only the draft id
     as its claim": the point of that rule was that the client never names a
     LISTING, and it still never does. What changed is that the create path
     also names its draft, because the server's duplicate-mint refusal can
     only check a binding it has been told about — and the case that matters
     is exactly the one where this client is wrong about its own mode. Both
     halves are asserted below, so the guarantee is stronger, not looser. */
  ok(
    "the draft id rides both paths, so the server can always check the binding",
    /^\s*draftId: serverDraftId,\s*$/m.test(review)
  );
  /* Scoped to the REQUEST BODY, not the file. A first pass at this asserted
     over the whole source and tripped on `onPublished?: (listingId: string)`
     — a type annotation, not a claim. What matters is what is put on the
     wire. */
  const requestBody = review.slice(
    review.indexOf("body: JSON.stringify({"),
    review.indexOf("credentials:") > 0 ? review.indexOf("credentials:") : review.indexOf("body: JSON.stringify({") + 3000
  );
  ok(
    "and the request body still names no listing — the claim is the draft alone",
    requestBody.length > 100 &&
      !/listingId:/.test(requestBody) &&
      !/listing_id:/.test(requestBody)
  );
  ok(
    "a correcting draft with no id refuses rather than creating a duplicate",
    /correcting && !serverDraftId/.test(review)
  );
}

console.log(`listing-resubmit: ${pass} assertions PASS`);
