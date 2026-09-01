/* ════════════════════════════════════════════════════════════════════════
   RETURNED LISTING — CORRECTION BINDING, AND THE REFUSAL BEHIND IT

   The defect this pins was human-proven: a founder returned a listing, the
   seller corrected it, and a SECOND listing appeared for a watch already on
   the site — new public code, new physical watch identity, same object.

   Where it actually came from: listing_drafts.listing_id is the binding, and
   the DESKTOP honoured it (adoptRow → correctsListingId → /api/listings/
   resubmit). The PHONE wizard never read the column and posted to
   /api/listings unconditionally. The create route, meanwhile, had no opinion
   about draft binding at all — so nothing between the seller's thumb and the
   INSERT was in a position to say no.

   Two halves, and the second only means something because of the first:

     PART A pins the real source — which columns carry the binding, which
     client reads it, which endpoint each chooses, and that the server refuses
     independently of all of them.

     PART B runs the lifecycle. Its inputs are NOT hand-written: whether each
     client honours the binding, and whether the server refuses, are READ OUT
     OF THE SOURCE by Part A. Remove the refusal or the phone's binding read
     and the simulation changes answer, so this suite cannot drift into
     agreeing with itself.

   NOT proven here: that Postgres inserted no row. That is the production
   walk, and it is Jason's. This proves every decision that precedes it.

   Run: node scripts/returned-listing-correction.test.mjs
   ════════════════════════════════════════════════════════════════════════ */

import { readFileSync } from "node:fs";
import assert from "node:assert";

let n = 0;
const ok = (label, cond) => {
  n += 1;
  assert.ok(cond, label);
};

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const createRoute = read("app/api/listings/route.ts");
const resubmitRoute = read("app/api/listings/resubmit/route.ts");
const review = read("components/ReviewStep.tsx");
const phone = read("components/MobileWizard.tsx");
const sellFlow = read("components/SellFlow.tsx");
const draftLib = read("lib/listingDraft.ts");

/* ── PART A — the source really is shaped the way Part B assumes ───────── */

/* A1 · the binding is a COLUMN, and every read of a draft row carries it */
ok(
  "the draft row select carries listing_id",
  /const ROW_COLS\s*=\s*\n?\s*"[^"]*listing_id[^"]*"/.test(draftLib)
);
ok(
  "the recoverable-drafts select carries listing_id too",
  /const LIST_COLS\s*=\s*\n?\s*"[^"]*listing_id[^"]*"/.test(draftLib)
);

/* A2 · the desktop turns that column into correction mode */
ok(
  "adoptRow reads the binding off the row, not off content",
  /const corrects = row\.listing_id \?\? null;/.test(sellFlow) &&
    /setCorrectsListingId\(corrects\)/.test(sellFlow)
);
ok(
  "every desktop resume path goes through adoptRow",
  (sellFlow.match(/adoptRow\(row\)/g) || []).length >= 3
);

/* A3 · Review branches on the binding and names its draft on BOTH paths */
const reviewHonoursBinding =
  /const correcting = correctsListingId != null;/.test(review) &&
  /const endpoint = correcting \? "\/api\/listings\/resubmit" : "\/api\/listings";/.test(review);
ok("Review chooses the endpoint from the binding", reviewHonoursBinding);
ok(
  "Review sends draftId unconditionally, not only when it believes it is correcting",
  /^\s*draftId: serverDraftId,\s*$/m.test(review) &&
    !/\.\.\.\(correcting \? \{ draftId: serverDraftId \} : \{\}\)/.test(review)
);

/* A4 · the phone — the surface the defect actually lived on */
const phoneHonoursBinding =
  /boundListingId = bindingRow\?\.listing_id \?\? null;/.test(phone) &&
  /const correcting = boundListingId !== null;/.test(phone) &&
  /const endpoint = correcting \? "\/api\/listings\/resubmit" : "\/api\/listings";/.test(phone);
