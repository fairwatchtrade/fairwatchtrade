import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const migration = read(
  "supabase/migrations/20260811230000_collector_dossier_production_wiring.sql"
);
const service = read("lib/dossier/collectorDossierService.ts");
const referenceViewModel = read("lib/dossier/referenceDossierViewModel.ts");
const listingPage = read("app/listings/[id]/page.tsx");
const statusRoute = read("app/api/admin/listings/[id]/status/route.ts");
const recheckRoute = read("app/api/admin/listings/[id]/recheck/route.ts");
const pdfRoute = read("app/api/listings/[id]/collector-dossier/route.ts");

test("artifact is unique at exact Vault reference level", () => {
  assert.match(migration, /vault_reference_id\s+uuid\s+not null unique/);
  assert.match(migration, /references public\.vault_references/);
});

test("attachment is unique at listing level", () => {
  assert.match(
    migration,
    /create table public\.listing_collector_dossiers[\s\S]*listing_id\s+uuid\s+primary key/
  );
  assert.match(migration, /collector_dossier_id\s+uuid\s+not null/);
});

test("qualification requires current reviewed exact reference and live fingerprint", () => {
  assert.match(migration, /d\.is_current/);
  assert.match(migration, /d\.outcome = 'exact'/);
  assert.match(migration, /c\.candidate_role = 'selected'/);
  assert.match(migration, /c\.vault_reference_id is not null/);
  assert.match(migration, /identity_resolution_claim_fingerprint\('listing', p_listing_id\)/);
  assert.match(service, /resolveListingReference\(listingId\)/);
});

test("publication enqueue is durable but fail-open", () => {
  assert.match(migration, /after insert or update of status on public\.listings/);
  assert.match(migration, /when \(new\.status = 'published'\)/);
  assert.match(migration, /exception[\s\S]*when others[\s\S]*return new/);
});

test("job state persists pending, generating, ready and failed", () => {
  for (const state of ["pending", "generating", "ready", "failed"]) {
    assert.match(migration, new RegExp(`'${state}'`));
  }
  assert.match(migration, /collector_dossier_claim/);
  assert.match(migration, /collector_dossier_mark_ready/);
  assert.match(migration, /collector_dossier_mark_failed/);
});

test("concurrent generation claims are atomic and recover stale work", () => {
  assert.match(
    migration,
    /update public\.collector_dossiers[\s\S]*status = 'generating'[\s\S]*returning \*/
  );
  assert.match(migration, /generation_started_at < now\(\) - interval '15 minutes'/);
});

test("production content reads only the canonical Vault chain", () => {
  for (const table of [
    "vault_references",
    "vault_variants",
    "vault_families",
    "vault_collections",
    "vault_brands",
  ]) {
    assert.match(referenceViewModel, new RegExp(table));
  }
  assert.doesNotMatch(referenceViewModel, /from\("listings"\)/);
  assert.doesNotMatch(referenceViewModel, /asking_price|seller_id|photos|condition:/);
});

test("reader-facing production copy excludes internal hashes", () => {
  // Manuscript hashes are canary METADATA (never rendered — neither renderer
  // consumes the editorial hash fields); no hash may appear inside reader
  // paragraph copy itself.
  assert.doesNotMatch(referenceViewModel, /claim-fingerprint/);
  const paragraphs = [...referenceViewModel.matchAll(/paragraphs: \[[\s\S]*?\]/g)]
    .map((m) => m[0])
    .join("\n");
  assert.doesNotMatch(paragraphs, /sha256|SHA-256/i);
  assert.match(referenceViewModel, /Listing-specific facts are deliberately excluded/);
  const html = read("lib/dossier/renderDossierHtml.ts");
  const doc = read("lib/dossier/renderDossierDocument.ts");
  assert.doesNotMatch(html, /editorialManuscriptSha256|editorialDeltaSha256/);
  assert.doesNotMatch(doc, /editorialManuscriptSha256|editorialDeltaSha256/);
});

test("ordinary listing reads do not statically load Chromium", () => {
  assert.doesNotMatch(service, /^import .*dossierPdf/m);
  assert.match(service, /import\("\.\/dossierPdf"\)/);
});

test("both publication paths invoke the same idempotent worker", () => {
  assert.match(statusRoute, /ensureCollectorDossierForListing\(id\)/);
  assert.match(recheckRoute, /ensureCollectorDossierForListing\(id\)/);
});

