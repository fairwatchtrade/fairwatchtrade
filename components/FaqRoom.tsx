"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FAQ_SUBJECTS, type FaqSubject } from "@/lib/faq/faqContent";

/* ════════════════════════════════════════════════════════════════════════
   FAQ ROOM — components/FaqRoom.tsx

   The FAQ shell: header, search, seven subject selectors, subject switching,
   question accordions, cross-subject search, no-match state, and a
   restrained Contact ending. It occupies the centre content area of the
   existing Account shell — the navbar, auction strip, metals strip, and
   Account rail are production components and are not touched by this file.

   The words come from lib/faq/faqContent.ts, which holds the published
   customer copy verbatim. This file renders it and never edits it — the copy
   was written deliberately and is not this component's to adjust.

   Typography follows the implementation brief's production targets, NOT the
   mockup's smaller values — subjects 13px (mockup had 11px), questions 17px
   (16px), answers 15px/24px (12px). Answer prose is capped at 780px on
   purpose: the panel may be wider, but prose does not stretch to fill a
   large monitor.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

/* The copy's own inline markers, rendered rather than stripped: **bold**,
   *italic* (which is how the approved wording carries its "Planned:" labels),
   and a newline where the copy asked for a hard break. Nothing else is
   interpreted, so an answer can never be reformatted into something other
   than what was written. */
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

