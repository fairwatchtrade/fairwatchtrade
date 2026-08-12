/* ════════════════════════════════════════════════════════════════════════
   COLLECTOR DOSSIER · PDF GENERATION

   Bounded dependency pair, as authorized: `@sparticuz/chromium` supplies a
   Chromium binary sized for the serverless target, `puppeteer-core` drives
   it. Full Puppeteer is deliberately NOT installed — it would download its
   own ~300MB browser at install time, which the deployment target does not
   need and the bundle cannot carry.

   TWO ENVIRONMENTS, ONE OUTPUT:
   - On Vercel/Lambda (Linux) the @sparticuz/chromium binary is used.
   - Locally, that binary does not run (it is a Linux x64 build), so a Chrome
     or Edge already installed on the machine is driven instead. Set
     DOSSIER_CHROME_PATH to override the search.
   The launch flags and the document are identical either way, so the PDF is
   the same document in both places.

   Node runtime only — this cannot run on the Edge runtime.
   ──────────────────────────────────────────────────────────────────────── */

import puppeteer, { type Browser } from "puppeteer-core";
import {
  renderDossierPrintDocument,
  dossierPdfHeaderTemplate,
  dossierPdfFooterTemplate,
} from "./renderDossierDocument";
import type { CollectorDossierViewModel } from "./collectorDossierViewModel";

/** Serverless Linux targets where the bundled Chromium build is the right one. */
function isServerlessLinux(): boolean {
  return (
    process.platform === "linux" &&
    Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)
  );
}

const LOCAL_CHROME_CANDIDATES: readonly string[] = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

async function resolveLocalChrome(): Promise<string> {
  const override = process.env.DOSSIER_CHROME_PATH;
  if (override) return override;

  const { existsSync } = await import("node:fs");
  const found = LOCAL_CHROME_CANDIDATES.find((candidate) =>
    existsSync(candidate)
  );

  if (!found) {
    throw new Error(
      "No local Chrome or Edge binary found for PDF generation. " +
        "Set DOSSIER_CHROME_PATH to a Chromium-based browser executable."
    );
  }
  return found;
}

async function launchBrowser(): Promise<Browser> {
  if (isServerlessLinux()) {
    const chromium = (await import("@sparticuz/chromium")).default;
    // No WebGL is needed for a print document; skipping the graphics stack
    // keeps the cold start and the unpacked size down.
    chromium.setGraphicsMode = false;

    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  return puppeteer.launch({
    executablePath: await resolveLocalChrome(),
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
  });
}

export async function generateDossierPdf(
  vm: CollectorDossierViewModel
): Promise<Uint8Array> {
  const html = renderDossierPrintDocument(vm);

  let browser: Browser | null = null;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    // "load" covers the webfont stylesheet itself; setContent does not accept
    // the networkidle lifecycle events.
    await page.setContent(html, { waitUntil: "load", timeout: 30_000 });

    // The stylesheet arriving is not the same as the faces being usable, so
    // wait for them explicitly. If the webfont is slow or blocked, fall
    // through to the declared Georgia/Times fallback rather than hanging.
    await page
      .evaluate(() => document.fonts.ready.then(() => undefined))
      .catch(() => undefined);

    return await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: dossierPdfHeaderTemplate(vm),
      footerTemplate: dossierPdfFooterTemplate(vm),
      // Left/right run to the edge so the dark composition bleeds; the top and
      // bottom bands carry the per-page canary marks.
      margin: { top: "16mm", bottom: "14mm", left: "0mm", right: "0mm" },
      preferCSSPageSize: false,
      timeout: 60_000,
    });
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
