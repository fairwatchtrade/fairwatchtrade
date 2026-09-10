"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CLOSING,
  CLOSING_PATHS,
  COMING_LABEL,
  HERO,
  REFUSALS,
  REFUSALS_SECTION,
  ROOMS,
  ROOM_IDS,
  SPECIALTY,
  STATUS_LABELS,
  TAX_TIME,
  type BenefitStatus,
  type RoomId,
} from "@/lib/whatFairWatchTradeCanDo/content";

/* ════════════════════════════════════════════════════════════════════════
   WHAT CAN FAIRWATCHTRADE DO FOR ME? — components/WhatFairWatchTradeCanDo.tsx

   One page, four ways in. A visitor chooses why they came —
   browse, buy, sell once in a while, dealer — and sees one room at a time:
   what FairWatchTrade actually helps with today, where it deliberately
   stops, and what is not available yet. The shared refusals, closing
   paths and specialty statement sit below every room.

   The words come from lib/whatFairWatchTradeCanDo/content.ts verbatim.
   This file renders them and never edits them.

   TRANSLATION, NOT TRANSPLANT. The source was a standalone light-paper
   prototype with its own shell and stylesheet. This renders inside the
   real site shell on the house tokens (light-dark aware), so it wears
   whichever appearance the visitor chose, and it brings no global CSS.
   Text roles are lifted to the readability floor: titles platinum, all
   reading copy slate, labels muted or gold-dim — never ghost, never void.

   STATUS TREATMENT. Live / Available with limits / Coming borrow the site's
   existing lifecycle badge tokens (published / draft / removed) so the
   three states read with the same restraint as everywhere else. The
   internal class stays `bounded`; the public never sees that word.

   TABS, PROPERLY. role=tablist / tab / tabpanel with aria-selected,
   aria-controls and aria-labelledby; arrow keys, Home and End move between
   rooms; every panel is in the DOM and hidden with the `hidden` attribute,
   so the first room is usable before hydration and a direct link to
   /…#dealer opens that room. Selecting a room writes the hash with
   replaceState, MERGING the existing history state (the framework keeps
   its own state there; overwriting it with null breaks back-navigation).
   ════════════════════════════════════════════════════════════════════════ */

const isRoomId = (v: string): v is RoomId => (ROOM_IDS as readonly string[]).includes(v);

const STATUS_TONE: Record<BenefitStatus | "coming", string> = {
  live: "border-[var(--lc-published-line)] bg-[var(--lc-published-wash)] text-[var(--lc-published-badge)]",
  bounded: "border-[var(--lc-draft-line)] bg-[var(--lc-draft-wash)] text-[var(--lc-draft-badge)]",
  coming: "border-[var(--lc-removed-line)] bg-[var(--lc-removed-wash)] text-[var(--lc-removed-badge)]",
};

function StatusPill({ tone, label }: { tone: BenefitStatus | "coming"; label: string }) {
  return (
    <span
      className={`inline-flex w-max max-w-full items-center gap-[7px] border px-[9px] py-[5px] text-[11px] uppercase leading-[15px] tracking-[1.2px] ${STATUS_TONE[tone]}`}
    >
      <span aria-hidden="true" className="h-[6px] w-[6px] shrink-0 rounded-full bg-current" />
      <span>{label}</span>
    </span>
  );
}

const PATH_CLASS =
  "inline-flex min-h-[44px] items-center justify-center border border-[var(--border-gold)] bg-[var(--gold-whisper)] px-[18px] py-[12px] text-[12px] uppercase leading-[16px] tracking-[1.6px] text-[var(--gold)] transition hover:bg-[rgba(201,168,76,0.1)]";