test("listing status is never changed by the Dossier worker", () => {
  assert.doesNotMatch(service, /from\("listings"\)[\s\S]{0,200}\.update\(/);
  assert.doesNotMatch(migration, /update public\.listings/);
});

test("ready control is listing-level and opens the listing PDF route", () => {
  assert.match(listingPage, /collectorDossier\.state === "ready"/);
  assert.match(listingPage, /\/api\/listings\/\$\{listing\.id\}\/collector-dossier/);
  assert.match(listingPage, /Collector Dossier/);
});

test("PDF route rechecks public listing status and current exact attachment", () => {
  assert.match(pdfRoute, /listing\.status !== "published"/);
  assert.match(pdfRoute, /getCollectorDossierForListing\(id\)/);
  assert.match(pdfRoute, /dossier\.state !== "ready"/);
  assert.match(pdfRoute, /NextResponse\.redirect/);
});

test("artifact path is deterministic by reference and content-model version", () => {
  assert.match(
    service,
    /collector-dossiers\/references\/\$\{resolution\.referenceId\}\/collector-dossier-v\$\{vm\.templateVersion\}\.pdf/
  );
  assert.match(service, /addRandomSuffix: false/);
  assert.match(service, /allowOverwrite: true/);
});

/* ── Reference-level editorial articles: storage + approval foundation ──
   (2026-08-13). Storage and gate only — the table ships empty, no prose is
   authored in code, and behavior is byte-identical until a founder-approved
   article row exists. */
const articlesMigration = read(
  "supabase/migrations/20260813150000_collector_dossier_articles.sql"
);

test("articles are reference-level, one approved per reference, client-untouchable", () => {
  assert.match(articlesMigration, /vault_reference_id uuid not null references public\.vault_references/);
  assert.match(articlesMigration, /check \(status in \('draft', 'approved', 'retired'\)\)/);
  assert.match(articlesMigration, /cda_one_approved_per_reference[\s\S]*where status = 'approved'/);
  assert.match(articlesMigration, /revoke all on public\.collector_dossier_articles from public, anon, authenticated/);
  // The article belongs to the reference — no listing or seller column exists.
  assert.doesNotMatch(articlesMigration, /listing_id|seller_id/);
});

test("approval is hash-bound, attributed, and freezes the approved content", () => {
  assert.match(articlesMigration, /cda_approved_complete[\s\S]*manuscript_sha256 is not null and approved_by is not null/);
  assert.match(articlesMigration, /extensions\.digest\(/);
  assert.match(articlesMigration, /only a draft can be approved/);
  assert.match(articlesMigration, /approved article content is frozen/);
  assert.match(articlesMigration, /an approved article cannot return to draft/);
  assert.match(articlesMigration, /reviewer profile missing; refusing to approve/);
  assert.match(articlesMigration, /revoke all on function public\.collector_dossier_article_approve/);
});

test("approval re-enters the proven generation path without touching listings", () => {
  assert.match(articlesMigration, /update public\.collector_dossiers[\s\S]*status = 'pending',[\s\S]*template_version = 2/);
  assert.doesNotMatch(articlesMigration, /update public\.listings/);
});

test("the view model consumes ONLY approved articles and fails safe to the skeleton", () => {
  assert.match(referenceViewModel, /\.eq\("status", "approved"\)/);
  assert.match(referenceViewModel, /maybeSingle\(\)/);
  // Malformed stored sections → skeleton, never a half-rendered article.
  assert.match(referenceViewModel, /serving skeleton/);
  // Identity anchor opens and the canonical boundary closes, article or not.
  assert.match(referenceViewModel, /\[exactReference, \.\.\.article\.sections, canonicalBoundary\]/);
  // The skeleton path remains intact for references without an article.
  assert.match(referenceViewModel, /VAULT_PROFILE/);
  assert.match(referenceViewModel, /templateVersion = article \? 2 : 1/);
});

test("rollback refuses while approved editorial content exists", () => {
  const down = read(
    "supabase/rollbacks/20260813150000_collector_dossier_articles.down.sql"
  );
  assert.match(down, /status = 'approved'/);
  assert.match(down, /retire them before rolling back/);
});

test("private canary routes are not repurposed as production routes", () => {
  assert.doesNotMatch(statusRoute, /breguet-5967bb-11-9w6/);
  assert.doesNotMatch(listingPage, /breguet-5967bb-11-9w6/);
  assert.doesNotMatch(pdfRoute, /buildBreguet5967CanaryViewModel/);
});