export default function FaqRoom() {
  const [subjectId, setSubjectId] = useState<string>(FAQ_SUBJECTS[0].id);
  const [search, setSearch] = useState("");
  /* Multi-open: opening one question does not close another. */
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());

  const query = search.trim().toLowerCase();
  const searching = query.length > 0;

  /* Cross-subject search over the fixture's question AND answer text. It can
     only ever see what this component renders — there is no path from here to
     internal notes, state labels, or unpublished copy. */
  const results: FaqSubject[] | null = useMemo(() => {
    if (!query) return null;
    return FAQ_SUBJECTS.map((s) => ({
      ...s,
      questions: s.questions.filter((q) =>
        `${q.question} ${q.answer}`.toLowerCase().includes(query)
      ),
    })).filter((s) => s.questions.length > 0);
  }, [query]);

  /* Clearing the search returns to the subject that was selected before it —
     the selection is never mutated by searching, so it is simply still there. */
  const selected = FAQ_SUBJECTS.find((s) => s.id === subjectId) ?? FAQ_SUBJECTS[0];
  const shown: FaqSubject[] = searching ? (results ?? []) : [selected];
  const matchCount = (results ?? []).reduce((n, s) => n + s.questions.length, 0);

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function chooseSubject(id: string) {
    setSubjectId(id);
    setSearch("");
    setOpenIds(new Set());
  }

  return (
    <div className="mx-auto w-full max-w-[1450px] px-[34px] pb-[70px] pt-[32px]">
      {/* ── Header + search ── */}
      <div className="flex flex-col gap-6 border-b border-[var(--border-faint)] pb-6 md:flex-row md:items-end md:justify-between md:gap-[30px]">
        <div className="min-w-0">
          <div className="mb-[8px] text-[10px] uppercase leading-[14px] tracking-[2.2px] text-[var(--gold-dim)]">
            Help &amp; Information
          </div>
          <h1 className="mb-[8px] font-display text-[36px] font-normal leading-[42px] text-[var(--platinum)]">
            Frequently Asked Questions
          </h1>
          <p className="max-w-[720px] text-[14px] leading-[22px] text-[var(--muted)]">
            Choose a subject to see its questions. Open any question for the answer.
          </p>
          {/* The one thing the answers cannot say for themselves: what their
              own Planned label means. The word is italicised to match how the
              label renders inside an answer; the sentence is Jason's, verbatim. */}
          <p className="mt-2 max-w-[720px] text-[13px] leading-[20px] text-[var(--muted)]">
            Answers marked <em>Planned</em> describe features or policies that are not live
            yet.
          </p>
        </div>
        <div className="shrink-0">
          <label htmlFor="faq-search" className="sr-only">
            Search all FAQ questions
          </label>
          <input
            id="faq-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search all FAQ questions…"
            className="min-h-[44px] w-full border border-[var(--border-mid)] bg-[var(--surface)] px-[14px] py-[11px] text-[14px] text-[var(--platinum)] placeholder:text-[var(--muted)] focus:border-[var(--border-gold)] focus:outline-none md:w-[310px]"
          />
        </div>
      </div>

      {/* ── Subject rail + question panel ── */}
      <div className="mt-6 grid grid-cols-1 gap-[34px] md:grid-cols-[230px_minmax(0,1fr)]">
        {/* Subjects. Below the desktop breakpoint this becomes a full-width
            selector above the questions rather than a narrow column. */}
        <aside className="h-max border border-[var(--border-faint)] bg-[var(--surface)] p-[9px] md:sticky md:top-6">
          <div className="px-[11px] pb-[8px] pt-[10px] text-[10px] uppercase leading-[14px] tracking-[2px] text-[var(--muted)]">
            Subjects
          </div>
          {FAQ_SUBJECTS.map((s) => {
            const active = !searching && s.id === selected.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => chooseSubject(s.id)}
                aria-current={active ? "true" : undefined}
                className={`flex min-h-[44px] w-full items-center justify-between border-l-2 px-[11px] py-[12px] text-left text-[13px] leading-[20px] transition ${
                  active
                    ? "border-[var(--gold)] bg-[var(--gold-whisper)] text-[var(--platinum)]"
                    : "border-transparent text-[var(--slate)] hover:bg-[var(--hover-wash)] hover:text-[var(--platinum)]"
                }`}
              >
                <span className="min-w-0 pr-2">{s.label}</span>
                <span
                  className={`shrink-0 text-[11px] ${
                    active ? "text-[var(--gold-dim)]" : "text-[var(--muted)]"
                  }`}
                >
                  {s.questions.length}
                </span>
              </button>
            );
          })}
        </aside>

        {/* Questions */}
        <section className="min-w-0">
          {searching && (
            <div className="mb-[14px] text-[11px] uppercase tracking-[1.4px] text-[var(--muted)]">
              {matchCount === 0
                ? "No matches"
                : `${matchCount} matching question${matchCount === 1 ? "" : "s"}`}
            </div>
          )}

          {searching && matchCount === 0 ? (
            <div className="border border-[var(--border-faint)] bg-[var(--surface)] px-6 py-[30px] text-[14px] leading-[22px] text-[var(--muted)]">
              No FAQ questions match that search.
            </div>
          ) : (
            shown.map((s) => (
              <div key={s.id} className={searching ? "mb-8" : undefined}>
                {/* Selected-subject header (also the group heading when a
                    search spans more than one subject). */}
                <div className="mb-[14px]">
                  <div className="text-[10px] uppercase leading-[14px] tracking-[2.2px] text-[var(--gold-dim)]">
                    Subject
                  </div>
                  <h2 className="mt-1 font-display text-[28px] font-normal leading-[34px] text-[var(--platinum)]">
                    {s.label}
                  </h2>
                  <div className="mt-1 text-[11px] uppercase tracking-[1.4px] text-[var(--muted)]">
                    {s.questions.length} question{s.questions.length === 1 ? "" : "s"}
                  </div>
                </div>

                <div className="border-t border-[var(--border-faint)]">
                  {s.questions.map((q) => {
                    const isOpen = openIds.has(q.id);
                    return (
                      <div key={q.id} className="border-b border-[var(--border-faint)]">
                        {/* The whole row is the control, not just the glyph. */}
                        <button
                          type="button"
                          onClick={() => toggle(q.id)}
                          aria-expanded={isOpen}
                          className="grid w-full grid-cols-[1fr_30px] items-center gap-2 px-[5px] py-[19px] text-left"
                        >
                          <span className="font-display text-[17px] font-normal leading-[24px] text-[var(--platinum)]">
                            {q.question}
                          </span>
                          <span
                            aria-hidden="true"
                            className={`text-center text-[20px] font-light leading-none transition-transform duration-150 ${
                              isOpen
                                ? "rotate-45 text-[var(--gold)]"
                                : "text-[var(--muted)]"
                            }`}
                          >
                            +
                          </span>
                        </button>
                        {isOpen && (
                          <div className="max-w-[780px] pb-[22px] pl-[5px] pr-[48px]">
                            <p className="text-[15px] font-normal leading-[24px] text-[var(--platinum-dim)]">
                              {renderCopy(q.answer)}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}

          {/* ── Contact ending ──
              Desktop: the action belongs to the sentence that invites it, so it
              sits IN that sentence — one continuous line reading "…point you in
              the right direction. [ CONTACT US ]".

              Mobile: letting it wrap "like any other word" was wrong on a real
              phone. The sentence breaks across two lines and the button landed
              beside the tail of the second one, reading as though it belonged
              mid-sentence. So below md the button stops being inline: the
              sentence completes as text, and the button takes the next line,
              flush with the copy. Same styling, same 44px target, no card. */}
          <div className="mt-[24px] border border-[var(--border-faint)] bg-[var(--surface)] p-[20px]">
            <strong className="block font-display text-[17px] font-normal leading-[24px] text-[var(--platinum)]">
              Still have a question?
            </strong>
            <p className="mt-[4px] max-w-[760px] text-[13px] leading-[20px] text-[var(--muted)]">
              Contact FairWatchTrade and we&rsquo;ll help point you in the right direction.{" "}
              {/* An in-site page, never the visitor's mail client. */}
              <Link
                href="/contact"
                className="mt-[12px] ml-0 flex w-fit min-h-[44px] items-center justify-center border border-[var(--border-gold)] bg-[var(--gold-whisper)] px-[22px] py-[12px] text-[12px] uppercase leading-[16px] tracking-[1.6px] text-[var(--gold)] transition hover:bg-[rgba(201,168,76,0.1)] md:mt-0 md:ml-[6px] md:inline-flex md:align-middle"
              >
                Contact Us
              </Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