export default function WhatFairWatchTradeCanDo() {
  const [room, setRoom] = useState<RoomId>("browse");
  const tabRefs = useRef<Partial<Record<RoomId, HTMLButtonElement | null>>>({});

  /* Direct room selection: /…#sell opens Sell. Read once on mount and again
     on any later hash change (back/forward, a hand-edited URL). */
  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.slice(1);
      if (isRoomId(id)) setRoom(id);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const select = useCallback((id: RoomId, focus = false) => {
    setRoom(id);
    if (typeof window !== "undefined") {
      window.history.replaceState({ ...window.history.state }, "", `#${id}`);
    }
    if (focus) tabRefs.current[id]?.focus();
  }, []);

  const onTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, current: RoomId) => {
    const i = ROOM_IDS.indexOf(current);
    let next: RoomId | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = ROOM_IDS[(i + 1) % ROOM_IDS.length];
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = ROOM_IDS[(i - 1 + ROOM_IDS.length) % ROOM_IDS.length];
    else if (e.key === "Home") next = ROOM_IDS[0];
    else if (e.key === "End") next = ROOM_IDS[ROOM_IDS.length - 1];
    if (next) {
      e.preventDefault();
      select(next, true);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 pb-[70px] pt-[32px] sm:px-6 lg:px-[34px]">
      {/* ── Hero ── */}
      <section className="max-w-[930px] pb-[28px] pt-[24px] sm:pt-[40px]">
        <div className="mb-[10px] font-medium text-[11px] uppercase leading-[14px] tracking-[2.2px] text-[var(--gold-dim)]">
          {HERO.eyebrow}
        </div>
        <h1 className="font-display text-[38px] font-normal leading-[42px] tracking-[-0.01em] text-[var(--platinum)] sm:text-[52px] sm:leading-[56px]">
          {HERO.title}
        </h1>
        <p className="mt-[16px] max-w-[760px] text-[16px] leading-[25px] text-[var(--slate)]">{HERO.intro}</p>
      </section>

      {/* ── Chooser ── */}
      <div
        role="tablist"
        aria-label="Why you came"
        className="mb-[24px] grid grid-cols-1 gap-[5px] border border-[var(--border-mid)] bg-[var(--surface)] p-[5px] sm:grid-cols-2 md:grid-cols-4"
      >
        {ROOMS.map((r) => {
          const active = r.id === room;
          return (
            <button
              key={r.id}
              ref={(el) => {
                tabRefs.current[r.id] = el;
              }}
              type="button"
              role="tab"
              id={`wcd-tab-${r.id}`}
              aria-selected={active}
              aria-controls={`wcd-panel-${r.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => select(r.id)}
              onKeyDown={(e) => onTabKeyDown(e, r.id)}
              className={`min-h-[56px] border-l-2 px-[14px] py-[11px] text-left transition ${
                active
                  ? "border-[var(--gold)] bg-[var(--gold-whisper)] text-[var(--platinum)]"
                  : "border-transparent text-[var(--slate)] hover:bg-[var(--hover-wash)] hover:text-[var(--platinum)]"
              }`}
            >
              <span
                className={`block text-[11px] uppercase leading-[14px] tracking-[1.6px] ${
                  active ? "text-[var(--gold-dim)]" : "text-[var(--muted)]"
                }`}
              >
                {r.choiceKicker}
              </span>
              <span className="mt-[4px] block text-[14px] font-medium leading-[20px]">{r.choice}</span>
            </button>
          );
        })}
      </div>

      {/* ── Rooms ── */}
      <div className="border border-[var(--border-mid)] bg-[var(--surface)]">
        {ROOMS.map((r) => (
          <section
            key={r.id}
            role="tabpanel"
            id={`wcd-panel-${r.id}`}
            aria-labelledby={`wcd-tab-${r.id}`}
            hidden={r.id !== room}
          >
            <div className="border-b border-[var(--border-faint)] px-[18px] py-[26px] md:px-[34px] md:py-[32px]">
              <div className="mb-[6px] font-medium text-[11px] uppercase leading-[14px] tracking-[2.2px] text-[var(--gold-dim)]">
                {r.kicker}
              </div>
              <h2 className="font-display text-[28px] font-normal leading-[34px] text-[var(--platinum)] md:text-[34px] md:leading-[38px]">
                {r.heading}
              </h2>
              <p className="mt-[10px] max-w-[720px] text-[14px] leading-[22px] text-[var(--slate)]">{r.intro}</p>
            </div>

            {r.groups.map((g) => (
              <div
                key={g.heading}
                className="border-t border-[var(--border-faint)] px-[18px] py-[24px] first:border-t-0 md:px-[34px]"
              >
                <h3 className="mb-[12px] font-display text-[22px] font-normal leading-[28px] text-[var(--platinum)]">
                  {g.heading}
                </h3>
                <div className="border-t border-[var(--border-faint)]">
                  {g.benefits.map((benefit) => (
                    <div
                      key={benefit.title}
                      className="grid gap-[8px] border-b border-[var(--border-faint)] py-[18px] md:grid-cols-[170px_minmax(200px,0.8fr)_1.55fr] md:items-start md:gap-[18px]"
                    >
                      <StatusPill tone={benefit.status} label={STATUS_LABELS[benefit.status]} />
                      <div className="font-display text-[17px] font-normal leading-[24px] text-[var(--platinum)]">
                        {benefit.title}
                      </div>
                      <p className="text-[14px] leading-[22px] text-[var(--slate)]">
                        {benefit.lead ? (
                          <>
                            <strong className="font-medium text-[var(--platinum)]">{benefit.lead}</strong>{" "}
                            {benefit.body}
                          </>
                        ) : (
                          benefit.body
                        )}
                      </p>
                    </div>
                  ))}
                </div>
                {g.feature && (
                  <div className="mt-[18px] grid gap-[10px] border-l-2 border-[var(--gold)] bg-[var(--gold-whisper)] px-[20px] py-[18px] md:grid-cols-[1fr_1.7fr] md:gap-[22px]">
                    <div className="font-display text-[22px] font-normal leading-[28px] text-[var(--platinum)]">
                      {g.feature.big}
                    </div>
                    <p className="text-[14px] leading-[22px] text-[var(--slate)]">{g.feature.body}</p>
                  </div>
                )}
              </div>
            ))}

            {r.id === "dealer" && (
              <div className="mx-[18px] mb-[26px] border border-[var(--border-mid)] bg-[var(--ink)] p-[22px] md:mx-[34px]">
                <div className="flex flex-col items-start gap-[10px] sm:flex-row sm:items-center sm:justify-between sm:gap-[14px]">
                  <h3 className="font-display text-[24px] font-normal leading-[30px] text-[var(--platinum)]">
                    {TAX_TIME.heading}
                  </h3>
                  <StatusPill tone="coming" label={COMING_LABEL} />
                </div>
                <p className="mt-[10px] max-w-[850px] text-[14px] leading-[22px] text-[var(--slate)]">
                  <strong className="font-medium text-[var(--platinum)]">{TAX_TIME.lead}</strong> {TAX_TIME.body}
                </p>
                <p className="mt-[12px] border-t border-[var(--border-faint)] pt-[12px] text-[13px] leading-[20px] text-[var(--slate)]">
                  {TAX_TIME.boundary}
                </p>
              </div>
            )}
          </section>
        ))}
      </div>

      {/* ── Shared refusals ── */}
      <section className="mt-[34px] border border-[var(--border-mid)] bg-[var(--surface)] px-[18px] py-[24px] md:p-[32px]">
        <div className="mb-[8px] font-medium text-[11px] uppercase leading-[14px] tracking-[2.2px] text-[var(--gold-dim)]">
          {REFUSALS_SECTION.eyebrow}
        </div>
        <h2 className="font-display text-[28px] font-normal leading-[34px] text-[var(--platinum)] md:text-[34px] md:leading-[38px]">
          {REFUSALS_SECTION.heading}
        </h2>
        <p className="mt-[10px] max-w-[760px] text-[14px] leading-[22px] text-[var(--slate)]">{REFUSALS_SECTION.lead}</p>
        <div className="mt-[16px] grid border-t border-[var(--border-faint)] md:grid-cols-2 md:gap-x-[30px]">
          {REFUSALS.map((refusal) => (
            <div key={refusal.heading} className="border-b border-[var(--border-faint)] py-[15px]">
              <strong className="block text-[14px] font-medium leading-[20px] text-[var(--platinum)]">
                {refusal.heading}
              </strong>
              <p className="mt-[4px] text-[13px] leading-[20px] text-[var(--slate)]">{refusal.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Closing paths: real doors, normal access rules ── */}
      <section className="mt-[34px] grid gap-[20px] border-t border-[var(--border-faint)] pt-[30px] md:grid-cols-[1.2fr_auto] md:items-center md:gap-[28px]">
        <div>
          <h2 className="font-display text-[28px] font-normal leading-[34px] text-[var(--platinum)]">{CLOSING.heading}</h2>
          <p className="mt-[8px] text-[14px] leading-[22px] text-[var(--slate)]">{CLOSING.body}</p>
        </div>
        <div className="flex flex-wrap gap-[9px] md:justify-end">
          {CLOSING_PATHS.map((p) => (
            <Link key={p.href} href={p.href} className={PATH_CLASS}>
              {p.label}
            </Link>
          ))}
        </div>
      </section>

      {/* ── Specialty ── */}
      <div className="mt-[28px] border-l-2 border-[var(--gold)] bg-[var(--gold-whisper)] px-[20px] py-[16px] text-[14px] leading-[22px] text-[var(--slate)]">
        <strong className="font-medium text-[var(--platinum)]">{SPECIALTY.lead}</strong> {SPECIALTY.body}
      </div>
    </div>
  );
}
