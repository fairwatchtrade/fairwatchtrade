import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  resolveDisplayIdentityCandidates,
  usableIdentity,
  buyerIdentityLabel,
  BUYER_IDENTITY_FALLBACK,
  BUYER_IDENTITY_LOADING_LABEL,
  BUYER_IDENTITY_UNAVAILABLE_LABEL,
  SIGNED_IN_IDENTITY_FALLBACK,
} from "../lib/displayIdentityPrecedence.ts";

/* ── Purchase Request Buyer Identity Correction (2026-09-11) ────────────
   The governed chain (display_name → business_name → email), the four
   distinguishable client states, and source pins on every render site and
   route that must consume the chain rather than a private one.
   Run: node scripts/buyer-identity.test.mjs
   ─────────────────────────────────────────────────────────────────────── */

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
/** Source without block or line comments, so a pin on CODE never matches prose. */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");

test("normal resolved buyer identity: the personal display name wins", () => {
  assert.equal(resolveDisplayIdentityCandidates({ profileDisplayName: "Morgan L.", dealerBusinessName: "Shop", email: "a@x.test" }), "Morgan L.");
});

test("dealer / business identity applies when no personal name exists", () => {
  assert.equal(resolveDisplayIdentityCandidates({ profileDisplayName: null, dealerBusinessName: "The Collector Identity", email: "t@x.test" }), "The Collector Identity");
});

test("governed fallback path reaches the email only after name and business are absent", () => {
  assert.equal(resolveDisplayIdentityCandidates({ profileDisplayName: null, dealerBusinessName: null, email: "buyer.one@example.test" }), "buyer.one@example.test");
  assert.equal(resolveDisplayIdentityCandidates({ profileDisplayName: undefined, dealerBusinessName: "", email: "e@x.test" }), "e@x.test");
});

test("whitespace-only display name is absence, never a blank identity", () => {
  assert.equal(usableIdentity("   "), null);
  assert.equal(usableIdentity("\t\n"), null);
  assert.equal(usableIdentity("  Jo  "), "Jo");
  assert.equal(resolveDisplayIdentityCandidates({ profileDisplayName: "   ", dealerBusinessName: "  ", email: "w@x.test" }), "w@x.test");
  assert.equal(resolveDisplayIdentityCandidates({ profileDisplayName: "   ", dealerBusinessName: "   ", email: "   " }), null);
});

test("true no-identity fallback: null from the chain, and each surface's own last resort", () => {
  assert.equal(resolveDisplayIdentityCandidates({}), null);
  assert.equal(resolveDisplayIdentityCandidates({ profileDisplayName: null, dealerBusinessName: null, email: null }), null);
  assert.equal(BUYER_IDENTITY_FALLBACK, "FairWatchTrade Member");
  assert.equal(SIGNED_IN_IDENTITY_FALLBACK, "Collector");
  assert.equal(buyerIdentityLabel({ state: "absent" }), "FairWatchTrade Member");
});

test("loading and failed lookup are distinct from absence and from each other", () => {
  assert.equal(buyerIdentityLabel(undefined), BUYER_IDENTITY_LOADING_LABEL);
  assert.equal(buyerIdentityLabel({ state: "loading" }), BUYER_IDENTITY_LOADING_LABEL);
  assert.equal(buyerIdentityLabel({ state: "unavailable" }), BUYER_IDENTITY_UNAVAILABLE_LABEL);
  assert.equal(buyerIdentityLabel({ state: "resolved", name: "Morgan" }), "Morgan");
  const labels = new Set([buyerIdentityLabel(undefined), buyerIdentityLabel({ state: "unavailable" }), buyerIdentityLabel({ state: "absent" })]);
  assert.equal(labels.size, 3, "loading, unavailable and absent never share a label");
});

test("two distinct buyers in the same seller request list render distinctly", () => {
  const a = resolveDisplayIdentityCandidates({ profileDisplayName: null, dealerBusinessName: null, email: "one@x.test" });
  const b = resolveDisplayIdentityCandidates({ profileDisplayName: null, dealerBusinessName: null, email: "two@x.test" });
  const c = resolveDisplayIdentityCandidates({ profileDisplayName: "Three", dealerBusinessName: null, email: "three@x.test" });
  assert.equal(new Set([a, b, c]).size, 3);
  assert.notEqual(a, BUYER_IDENTITY_FALLBACK);
});

/* ── Source pins ───────────────────────────────────────────────────────── */

