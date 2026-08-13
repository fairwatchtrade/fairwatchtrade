/* ════════════════════════════════════════════════════════════════════════
   INTERNAL API — Collector Dossier verified-draft preview PDF

   Renders the newest machine-composed DRAFT article for a reference
   through the real Dossier renderer — same view model, same document,
   same PDF machinery the published path uses — so the founder can judge
   the prose in its actual presentation before any approval decision.

   NON-PUBLIC BY CONSTRUCTION:
   · the established single-admin gate (non-admins get 404, no hint);
   · reads status='draft' rows only — nothing here can read, write or
     serve approved/published state;
   · the rendered document itself carries the "Verified draft preview —
     not published" mark;
   · nothing is written anywhere: no dossier row, no artifact, no storage.

   Node runtime is required: Chromium cannot be driven from the Edge
   runtime.
   ──────────────────────────────────────────────────────────────────────── */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildReferenceDossierViewModel } from "@/lib/dossier/referenceDossierViewModel";
import { generateDossierPdf } from "@/lib/dossier/dossierPdf";

// Same gate as /admin/vault-review and /api/admin/auctions/*.
const ADMIN_EMAIL = "jmynatt74@gmail.com";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ referenceId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 }); // no hint
  }

  const { referenceId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(referenceId)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const vm = await buildReferenceDossierViewModel(
    referenceId,
    new Date(),
    "draft_preview"
  );
  if (!vm) {
    // No verified draft exists for this reference — nothing to preview.
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const pdf = await generateDossierPdf(vm);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.byteLength),
        "Content-Disposition": `attachment; filename="Collector-Dossier-Draft-Preview-${vm.identity.reference.replace(/[^A-Za-z0-9-]/g, "-")}.pdf"`,
        // Draft preview: never cached by a shared cache, never indexed.
        "Cache-Control": "no-store, private",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (err) {
    console.error("[collector-dossier] draft preview PDF failed:", err);
    return NextResponse.json({ error: "pdf_generation_failed" }, { status: 500 });
  }
}
