"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/* ────────────────────────────────────────────────────────────────────────
   SAVE SEARCH CONTROL — components/SaveSearchControl.tsx  (v2.25a)

   Creation before consumption: the one real user-facing way to create and
   name a saved search, mounted once in BrowseClient's toggle bar — the
   surface that owns the filter context being saved. The Drawer's quick
   links and the buyer-dashboard management surface only ever CONSUME what
   this control creates.

   Captures the ACTIVE browse query string exactly as the URL carries it
   (searchParams.toString() — the recon-verified single source of truth),
   so a reopened search is byte-identical to the saved one. Saving an
   unfiltered browse is allowed: it reopens plain /browse; the name is the
   meaning, and no restriction was ruled.

   States, all honest:
     · resting  — quiet "Save this search" text control
     · naming   — inline input (≤ 60 chars, DB CHECK backs it) + Save/Cancel
     · saved    — brief confirmation with the given name, then resting
     · errors   — duplicate name (unique user_id+name → 23505) and generic
                  failure, each in plain words; never a silent no-op
   Signed-out: tapping routes to /login with a callbackUrl back to this
   exact filtered URL (the drawer's own catalogue pattern).

   Canary: PFC274 = 62 — /api/evaluate untouched.
   ──────────────────────────────────────────────────────────────────────── */

const NAME_MAX = 60;

type Phase = "resting" | "naming" | "saving" | "saved";

/* v2.68 — searchState: the parsed Search meaning BrowseClient already holds.
   Stored alongside query_string so a control-created save is WATCHED by the
   v2.60 publish watcher (which skips null-state rows). Optional so nothing
   else that mounts this control breaks. */
export default function SaveSearchControl({
  searchState,
}: {
  searchState?: unknown;
} = {}) {
  const [phase, setPhase] = useState<Phase>("resting");
  const [name, setName] = useState("");
  const [savedName, setSavedName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  async function begin() {
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      const qs = searchParams.toString();
      router.push(`/login?callbackUrl=${encodeURIComponent(pathname + (qs ? `?${qs}` : ""))}`);
      return;
    }
    setPhase("naming");
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give it a name first.");
      return;
    }
    setPhase("saving");
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setPhase("naming");
      setError("Please sign in and try again.");
      return;
    }

    const { error: insErr } = await supabase.from("saved_searches").insert({
      user_id: user.id,
      name: trimmed,
      query_string: searchParams.toString(),
      // v2.68 — the interpreted meaning travels with the save so the
      // publish watcher can evaluate it. Null stays valid (quick-link-only).
      search_state: searchState ?? null,
      meaning_version: 1,
      paused: false,
    });

    if (insErr) {
      setPhase("naming");
      if ((insErr as { code?: string }).code === "23505") {
        setError("You already have a saved search with that name.");
      } else {
        console.error("[FairWatchTrade] Save search failed:", insErr);
        setError("That didn't work. Please try again.");
      }
      return;
    }

    setSavedName(trimmed);
    setName("");
    setPhase("saved");
    // Long enough to read AND take the "View saved searches" path (v2.68).
    setTimeout(() => setPhase((p) => (p === "saved" ? "resting" : p)), 8000);
  }

  function cancel() {
    setPhase("resting");
    setName("");
    setError(null);
  }

  if (phase === "saved") {
    /* v2.68 — DD1's restrained confirmation: the fact, then the one real
       destination. (Replaces the drawer-pointing sentence; the saved name
       still anchors it so the collector knows what landed.) */
    return (
      <span className="flex flex-wrap items-center gap-2">
        <strong className="text-[12px] font-medium text-[var(--platinum-dim)]">
          Search saved.
        </strong>
        <span className="font-display text-[12px] font-light italic text-[var(--gold-subtle)]">
          &ldquo;{savedName}&rdquo;
        </span>
        <a
          href="/account?module=saved"
          className="text-[12px] text-[var(--gold)] underline decoration-[rgba(201,168,76,0.44)] underline-offset-[3px] transition hover:decoration-[var(--gold)]"
        >
          View saved searches
        </a>
      </span>
    );
  }

  if (phase === "naming" || phase === "saving") {
    return (
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value.slice(0, NAME_MAX));
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") cancel();
          }}
          disabled={phase === "saving"}
          maxLength={NAME_MAX}
          placeholder="Name this search…"
          className="w-[190px] rounded-md border border-white/10 bg-transparent px-3 py-1.5 text-[12px] text-[#E8E4DC] placeholder:italic placeholder:text-[var(--ghost)] focus:border-[#C9A84C]/40 focus:outline-none"
        />
        <button
          type="button"
          onClick={save}
          disabled={phase === "saving"}
          className="rounded-md border border-[#C9A84C]/40 px-3 py-1.5 text-[12px] text-[var(--gold)] transition hover:bg-[rgba(201,168,76,0.06)] disabled:cursor-wait disabled:opacity-50"
        >
          {phase === "saving" ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={phase === "saving"}
          className="text-[11px] uppercase tracking-[1.5px] text-[var(--ghost)] transition hover:text-[var(--muted)]"
        >
          Cancel
        </button>
        {error && (
          <span className="text-[11px] text-[var(--danger)]">{error}</span>
        )}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={begin}
      className="inline-flex items-center rounded-md border border-white/10 px-3 py-1.5 text-[12px] text-[#E8E4DC] transition hover:border-[#C9A84C]/40"
    >
      Save this search
    </button>
  );
}
