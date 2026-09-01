/* ════════════════════════════════════════════════════════════════════════
   SELL LIFECYCLE — Submit for Review → Pending → Approval → Public

   Source assertions over the governed publication gate. These exist because
   the defect they guard was invisible to every other suite: the seller flow
   inserted 'published' directly, so a clean integrity result put a listing
   into Browse with no human decision. Nothing about that is type-checkable.

   Run: node scripts/sell-lifecycle.test.mjs
   ════════════════════════════════════════════════════════════════════════ */

import { readFileSync } from "node:fs";
import assert from "node:assert";

let n = 0;
const ok = (label, cond) => {
  n += 1;
  assert.ok(cond, label);
};

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const route = read("app/api/listings/route.ts");
/* v6.84 — the transition machinery moved VERBATIM to lib when the Founder
   Assistant became the second authorized caller (the same move the
   publication gate made at v6.34). The machinery assertions follow the
   machinery; the HTTP route keeps only its gate, its parse, and the
   hardcoded 'direct' execution signal — asserted separately below. */
const admin = read("lib/listingStatusTransition.ts");
const adminRoute = read("app/api/admin/listings/[id]/status/route.ts");
const review = read("components/ReviewStep.tsx");
const wizard = read("components/MobileWizard.tsx");
const status = read("lib/listingStatus.ts");

/* ── 1. Submission never publishes ─────────────────────────────────────── */
{
  /* The source declares `let` — the retry re-gate reassigns it. The old
     assertions demanded `const` AND banned `let`, so this suite failed
     against correct source instead of guarding it. What matters is the
     INITIAL VALUE, and that 'published' is never it. */
  ok(
    "the seller route pins the initial status to pending_review",
    /initialStatus: ListingStatus = "pending_review"/.test(route)
  );
  ok(
    "no 'published' initial status survives anywhere in the seller route",
    !/initialStatus\s*=\s*"published"/.test(route)
  );
  ok(
    "the seller route never writes status: 'published'",
    !/status:\s*"published"/.test(route)
  );
  ok(
    "the integrity gate still records WHY (hold reason survives)",
    /holdReason = gate\.holdReason/.test(route) &&
      /integrity_hold_reason/.test(route)
  );
  ok(
    "a cleared hold clears the reason and stays pending_review",
    /integrity_hold_reason: null/.test(route) &&
      /return \{ status: "pending_review", holdReason: error \? current : null \}/.test(route)
  );
}

