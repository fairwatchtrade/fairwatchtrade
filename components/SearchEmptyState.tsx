"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { SearchState } from "@/lib/search/parse";
import { SEARCH_MEANING_VERSION } from "@/lib/search/parse";

/* ────────────────────────────────────────────────────────────────────────
   EMPTY RESULT — DD10.

   "save it" is an in-place button, never navigation. The Search is not
   rebuilt, re-parsed, or broadened; the exact state on screen is what gets
   stored, so the saved Search means tomorrow what it means right now.

   A signed-out collector is sent to sign in with callbackUrl set to the
   current Browse URL — and because every part of a Search lives in that URL,
   they come back to the identical Search rather than an empty box.
   ──────────────────────────────────────────────────────────────────────── */

type SaveState = "idle" | "saving" | "saved" | "error";

export default function SearchEmptyState({
  searchState,
  queryString,
  browseUrl,
}: {
  searchState: SearchState;
  /** The full Browse query string — Search text plus every manual filter. */
  queryString: string;
  browseUrl: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");

  const save = async () => {
    if (state === "saving" || state === "saved") return;
    setState("saving");
    setMessage("Saving this Search and its filters.");

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      // Not an error — the Search is preserved in the URL we return to.
      router.push(`/login?callbackUrl=${encodeURIComponent(browseUrl)}`);
      return;
    }

    const name = searchState.text.trim() || "Saved Search";
    const { error } = await supabase.from("saved_searches").insert({
      user_id: user.id,
      name,
      query_string: queryString,
      search_state: searchState,
      meaning_version: SEARCH_MEANING_VERSION,
      paused: false,
    });

    if (error) {
      setState("error");
      setMessage("Could not save this Search.");
      return;
    }

    setState("saved");
    setMessage("Search saved.");
  };

  return (
    <section
      aria-labelledby="search-empty-heading"
      className="mx-auto mt-[18px] w-full max-w-[940px] border border-[var(--border-subtle)] bg-[#0d1118] px-5 py-[22px]"
    >
      <p className="text-[14px] leading-[1.6] text-[var(--muted)]">
        <strong
          id="search-empty-heading"
          className="mb-[5px] block font-display text-[20px] font-light text-[var(--platinum)] sm:text-[22px]"
        >
          Nothing yet.
        </strong>
        Simplify your search, or{" "}
        <button
          type="button"
          onClick={save}
          disabled={state === "saving" || state === "saved"}
          className="appearance-none bg-transparent p-0 text-[var(--gold-dim)] underline decoration-[rgba(201,168,76,0.44)] underline-offset-[3px] transition-colors hover:text-[var(--gold)] hover:decoration-[var(--gold)] disabled:cursor-default disabled:text-[var(--platinum-dim)] disabled:no-underline"
        >
          {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "save it"}
        </button>
        <span aria-hidden="true">&nbsp;—&nbsp;</span>
        <span>we&rsquo;ll keep watching for your watch.</span>
      </p>

      <div
        aria-live="polite"
        className={`mt-[10px] min-h-5 text-[12px] ${
          state === "error" ? "text-[var(--danger)]" : "text-[var(--muted)]"
        }`}
      >
        {state === "saved" ? (
          /* v2.68 — DD1 confirmation: the fact, then the real destination. */
          <>
            <strong className="font-medium text-[var(--platinum-dim)]">
              Search saved.
            </strong>{" "}
            <a
              href="/account?module=saved"
              className="text-[var(--gold-dim)] underline underline-offset-[3px] transition-colors hover:text-[var(--gold)]"
            >
              View saved searches
            </a>
          </>
        ) : (
          message
        )}
      </div>

      {state === "error" && (
        <button
          type="button"
          onClick={() => {
            setState("idle");
            setMessage("");
            void save();
          }}
          className="bg-transparent p-0 text-[12px] text-[var(--gold-dim)] underline underline-offset-[3px] hover:text-[var(--gold)]"
        >
          Try again
        </button>
      )}
    </section>
  );
}
