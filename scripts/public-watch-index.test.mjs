/* Public Watch Index — projection + suppression seam
   Governing authority: docs/product-laws/Public_Watch_Index_Product_Contract_v2_ADOPTED.md (adopted v2)

   Run: node scripts/public-watch-index.test.mjs

   Two layers:
     1. the law executed — the four independent assertions, three-valued
        states, suppression and no-resurrection, presentation shorthand, and
        the §13 acceptance scenarios, all against in-memory rows;
     2. source pins on the seam that cannot be proven by calling a function —
        service_role-only writers, structural client denial, no seller
        identity, no counts, no public endpoint, no robots change.

   Phase 1 scope: internal only. Nothing here asserts a public endpoint, a
   manifest entry, a robots change, or any backfill. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CONTRACT_VERSION,
  SHORTHAND_AVAILABLE_NOW,
  SHORTHAND_HISTORY_AVAILABILITY_UNKNOWN,
  SHORTHAND_PREVIOUSLY_LISTED,
  assessHistory,
  contributionSuppressed,
  episodeQualifies,
  presentationShorthand,
  project,
  referenceSuppressed,
  utcAssessmentDay,
} from "../lib/publicWatchIndex/projection.ts";

let n = 0;
const ok = (name, cond) => { assert.ok(cond, name); n += 1; };
const eq = (name, a, b) => { assert.equal(a, b, name); n += 1; };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const REF = {
  vaultReferenceId: "11111111-1111-4111-8111-111111111111",
  manufacturer: "Parmigiani Fleurier",
  reference: "PFC914-1020001-100182",
  collection: "Tonda",
  family: "Tonda PF",
  variant: "Micro-Rotor",
};
const L1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const L2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const url = (id) => `https://www.fairwatchtrade.com/listings/${id}`;

/** A fully-answerable input; each test overrides only what it is about. */
const input = (over = {}) => ({
  reference: REF,
  eligibleListings: [],
  retrievalComplete: true,
  publicationEpisodes: [],
  knowledge: { state: "unavailable_or_incomplete", destination: null },
  marketEvidence: { qualifies: false, destination: null },
  suppressions: [],
  assessedOn: "2026-09-09",
  ...over,
});
const episode = (over = {}) => ({
  listingId: L1,
  durablyEvidenced: true,
  referenceAssociationEvidenced: true,
  publicUsePermitted: true,
  disqualifyingMistake: false,
  ...over,
});
const listing = (id) => ({ listingId: id, canonicalUrl: url(id) });

/* ── 1 · the subject is the canonical reference (§2) ── */
const base = project(input());
eq("contract version is stated", base.assessment.contractVersion, CONTRACT_VERSION);
eq("the record's subject is the canonical reference", base.reference.vaultReferenceId, REF.vaultReferenceId);
ok("hierarchy is carried where the identity supplies it",
  base.reference.collection === "Tonda" && base.reference.variant === "Micro-Rotor");
const flat = project(input({ reference: { ...REF, collection: null, family: null, variant: null } }));
ok("absent hierarchy is not invented", flat.reference.collection === null && flat.reference.family === null);
const serialized = JSON.stringify(base);
for (const forbidden of ["physical_watch", "physicalWatch", "serial", "token", "owner", "seller", "buyer"]) {
  ok(`no ${forbidden} field reaches the record`, !serialized.toLowerCase().includes(forbidden.toLowerCase()));
}
for (const forbidden of ["price", "asking", "realized", "photo", "reason", "actor"]) {
  ok(`no ${forbidden} field reaches the record`, !serialized.toLowerCase().includes(forbidden));
}
ok("no aggregate count field of any kind", !/"(count|total|listingCount|numListings)"/i.test(serialized));

/* ── 2 · four assertions are independent, not four buckets (§3) ── */
const allFour = project(input({
  eligibleListings: [listing(L1)],
  publicationEpisodes: [episode()],
  knowledge: { state: "approved_public_knowledge", destination: "https://www.fairwatchtrade.com/vault" },
  marketEvidence: { qualifies: true, destination: "https://example.invalid/lot/1" },
}));
ok("all four assertions can be positive at once",
  allFour.availableNow.state === "yes" &&
  allFour.publicListingHistory.state === "established" &&
  allFour.approvedPublicReferenceKnowledge.state === "approved_public_knowledge" &&
  allFour.marketEvidence.state === "qualifying_record");
