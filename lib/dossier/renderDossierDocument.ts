/* ════════════════════════════════════════════════════════════════════════
   COLLECTOR DOSSIER · PRINT DOCUMENT

   Wraps the SAME composition string the private HTML page injects in a
   standalone document for Chromium, with the same stylesheet plus the
   print-only page geometry.

   This is what makes "one view model, one composition" true rather than
   merely intended: the PDF cannot drift from the page, because both call
   renderDossierHtml() with the same view model.
   ──────────────────────────────────────────────────────────────────────── */

import { dossierCss, dossierPrintCss, DOSSIER_FONT_HREF } from "./dossierStyles";
import { renderDossierHtml, esc } from "./renderDossierHtml";
import type { CollectorDossierViewModel } from "./collectorDossierViewModel";

export function renderDossierPrintDocument(
  vm: CollectorDossierViewModel
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Collector Dossier — ${esc(vm.identity.brand)} ${esc(
    vm.identity.reference
  )}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="${DOSSIER_FONT_HREF}" />
<style>${dossierCss}</style>
<style>${dossierPrintCss}</style>
</head>
<body>${renderDossierHtml(vm)}</body>
</html>`;
}

/* ── REPEATED PAGE MARKS ──────────────────────────────────────────────────
   The order requires the canary marks on EVERY PDF page. Chromium's
   header/footer templates are the reliable way to guarantee that — a
   position:fixed element in the document is not dependably repeated across
   paginated output, whereas these bands are drawn per page by definition.

   Templates do not inherit the document's styles and cannot rely on
   webfonts, so everything here is inline and uses generic families. The
   bands are filled with the house ink so the dark composition runs to the
   paper edge instead of sitting inside white gutters.
   ────────────────────────────────────────────────────────────────────── */

/* Chromium insets these templates about 5mm from the paper edge, which on a
   dark composition leaves a white strip along the top and bottom of every
   page. The bands are therefore over-sized and pulled outward so the ink
   reaches the edge; any excess is clipped by the margin box. */
const BAND_BLEED = "6mm";

const BAND_BASE =
  "width:100%;margin:0;padding:0 22mm;box-sizing:border-box;" +
  "background:#0D0F14;-webkit-print-color-adjust:exact;print-color-adjust:exact;" +
  "font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:7.5px;" +
  "font-weight:500;letter-spacing:2.4px;text-transform:uppercase;display:flex;" +
  `height:calc(100% + ${BAND_BLEED});`;

export function dossierPdfHeaderTemplate(
  vm: CollectorDossierViewModel
): string {
  // Pulled upward so the band bleeds off the top edge; text stays low in the
  // band, clear of the paper edge.
  return `<div style="${BAND_BASE}justify-content:space-between;align-items:flex-end;padding-bottom:2mm;margin-top:-${BAND_BLEED};">
  <span style="color:#C9A84C;font-weight:600;">${esc(vm.canary.primary)}</span>
  <span style="color:#8A90A0;">${esc(vm.identity.reference)}</span>
</div>`;
}

export function dossierPdfFooterTemplate(
  vm: CollectorDossierViewModel
): string {
  // The footer container is bottom-anchored, so extra height grows upward.
  // Shifting the band down by the bleed is what carries the ink to the edge.
  return `<div style="${BAND_BASE}justify-content:space-between;align-items:flex-start;padding-top:2mm;position:relative;top:${BAND_BLEED};">
  <span style="color:#9CA1B0;">${esc(vm.canary.secondary)}</span>
  <span style="color:#8A90A0;">
    <span class="pageNumber"></span> / <span class="totalPages"></span>
  </span>
</div>`;
}
