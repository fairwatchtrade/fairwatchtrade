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
  assert.doesNotMatch(referenceViewModel, /claim-fingerprint|sha256|SHA-256/);
  assert.match(referenceViewModel, /Listing-specific facts are deliberately excluded/);
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

test("artifact path is deterministic by reference, enabling reuse", () => {
  assert.match(
    service,
    /collector-dossiers\/references\/\$\{resolution\.referenceId\}\/collector-dossier-v1\.pdf/
  );
  assert.match(service, /addRandomSuffix: false/);
  assert.match(service, /allowOverwrite: true/);
});

test("private canary routes are not repurposed as production routes", () => {
  assert.doesNotMatch(statusRoute, /breguet-5967bb-11-9w6/);
  assert.doesNotMatch(listingPage, /breguet-5967bb-11-9w6/);
  assert.doesNotMatch(pdfRoute, /buildBreguet5967CanaryViewModel/);
});