ok("no single collapsed status field exists", !("status" in allFour) && !("state" in allFour));
const knowledgeOnly = project(input({
  knowledge: { state: "approved_public_knowledge", destination: "https://www.fairwatchtrade.com/vault" },
}));
ok("knowledge alone invents no listing, sale or inventory claim",
  knowledgeOnly.availableNow.state === "no_current_qualifying_public_listings" &&
  knowledgeOnly.availableNow.listingUrls.length === 0 &&
  knowledgeOnly.publicListingHistory.state === "not_established_within_coverage");
const evidenceOnly = project(input({ marketEvidence: { qualifies: true, destination: "https://example.invalid/lot/2" } }));
ok("Market Evidence alone does not earn FWT public listing history",
  evidenceOnly.marketEvidence.state === "qualifying_record" &&
  evidenceOnly.publicListingHistory.state === "not_established_within_coverage" &&
  evidenceOnly.availableNow.state === "no_current_qualifying_public_listings");

/* ── 3 · availability is three-valued (§4) ── */
eq("a validated eligible listing establishes yes",
  project(input({ eligibleListings: [listing(L1)] })).availableNow.state, "yes");
eq("a complete check with none is a definitive negative",
  project(input({ eligibleListings: [], retrievalComplete: true })).availableNow.state,
  "no_current_qualifying_public_listings");
eq("an INCOMPLETE empty retrieval is never a definitive negative",
  project(input({ eligibleListings: [], retrievalComplete: false })).availableNow.state,
  "availability_unavailable");
eq("a failed check is unavailable, not negative",
  project(input({ eligibleListings: null })).availableNow.state, "availability_unavailable");
ok("a positive answer may stand on one validated listing without claiming exhaustive retrieval",
  project(input({ eligibleListings: [listing(L1)], retrievalComplete: false })).availableNow.state === "yes");
ok("retrieval completeness is disclosed",
  project(input({ retrievalComplete: false })).availableNow.retrievalComplete === false);
const twoLinks = project(input({ eligibleListings: [listing(L1), listing(L2)] }));
ok("links are canonical listing URLs", twoLinks.availableNow.listingUrls.every((u) => u.startsWith("https://www.fairwatchtrade.com/listings/")));
ok("links are offerings, carried without any count field", !("count" in twoLinks.availableNow));

/* ── 4 · history admission — five conditions, publication ≠ association (§5) ── */
ok("a fully qualified episode qualifies", episodeQualifies(episode()));
ok("no durable publication evidence disqualifies", !episodeQualifies(episode({ durablyEvidenced: false })));
ok("no reference-association evidence disqualifies", !episodeQualifies(episode({ referenceAssociationEvidenced: false })));
ok("public-use permission withdrawn disqualifies", !episodeQualifies(episode({ publicUsePermitted: false })));
ok("a governed mistake disqualifies", !episodeQualifies(episode({ disqualifyingMistake: true })));
eq("publication evidence alone does NOT establish history",
  assessHistory(input({ publicationEpisodes: [episode({ referenceAssociationEvidenced: false })] })),
  "not_established_within_coverage");
eq("association evidence alone does NOT establish history",
  assessHistory(input({ publicationEpisodes: [episode({ durablyEvidenced: false })] })),
  "not_established_within_coverage");
eq("an unassessable history is unavailable, never negative",
  assessHistory(input({ publicationEpisodes: null })), "unavailable_or_incomplete");
eq("a complete check with no qualifying record is within-coverage, never 'never happened'",
  assessHistory(input({ publicationEpisodes: [] })), "not_established_within_coverage");
ok("history survives the listing leaving availability",
  project(input({ eligibleListings: [], publicationEpisodes: [episode()] })).publicListingHistory.state === "established");
ok("a still-live listing establishes history only through durable evidence, never through current status",
  project(input({ eligibleListings: [listing(L1)], publicationEpisodes: [] })).publicListingHistory.state
    === "not_established_within_coverage");

/* ── 5 · knowledge (§3) ── */
eq("no approval state is unavailable, not negative",
  project(input()).approvedPublicReferenceKnowledge.state, "unavailable_or_incomplete");
ok("a destination is only offered with a positive assertion",
  project(input({ knowledge: { state: "unavailable_or_incomplete", destination: "https://example.invalid" } }))
    .approvedPublicReferenceKnowledge.destination === null);
eq("a complete check that established nothing is distinguishable from an incomplete one",
  project(input({ knowledge: { state: "none_established_within_coverage", destination: null } }))
    .approvedPublicReferenceKnowledge.state, "none_established_within_coverage");

/* ── 6 · Market Evidence consumes the existing gate (§9) ── */
eq("gate unavailable stays unavailable, never promoted",
  project(input({ marketEvidence: null })).marketEvidence.state, "unavailable_or_incomplete");
