/* Robots Readiness SEO Foundation — GRS-005 / GRS-006 / GRS-007
   (route metadata · canonicalization · production sitemap · route policy)

   Run: node scripts/robots-readiness-seo-foundation.test.mjs

   Two layers:
     1. the pure policy in lib/seo/ executed directly — locked copy,
        canonical rules, listing lifecycle indexability, dealer-vs-individual
        seller indexing, sitemap membership;
     2. source pins on the routes that consume it — every governed page
        declares through the one source, noindex surfaces are noindex,
        returnTo behaviour is preserved, robots stays closed and its stale
        /sell note is gone.

   Robots-lift is NOT asserted anywhere here; the whole site stays closed. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AUTH_ROUTE_TITLES,
  CANONICAL_ORIGIN,
  INDEXABLE_LISTING_STATUSES,
  PUBLIC_STATIC_PATHS,
  STATIC_ROUTE_COPY,
  authRouteMetadata,
  canonicalUrl,
  dealerProfileMetadata,
  homeMetadata,
  individualSellerMetadata,
  listingDescription,
  listingIsIndexable,
  listingMetadata,
  listingTitle,
  privateRouteMetadata,
  staticRouteMetadata,
  unknownSellerMetadata,
  vaultGalaxyMetadata,
} from "../lib/seo/routeMetadata.ts";
import { SITEMAP_LISTING_CEILING, buildSitemapEntries } from "../lib/seo/sitemap.ts";
import { SITE_URL } from "../lib/discovery/publicDiscovery.ts";

let n = 0;
const ok = (name, cond) => { assert.ok(cond, name); n += 1; };
const eq = (name, a, b) => { assert.equal(a, b, name); n += 1; };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const O = "https://www.fairwatchtrade.com";

/* ── 1 · origin and canonical composition ── */
eq("canonical origin is the serving www host", CANONICAL_ORIGIN, O);
eq("canonical origin equals the discovery SITE_URL (one identity)", CANONICAL_ORIGIN, SITE_URL);
eq("root canonical", canonicalUrl("/"), `${O}/`);
eq("clean path", canonicalUrl("/browse"), `${O}/browse`);
eq("query string is navigation, not identity", canonicalUrl("/listings/abc?returnTo=/browse%3Fbrand%3DX"), `${O}/listings/abc`);
eq("fragment stripped", canonicalUrl("/faq#payments"), `${O}/faq`);
eq("trailing slash normalized", canonicalUrl("/vault/"), `${O}/vault`);
assert.throws(() => canonicalUrl("browse"), /absolute and internal/); n += 1;
assert.throws(() => canonicalUrl("https://evil.example/"), /absolute and internal/); n += 1;

/* ── 2 · INDEX + SITEMAP static matrix, locked copy ── */
/* v8.33 added /what-fairwatchtrade-can-do through the policy source — the
   designed path for a new public page (add the copy, it joins the sitemap). */
const EXPECTED_STATIC = ["/", "/browse", "/vault", "/sell", "/watch-dna", "/about", "/what-fairwatchtrade-can-do", "/faq", "/contact", "/terms", "/privacy"];
assert.deepEqual([...PUBLIC_STATIC_PATHS], EXPECTED_STATIC, "the indexable static set is exactly the locked route policy"); n += 1;

const LOCKED = {
  "/browse": ["Browse Watches | FairWatchTrade", "Browse current FairWatchTrade watch listings with collector-focused search, filters, and reference-aware discovery."],
  "/vault": ["The Vault | FairWatchTrade", "Explore FairWatchTrade’s collector-structured watch reference library by brand, collection, family, variant, and reference."],
  "/sell": ["Sell a Watch | FairWatchTrade", "Create a structured FairWatchTrade listing through Curation, Photos, Details, Description, and Review."],
  "/watch-dna": ["Watch DNA | FairWatchTrade", "Explore your watch preferences with FairWatchTrade’s Watch DNA experience."],
  "/about": ["About FairWatchTrade", "Learn what FairWatchTrade is building for watch collectors, occasional sellers, and dealers."],
  "/what-fairwatchtrade-can-do": ["What Can FairWatchTrade Do For Me? | FairWatchTrade", "Choose what you came to do, and see what FairWatchTrade can actually help with today — including where it deliberately stops and what isn’t available yet."],
  "/faq": ["FairWatchTrade FAQ", "Answers about browsing, buying, selling, listings, payments, privacy, and how FairWatchTrade works."],
  "/contact": ["Contact FairWatchTrade", "Contact FairWatchTrade for support and questions about the marketplace."],
  "/terms": ["Terms | FairWatchTrade", "FairWatchTrade marketplace terms and conditions."],
  "/privacy": ["Privacy | FairWatchTrade", "FairWatchTrade privacy policy and information about how personal data is handled."],
};
for (const [path, [title, description]] of Object.entries(LOCKED)) {
  const m = staticRouteMetadata(path);
  eq(`${path} title is the locked string`, m.title, title);
  eq(`${path} description is the locked string`, m.description, description);
  eq(`${path} canonical is the clean absolute URL`, m.alternates.canonical, `${O}${path}`);
  ok(`${path} is index, follow`, m.robots.index === true && m.robots.follow === true);
  eq(`${path} copy table matches helper`, STATIC_ROUTE_COPY[path].title, title);
}
assert.throws(() => staticRouteMetadata("/admin"), /not a locked public route/); n += 1;

