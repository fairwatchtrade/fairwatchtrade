"use client";

import { useState } from "react";
import Link from "next/link";
import { FAQ_SUBJECTS } from "@/lib/faq/faqContent";

/* ────────────────────────────────────────────────────────────────────────
   LISTING-STAGE FAQ — components/ListingStageFaq.tsx

   The contextual help layer at the bottom of listing detail (buyer-facing
   polish order, 2026-08-13 §8): the handful of questions a buyer actually
   has AT THIS STEP — offer, payment, what happens next, shipping, what
   FairWatchTrade verifies — answered in the PUBLISHED FAQ copy, verbatim.

   This component curates and renders; it never authors marketplace policy.
   Every answer is pulled by id from lib/faq/faqContent.ts (the generated
   customer copy that must never be hand-edited), so the listing page and
   /faq can never disagree. The one exception is the first entry — "How do
   I ask about this watch?" — which describes THIS page's own controls and
   is therefore interface copy, not policy.

   The full room stays one click away: "More questions and answers → /faq".
   Copy markers (**bold**, *italic*, newline) render exactly as FaqRoom
   renders them.

   Canary: PFC274 = 62 — /api/evaluate untouched.
   ──────────────────────────────────────────────────────────────────────── */

/* The listing-stage curation — ids into the published copy, in the order a
   buyer meets the questions: ask → offer → accepted → payment → shipping →
   verification → protection. */
const STAGE_QUESTION_IDS = [
  "buying-4", // Can I make an offer?
  "buying-5", // What happens after my offer is accepted?
  "payments-0", // Does FairWatchTrade process payments?
  "payments-2", // Who handles shipping and insurance?
  "trust-0", // How does FairWatchTrade verify authenticity?
  "buying-6", // Buyer protection / escrow?
];

const EMPHASIS = /(\*\*[^*]+\*\*|\*[^*]+\*)/;

function renderCopy(text: string) {
  const lines = text.split("\n");
  return lines.map((line, li) => (
    <span key={li}>
      {line
        .split(EMPHASIS)
        .filter((part) => part !== "")
        .map((part, pi) => {
          if (part.startsWith("**") && part.endsWith("**")) {
            return (
              <strong key={pi} className="font-medium text-[var(--platinum)]">
                {part.slice(2, -2)}
              </strong>
            );
          }
          if (part.startsWith("*") && part.endsWith("*")) {
            return <em key={pi}>{part.slice(1, -1)}</em>;
          }
          return <span key={pi}>{part}</span>;
        })}
      {li < lines.length - 1 && <br />}
    </span>
  ));
}

export default function ListingStageFaq({ sellerName }: { sellerName: string }) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const published = FAQ_SUBJECTS.flatMap((s) => s.questions);
  const entries: Array<{ id: string; question: string; answer: React.ReactNode }> = [
    {
      // Interface copy about THIS page's own controls — not marketplace policy.
      id: "stage-contact",
      question: "How do I ask about this watch?",
      answer: (
        <>
          Use{" "}
          <strong className="font-medium text-[var(--platinum)]">
            &ldquo;Have a question? Ask the seller&rdquo;
          </strong>{" "}
          beside the price, or the message bar at the bottom of this page. The
          conversation lives with this watch, so {sellerName}&rsquo;s answers
          stay right here where you can find them.
        </>
      ),
    },
    ...STAGE_QUESTION_IDS.flatMap((id) => {
      const q = published.find((entry) => entry.id === id);
      return q ? [{ id: q.id, question: q.question, answer: renderCopy(q.answer) }] : [];
    }),
  ];

  return (
    <section aria-label="Questions about buying" className="mt-12 border-t border-[var(--border-faint)] pt-8">
      <h2 className="text-[10px] uppercase tracking-[2.5px] text-[var(--muted)]">
        Questions about buying
      </h2>
      <div className="mt-4 border-t border-[var(--border-faint)]">
        {entries.map((entry) => {
          const open = openIds.has(entry.id);
          return (
            <div key={entry.id} className="border-b border-[var(--border-faint)]">
              <button
                type="button"
                onClick={() => toggle(entry.id)}
                aria-expanded={open}
                className="flex min-h-[48px] w-full items-center justify-between gap-4 py-3 text-left"
              >
                <span className="text-[14px] leading-[1.5] text-[var(--platinum-dim)]">
                  {entry.question}
                </span>
                <span
                  aria-hidden="true"
                  className={`shrink-0 text-[14px] text-[var(--muted)] transition-transform ${
                    open ? "rotate-45" : ""
                  }`}
                >
                  +
                </span>
              </button>
              {open && (
                <p className="max-w-[680px] pb-4 text-[13px] leading-[1.7] text-[var(--slate)]">
                  {entry.answer}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <Link
        href="/faq"
        className="mt-4 inline-block text-[12px] text-[var(--gold-dim)] underline decoration-[rgba(201,168,76,0.44)] underline-offset-[3px] transition hover:text-[var(--gold)]"
      >
        More questions and answers →
      </Link>
    </section>
  );
}