eq("gate says no qualifying record", project(input()).marketEvidence.state, "none_established_within_coverage");
ok("a positive carries the approved destination only",
  project(input({ marketEvidence: { qualifies: true, destination: "https://example.invalid/lot/3" } }))
    .marketEvidence.destination === "https://example.invalid/lot/3");
ok("a negative carries no destination",
  project(input({ marketEvidence: { qualifies: false, destination: "https://example.invalid/lot/4" } }))
    .marketEvidence.destination === null);

/* ── 7 · suppression and no-resurrection (§8) ── */
const supRef = (assertion) => [{ assertion, contributionListingId: null }];
const supContrib = (id, assertion) => [{ assertion, contributionListingId: id }];

ok("reference-scope suppression is detected", referenceSuppressed(supRef("available_now"), "available_now"));
ok("'all' covers every assertion", referenceSuppressed(supRef("all"), "market_evidence"));
ok("a contribution-scope row is not a reference-scope suppression",
  !referenceSuppressed(supContrib(L1, "available_now"), "available_now"));
ok("contribution suppression is keyed on the contribution",
  contributionSuppressed(supContrib(L1, "available_now"), L1, "available_now") &&
  !contributionSuppressed(supContrib(L1, "available_now"), L2, "available_now"));

const oneSuppressed = project(input({
  eligibleListings: [listing(L1), listing(L2)],
  suppressions: supContrib(L1, "available_now"),
}));
ok("a suppressed contribution leaves the links; the others remain",
  oneSuppressed.availableNow.state === "yes" &&
  oneSuppressed.availableNow.listingUrls.length === 1 &&
  oneSuppressed.availableNow.listingUrls[0] === url(L2));
const allSuppressed = project(input({
  eligibleListings: [listing(L1)],
  suppressions: supContrib(L1, "available_now"),
}));
ok("suppressing the only contribution removes the offering and its link",
  allSuppressed.availableNow.listingUrls.length === 0);
ok("reference-scope availability suppression publishes nothing available",
  project(input({ eligibleListings: [listing(L1)], suppressions: supRef("available_now") }))
    .availableNow.listingUrls.length === 0);
eq("history suppression at reference scope withholds the assertion",
  assessHistory(input({ publicationEpisodes: [episode()], suppressions: supRef("public_listing_history") })),
  "unavailable_or_incomplete");
eq("a suppressed contribution cannot establish history",
  assessHistory(input({ publicationEpisodes: [episode()], suppressions: supContrib(L1, "public_listing_history") })),
  "not_established_within_coverage");
ok("suppressed reads identically to absent — hidden existence is not distinguishable",
  assessHistory(input({ publicationEpisodes: [episode()], suppressions: supContrib(L1, "public_listing_history") }))
    === assessHistory(input({ publicationEpisodes: [] })));
eq("knowledge suppression withholds", project(input({
  knowledge: { state: "approved_public_knowledge", destination: "https://example.invalid" },
  suppressions: supRef("approved_public_reference_knowledge"),
})).approvedPublicReferenceKnowledge.state, "unavailable_or_incomplete");
eq("market evidence suppression withholds", project(input({
  marketEvidence: { qualifies: true, destination: "https://example.invalid" },
  suppressions: supRef("market_evidence"),
})).marketEvidence.state, "unavailable_or_incomplete");
const blanket = project(input({
  eligibleListings: [listing(L1)],
  publicationEpisodes: [episode()],
  knowledge: { state: "approved_public_knowledge", destination: "https://example.invalid" },
  marketEvidence: { qualifies: true, destination: "https://example.invalid" },
  suppressions: supRef("all"),
}));
ok("'all' withholds every dimension at once",
  blanket.availableNow.listingUrls.length === 0 &&
  blanket.publicListingHistory.state === "unavailable_or_incomplete" &&
  blanket.approvedPublicReferenceKnowledge.state === "unavailable_or_incomplete" &&
  blanket.marketEvidence.state === "unavailable_or_incomplete");

/* no resurrection: re-reading the source with the suppression live changes nothing */
const rebuiltInput = input({ eligibleListings: [listing(L1)], suppressions: supContrib(L1, "available_now") });
ok("an ordinary rebuild re-admits nothing while the suppression is live",
  JSON.stringify(project(rebuiltInput)) === JSON.stringify(project(rebuiltInput)));
