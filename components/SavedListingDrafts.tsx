"use client";

import { useEffect, useState } from "react";
import {
  fetchRecoverableDrafts,
  draftIdentity,
  UNTITLED_DRAFT_LABEL,
  type RecoverableDraft,
} from "@/lib/listingDraft";

/* ────────────────────────────────────────────────────────────────────────
   SAVED LISTINGS — the seller's doorway to their own unfinished work.

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "The drafts were always recoverable, so the seller could get them back."

   Nothing was ever deleted, and that was never the problem. The Sell page
   opens on `status='active' ORDER BY updated_at DESC LIMIT 1`, so whichever
   draft was touched last owned the page and every other draft the seller
   had was invisible — including the ones a deliberate "Start a new listing"
   had just set aside. Preserved and unreachable is not recoverable.

   This surface exists so the ordering rule stops being product authority.
   The seller sees what they have and picks. Ordering may still say which is
   most recent; it no longer gets to decide alone.

   TRUTH RULES THIS SURFACE OBEYS:
     · missing identity stays missing — no inferred model, reference, or
       completion state, and no step, because the step a seller reached is
       not persisted and claiming one would be invention;
     · photo COUNT is a fact about stored data and is shown; progress is not;
     · a failed read renders as "could not load", never as "you have none".
       Absence is a claim and this surface will not make it by accident.
   ──────────────────────────────────────────────────────────────────────── */

type Props = {
  /** Signed-in sellers only — drafts are account-backed. */
  authed: boolean;
  /** The draft currently open in the flow, so it can be marked, not offered. */
  currentDraftId: string | null;
  /** Bumped by the flow after set-aside / resume so the list re-reads. */
  refreshKey: number;
  /** Explicit seller selection. No heuristic may override this. */
  onResume: (draft: RecoverableDraft) => void | Promise<void>;
  /** True while the flow is applying a resume, to disable the row controls. */
  busyDraftId?: string | null;
};

function whenLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function SavedListingDrafts({
  authed,
  currentDraftId,
  refreshKey,
  onResume,
  busyDraftId = null,
}: Props) {
  const [drafts, setDrafts] = useState<RecoverableDraft[]>([]);
  const [loadOk, setLoadOk] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    (async () => {
      const res = await fetchRecoverableDrafts();
      if (cancelled) return;
      setLoadOk(res.ok);
      setDrafts(res.drafts);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [authed, refreshKey]);

  if (!authed || !loaded) return null;

  /* A read that failed must say so. Rendering nothing here would be the
     surface quietly asserting the seller has no saved work. */
  if (!loadOk) {
    return (
      <div className="border border-[var(--border-faint)] px-5 py-4">
        <p className="text-[13px] leading-[1.6] text-[var(--slate)]">
          Your saved listings could not be loaded just now. Nothing has been lost —
          reload the page to try again.
        </p>
      </div>
    );
  }

  const others = drafts.filter((d) => d.id !== currentDraftId);
  /* Nothing saved, or the only saved draft is the one already on screen:
     an affordance here would be noise pointing at the page you are on. */
  if (others.length === 0) return null;

  const newestId = drafts[0]?.id ?? null;
  const count = drafts.length;

  return (
    <div className="border border-[var(--border-gold)] px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[2px] text-[var(--gold-dim)]">
            Saved listings
          </div>
          <p className="mt-1 text-[14px] leading-[1.5] text-[var(--platinum)]">
            {count === 1
              ? "You have 1 saved listing."
              : `You have ${count} saved listings.`}{" "}
            <span className="text-[var(--slate)]">
              Every one keeps its words and photographs until you publish it.
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="saved-listing-drafts"
          className="shrink-0 border border-[var(--border-gold)] px-4 py-2 text-[11px] uppercase tracking-[1.6px] text-[var(--gold)] transition hover:bg-[var(--gold-whisper)]"
        >
          {open ? "Hide saved listings" : "Choose a listing"}
        </button>
      </div>

      {open && (
        <ul id="saved-listing-drafts" className="mt-4 space-y-3">
          {drafts.map((d) => {
            const id = draftIdentity(d.content);
            const isCurrent = d.id === currentDraftId;
            const isBusy = busyDraftId === d.id;
            const setAside = d.status === "abandoned";
            return (
              <li
                key={d.id}
                className="flex flex-wrap items-start gap-4 border-t border-[var(--border-faint)] pt-3 sm:flex-nowrap"
              >
                {/* Plain <img>, matching every other photo surface in this
                    repository. next/image is deliberately unused here: there
                    is no images config, and these are uploaded blob URLs. */}
                <div className="h-14 w-14 shrink-0 overflow-hidden border border-[var(--border-faint)]">
                  {id.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={id.thumbnailUrl}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-[9px] uppercase tracking-[1px] text-[var(--muted)]">
                      No photo
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span
                      className={`font-display text-[15px] font-light ${
                        id.titleSource === "none"
                          ? "italic text-[var(--platinum-dim)]"
                          : "text-[var(--platinum)]"
                      }`}
                    >
                      {id.title === UNTITLED_DRAFT_LABEL ? UNTITLED_DRAFT_LABEL : id.title}
                    </span>
                    {isCurrent && (
                      <span className="text-[10px] uppercase tracking-[1.4px] text-[var(--gold)]">
                        Open now
                      </span>
                    )}
                    {!isCurrent && d.id === newestId && (
                      <span className="text-[10px] uppercase tracking-[1.4px] text-[var(--slate)]">
                        Most recent
                      </span>
                    )}
                    {setAside && (
                      <span className="text-[10px] uppercase tracking-[1.4px] text-[var(--slate)]">
                        Set aside
                      </span>
                    )}
                  </div>

                  <div className="mt-1 text-[12px] leading-[1.6] text-[var(--slate)]">
                    {id.titleSource === "identity" && id.reference && (
                      <span>Ref. {id.reference}</span>
                    )}
                    {id.titleSource === "identity" && id.reference && id.photoCount > 0 && (
                      <span className="text-[var(--muted)]"> · </span>
                    )}
                    {id.photoCount > 0 && (
                      <span>
                        {id.photoCount} {id.photoCount === 1 ? "photograph" : "photographs"}
                      </span>
                    )}
                    {id.titleSource === "none" && id.photoCount === 0 && (
                      <span>Nothing entered yet</span>
                    )}
                  </div>

                  <div className="mt-0.5 text-[11px] text-[var(--muted)]">
                    Last edited {whenLabel(d.updated_at)}
                  </div>
                </div>

                <div className="w-full shrink-0 sm:w-auto">
                  {isCurrent ? (
                    <span className="block py-2 text-[11px] uppercase tracking-[1.6px] text-[var(--muted)] sm:text-right">
                      On screen
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void onResume(d)}
                      disabled={isBusy}
                      className={`w-full border border-[var(--border-gold)] px-4 py-2 text-[11px] uppercase tracking-[1.6px] text-[var(--gold)] transition hover:bg-[var(--gold-whisper)] sm:w-auto ${
                        isBusy ? "cursor-wait opacity-70" : ""
                      }`}
                    >
                      {isBusy ? "Opening…" : "Continue this listing"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
