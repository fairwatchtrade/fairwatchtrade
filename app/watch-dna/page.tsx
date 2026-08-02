"use client";

import CatalogueRail from "@/components/CatalogueRail";
import WatchDnaQuiz from "@/components/WatchDnaQuiz";

/* v3.21 — Watch DNA joins the Catalogue family (v3 rail order §6.4,
   correction 2): the page mounts the persistent CatalogueRail with Watch
   DNA active, in the same stage composition as /catalogue. The page stays
   public — the rail's links carry their own guards on arrival, unchanged.
   Quiz internals, copy, and the page's own styling are untouched (Layout's
   scope boundary). The rail hides itself below md — mobile /watch-dna
   renders exactly as before. Collapse state is shared with /catalogue
   (fwt-rail-catalogue): one physical object across the family. */

export default function WatchDnaPage() {
  return (
    <div className="flex min-h-screen bg-[#0D0F14]">
      <CatalogueRail />
      <main className="flex flex-1 justify-center px-4 py-12">
        <div className="w-full max-w-xl text-center">
          <div className="mb-7 text-center">
            <div className="text-[11px] uppercase tracking-[0.25em] text-[#8A8F9E]">
              FairWatchTrade
            </div>
            <h1 className="mt-2 text-[28px] font-semibold text-[#E8E4DC]">
              What's your Watch DNA?
            </h1>
            <p className="mt-2 text-[14px] text-[#8A8F9E]">
              Five questions. No wrong answers — just what's true for you.
            </p>
          </div>

          <WatchDnaQuiz />
        </div>
      </main>
    </div>
  );
}
