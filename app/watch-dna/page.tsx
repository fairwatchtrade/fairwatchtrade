"use client";

import WatchDnaQuiz from "@/components/WatchDnaQuiz";

export default function WatchDnaPage() {
  return (
    <main className="min-h-screen bg-[#0D0F14] px-4 py-12">
      <div className="mx-auto max-w-xl">
        <div className="mb-7 text-center">
          <div className="text-[11px] uppercase tracking-[0.25em] text-[#8A8F9E]">
            FairWatchTrade
          </div>
          <h1 className="mt-2 text-[28px] font-semibold text-[#E8E4DC]">
            What's your Watch DNA?
          </h1>
          <p className="mt-2 text-[14px] text-[#8A8F9E]">
            Six questions. No wrong answers — just what's true for you.
          </p>
        </div>

        <WatchDnaQuiz />
      </div>
    </main>
  );
}