const home = homeMetadata();
eq("homepage canonical is the root", home.alternates.canonical, `${O}/`);
ok("homepage declares no title/description here (root layout copy preserved)", home.title === undefined && home.description === undefined);
ok("homepage is index, follow", home.robots.index === true && home.robots.follow === true);

/* ── 3 · Vault duplicate: canonical, not hidden, not in sitemap ── */
const galaxy = vaultGalaxyMetadata();
eq("/vault/galaxy declares /vault as its canonical", galaxy.alternates.canonical, `${O}/vault`);
eq("/vault/galaxy carries the Vault title", galaxy.title, "The Vault | FairWatchTrade");
ok("/vault/galaxy is NOT noindexed (consolidated, not hidden)", galaxy.robots === undefined);
ok("/vault/galaxy is not in the static sitemap set", !PUBLIC_STATIC_PATHS.includes("/vault/galaxy"));

/* ── 4 · auth doors: noindex, links followable, clean canonical ── */
eq("login title", AUTH_ROUTE_TITLES["/login"], "Sign In | FairWatchTrade");
eq("signup title", AUTH_ROUTE_TITLES["/signup"], "Create an Account | FairWatchTrade");
eq("forgot-password title", AUTH_ROUTE_TITLES["/forgot-password"], "Reset Password | FairWatchTrade");
for (const path of Object.keys(AUTH_ROUTE_TITLES)) {
  const m = authRouteMetadata(path);
  ok(`${path} is noindex with links followable`, m.robots.index === false && m.robots.follow === true);
  eq(`${path} canonical is the clean door`, m.alternates.canonical, `${O}${path}`);
  ok(`${path} invents no description`, m.description === undefined);
}

/* ── 5 · private surfaces ── */
const priv = privateRouteMetadata();
ok("private surface is noindex, nofollow", priv.robots.index === false && priv.robots.follow === false);
ok("private surface declares no canonical", priv.alternates === undefined);
eq("private surface may carry a human title", privateRouteMetadata("Tax Time").title, "Tax Time");

/* ── 6 · listing metadata: composition from own fields only ── */
const base = { id: "11111111-1111-4111-8111-111111111111", status: "published", brand: "Parmigiani Fleurier", model: "Tonda PF Micro-Rotor", reference: "PFC914-1020001-100182", public_code: "FWT-0042" };
eq("brand/model/reference title", listingTitle(base), "Parmigiani Fleurier Tonda PF Micro-Rotor · Ref. PFC914-1020001-100182 | FairWatchTrade");
eq("missing reference → no suffix, no placeholder", listingTitle({ ...base, reference: "" }), "Parmigiani Fleurier Tonda PF Micro-Rotor | FairWatchTrade");
eq("null reference → no suffix", listingTitle({ ...base, reference: null }), "Parmigiani Fleurier Tonda PF Micro-Rotor | FairWatchTrade");
eq("missing model → brand and reference only", listingTitle({ ...base, model: null }), "Parmigiani Fleurier · Ref. PFC914-1020001-100182 | FairWatchTrade");
eq("missing brand → model carries", listingTitle({ ...base, brand: "  " }), "Tonda PF Micro-Rotor · Ref. PFC914-1020001-100182 | FairWatchTrade");
eq("minimal fallback title uses the listing code", listingTitle({ ...base, brand: null, model: null, reference: null }), "Watch Listing FWT-0042 | FairWatchTrade");
eq("fallback without a code still invents nothing", listingTitle({ ...base, brand: null, model: null, reference: null, public_code: null }), "Watch Listing | FairWatchTrade");
eq("description with brand/model", listingDescription(base), "View FairWatchTrade listing FWT-0042 for Parmigiani Fleurier Tonda PF Micro-Rotor.");
eq("description without brand/model", listingDescription({ ...base, brand: null, model: "" }), "View FairWatchTrade listing FWT-0042.");
eq("description never carries the reference", listingDescription(base).includes("PFC914"), false);
const published = listingMetadata(base, base.id);
ok("published listing is index, follow", published.robots.index === true && published.robots.follow === true);
eq("published listing canonical is the clean /listings/[id]", published.alternates.canonical, `${O}/listings/${base.id}`);
for (const claim of [/verified/i, /authenticated/i, /certified/i, /guarantee/i]) {
  ok(`published metadata makes no "${claim.source}" claim`, !claim.test(published.title) && !claim.test(published.description));
}