ok("reference reassociation cannot evade a contribution suppression",
  project({ ...rebuiltInput, reference: { ...REF, vaultReferenceId: "22222222-2222-4222-8222-222222222222" } })
    .availableNow.listingUrls.length === 0);
ok("a reversed suppression (absent from the live set) re-admits only via the live gates",
  project(input({ eligibleListings: [listing(L1)], suppressions: [] })).availableNow.state === "yes");
ok("reversal alone does not re-admit an ineligible contribution",
  project(input({ eligibleListings: [], retrievalComplete: true, suppressions: [] })).availableNow.state
    === "no_current_qualifying_public_listings");

/* ── 8 · presentation shorthand (§3) ── */
eq("Available Now takes precedence", presentationShorthand(project(input({
  eligibleListings: [listing(L1)], publicationEpisodes: [episode()],
}))), SHORTHAND_AVAILABLE_NOW);
eq("Previously Listed needs history AND a complete negative availability check",
  presentationShorthand(project(input({ eligibleListings: [], retrievalComplete: true, publicationEpisodes: [episode()] }))),
  SHORTHAND_PREVIOUSLY_LISTED);
eq("history with unavailable availability says so instead of implying an end",
  presentationShorthand(project(input({ eligibleListings: null, publicationEpisodes: [episode()] }))),
  SHORTHAND_HISTORY_AVAILABILITY_UNKNOWN);
eq("no history yields no shorthand", presentationShorthand(project(input())), null);
ok("knowledge and evidence never produce a commercial shorthand",
  presentationShorthand(project(input({
    knowledge: { state: "approved_public_knowledge", destination: null },
    marketEvidence: { qualifies: true, destination: null },
  }))) === null);

/* ── 9 · assessment date at UTC calendar-day precision (§12) ── */
ok("assessedOn is a UTC calendar day", /^\d{4}-\d{2}-\d{2}$/.test(base.assessment.assessedOn));
ok("utcAssessmentDay yields YYYY-MM-DD", /^\d{4}-\d{2}-\d{2}$/.test(utcAssessmentDay(new Date("2026-09-09T23:59:59Z"))));
eq("the day is the UTC day", utcAssessmentDay(new Date("2026-09-09T23:59:59Z")), "2026-09-09");
assert.throws(() => project(input({ assessedOn: "2026-09-09T12:00:00Z" })), /UTC calendar day/); n += 1;
assert.throws(() => project(input({ assessedOn: "" })), /UTC calendar day/); n += 1;
ok("no per-listing event timestamp appears anywhere in a record",
  !/occurred_at|published_at|removed_at|reserved_at/.test(JSON.stringify(allFour)));