test("one chain: the signed-in resolver consumes the shared precedence; no second copy remains", () => {
  const s = read("lib/signedInDisplayIdentity.ts");
  assert.match(s, /resolveDisplayIdentityCandidates\(candidates\) \?\? SIGNED_IN_IDENTITY_FALLBACK/);
  assert.ok(!/for \(const candidate of \[profileDisplayName, dealerBusinessName, email\]\)/.test(s), "the loop lives in the shared module only");
  const b = read("lib/buyerDisplayIdentity.ts");
  assert.match(b, /import "server-only"/);
  assert.match(b, /resolveDisplayIdentityCandidates\(\{\s*profileDisplayName: p\?\.display_name \?\? null,\s*dealerBusinessName: businessById\.get\(id\) \?\? null,\s*email: p\?\.email \?\? null,\s*\}\)/);
  assert.match(b, /throw new Error\(`profiles read failed/, "a failed read throws; it is never absence");
  assert.ok(!/phone|strikes|notify_/.test(code("lib/buyerDisplayIdentity.ts")), "nothing beyond the governed identity is selected");
  assert.match(b, /select\("id, display_name, email"\)/);
});

test("the buyer-identity route answers only for buyers of the caller's own requests, and 503s on failure", () => {
  const r = read("app/api/buyer-identity/route.ts");
  assert.match(r, /\.from\("purchase_requests"\)\s*\.select\("buyer_id"\)\s*\.eq\("seller_id", user\.id\)\s*\.in\("buyer_id", requested\)/);
  assert.match(r, /if \(admitted\.length === 0\) return NextResponse\.json\(\{ ok: true, identities: \{\} \}\)/, "unadmitted ids are silently unanswered");
  assert.equal((r.match(/status: 503/g) ?? []).length, 3, "entitlement read, service client and resolution failures are all unavailable");
  assert.ok(!/export async function (POST|PUT|PATCH|DELETE)/.test(r), "read-only");
  assert.ok(!/snapshot|alter table|create table/i.test(r + read("lib/buyerDisplayIdentity.ts")), "no identity snapshot, no new truth store");
});

test("the Communications room keeps four states and every render site reads through one function", () => {
  const room = read("components/CommunicationsRoom.tsx");
  assert.match(room, /useState<Record<string, BuyerIdentityState>>\(\{\}\)/);
  assert.match(room, /fetch\(`\/api\/buyer-identity\?ids=\$\{encodeURIComponent\(missing\.join\(","\)\)\}`/);
  assert.match(room, /next\[id\] = name \? \{ state: "resolved", name \} : \{ state: "absent" \};/);
  assert.match(room, /Object\.fromEntries\(missing\.map\(\(id\) => \[id, \{ state: "unavailable" as const \}\]\)\)/, "a failed lookup is unavailable, not absent");
  assert.match(room, /return buyerIdentityLabel\(identities\[r\.buyer_id\]\);/);
  const roomCode = code("components/CommunicationsRoom.tsx");
  assert.ok(!/public_seller_profiles/.test(roomCode), "the room no longer walks its own truncated chain");
  assert.ok(!/"FairWatchTrade Member"/.test(roomCode), "the generic label is not hard-coded in the room; it comes from the governed last resort");
  // list row, requester field, note attribution, pane person all go through requesterName
  assert.ok((room.match(/requesterName\(/g) ?? []).length >= 4);
  assert.match(room, /: selected\s*\?\s*requesterName\(selected\.request\)/, "pane identity");
  assert.match(room, /\{requesterName\(selected\.request\)\} · Note with offer/, "note attribution");
});

test("correspondence identity: buyer counterparts walk the governed chain; seller counterparts are untouched; failure is unavailable", () => {
  const list = read("app/api/messages/route.ts");
  assert.match(list, /\.filter\(\(t\) => t\.participant_b_id === user\.id && t\.participant_a_id\)/, "buyer = participant_a when the caller is the seller");
  assert.match(list, /buyerNames = await resolveBuyerIdentities\(createServiceClient\(\), buyerCounterpartIds\);/);
  assert.match(list, /if \(buyerNames === null\) return BUYER_IDENTITY_UNAVAILABLE_LABEL;/);
  assert.match(list, /return publicName \|\| BUYER_IDENTITY_FALLBACK;/, "seller counterparts keep the public path");
  assert.match(list, /otherName: counterpartName\(t, otherId, otherId \? nameById\.get\(otherId\) : null\)/);
  assert.match(list, /public_seller_profiles/, "the public seller path still exists");
  const thread = read("app/api/messages/[threadId]/route.ts");
  assert.match(thread, /const buyerId = thread\.participant_b_id === user\.id \? thread\.participant_a_id : null;/);
  assert.match(thread, /buyerName = BUYER_IDENTITY_UNAVAILABLE_LABEL;/);
  assert.match(thread, /otherName: nameFor\(otherId\)/);
  assert.match(thread, /: nameFor\(m\.sender_id\)/);
  assert.ok(!/"FairWatchTrade Member"/.test(code("app/api/messages/route.ts") + code("app/api/messages/[threadId]/route.ts")), "no hard-coded generic in the routes");
  // thread model untouched
  assert.ok(!/transaction_id|thread_kind: "transaction"/.test(list + thread));
});

test("frozen neighbours: acceptance, Shopping Bag, Stripe and seller identity untouched by this correction", () => {
  const acc = read("app/api/purchase-requests/[id]/route.ts");
  assert.ok(!/displayIdentityPrecedence|buyerDisplayIdentity/.test(acc));
  const bag = read("lib/purchases/shoppingBag.ts");
  assert.match(bag, /public_seller_profiles/, "seller identity in the Bag keeps the public convention");
  assert.ok(!/buyerDisplayIdentity/.test(bag));
  const greeting = read("lib/catalogueGreetingIdentity.ts");
  assert.ok(!/displayIdentityPrecedence/.test(greeting), "the greeting resolver stays deliberately separate");
});
