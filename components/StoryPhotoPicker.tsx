"use client";

import { useState } from "react";

/* ════════════════════════════════════════════════════════════════════════
   STORY PHOTO PICKER — the seller's post-creation choice, in the rail.

   THE MISCONCEPTION THIS EXISTS TO KILL

   "The Sell Flow already has a Story Photo control, so this is a duplicate."
   It is not. The Sell Flow control writes into a DRAFT that has not become a
   listing yet; its value reaches the database exactly once, at insert. From
   the moment a listing exists, that control can never be reached again for
   it. This is the only surface that can change the choice on a listing that
   already exists — which, for a published watch, means the only one at all.

   WHAT IT IS NOT

   Not a listing editor, not a gallery editor, not a framing editor. It
   chooses among photographs the listing already has and writes one key. No
   photograph is uploaded, replaced, reordered, cropped, or removed from
   here, and nothing else about the listing can be changed from here.

   WHY IT DOES NOT SHOW WHICH PHOTOGRAPH THE FALLBACK WOULD PICK

   The automatic rule lives in one place — the listing page, feeding
   resolveStoryIndex. Re-deriving it here to render a "this is the automatic
   one" badge would create a second definition of the same rule, and the two
   would drift the first time either changed. The honest sentence costs
   nothing and cannot go stale.

   OPTIMISTIC, BUT NOT DISHONEST: the mark moves on click because a seller
   should see their own choice land, and moves BACK on refusal with the
   server's own sentence shown. It never reports a save that did not happen.
   ════════════════════════════════════════════════════════════════════════ */

export type StoryPhotoOption = {
  url: string;
  pathname: string;
  category: string;
};

export default function StoryPhotoPicker({
  listingId,
  photos,
  withheldCount = 0,
  storyPathname,
  onSaved,
}: {
  listingId: string;
  /** Only photographs a public surface may actually show. */
  photos: StoryPhotoOption[];
  /** How many of the listing's photographs were withheld from that list, so
      the grid can say why it is shorter than the gallery instead of leaving
      a seller to wonder where their service document went. */
  withheldCount?: number;
  storyPathname: string | null;
  onSaved?: (pathname: string | null) => void;
}) {
  const [chosen, setChosen] = useState<string | null>(storyPathname);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* NO RESET-VIA-EFFECT. The rail swaps listings under this card, and the
     obvious fix — an effect that copies the incoming prop into state — is
     both a lint error in this repo and the wrong mechanism: it re-renders
     twice and races the optimistic value the seller just set. The mount site
     passes key={listing.id} instead, so a different watch is a different
     component and this state starts correct rather than being corrected.

     After a save the prop catches up via router.refresh(), and it agrees with
     what is already shown — nothing needs to be copied in. */

  if (photos.length === 0) {
    return (
      <div className="border border-[var(--border-faint)] bg-[rgba(255,255,255,0.008)] px-4 py-3.5">
        <div className="mb-2 text-[11px] uppercase tracking-[2.2px] text-[var(--gold)]">
          Story Photo
        </div>
        <p className="text-[11px] leading-[1.6] text-[var(--muted)]">
          {withheldCount > 0
            ? "The only photographs on this listing are private service documents, which never appear publicly. There is nothing to choose from here."
            : "This listing has no photographs, so there is nothing to choose from yet."}
        </p>
      </div>
    );
  }

  async function save(next: string | null) {
    const previous = chosen;
    setChosen(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/listings/${listingId}/story-photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pathname: next }),
      });
      const body = (await res.json().catch(() => null)) as
        | { storyPathname?: string | null; detail?: string }
        | null;
      if (!res.ok) {
        setChosen(previous);
        setError(body?.detail ?? "Could not save the Story Photo.");
        return;
      }
      /* The server's value, not the one that was clicked — it is the one the
         collector will actually be shown. */
      const saved = body?.storyPathname ?? null;
      setChosen(saved);
      onSaved?.(saved);
    } catch {
      setChosen(previous);
      setError("Could not reach FairWatchTrade. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-[var(--border-faint)] bg-[rgba(255,255,255,0.008)] px-4 py-3.5">
      <div className="mb-2 text-[11px] uppercase tracking-[2.2px] text-[var(--gold)]">
        Story Photo
      </div>
      <p className="mb-3 text-[11px] leading-[1.6] text-[var(--muted)]">
        The photograph that accompanies your narrative under{" "}
        <span className="text-[var(--platinum-dim)]">From the Seller</span> on the listing
        page. Choose one, or leave it and FairWatchTrade picks one for you.
      </p>

      <div className="grid grid-cols-4 gap-1.5">
        {photos.map((p) => {
          const isChosen = p.pathname === chosen;
          return (
            <button
              key={p.pathname}
              type="button"
              disabled={saving}
              aria-pressed={isChosen}
              title={
                isChosen
                  ? `${p.category || "Photograph"} — chosen; press again to clear`
                  : `Use the ${p.category || "photograph"} as the Story Photo`
              }
              onClick={() => save(isChosen ? null : p.pathname)}
              className={`relative aspect-square overflow-hidden border transition disabled:cursor-wait ${
                isChosen
                  ? "border-[var(--border-gold)]"
                  : "border-[var(--border-faint)] hover:border-[var(--border-mid)]"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={p.category || "Listing photograph"}
                className={`h-full w-full object-cover transition ${
                  isChosen ? "" : "opacity-70"
                }`}
              />
              {isChosen && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 right-0 bg-[var(--gold-fill)] px-1 text-[10px] leading-[14px] text-[var(--on-gold)]"
                >
                  ✦
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 text-[11px] leading-[1.6] text-[var(--muted)]">
        {chosen ? (
          <>
            <span className="text-[var(--platinum-dim)]">Chosen by you.</span> Press it again
            to clear.
          </>
        ) : (
          "No choice made — FairWatchTrade picks one automatically."
        )}
      </div>

      {withheldCount > 0 && (
        <div className="mt-1.5 text-[11px] leading-[1.6] text-[var(--muted)]">
          {withheldCount === 1
            ? "One photograph isn't shown here — service documents stay private unless you opt in."
            : `${withheldCount} photographs aren't shown here — service documents stay private unless you opt in.`}
        </div>
      )}

      {error && (
        <div
          role="status"
          className="mt-2 border border-[var(--border-mid)] px-2 py-1.5 text-[11px] leading-[1.5] text-[var(--platinum-dim)]"
        >
          {error}
        </div>
      )}
    </div>
  );
}