ok("the phone reads the binding at submit", phoneHonoursBinding);
ok(
  "the phone no longer posts to the create route unconditionally",
  !/await fetch\("\/api\/listings", \{/.test(phone)
);
ok("the phone names its draft", /draftId: submittingDraftId,/.test(phone));

/* A5 · THE REFUSAL — the half that does not trust any of the above */
const serverRefuses =
  /error: "draft_bound"/.test(createRoute) &&
  /if \(sourceDraft\.listing_id\)/.test(createRoute) &&
  /\.from\("listing_drafts"\)/.test(createRoute);
ok("the create route refuses a bound draft", serverRefuses);
ok(
  "the refusal reads the binding server-side rather than accepting a claim",
  /\.select\("id, listing_id"\)/.test(createRoute)
);
ok(
  "a named draft that cannot be read is refused, not waved through",
  /error: "draft_not_found"/.test(createRoute)
);
ok(
  "the refusal is a conflict, not a validation nicety",
  /error: "draft_bound"[\s\S]{0,400}status: 409/.test(createRoute)
);

/* A6 · the correction path preserves identity by construction */
ok(
  "resubmit derives the listing from the draft binding, never from the body",
  /\.select\("id, listing_id"\)/.test(resubmitRoute) &&
    /const listingId = \(draft\.listing_id as string \| null\) \?\? null;/.test(resubmitRoute)
);
ok(
  "resubmit UPDATEs rather than inserting, so no new code is minted",
  !/\.from\("listings"\)\s*\n?\s*\.insert\(/.test(resubmitRoute)
);
ok(
  "the review transition is delegated, so founder triage still governs",
  /submit_listing_for_review/.test(resubmitRoute)
);

/* ── PART B — the lifecycle, driven by what Part A read ────────────────── */

const world = () => ({
  listings: [{ id: "L1", publicCode: "P10001", watchId: "W1", status: "rejected" }],
  drafts: {
    unbound: { id: "D-new", listing_id: null },
    bound: { id: "D-ret", listing_id: "L1" },
  },
  minted: [],
});

/* The server, behaving exactly as the source says it does. */
function serverCreate(w, draftId) {
  if (serverRefuses && draftId) {
    const d = Object.values(w.drafts).find((x) => x.id === draftId);
    if (!d) return { refused: "draft_not_found" };
    if (d.listing_id) return { refused: "draft_bound" };
  }
  const l = {
    id: `L${w.listings.length + 1}`,
    publicCode: `P1000${w.listings.length + 1}`,
    watchId: `W${w.listings.length + 1}`,
    status: "pending_review",
  };
  w.listings.push(l);
  w.minted.push(l.id);
  return { created: l.id };
}

function serverResubmit(w, draftId) {
  const d = Object.values(w.drafts).find((x) => x.id === draftId);
  if (!d?.listing_id) return { refused: "not_bound" };
  const l = w.listings.find((x) => x.id === d.listing_id);
  l.status = "pending_review"; // identity untouched: no new code, no new watch
  return { updated: l.id };
}

/* The two clients, honouring the binding exactly as far as the source says. */
const desktop = (w, draft) => {
  const corrects = reviewHonoursBinding ? draft.listing_id : null;
  return corrects
    ? { endpoint: "resubmit", ...serverResubmit(w, draft.id) }
    : { endpoint: "create", ...serverCreate(w, draft.id) };
};
const mobile = (w, draft) => {
  const corrects = phoneHonoursBinding ? draft.listing_id : null;
  return corrects
    ? { endpoint: "resubmit", ...serverResubmit(w, draft.id) }
    : { endpoint: "create", ...serverCreate(w, draft.id) };
};

/* 1 — a new unbound draft still creates exactly one listing */
{
  const w = world();
  const r = desktop(w, w.drafts.unbound);
  ok("1 · unbound draft uses the create path", r.endpoint === "create");
  ok("1 · unbound draft creates one listing", w.minted.length === 1);
  ok("1 · and it is not refused", !r.refused);

  const w2 = world();
  const r2 = mobile(w2, w2.drafts.unbound);
  ok("6 · the phone's ordinary new-listing flow still works", r2.endpoint === "create" && w2.minted.length === 1);
}

/* 2 — a returned/bound draft corrects, on BOTH surfaces */
for (const [name, client] of [["desktop", desktop], ["phone", mobile]]) {
  const w = world();
  const r = client(w, w.drafts.bound);
  ok(`2 · ${name} enters correction mode for a bound draft`, r.endpoint === "resubmit");
  ok(`2 · ${name} never touches the create route`, r.endpoint !== "create");
  ok(`2 · ${name} mints nothing`, w.minted.length === 0);
  ok(`2 · ${name} updates the bound listing`, r.updated === "L1");
}

/* 3 — the server refuses even when the client is wrong */
{
  const w = world();
  const r = serverCreate(w, w.drafts.bound.id); // a client that ignored the binding
  ok("3 · the create route refuses a bound draft", r.refused === "draft_bound");
  ok("3 · no duplicate row is minted", w.minted.length === 0);
  ok("3 · only the original listing exists", w.listings.length === 1);
  ok("3 · no new public code is minted", w.listings.map((l) => l.publicCode).join() === "P10001");
}

/* 4 — identity survives the round trip */
{
  const w = world();
  const before = { ...w.listings[0] };
  desktop(w, w.drafts.bound);
  const after = w.listings[0];
  ok("4 · listing id unchanged", before.id === after.id);
  ok("4 · public FWT code unchanged", before.publicCode === after.publicCode);
  ok("4 · physical watch identity unchanged", before.watchId === after.watchId);
  ok("4 · and it returns to review", after.status === "pending_review");
  ok("4 · still exactly one listing", w.listings.length === 1);
}

/* 5 — reopening the same returned draft again stays bound */
{
  const w = world();
  desktop(w, w.drafts.bound);
  desktop(w, w.drafts.bound);
  mobile(w, w.drafts.bound);
  ok("5 · repeated correction creates no second listing", w.listings.length === 1);
  ok("5 · and mints nothing across three passes", w.minted.length === 0);
  ok("5 · the draft is still bound to the original", w.drafts.bound.listing_id === "L1");
}

console.log(`returned-listing-correction: ${n} checks passed`);