/* ── 2. Approval is the only publication door ──────────────────────────── */
{
  const recheck = read("app/api/admin/listings/[id]/recheck/route.ts");

  /* RECHECK PATH. A recheck gathers evidence; it may clear the system's
     objection but may never conclude the human review. It used to release a
     cleared hold straight to 'published' — a listing reaching Browse because
     a provider stopped failing, with no founder decision anywhere. */
  ok(
    "the recheck route never writes status: 'published'",
    !/status:\s*"published"/.test(recheck)
  );
  ok(
    "a recheck that clears a hold clears only the reason",
    /update\(\{ integrity_hold_reason: null \}\)/.test(recheck)
  );
  ok(
    "the recheck hold-clear stays scoped to pending_review",
    /\.eq\("status", "pending_review"\)/.test(recheck)
  );

  /* THE GUARD. Both conditions are required, so the generic status control
     can no longer publish outside a recorded approval.

     The law MOVED to lib/listingPublicationGate when Founder Review Triage
     added a second authorized caller (a machine approval that records itself
     as machine). These assertions moved with it and got stronger: the rule
     is now pinned where it is stated, AND every publication writer is pinned
     to that one statement of it. A future writer that re-implements the
     conditions inline fails the last assertion in this block. */
  const gate = read("lib/listingPublicationGate.ts");
  const triageSeam = read("lib/reviewTriageService.ts");

  ok(
    "publication requires the listing to be in review",
    /priorStatus !== "pending_review"/.test(gate) && /not_in_review/.test(gate)
  );
  ok(
    "publication requires an explicitly recorded approval",
    /!req\.approvalRecorded/.test(gate) && /approval_required/.test(gate)
  );
  ok(
    "the availability gate is part of the same law",
    /AVAILABILITY_NOT_IN_STOCK/.test(gate) && /not_available/.test(gate)
  );
  /* The floor added after two zero-photo listings reached Browse: one
     auto-approved by triage, one published on a resubmission the founder had
     already returned asking for photographs. Stated in the law, so every
     caller inherits it and no caller can be the one that forgot. */
  ok(
    "a listing with no photographs cannot be published",
    /photoCount < 1/.test(gate) && /no_photographs/.test(gate)
  );
  ok(
    "and the count is read defensively, so a non-array is zero not a pass",
    gate.includes("Array.isArray(photos) ? photos.length : 0")
  );
  ok(
    "both publication writers supply the photograph count",
    admin.includes("photoCount: photoCountOf(") &&
      triageSeam.includes("photoCount: photoCountOf(")
  );
  ok(
    "the founder route actually reads the column it counts",
    admin.includes("details, photos, status")
  );
  ok(
    "the founder route reaches published only through that law",
    /publicationRefusal\(\{/.test(admin) &&
      /approvalRecorded: reviewAction === "approve"/.test(admin)
  );
  ok(
    "automatic triage reaches published only through that same law",
    /publicationRefusal\(\{/.test(triageSeam)
  );
  /* Comments are stripped first: both files EXPLAIN the rule in prose, and
     the thing being guarded is that neither one CODES it a second time. */
  const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "");
  ok(
    "and no publication writer re-implements the conditions inline",
    !/priorStatus !== "pending_review"/.test(stripComments(admin)) &&
      !/priorStatus !== "pending_review"/.test(stripComments(triageSeam))
  );

  /* THE EXECUTION SIGNAL (v6.84). executed_via is a hardcoded argument at
     each of the two call sites — never a request parameter. A body field
     could be forged by anything holding the founder's session, which is
     exactly the principal the column exists to distinguish. These fail the
     moment someone "simplifies" the signal into the request. */
  const assistantRoute = read("app/api/admin/assistant/route.ts");
  ok(
    "the HTTP route executes as 'direct', hardcoded",
    /executedVia: "direct"/.test(adminRoute)
  );
  ok(
    "the Assistant executes as 'assistant', hardcoded at its one call site",
    /executedVia: "assistant"/.test(assistantRoute)
  );
  const routeCode = stripComments(adminRoute);
  const assistantCode = stripComments(assistantRoute);
  ok(
    "neither caller ever reads the execution signal from a request",
    !/executed_via/.test(routeCode) &&
      !/body\.executed_via/.test(assistantCode) &&
      // every executedVia in each caller IS its hardcoded literal — nothing
      // computed, nothing passed through from anywhere else
      (routeCode.match(/executedVia/g) || []).length ===
        (routeCode.match(/executedVia: "direct"/g) || []).length &&
      (assistantCode.match(/executedVia/g) || []).length ===
        (assistantCode.match(/executedVia: "assistant"/g) || []).length
  );

  /* PRIVATE LISTING BRANCH. Approving a private-intended row releases it to
     its one authorized buyer, never to Browse — through this same gate. */
  ok(
    "an approved private listing becomes private_active, not published",
    /status === "published" && current\.private_buyer_id/.test(admin) &&
      /"private_active"/.test(admin)
  );

  ok(
    "the founder route maps approve -> published",
    /approve:\s*"published"/.test(admin)
  );
  ok(
    "the founder route authorizes against a hardcoded admin id",
    /const ADMIN_USER_ID = "/.test(adminRoute) && /user\.id !== ADMIN_USER_ID/.test(adminRoute)
  );
  ok(
    "the founder route validates the requested status against a fixed set",
    /ALLOWED_STATUSES/.test(admin) && /invalid_status/.test(admin)
  );
  ok(
    "approval records the decision in the review table",
    /listing_integrity_reviews/.test(admin) && /resolved_by/.test(admin)
  );
}

/* ── 3. Seller-facing truth ────────────────────────────────────────────── */
{
  ok(
    "desktop Review submits for review, never 'Publish Listing'",
    /Submit for Review/.test(review) && !/"Publish Listing"/.test(review)
  );
  ok(
    "desktop confirmation no longer claims the listing is live",
    !/Your listing is live\./.test(review) &&
      /submitted for review/i.test(review)
  );
  ok(
    "desktop confirmation states it is not visible to buyers yet",
    /not\s*\n?\s*visible to buyers yet/i.test(review.replace(/\s+/g, " "))
  );
  ok(
    "mobile wizard submits for review, never 'Publish Listing'",
    /Submit for Review/.test(wizard) && !/"Publish Listing"/.test(wizard)
  );
  ok(
    "mobile confirmation no longer claims the watch is in the marketplace",
    !/Your watch is in the marketplace\./.test(wizard) &&
      /submitted for review/i.test(wizard)
  );
  ok(
    "the held-state copy is preserved and driven by the server's own flag",
    /additional authenticity review/.test(review) &&
      /data\?\.held === true/.test(review) &&
      /data\?\.held === true/.test(wizard)
  );
  ok(
    "the seller is never told which signal fired",
    !/finding_review|provider_unavailable|results_pending/.test(review)
  );
}

/* ── 4. Public visibility is gated on published ────────────────────────── */
{
  const publicPaths = [
    "app/browse/page.tsx",
    "app/sellers/[id]/page.tsx",
    "app/watch-dna/page.tsx",
    "marketplace/page.tsx",
  ];
  for (const p of publicPaths) {
    const src = read(p);
    ok(
      `${p} filters to published listings`,
      /\.eq\("status",\s*"published"\)/.test(src)
    );
  }
  /* Catalogue (Permissioned Adjacency, v4.35): the page no longer queries
     listings at all — it reads the collector's own saved-search matches,
     and publish-gating happens at read time in lib/catalogueMatches, which
     drops any card whose joined listing is not currently published. */
  {
    const cataloguePage = read("app/catalogue/page.tsx");
    const catalogueLib = read("lib/catalogueMatches.ts");
    ok(
      "app/catalogue/page.tsx reads collector-scoped matches, never marketplace listings",
      /from\("saved_search_matches"\)/.test(cataloguePage) &&
        !/from\("listings"\)/.test(cataloguePage)
    );
    ok(
      "catalogue cards render only currently published listings",
      /listing\.status !== "published"\) continue/.test(catalogueLib)
    );
  }
  const detail = read("app/listings/[id]/page.tsx");
  ok(
    "public listing detail refuses anything but published/reserved/private_active",
    /data\.status !== "published"/.test(detail) &&
      /data\.status !== "reserved"/.test(detail) &&
      /data\.status !== "private_active"/.test(detail)
  );
  const pr = read("app/listings/[id]/purchase-request/page.tsx");
  ok(
    "a pending listing is not purchasable",
    /data\.status !== "published"/.test(pr)
  );
}

/* ── 5. The status vocabulary stays one source of truth ────────────────── */
{
  ok(
    "lib/listingStatus owns the lifecycle values",
    /LIFECYCLE_STATUSES/.test(status) &&
      /"pending_review"/.test(status) &&
      /"published"/.test(status)
  );
  ok(
    "pending_review has a seller-facing label",
    /pending_review: "Pending Review"/.test(status)
  );
  const migration = read(
    "supabase/migrations/20260807190000_listings_status_lifecycle_guardrail.sql"
  );
  ok(
    "the database guardrail covers exactly the five lifecycle values",
    /listings_status_lifecycle/.test(migration) &&
      /'draft', 'pending_review', 'published', 'rejected', 'reserved'/.test(migration)
  );
}

/* ── 6. The live email fires at approval, exactly once ─────────────────── */
{
  const mail = read("lib/listingLiveEmail.ts");
  ok(
    "the live email is one shared module, not a copy per route",
    /export async function sendListingLiveEmail/.test(mail) &&
      /Your listing is live on FairWatchTrade/.test(mail)
  );
  ok(
    "the seller route no longer defines its own copy",
    !/async function sendListingLiveEmail/.test(route) &&
      /from "@\/lib\/listingLiveEmail"/.test(route)
  );
  ok(
    "the founder approval route sends it",
    /from "@\/lib\/listingLiveEmail"/.test(admin) &&
      /await sendListingLiveEmail\(/.test(admin)
  );
  ok(
    "it fires ONLY on a real transition into published",
    /data\.status === "published"\s*&&\s*priorStatus !== "published"/.test(admin)
  );
  ok(
    "the prior status is read before the write",
    /const priorStatus: string \| null =\s*typeof current\.status === "string"/.test(admin)
  );
  ok(
    "the send happens after the status write, not before",
    admin.indexOf("await sendListingLiveEmail(") >
      admin.indexOf('.update({\n      status: status as AllowedStatus')
  );
  ok(
    "reject / clarify / return_to_draft can never reach the LIVE send",
    /data\.status === "published" &&\s*priorStatus !== "published" &&\s*listingFacts\.seller_id/.test(
      admin
    )
  );
  ok(
    "the price is currency-aware, never a bare dollar sign",
    /priceText: formatMoney\(/.test(admin)
  );
  ok(
    "the seller route still only mails when something is genuinely live",
    /if \(data\.status === "published"\) \{/.test(route)
  );
  ok(
    "submission alone cannot mail — nothing publishes in the seller route",
    !/status:\s*"published"/.test(route)
  );
}

/* ── 7. No adverse decision without a seller-visible reason ────────────── */
{
  const panel = read("components/IntegrityEvidencePanel.tsx");
  const controls = read("components/ListingStatusControls.tsx");
  const account = read("app/account/page.tsx");
  const room = read("components/SellerListingsRoom.tsx");
  const decisionMail = read("lib/listingDecisionEmail.ts");
  const transport = read("lib/sellerEmail.ts");
  const migration = read(
    "supabase/migrations/20260807213000_listing_decision_events.sql"
  );

  // The rule lives at the transition boundary, not in one component.
  ok(
    "the route requires a seller message for every adverse transition",
    /const ADVERSE_STATUSES = \["rejected", "draft"\]/.test(admin) &&
      /seller_message_required/.test(admin)
  );
  ok(
    "the seller-copy boundary now covers every seller-visible message",
    /FORBIDDEN_SELLER_NOTE\.test\(sellerMessage\)/.test(admin)
  );
  ok(
    "the founder-only reviewer note is never used as seller copy",
    !/sellerMessage\s*=\s*reviewerNote/.test(admin) &&
      /reviewer_note/.test(admin)
  );

  // Both admin surfaces must ask; neither may be the bypass.
  ok(
    "the evidence panel requires a message for all three adverse actions",
    /ADVERSE_ACTIONS: Action\[\] = \["clarify", "reject", "return_to_draft"\]/.test(panel) &&
      /A message to the seller is required/.test(panel) &&
      /payload\.seller_message/.test(panel)
  );
  ok(
    "the status dropdown cannot bypass it, take-down included",
    /const ADVERSE_STATUSES: string\[\] = \["rejected", "draft"\]/.test(controls) &&
      /seller_message: rejectionReason\.trim\(\)/.test(controls)
  );
  ok(
    "the manual status control follows authoritative status after a room refresh",
    /const \[lastAuthoritativeStatus, setLastAuthoritativeStatus\] = useState\(currentStatus\)/.test(
      controls
    ) &&
      /if \(lastAuthoritativeStatus !== currentStatus\) \{\s*setLastAuthoritativeStatus\(currentStatus\);\s*setStatus\(currentStatus\);\s*setSelected\(isStatusOption\(currentStatus\) \? currentStatus : "published"\);/.test(
        controls
      ) &&
      /setFeedback\(\(existing\) =>[\s\S]*existing\.text === `Status changed to "\$\{currentStatus\}"\.`[\s\S]*\? existing[\s\S]*: null/.test(
        controls
      )
  );

  // History is append-only and enforced by the database.
  ok(
    "an adverse decision cannot be recorded blank",
    /lde_seller_message_required_check/.test(migration) &&
      /decision = 'approved'/.test(migration)
  );
  ok(
    "only a real movement is a decision",
    /lde_real_transition_check/.test(migration) &&
      /prior_status <> resulting_status/.test(migration)
  );
  ok(
    "the event is written only on a real transition",
    /const realTransition = priorStatus !== null && priorStatus !== data\.status/.test(admin) &&
      /listing_decision_events/.test(admin)
  );
  ok(
    "a later decision inserts, never updates",
    /from\("listing_decision_events"\)\s*\.insert\(/.test(admin.replace(/\s+/g, " ")) &&
      !/from\("listing_decision_events"\)[\s\S]{0,80}\.update\(/.test(admin)
  );

  // The same persisted message reaches both places.
  ok(
    "adverse emails are sent from the persisted decision message",
    /sendListingRejectedEmail\(\{ \.\.\.facts, sellerMessage: message \}\)/.test(admin) &&
      /sendReturnedToDraftEmail\(/.test(admin)
  );
  ok(
    "the seller Account finally fetches the rejection reason",
    /rejection_reason/.test(account) && /listing_decision_events/.test(account)
  );
  ok(
    "the Account surface renders reason and prior decisions",
    /latestMessage\(/.test(room) && /priorDecisions\(/.test(room)
  );
  ok(
    "submission receipt exists and says not public yet",
    /sendSubmissionReceivedEmail/.test(decisionMail) &&
      /not public yet/i.test(decisionMail) &&
      /sendSubmissionReceivedEmail/.test(route)
  );

  // Silent sends are over.
  ok(
    "the transport checks response.ok instead of assuming success",
    /if \(!res\.ok\)/.test(transport) && /Resend rejected the send/.test(transport)
  );
  ok(
    "the live email now rides the checked transport",
    /sendSellerEmail/.test(read("lib/listingLiveEmail.ts")) &&
      !/\.catch\(\(\) => \{\s*\/\/ Email failure/.test(read("lib/listingLiveEmail.ts"))
  );
}

console.log(`sell-lifecycle: ${n} assertions PASS`);
