/* ════════════════════════════════════════════════════════════════════════
   INTERNAL — Collector Dossier · Breguet 5967BB/11/9W6 (private canary)

   The first real Collector Dossier, served privately to the founder only.

   NOT PUBLIC. Not linked from navigation, Browse, Catalogue, listing pages,
   search or the sitemap (the app publishes no sitemap), and app/robots.ts
   disallows every crawler site-wide. `noindex, nofollow` is declared here as
   well so the page carries its own refusal regardless of what robots.txt
   does later at launch.

   Auth: the established single-admin gate — the same ADMIN_EMAIL vs
   user.email comparison after getUser() used by /admin/vault-review and
   /admin/auctions. Failure redirects to "/" with no hint the page exists.

   This renders a PRIVATE UNBOUND CANARY. Reference 5967BB/11/9W6 is not in
   the canonical Vault; nothing here creates a Vault row, an identity
   decision, or a listing binding, and authorized_to_serve stays false.
   ──────────────────────────────────────────────────────────────────────── */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import GenerateCollectorDossierButton from "@/components/GenerateCollectorDossierButton";
import { buildBreguet5967CanaryViewModel } from "@/lib/dossier/collectorDossierViewModel";
import { renderDossierHtml } from "@/lib/dossier/renderDossierHtml";
import { BREGUET_5967_CANARY_SLUG } from "@/lib/dossier/breguet5967CanarySeed";
import { dossierCss } from "@/lib/dossier/dossierStyles";

// Same gate as /admin/vault-review and /admin/auctions.
const ADMIN_EMAIL = "jmynatt74@gmail.com";

export const metadata: Metadata = {
  title: "Collector Dossier — Private Canary",
  robots: { index: false, follow: false, nocache: true },
};

const PDF_ENDPOINT = `/api/internal/collector-dossiers/${BREGUET_5967_CANARY_SLUG}/pdf`;
const PDF_FILENAME = "Collector-Dossier-Breguet-5967BB-11-9W6-Private-Canary.pdf";

export default async function Breguet5967CanaryDossierPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not signed in, or not the founder → bounce. No hint that the page exists.
  if (!user || user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    redirect("/");
  }

  const vm = buildBreguet5967CanaryViewModel();

  return (
    <main className="min-h-screen bg-[var(--ink)]">
      {/* The dossier composition's stylesheet. The PDF document injects this
          same string — see lib/dossier/renderDossierDocument.tsx. */}
      <style dangerouslySetInnerHTML={{ __html: dossierCss }} />

      {/* Internal chrome — deliberately outside the dossier composition, so
          nothing here can reach the PDF. */}
      <div className="border-b border-[var(--border-subtle)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-[820px] flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div>
            <div className="text-[8px] uppercase tracking-[4px] text-[var(--gold-subtle)]">
              Internal · Collector Dossier
            </div>
            <div className="mt-2 text-[12px] tracking-[1px] text-[var(--slate)]">
              {vm.identity.reference} · {vm.canary.state.replace(/_/g, " ")}
            </div>
          </div>

          <GenerateCollectorDossierButton
            endpoint={PDF_ENDPOINT}
            filename={PDF_FILENAME}
          />
        </div>
      </div>

      {/* The same composition function the PDF calls. Every value it renders
          comes from the frozen canary seed by way of the view model — there is
          no user input in this markup — and the builder escapes on the way in. */}
      <div dangerouslySetInnerHTML={{ __html: renderDossierHtml(vm) }} />
    </main>
  );
}
