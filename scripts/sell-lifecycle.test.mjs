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
const admin = read("app/api/admin/listings/[id]/status/route.ts");
const review = read("components/ReviewStep.tsx");
const wizard = read("components/MobileWizard.tsx");
const status = read("lib/listingStatus.ts");

/* ── 1. Submission never publishes ─────────────────────────────────────── */
{
  ok(
    "the seller route pins the initial status to pending_review",
    /const initialStatus: ListingStatus = "pending_review"/.test(route)
  );
  ok(
    "no 'published' initial status survives anywhere in the seller route",
    !/initialStatus\s*=\s*"published"/.test(route) &&
      !/let initialStatus/.test(route)
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
  ok(
    "the founder route maps approve -> published",
    /approve:\s*"published"/.test(admin)
  );
  ok(
    "the founder route authorizes against a hardcoded admin id",
    /const ADMIN_USER_ID = "/.test(admin) && /user\.id !== ADMIN_USER_ID/.test(admin)
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
    "app/catalogue/page.tsx",
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
  const detail = read("app/listings/[id]/page.tsx");
  ok(
    "public listing detail refuses anything but published/reserved",
    /status !== "published" && data\.status !== "reserved"/.test(detail)
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

console.log(`sell-lifecycle: ${n} assertions PASS`);
