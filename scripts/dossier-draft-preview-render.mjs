/* ════════════════════════════════════════════════════════════════════════
   COLLECTOR DOSSIER — DRAFT PREVIEW RENDER (operator proof artifact)

   Run: node scripts/dossier-draft-preview-render.mjs [output.pdf]

   Renders the newest machine-composed DRAFT article for the Breitling
   canary through the REAL view-model builder and the REAL PDF renderer —
   the same modules the deployed admin preview route uses — and writes the
   PDF locally. Nothing is written to any database or storage; the public
   Dossier path is untouched.

   WHY THE CONCATENATION: the production lib modules import each other with
   extensionless specifiers (Next resolves them; bare Node ESM does not)
   and one imports the app's service-client wrapper. Rather than edit
   production code for an operator script, the modules are concatenated
   verbatim into one temporary module with those internal import lines
   removed and a service-client shim prepended — the same technique the
   fidelity replay uses for its answer key. The rendering logic bytes are
   untouched, so this PDF is the same document the deployed route serves.
   ════════════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] ?? join(here, "..", "dossier-draft-preview.pdf");
for (const line of readFileSync(join(here, "..", ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

const REFERENCE_ID = "aa71f4a5-1a5e-4488-b4b2-5f3206c9a411";

/* ── Assemble the real modules into one Node-loadable module ──────────── */
const FILES = [
  "lib/dossier/referenceDossierViewModel.ts",
  "lib/dossier/dossierStyles.ts",
  "lib/dossier/renderDossierHtml.ts",
  "lib/dossier/renderDossierDocument.ts",
  "lib/dossier/dossierPdf.ts",
];
// Anchored per statement ([^;]* cannot cross into a neighbouring import),
// so only imports whose OWN specifier is internal are removed.
const stripInternalImports = (src) =>
  src.replace(
    /^import[^;]*from\s*"(?:\.\/|@\/)[^"]*";\s*$/gm,
    "/* internal import inlined by preview harness */"
  );

const shim = `
import { createClient as __sbCreate } from "@supabase/supabase-js";
const createServiceClient = () =>
  __sbCreate(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
`;

const combined =
  shim +
  FILES.map((f) => stripInternalImports(readFileSync(join(here, "..", f), "utf8"))).join("\n");

// Inside the repo tree so the temp module resolves installed packages
// (@supabase/supabase-js, puppeteer-core) like any repo module.
const tmpDir = mkdtempSync(join(here, ".preview-harness-"));
const tmpModule = join(tmpDir, "previewHarness.ts");
writeFileSync(tmpModule, combined, "utf8");
const { buildReferenceDossierViewModel, generateDossierPdf } = await import(
  `file:///${tmpModule.replace(/\\/g, "/")}`
);
rmSync(tmpDir, { recursive: true, force: true });

/* ── Build the draft-preview view model and render ─────────────────────── */
let vm = await buildReferenceDossierViewModel(REFERENCE_ID, new Date(), "draft_preview");
if (!vm) {
  // No machine draft (e.g. it was just approved): render the approved
  // article through the same path — what production itself serves.
  vm = await buildReferenceDossierViewModel(REFERENCE_ID, new Date(), "approved");
}
if (!vm) {
  console.error("STOP: no draft article exists for the canary reference — nothing to preview.");
  process.exit(1);
}

console.log(`reference:  ${vm.identity.brand} ${vm.identity.model} · ${vm.identity.reference}`);
console.log(`mark:       ${vm.canary.secondary}`);
console.log(`sections:   ${vm.sections.map((s) => s.moduleId).join(" → ")}`);

const pdf = await generateDossierPdf(vm);
writeFileSync(OUT, pdf);
console.log(`\nwrote ${OUT} (${pdf.byteLength.toLocaleString()} bytes) through the real renderer`);
