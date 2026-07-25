"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buildBrowseSearchHref } from "@/lib/nav/headerSearch";

/* ────────────────────────────────────────────────────────────────────────
   COMPACT HEADER SEARCH — Global Search DD2

   A quiet, subordinate free-text field that lives in the global site header on
   discovery surfaces (availability decided by lib/nav/headerSearch.ts). It is a
   new PLACEMENT of the existing Search Flight 1 mechanism, not a new Search:

     enter text → submit → /browse?q=<text> → Browse's existing parser,
     URL state, Active Criteria, and results take over.

   No client-side parsing, no operators, no instant/live results over the
   current page, no forked Search state. The text is preserved exactly and
   handed to Browse verbatim. On listing detail it is deliberately subordinate
   to the watch and distinct from the Collector's Drawer's "Search Similar
   Watches" (a contextual action, not free-text reach).

   `variant`:
     · "inline"  — desktop nav row; fixed compact width.
     · "row"     — mobile full-width row beneath the nav (md:hidden caller).
   ──────────────────────────────────────────────────────────────────────── */

function MagnifierIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="6" cy="6" r="4.25" stroke="currentColor" strokeWidth="1.2" />
      <line x1="9.2" y1="9.2" x2="12.5" y2="12.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export default function HeaderSearch({
  variant = "inline",
  onSubmitted,
}: {
  variant?: "inline" | "row";
  onSubmitted?: () => void;
}) {
  const [text, setText] = useState("");
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // Exact query preservation — no parsing here; Browse owns interpretation.
    router.push(buildBrowseSearchHref(text));
    onSubmitted?.();
  }

  const isRow = variant === "row";

  return (
    <form
      role="search"
      onSubmit={submit}
      className={
        isRow
          ? "flex w-full items-center gap-2 border border-[var(--border-subtle)] bg-[var(--surface)] px-3"
          : "flex items-center gap-2 border border-[var(--border-subtle)] bg-[var(--surface)] px-2.5"
      }
    >
      <span className="shrink-0 text-[var(--muted)]" aria-hidden="true">
        <MagnifierIcon />
      </span>
      <input
        type="search"
        inputMode="search"
        enterKeyHint="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Search watches"
        placeholder="Search watches"
        className={
          isRow
            ? "min-h-[44px] w-full bg-transparent py-2 text-[13px] text-[var(--platinum)] placeholder:text-[var(--muted)] focus:outline-none"
            : "h-8 w-[190px] bg-transparent text-[12px] text-[var(--platinum)] placeholder:text-[var(--muted)] focus:outline-none"
        }
      />
      {/* Visible affordance + keyboard-reachable submit. Enter also submits. */}
      <button
        type="submit"
        aria-label="Search"
        className={`shrink-0 text-[9px] uppercase tracking-[2px] text-[var(--slate)] transition-colors hover:text-[var(--gold)] ${
          isRow ? "min-h-[44px] px-1" : ""
        }`}
      >
        Go
      </button>
    </form>
  );
}