/* ── 6b · listing lifecycle indexability ── */
assert.deepEqual([...INDEXABLE_LISTING_STATUSES], ["published"], "published is the only indexable state"); n += 1;
ok("published is indexable", listingIsIndexable("published"));
for (const status of ["reserved", "private_active", "removed", "draft", "pending_review", "rejected", "", null, undefined, "PUBLISHED"]) {
  ok(`${String(status)} is not indexable`, !listingIsIndexable(status));
  const m = listingMetadata({ ...base, status }, base.id);
  ok(`published → ${String(status)} emits noindex on the page`, m.robots.index === false && m.robots.follow === false);
  eq(`${String(status)} keeps the clean canonical`, m.alternates.canonical, `${O}/listings/${base.id}`);
  eq(`${String(status)} title is the listing-code fallback only`, m.title, "Watch Listing FWT-0042 | FairWatchTrade");
  ok(`${String(status)} leaks no brand/model/reference into metadata`, !JSON.stringify(m).includes("Parmigiani") && !JSON.stringify(m).includes("PFC914"));
  ok(`${String(status)} emits no description`, m.description === undefined);
}
const gone = listingMetadata(null, "nope");
ok("unknown/invisible listing is a neutral noindex", gone.robots.index === false && gone.alternates === undefined && gone.title === "Listing | FairWatchTrade");

/* ── 7 · seller indexing: dealer row vs ordinary individual ── */
const dealer = dealerProfileMetadata({ slug: "the-collector-identity", business_name: "The Collector Identity" });
eq("dealer title", dealer.title, "The Collector Identity | FairWatchTrade");
eq("dealer description", dealer.description, "View the FairWatchTrade seller profile for The Collector Identity.");
eq("dealer canonical is the existing slug route", dealer.alternates.canonical, `${O}/sellers/the-collector-identity`);
ok("dealer profile is index, follow", dealer.robots.index === true && dealer.robots.follow === true);
const uuid = "22222222-2222-4222-8222-222222222222";
const person = individualSellerMetadata(uuid);
ok("individual seller is noindex, nofollow", person.robots.index === false && person.robots.follow === false);
eq("individual seller keeps the clean current URL as canonical", person.alternates.canonical, `${O}/sellers/${uuid}`);
eq("individual seller title carries no name", person.title, "Seller Profile | FairWatchTrade");
ok("individual seller gets no crawler-oriented description", person.description === undefined);
const unknown = unknownSellerMetadata();
ok("unknown seller is noindex with no canonical", unknown.robots.index === false && unknown.alternates === undefined);