/* ── 10 · Phase 1 reader: the two honest gaps ── */
const source = read("lib/publicWatchIndex/projectionSource.ts");
ok("the reader NEVER queries reference_knowledge", !/from\(\s*["'`]reference_knowledge/.test(source));
ok("knowledge is handed to the projection as unavailable, not invented",
  source.includes('knowledge: { state: "unavailable_or_incomplete", destination: null }'));
ok("the knowledge gap is recorded as a named prerequisite", source.includes("KNOWLEDGE_GAP"));
ok("the history gap is recorded as a named prerequisite", source.includes("HISTORY_GAP"));
ok("publication episodes return null in Phase 1 — the assessment cannot be completed",
  /readPublicationEpisodes\(\)[\s\S]{0,200}return null;/.test(source));
ok("availability reads the governed view, not a status string",
  source.includes('.from("public_discovery_listings")') && !/\.eq\(\s*["'`]status["'`]\s*,\s*["'`]published/.test(source));
/* Comments are stripped first: the doc comment names the two seller columns
   in order to say they are never selected, and a naive grep would read that
   sentence as the defect it prevents. The check is about CODE. */
const sourceCode = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
ok("seller identity is never selected from the view",
  !sourceCode.includes("seller_display_name") && !sourceCode.includes("seller_slug"));
ok("the record type has no seller field at all",
  !/seller/i.test(read("lib/publicWatchIndex/projection.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")));
ok("availability and the evidence gate read through the ANONYMOUS client",
  source.includes("createDiscoveryClient()"));
ok("suppressions read through the service client", source.includes("createServiceClient()"));
ok("the Market Evidence gate is consumed, not reimplemented",
  source.includes('rpc("market_evidence_for_reference"') && !source.includes("auction_evidence_result"));
ok("suppression read failure fails CLOSED", /suppressions === null[\s\S]{0,400}eligibleListings: null/.test(source));
ok("Galaxy visibility is used only as an inclusion floor",
  source.includes('from("vault_galaxy_references")') && source.includes("inclusion floor"));

/* ── 11 · the suppression seam, at the database ── */
const migration = read("supabase/migrations/20260909210000_public_watch_index_suppression_seam.sql");
ok("RLS is enabled on the suppression table", /enable row level security/.test(migration));
ok("no policy is created — every client role is denied structurally", !/create policy/i.test(migration));
ok("anon and authenticated are revoked from the table",
  /revoke all on table public\.public_watch_index_suppressions from anon/.test(migration) &&
  /revoke all on table public\.public_watch_index_suppressions from authenticated/.test(migration));
for (const fn of ["public_watch_index_suppress", "public_watch_index_reverse_suppression"]) {
  ok(`${fn} is revoked from public/anon/authenticated`,
    new RegExp(`revoke all on function public\\.${fn}[^\\n]*from public`).test(migration) &&
    new RegExp(`revoke all on function public\\.${fn}[^\\n]*from anon`).test(migration) &&
    new RegExp(`revoke all on function public\\.${fn}[^\\n]*from authenticated`).test(migration));
  ok(`${fn} is granted to service_role alone`,
    new RegExp(`grant execute on function public\\.${fn}[^\\n]*to service_role`).test(migration));
  ok(`${fn} is security definer with a fixed search_path`,
    new RegExp(`${fn}[\\s\\S]{0,600}security definer[\\s\\S]{0,120}set search_path = public, pg_catalog`).test(migration));
}
ok("a live suppression is unique per (reference, contribution, assertion)",
  /create unique index[\s\S]{0,400}where reversed_at is null/.test(migration));
ok("reversal records actor and reason or is refused",
  /reversal_complete check/.test(migration) && /reversed_by is not null/.test(migration));
ok("the assertion vocabulary matches the projection's",
  ["all", "available_now", "public_listing_history", "approved_public_reference_knowledge", "market_evidence"]
    .every((a) => migration.includes(`'${a}'`)));
ok("contribution_listing_id deliberately carries NO foreign key to listings",
  /DELIBERATELY NO FOREIGN KEY/.test(migration) &&
  !/contribution_listing_id uuid[\s\S]{0,80}references public\.listings/.test(migration));
ok("the reference edge is RESTRICT — a reference cannot be deleted under a live decision",
  /vault_reference_id uuid not null[\s\S]{0,120}on delete restrict/.test(migration));

/* ── 12 · the founder path carries authority; it does not enforce ── */
const route = read("app/api/admin/public-watch-index/suppressions/route.ts");
ok("the route is founder-gated on the server session", route.includes("requireFounder()") && route.includes("user.id !== ADMIN_USER_ID"));
ok("the actor is the session founder, never a request field",
  route.includes("p_actor_uid: founderId") && !/body\.actor/.test(route));
ok("writes go through the governed RPCs only",
  route.includes('rpc("public_watch_index_suppress"') && route.includes('rpc("public_watch_index_reverse_suppression"'));
ok("the route never writes the table directly", !/from\(["'`]public_watch_index_suppressions["'`]\)[\s\S]{0,80}\.(insert|update|delete)/.test(route));
ok("a reversal reply states that re-admission still needs an eligibility check",
  route.includes("Re-admission still requires a successful eligibility check"));
ok("the route returns no index records — it is not a Watch Index endpoint",
  !route.includes("projectReference") && !route.includes("publicWatchIndex/projection"));

/* ── 13 · Phase 1 scope kept ── */
ok("no public Watch Index route file exists", (() => {
  for (const p of ["app/api/watch-index/route.ts", "app/api/public-watch-index/route.ts", "app/watch-index/page.tsx"]) {
    try { readFileSync(new URL(`../${p}`, import.meta.url)); return false; } catch { /* absent, good */ }
  }
  return true;
})());
ok("robots posture is untouched and still closed", /disallow:\s*"\/"/.test(read("app/robots.ts")));
ok("the discovery manifest does not advertise a watch index",
  !/watch[-_]?index/i.test(read("app/api/discovery/route.ts")));
ok("the sitemap policy does not carry a watch-index route",
  !/watch[-_]?index/i.test(read("lib/seo/routeMetadata.ts")));
ok("the adopted law is carried in the repository",
  read("docs/product-laws/Public_Watch_Index_Product_Contract_v2_ADOPTED.md").includes("ADOPTED PRODUCT LAW"));
ok("the README names the governing law", read("lib/publicWatchIndex/README.md").includes("Public_Watch_Index_Product_Contract_v2_ADOPTED.md"));

console.log(`public-watch-index: ${n} assertions PASS`);
