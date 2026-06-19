"use client";

import SellFlow from "@/components/SellFlow";

export default function SellPage() {
  return (
    <main className="min-h-screen bg-[#0D0F14] px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <div className="text-[11px] uppercase tracking-[0.25em] text-[#8A8F9E]">
            FairWatchTrade
          </div>
          <h1 className="mt-1 text-[24px] font-semibold text-[#E8E4DC]">
            List your watch
          </h1>
        </div>
        <SellFlow />
      </div>
    </main>
  );
}