/* ── 8 · sitemap membership ── */
const rows = [
  { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", status: "published", updated_at: "2026-09-01T12:00:00.000Z" },
  { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", status: "published", updated_at: "not a date" },
  { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", status: "reserved", updated_at: "2026-09-01T12:00:00.000Z" },
  { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", status: "private_active", updated_at: null },
  { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", status: "removed", updated_at: null },
  { id: "ffffffff-ffff-4fff-8fff-ffffffffffff", status: "draft", updated_at: null },
  { id: "99999999-9999-4999-8999-999999999999", status: "pending_review", updated_at: null },
  { id: "88888888-8888-4888-8888-888888888888", status: "rejected", updated_at: null },
];
const dealers = [{ slug: "the-collector-identity" }, { slug: "william-mynatt" }, { slug: "william-mynatt" }, { slug: "" }, { slug: null }];
const entries = buildSitemapEntries({ listings: rows, dealers });
const urls = entries.map((e) => e.url);
for (const path of EXPECTED_STATIC) ok(`sitemap includes static ${path}`, urls.includes(canonicalUrl(path)));
ok("sitemap includes the published listing", urls.includes(`${O}/listings/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`));
ok("published listing carries its trigger-maintained lastModified", entries.find((e) => e.url.endsWith("aaaaaaaaaaaa")).lastModified instanceof Date);
ok("an unparseable timestamp yields no lastModified rather than an invented one", entries.find((e) => e.url.endsWith("bbbbbbbbbbbb")).lastModified === undefined);
for (const s of ["cccccccc", "dddddddd", "eeeeeeee", "ffffffff", "99999999", "88888888"]) {
  ok(`non-public listing ${s}… is excluded`, !urls.some((u) => u.includes(s)));
}
ok("governed dealer profiles are included", urls.includes(`${O}/sellers/the-collector-identity`) && urls.includes(`${O}/sellers/william-mynatt`));
eq("duplicate dealer slug appears once", urls.filter((u) => u.endsWith("/sellers/william-mynatt")).length, 1);
ok("individual sellers (no slug) never enter", !urls.some((u) => /\/sellers\/[0-9a-f-]{36}$/.test(u)) && urls.filter((u) => u.includes("/sellers/")).length === 2);
ok("dealer entries carry no invented lastModified", entries.filter((e) => e.url.includes("/sellers/")).every((e) => e.lastModified === undefined));
ok("static entries carry no invented lastModified", entries.slice(0, EXPECTED_STATIC.length).every((e) => e.lastModified === undefined));
ok("no /vault/galaxy in sitemap", !urls.includes(`${O}/vault/galaxy`));
ok("no query-string variants", urls.every((u) => !u.includes("?")));
for (const excluded of ["/login", "/signup", "/forgot-password", "/reset-password", "/account", "/account/settings", "/catalogue", "/wanted", "/sell/mobile", "/sell/continue", "/admin", "/internal", "/api", "/dashboard", "/tracking"]) {
  ok(`${excluded} is excluded from sitemap`, !urls.some((u) => u === `${O}${excluded}` || u.startsWith(`${O}${excluded}/`)));
}
ok("every entry is on the canonical origin", urls.every((u) => u.startsWith(`${O}/`)));
ok("sitemap ceiling is sane (under the 50,000 protocol limit)", SITEMAP_LISTING_CEILING > 0 && SITEMAP_LISTING_CEILING <= 50000);
eq("empty reads still yield the static set", buildSitemapEntries({ listings: [], dealers: [] }).length, EXPECTED_STATIC.length);

/* ── 9 · source pins: the routes consume the one policy ── */
const pin = (file, path) => ok(`${file} declares through staticRouteMetadata("${path}")`, read(file).includes(`staticRouteMetadata("${path}")`));
pin("app/browse/page.tsx", "/browse");
pin("app/vault/page.tsx", "/vault");
pin("app/sell/(entry)/layout.tsx", "/sell");
pin("app/watch-dna/page.tsx", "/watch-dna");
pin("app/about/page.tsx", "/about");
pin("app/faq/page.tsx", "/faq");
pin("app/contact/page.tsx", "/contact");
pin("app/terms/page.tsx", "/terms");
pin("app/privacy/page.tsx", "/privacy");
ok("app/page.tsx declares the home canonical", read("app/page.tsx").includes("homeMetadata()"));
ok("app/vault/galaxy/page.tsx declares the Vault canonical", read("app/vault/galaxy/page.tsx").includes("vaultGalaxyMetadata()"));
ok("/sell entry page still lives in the route group the layout scopes", read("app/sell/(entry)/page.tsx").startsWith('"use client"'));
ok("no plain app/sell/layout.tsx exists to leak /sell metadata into noindex children",
  (() => { try { readFileSync(new URL("../app/sell/layout.tsx", import.meta.url)); return false; } catch { return true; } })());
for (const [file, path] of [["app/login/layout.tsx", "/login"], ["app/signup/layout.tsx", "/signup"], ["app/forgot-password/layout.tsx", "/forgot-password"]]) {
  ok(`${file} declares authRouteMetadata("${path}")`, read(file).includes(`authRouteMetadata("${path}")`));
}
for (const file of ["app/admin/layout.tsx", "app/account/layout.tsx", "app/internal/layout.tsx", "app/reset-password/layout.tsx", "app/catalogue/page.tsx", "app/wanted/page.tsx", "app/sell/mobile/page.tsx", "app/listings/[id]/purchase-request/page.tsx"]) {
  ok(`${file} is noindex via privateRouteMetadata`, read(file).includes("privateRouteMetadata("));
}
ok("/sell/continue keeps its own noindex", read("app/sell/continue/[token]/page.tsx").includes("robots: { index: false, follow: false }"));
const contact = read("app/contact/page.tsx");
ok("/contact blanket noindex is withdrawn", !contact.includes("index: false"));

const listingPage = read("app/listings/[id]/page.tsx");
ok("listing page exports generateMetadata", listingPage.includes("export async function generateMetadata("));
ok("listing page metadata comes from listingMetadata()", listingPage.includes("return listingMetadata("));
ok("listing generateMetadata never reads searchParams (returnTo cannot reach the canonical)",
  !/generateMetadata\([\s\S]*?searchParams[\s\S]*?\n\}\n\nexport default/.test(listingPage));
ok("listing page still honours returnTo for the human", listingPage.includes("safeBrowseReturn(returnTo)"));
ok("listing page still serves reserved/private rows to authorized viewers (no SEO 404)",
  listingPage.includes('data.status !== "reserved"') && listingPage.includes('data.status !== "private_active"'));
ok("listing metadata reads only the fields it composes from", listingPage.includes('.select("id, status, brand, model, reference, public_code")'));

const sellerPage = read("app/sellers/[id]/page.tsx");
ok("seller page exports generateMetadata", sellerPage.includes("export async function generateMetadata("));
ok("seller metadata branches on the governed dealer row", sellerPage.includes("dealerProfileMetadata(") && sellerPage.includes("individualSellerMetadata(") && sellerPage.includes("unknownSellerMetadata()"));
ok("dealer truth is resolved from dealer_profiles by one shared function", sellerPage.includes("async function resolveDealer(") && (sellerPage.match(/resolveDealer\(supabase, id\)/g) || []).length === 2);
ok("seller page keeps the uuid → slug redirect", sellerPage.includes("if (id !== dealer.slug) redirect(`/sellers/${dealer.slug}`);"));
ok("no new role, flag or seller type was introduced", !/is_dealer|seller_type|dealer_flag/.test(sellerPage));

const rootLayout = read("app/layout.tsx");
ok("root layout sets metadataBase on the canonical origin", rootLayout.includes("metadataBase: new URL(CANONICAL_ORIGIN)"));
ok("root layout declares NO canonical (it would be inherited by every route)", !rootLayout.includes("alternates"));
ok("root layout keeps the governed specialty title", rootLayout.includes('title: "FairWatchTrade — Independent & Boutique Watchmakers"'));

const sitemapRoute = read("app/sitemap.ts");
ok("sitemap route is always current", sitemapRoute.includes('export const dynamic = "force-dynamic"'));
ok("sitemap reads through the anonymous client, never the session client", sitemapRoute.includes("createDiscoveryClient()") && !sitemapRoute.includes("@/lib/supabase/server"));
ok("sitemap listing read is published-only", sitemapRoute.includes('.eq("status", "published")'));
ok("sitemap membership is decided by the pure composer", sitemapRoute.includes("buildSitemapEntries({ listings, dealers })"));

/* ── 10 · robots stays closed; the stale /sell note is gone ── */
const robots = read("app/robots.ts");
ok("robots still disallows everything", /userAgent:\s*"\*"/.test(robots) && /disallow:\s*"\/"/.test(robots));
ok("robots carries no allow rules", !/\ballow:/.test(robots));
ok("robots carries no sitemap reference yet (discovery stays a lift-flight decision)", !/sitemap:/.test(robots));
ok("stale launch note no longer documents /sell as disallowed", !robots.includes("/sell disallowed"));
ok("robots records that /sell is indexable under the route policy", robots.includes("/sell is a public entry destination"));
ok("robots points at the policy home", robots.includes("lib/seo/README.md"));

/* ── 11 · the README beside the machinery ── */
const readme = read("lib/seo/README.md");
ok("README leads with the misconception it kills", readme.includes("misconception") && readme.includes("robots.txt decides what gets indexed"));
ok("README records the root-canonical trap", readme.includes("root layout must never declare a canonical"));
ok("README records what is deliberately not built", readme.includes("deliberately NOT built") && readme.includes("No robots lift"));

console.log(`robots-readiness-seo-foundation: ${n} assertions PASS`);
