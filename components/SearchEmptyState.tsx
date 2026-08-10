"use client";

import { useState } from "react";
import Link from "next/link";
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

   EXACT IDENTIFIER SEARCH LAW — when the Search was one exact identifier
   (listing code or manufacturer reference), the empty state must say
   "No exact match found." in those words, and any nearby watches appear
   only afterward under their own visible "Related references" label.
   Related never masquerades as found. Saving such a Search is the promise
   working as designed: the watcher matches the moment a listing carrying
   exactly that identifier arrives.
   ──────────────────────────────────────────────────────────────────────── */

type SaveState = "idle" | "saving" | "saved" | "error";

export type RelatedResult = {
  id: string;
  href: string;
  brand: string;
  model: string | null;
  reference: string;
  priceText: string;
};

export default function SearchEmptyState({
  searchState,
  queryString,
  browseUrl,
  exactIdentifier,
  related,
}: {
  searchState: SearchState;
  /** The full Browse query string — Search text plus every manual filter. */
  queryString: string;
  browseUrl: string;
  /** Set when the Search was one exact identifier (code or reference). */
  exactIdentifier?: string | null;
  /** Deterministic nearby watches — labeled, never mixed into results. */
  related?: RelatedResult[];
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
          {exactIdentifier ? "No exact match found." : "Nothing yet."}
        </strong>
        {/* v2.70 — the sentence is fixed copy and never rewrites itself. The
            button previously became "Saving…"/"Saved", mutating the approved
            line into "Simplify your search, or Saved — …". Progress belongs to
            the live-region below; the words here stay put. */}
        {exactIdentifier && (
          <span className="mb-[6px] block text-[13px] text-[var(--slate)]">
            Nothing on FairWatchTrade carries{" "}
            <span className="font-mono text-[var(--platinum-dim)]">{exactIdentifier}</span>{" "}
            exactly.
          </span>
        )}
        Simplify your search, or{" "}
        <button
          type="button"
          onClick={save}
          disabled={state === "saving" || state === "saved"}
          className="appearance-none bg-transparent p-0 text-[var(--gold-dim)] underline decoration-[rgba(201,168,76,0.44)] underline-offset-[3px] transition-colors hover:text-[var(--gold)] hover:decoration-[var(--gold)] disabled:cursor-default disabled:text-[var(--platinum-dim)] disabled:no-underline"
        >
          save it
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

      {/* ── Related references — only AFTER the exact truth above, always
            under their own visible label. These are nearby alternatives,
            rendered outside the result grid so they can never read as the
            watch that was asked for. */}
      {exactIdentifier && (related?.length ?? 0) > 0 && (
        <div className="mt-6 border-t border-[var(--border-subtle)] pt-4">
          <h3 className="mb-1 text-[10px] uppercase tracking-[2.5px] text-[var(--gold-dim)]">
            Related references
          </h3>
          <p className="mb-3 text-[12px] text-[var(--muted)]">
            Nearby alternatives — not the exact identifier you searched.
          </p>
          <ul className="divide-y divide-[var(--border-faint)]">
            {related!.map((r) => (
              <li key={r.id}>
                <Link
                  href={r.href}
                  className="flex items-baseline justify-between gap-4 py-2.5 transition hover:bg-[rgba(255,255,255,0.02)]"
                >
                  <span className="min-w-0">
                    <span className="mr-2 text-[9px] uppercase tracking-[2px] text-[var(--gold-subtle)]">
                      {r.brand}
                    </span>
                    <span className="font-display text-[14px] font-light text-[var(--platinum)]">
                      {r.model ?? r.brand}
                    </span>
                    <span className="ml-2 font-mono text-[11px] text-[var(--muted)]">
                      {r.reference}
                    </span>
                  </span>
                  <span className="shrink-0 font-display text-[13px] font-light text-[var(--platinum-dim)]">
                    {r.priceText}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
