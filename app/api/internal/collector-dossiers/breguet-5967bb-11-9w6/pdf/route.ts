/* ════════════════════════════════════════════════════════════════════════
   INTERNAL API — Collector Dossier PDF · Breguet 5967BB/11/9W6

   Generates the magazine-style PDF from the SAME view model and the SAME
   composition the private HTML page renders. Nothing is written anywhere:
   no Vault row, no identity decision, no listing binding, no storage. The
   PDF is produced per request and streamed back.

   Auth: the established single-admin gate. Non-admins get 404 — the same
   "no hint" posture as /api/admin/auctions/*.

   Node runtime is required: Chromium cannot be driven from the Edge runtime.
   ──────────────────────────────────────────────────────────────────────── */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildBreguet5967CanaryViewModel } from "@/lib/dossier/collectorDossierViewModel";
import { generateDossierPdf } from "@/lib/dossier/dossierPdf";

// Same gate as /admin/vault-review and /api/admin/auctions/*.
const ADMIN_EMAIL = "jmynatt74@gmail.com";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Chromium cold start plus render; well inside Vercel's ceiling but above the
// default, which a cold serverless invocation can otherwise exceed.
export const maxDuration = 60;

const PDF_FILENAME = "Collector-Dossier-Breguet-5967BB-11-9W6-Private-Canary.pdf";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 }); // no hint
  }

  const vm = buildBreguet5967CanaryViewModel();

  // Refuse to serve if the canary is ever flipped toward public serving
  // without the composition being re-reviewed. Belt and braces on a value
  // that is currently a frozen literal.
  if (vm.canary.authorizedToServe !== false) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const pdf = await generateDossierPdf(vm);

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.byteLength),
        "Content-Disposition": `attachment; filename="${PDF_FILENAME}"`,
        // Private canary: never cached by a shared cache.
        "Cache-Control": "no-store, private",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (err) {
    console.error("[collector-dossier] PDF generation failed:", err);
    return NextResponse.json(
      { error: "pdf_generation_failed" },
      { status: 500 }
    );
  }
}
