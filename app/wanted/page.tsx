import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CatalogueRail from "@/components/CatalogueRail";
import WantedWorkspace from "@/components/WantedWorkspace";

/* ────────────────────────────────────────────────────────────────────────
   /wanted — the collector's demand workspace

   Wanted belongs to the Catalogue family because it begins where the
   Catalogue does: with collector watch identity. It mounts the same
   persistent CatalogueRail as Browse, Catalogue and Watch DNA, joining the
   Discover section rather than inventing a navigation of its own.

   SIGNED-IN ONLY, and not coy about it: a Wanted request is owned demand,
   so an anonymous visitor is sent to sign in rather than shown an empty
   room they cannot use. Every row underneath is own-row RLS; this redirect
   is convenience, never the security boundary.

   The workspace reads its own data client-side (own-row endpoints), so the
   page stays a thin shell — and useSearchParams inside the workspace is
   why it sits behind Suspense.

   Canary: PFC274 = 62 — not touched here.
   ──────────────────────────────────────────────────────────────────────── */

export const dynamic = "force-dynamic";

export default async function WantedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/wanted");

  return (
    <div className="flex min-h-screen bg-[var(--ink)]">
      <CatalogueRail />
      <main className="flex-1 px-4 py-10 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="text-[10px] uppercase tracking-[4px] text-[var(--gold-subtle)]">
            Wanted / Looking For
          </div>
          <Suspense
            fallback={
              <p className="mt-6 text-[13px] italic text-[var(--muted)]">Opening your requests…</p>
            }
          >
            <WantedWorkspace />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
