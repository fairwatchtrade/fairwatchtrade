"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import HelpBubble from "@/components/HelpBubble";
import ImportedDraftsWorkspace from "@/components/ImportedDraftsWorkspace";

/* ════════════════════════════════════════════════════════════════════════
   DEALER ACCELERATOR — the room  (components/DealerAcceleratorRoom.tsx)

   The doorway the capability never had. Until now the engine ran only when
   the founder invoked a route by hand; a dealer had a card that explained a
   service and offered nothing to press.

   ── One doorway, one room, one hierarchy ──────────────────────────────
   The Seller Workspace rail names the CAPABILITY — Dealer Accelerator.
   Imported Drafts is a child work state inside this room, reached by the
   room's own navigation, and must never reappear as a rail peer. It is a
   product of this room, not a sibling of it.

   ── Every number here is counted, never estimated ─────────────────────
   Progress, counts, and states arrive from /api/dealer-accelerator/state,
   which counts the rows that mean them. There is no simulated progress bar
   and no optimistic total. A run that has prepared four of thirteen says
   four because four drafts exist.

   ── Failures are specific ─────────────────────────────────────────────
   Both copy maps below exist so a dealer is never told "something went
   wrong." A resolver refusal and a blocked item each carry a real code from
   the engine, and each code has a sentence that says what happened and what
   to do. An unmapped code still names itself rather than hiding — silence
   would be the actual failure.
   ════════════════════════════════════════════════════════════════════════ */

/* ── Why a website could not be connected ───────────────────────────────
   Keyed by the resolver's own failure vocabulary. Written for a dealer, not
   for an engineer: no parser names, no transport codes, no jargon. */
const SOURCE_FAILURE_COPY: Record<string, { title: string; body: string }> = {
  website_blank: {
    title: "Enter your dealer website.",
    body: "Paste the public web address where your current inventory is listed.",
  },
  website_unparseable: {
    title: "That doesn’t look like a web address.",
    body: "Check the spelling and try again. Nothing was changed.",
  },
  website_ip_literal_refused: {
    title: "FairWatchTrade needs a domain name, not a numeric address.",
    body: "Enter the website address your customers use. Nothing was changed.",
  },
  website_is_fairwatchtrade: {
    title: "That’s a FairWatchTrade page.",
    body: "Enter your own dealer website — the one that publishes your inventory.",
  },
  website_unreachable: {
    title: "We couldn’t reach this dealer website.",
    body: "No preparation run was started and no listings were changed. Check the address, confirm the site is online, and try again.",
  },
  discovery_document_absent: {
    title: "We couldn’t find a FairWatchTrade inventory file on this website.",
    body: "No listings were changed. Your website needs to publish one small file telling FairWatchTrade where your inventory lives — the instructions below explain exactly what it contains.",
  },
  discovery_document_too_large: {
    title: "That inventory file is far larger than expected.",
    body: "The file should only point at your inventory, not contain it. No listings were changed.",
  },
  discovery_document_not_json: {
    title: "We found the inventory file, but couldn’t read it.",
    body: "It isn’t valid JSON. No listings were changed.",
  },
  discovery_document_invalid: {
    title: "We found the inventory file, but it isn’t in the expected shape.",
    body: "Check it against the example below. No listings were changed.",
  },
  discovery_version_unsupported: {
    title: "That inventory file uses a version FairWatchTrade doesn’t support.",
    body: "It should declare version 1. No listings were changed.",
  },
  inventory_declaration_missing: {
    title: "The inventory file doesn’t say where your inventory is.",
    body: "It needs an inventory section naming the file to read. No listings were changed.",
  },
  inventory_format_unsupported: {
    title: "That inventory format isn’t supported yet.",
    body: "FairWatchTrade currently prepares inventory from an ndjson file. No listings were changed.",
  },
  inventory_url_invalid: {
    title: "The inventory address in that file couldn’t be read.",
    body: "No listings were changed.",
  },
  inventory_url_off_origin: {
    title: "That inventory file points at a different website.",
    body: "FairWatchTrade only prepares inventory published on the website you connected — that boundary is what keeps one dealer’s photographs from being claimed by another. No listings were changed.",
  },
  inventory_version_missing: {
    title: "The inventory file doesn’t name which version of your inventory this is.",
    body: "That label is how FairWatchTrade knows a re-check is the same inventory and avoids preparing it twice. No listings were changed.",
  },
  photographs_path_invalid: {
    title: "The photograph location in that file couldn’t be read.",
    body: "No listings were changed.",
  },
  manifest_unreachable: {
    title: "We found your inventory file, but couldn’t open the inventory itself.",
    body: "No preparation run was started and no listings were changed.",
  },
  manifest_content_type_unsupported: {
    title: "Your inventory file was served as the wrong type.",
    body: "It needs to be delivered as ndjson or plain text. No listings were changed.",
  },
  manifest_too_large: {
    title: "That inventory file is too large to prepare in one run.",
    body: "No listings were changed.",
  },
  manifest_rejected: {
    title: "We reached your inventory, but couldn’t safely read every line.",
    body: "FairWatchTrade stops rather than guessing at inventory it cannot read exactly. No listings were changed.",
  },
  attestation_required: {
    title: "Confirm your authorization to continue.",
    body: "FairWatchTrade needs your confirmation before retrieving anything from your website.",
  },
  source_write_failed: {
    title: "We couldn’t record this source.",
    body: "Nothing was changed. Please try again.",
  },
  /* Preparation failures are NOT connect failures, and must never borrow the
     copy above. On 2026-08-17 a failure during Start fell through to
     source_write_failed and told a dealer "We couldn't record this source.
     Nothing was changed." Both halves were false: the source was recorded
     minutes earlier and was fine, and a batch HAD been created. Telling
     someone nothing changed when something did is the worst thing this
     surface can do — it invites a retry that compounds the problem. */
  preparation_failed: {
    title: "Something went wrong while preparing your drafts.",
    body: "Your inventory source is still connected. Some preparation may already have started, so please don’t start again — open Batches to see the current state, or come back shortly.",
  },
};

/** Never leave a dealer with a blank screen because a code was unmapped. An
    unmapped failure still says what is known and, crucially, does not claim
    that nothing changed. */
function sourceFailureCopy(code: string): { title: string; body: string } {
  return (
    SOURCE_FAILURE_COPY[code] ?? {
      title: "FairWatchTrade couldn’t complete that step.",
      body: `Your inventory source is still connected. Open Batches to see the current state before trying again (${code}).`,
    }
  );
}

/* ── Why one watch could not be prepared ───────────────────────────────
   The engine's real eligibility codes. Needs Attention is not a rejection
   and does not touch drafts that succeeded. */
const BLOCKED_REASON_COPY: Record<string, string> = {
  evidence_missing_reference:
    "Your source describes this watch but gives no manufacturer reference. FairWatchTrade will not invent one.",
  evidence_missing_brand:
    "Your source gives no maker for this watch. FairWatchTrade will not guess it.",
  evidence_no_photographs:
    "No photograph was listed for this watch in your source.",
  photograph_evidence_incomplete:
    "FairWatchTrade could not retrieve every photograph listed for this watch.",
  evidence_currency_missing:
    "This watch has a price with no currency, so its asking price cannot be read safely.",
  evidence_currency_unsupported:
    "This watch’s currency isn’t supported on FairWatchTrade yet.",
  evidence_currency_without_price:
    "This watch names a currency but no price.",
  evidence_price_contradiction:
    "This watch’s price appears more than once in your source, with different values.",
  evidence_item_id_mismatch:
    "This watch’s identity in your source doesn’t match the record FairWatchTrade already holds for it.",
  evidence_payload_unparsed:
    "FairWatchTrade could not read this watch’s line in your inventory file.",
  technical_retry_exhausted:
    "FairWatchTrade tried several times and could not complete this watch. Your source may have been unavailable.",
};

function blockedCopy(code: string): string {
  return (
    BLOCKED_REASON_COPY[code] ??
    // Naming the raw code beats hiding it: a dealer can quote it, and it is
    // the truth. A vague sentence here would be a lie with better manners.
    `FairWatchTrade could not safely prepare this watch from its current source truth (${code}).`
  );
}

/* ── Server shapes, mirrored ────────────────────────────────────────── */

type AttentionItem = { batchItemId: string; sourceItemKey: string; reasonCode: string };

type RoomState = {
  source: {
    id: string;
    locator: string;
    state: string;
    connectedAt: string;
    authorizedBySelf: boolean;
  } | null;
  run: {
    batchId: string;
    status: string;
    snapshotKey: string;
    startedAt: string | null;
    completedAt: string | null;
    itemsTotal: number;
    prepared: number;
    needsAttention: number;
    stillProcessing: number;
    settled: boolean;
    advanceable: boolean;
    fatalErrorCode: string | null;
  } | null;
  needsAttention: AttentionItem[];
  importedDraftCount: number;
};

type Forecast = { found: number; alreadyPrepared: number; toPrepare: number };

type Probe = {
  hostname: string;
  locator: string;
  snapshot: string;
  forecast: Forecast;
  photographCount: number;
};

type RoomTab = "start" | "batches" | "drafts";
type Step = "intro" | "connect" | "recognized" | "confirm" | "running" | "attention" | "ready";

const INTRO_HIDDEN_KEY = "fwtDealerAcceleratorIntroHidden";

/* ── The intro preference ───────────────────────────────────────────────
   localStorage is external state, so it is subscribed to rather than copied
   into React state inside an effect — the latter reads the value and then
   immediately re-renders to report it, which is the cascading render the
   pattern exists to avoid.

   The server snapshot is deliberately "not hidden": the first paint on both
   sides agrees, and the stored preference applies immediately after
   hydration. A dealer who hid the panel sees it stay hidden; nobody sees the
   panel flash away mid-read.

   Per device, deliberately. This hides a teaching panel and nothing else —
   it is not worth a column on the dealer's account, and it must never hide
   the feature, the source status, the run history, Needs Attention, or
   Imported Drafts. */
const introPreference = {
  listeners: new Set<() => void>(),
  subscribe(listener: () => void): () => void {
    introPreference.listeners.add(listener);
    return () => {
      introPreference.listeners.delete(listener);
    };
  },
  isHidden(): boolean {
    try {
      return window.localStorage.getItem(INTRO_HIDDEN_KEY) === "1";
    } catch {
      return false; // a preference we cannot read simply is not set
    }
  },
  serverSnapshot(): boolean {
    return false;
  },
  setHidden(next: boolean): void {
    try {
      if (next) window.localStorage.setItem(INTRO_HIDDEN_KEY, "1");
      else window.localStorage.removeItem(INTRO_HIDDEN_KEY);
    } catch {
      /* the preference is a convenience, never a gate */
    }
    introPreference.listeners.forEach((l) => l());
  },
};

/* ── Small presentational pieces ────────────────────────────────────── */

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--gold)]">{children}</div>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="border border-[var(--border-subtle)] bg-[var(--surface-2)] px-4 py-3">
      <div className="font-display text-[26px] font-light leading-none text-[var(--platinum)]">
        {value}
      </div>
      <div className="mt-1.5 text-[12px] leading-[1.4] text-[var(--muted)]">{label}</div>
    </div>
  );
}

function Primary({
  children,
  onClick,
  disabled,
  busy,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className="min-h-[46px] cursor-pointer border border-[var(--gold)] bg-[var(--cta-fill)] px-5 py-3 text-[12px] font-semibold text-[var(--on-cta)] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)] disabled:cursor-not-allowed disabled:opacity-45"
    >
      {busy ? "Working…" : children}
    </button>
  );
}

function Secondary({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-[46px] cursor-pointer border border-[var(--border-mid)] bg-transparent px-5 py-3 text-[12px] font-semibold text-[var(--platinum)] transition-colors hover:border-[var(--gold-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)] disabled:cursor-not-allowed disabled:opacity-45"
    >
      {children}
    </button>
  );
}

function Notice({
  title,
  body,
  tone = "quiet",
}: {
  title: string;
  body: string;
  tone?: "quiet" | "warn";
}) {
  return (
    <div
      className={`border px-4 py-3.5 ${
        tone === "warn"
          ? "border-[var(--gold-subtle)] bg-[var(--surface-2)]"
          : "border-[var(--border-subtle)] bg-[var(--surface-2)]"
      }`}
    >
      <p className="text-[13px] font-semibold leading-[1.5] text-[var(--platinum)]">{title}</p>
      <p className="mt-1.5 text-[12px] leading-[1.6] text-[var(--muted)]">{body}</p>
    </div>
  );
}

/* ── The room ───────────────────────────────────────────────────────── */

export default function DealerAcceleratorRoom({
  onBackToOverview,
  initialTab = "start",
}: {
  /** Returns to the Seller Overview. The room is a destination, not a trap. */
  onBackToOverview: () => void;
  /** Which destination to open on. Lets "Review Imported Drafts" elsewhere
      in the workspace land on that tab without becoming a second doorway to
      it — one room, entered at the right place. */
  initialTab?: RoomTab;
}) {
  const [tab, setTab] = useState<RoomTab>(initialTab);
  const [step, setStep] = useState<Step>("intro");
  const [state, setState] = useState<RoomState | null>(null);
  const [loading, setLoading] = useState(true);
  const [readFailed, setReadFailed] = useState(false);

  const [website, setWebsite] = useState("");
  const [probe, setProbe] = useState<Probe | null>(null);
  const [attested, setAttested] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [manifestDetail, setManifestDetail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const introHidden = useSyncExternalStore(
    introPreference.subscribe,
    introPreference.isHidden,
    introPreference.serverSnapshot
  );

  const pollRef = useRef<number | null>(null);

  const loadState = useCallback(async (): Promise<RoomState | null> => {
    try {
      const res = await fetch("/api/dealer-accelerator/state", { cache: "no-store" });
      if (!res.ok) {
        setReadFailed(true);
        return null;
      }
      const data = (await res.json()) as { state: RoomState };
      setReadFailed(false);
      setState(data.state);
      return data.state;
    } catch {
      setReadFailed(true);
      return null;
    }
  }, []);

  // First read decides which screen the dealer lands on. A run already in
  // flight resumes its progress view rather than starting them over.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await loadState();
      if (cancelled) return;
      setLoading(false);
      if (s?.run && s.run.advanceable) setStep("running");
      else if (s?.run && s.run.needsAttention > 0) setStep("attention");
      else if (s?.run && s.run.prepared > 0) setStep("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [loadState]);

  /* While a run is advanceable, poll state AND drive it forward. Driving
     from here is deliberate belt-and-braces: the scheduled worker is the
     durable guarantee, and every call is idempotent, so the two converge on
     the same run instead of racing to duplicate it. */
  useEffect(() => {
    if (step !== "running") return;
    const sourceId = state?.source?.id;
    if (!sourceId) return;

    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        await fetch("/api/dealer-accelerator/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceId }),
        });
      } catch {
        /* the run is durable; a dropped tick costs time, never state */
      }
      const s = await loadState();
      if (stopped || !s?.run) return;
      if (!s.run.advanceable) {
        setStep(s.run.needsAttention > 0 ? "attention" : "ready");
      }
    };

    pollRef.current = window.setInterval(tick, 4000);
    return () => {
      stopped = true;
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
    };
  }, [step, state?.source?.id, loadState]);

  const checkWebsite = async () => {
    setBusy(true);
    setFailure(null);
    setManifestDetail(null);
    try {
      const res = await fetch("/api/dealer-accelerator/check-website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        failure?: string;
        manifestReason?: string | null;
        manifestLine?: number | null;
        website?: { hostname: string; locator: string; snapshot: string };
        forecast?: Forecast;
        photographCount?: number;
      };
      if (!data.ok || !data.website || !data.forecast) {
        setFailure(data.failure ?? "website_unreachable");
        if (data.manifestReason) {
          setManifestDetail(
            data.manifestLine
              ? `${data.manifestReason} (line ${data.manifestLine})`
              : data.manifestReason
          );
        }
        return;
      }
      setProbe({
        hostname: data.website.hostname,
        locator: data.website.locator,
        snapshot: data.website.snapshot,
        forecast: data.forecast,
        photographCount: data.photographCount ?? 0,
      });
      setAttested(false);
      setStep("recognized");
    } finally {
      setBusy(false);
    }
  };

  const connect = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const res = await fetch("/api/dealer-accelerator/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website, attested }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        failure?: string;
        forecast?: Forecast;
      };
      if (!data.ok) {
        setFailure(data.failure ?? "source_write_failed");
        return;
      }
      if (data.forecast && probe) setProbe({ ...probe, forecast: data.forecast });
      await loadState();
      setStep("confirm");
    } finally {
      setBusy(false);
    }
  };

  const startPreparing = async () => {
    const sourceId = state?.source?.id;
    if (!sourceId) return;
    setBusy(true);
    setFailure(null);
    try {
      const res = await fetch("/api/dealer-accelerator/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId }),
      });
      const data = (await res.json()) as { ok: boolean; failure?: string; state?: RoomState };
      if (!data.ok) {
        setFailure(data.failure ?? "preparation_failed");
        return;
      }
      if (data.state) setState(data.state);
      setStep("running");
    } finally {
      setBusy(false);
    }
  };

  /* ── Room navigation. Three destinations, one hierarchy. ───────────── */
  const roomNav = (
    <div className="mb-7 flex flex-wrap gap-2 border-b border-[var(--border-subtle)] pb-4">
      {(
        [
          ["start", "Start"],
          ["batches", "Batches"],
          ["drafts", "Imported Drafts"],
        ] as const
      ).map(([id, label]) => {
        const active = tab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-current={active ? "true" : undefined}
            className={`min-h-[40px] cursor-pointer border px-4 py-2 text-[12px] font-semibold transition-colors ${
              active
                ? "border-[var(--gold)] text-[var(--gold)]"
                : "border-[var(--border-mid)] text-[var(--platinum)] hover:border-[var(--gold-subtle)]"
            }`}
          >
            {label}
            {id === "drafts" && state && state.importedDraftCount > 0 ? (
              <span className="ml-2 text-[var(--muted)]">{state.importedDraftCount}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );

  /* ── Help anchoring, and why it is shaped exactly like this ────────────
     The shared bubble renders as a SIBLING of its trigger with `absolute`
     placement, so the caller must supply the positioning ancestor. Without
     one it anchors to whatever distant ancestor happens to be positioned and
     `top: calc(100% + 10px)` puts it far down the page — it opens, and
     nobody sees it. That is exactly what happened here.

     The breakpoint split is the established pattern, not decoration: below
     sm the inner span is static, so the bubble anchors to the RELATIVE row
     below and spans it edge to edge. A fixed-width card anchored to a 44px
     trigger overflowed a phone viewport faster than the clamp could measure,
     and mobile Chrome expanded the whole layout viewport to fit. At sm+ the
     span becomes the ancestor and the card is the ordinary long-help card,
     with the caret tracking the ? wherever it sits.

     ── Why sm:left-[-14px] and not sm:left-0 ──────────────────────────────
     Anchored flush to the trigger, the ?'s centre lands 18px into the card
     (a 36px button at sm+), so the caret would want to sit at 9px — inside
     the 16px corner radius, where the shared component now correctly refuses
     to put it and clamps it inboard instead. Clean tail, but aimed about
     11px to the right of the ?.

     Offsetting the card 14px left puts the trigger's centre 32px in, which
     is past the radius, so the caret is placed exactly under the ? with no
     clamping at all. It is an aiming correction, not decoration: restore
     left-0 and the pointer stops pointing at anything. */
  const header = (
    <div className="relative mb-2 flex items-start gap-2">
      <div>
        <Kicker>Seller Workspace</Kicker>
        <h1 className="mt-2 font-display text-[30px] font-light leading-[1.1] text-[var(--platinum)] sm:text-[34px]">
          Dealer Accelerator
        </h1>
      </div>
      <span className="inline-flex sm:relative">
        <HelpBubble
          label="What Dealer Accelerator does"
          historyKey="fwtDealerAcceleratorHelp"
          title="Dealer Accelerator"
          bubbleClassName="left-3 right-3 top-[calc(100%+10px)] rounded-2xl sm:left-[-14px] sm:right-auto sm:w-[340px]"
          caretTracksTrigger
        >
          <p className="text-[13px] leading-[1.65] text-[var(--slate)]">
            Use your existing dealer inventory as the starting point for private
            FairWatchTrade drafts. FairWatchTrade prepares; you confirm;
            FairWatchTrade reviews. Nothing publishes automatically.
          </p>
        </HelpBubble>
      </span>
    </div>
  );

  if (loading) {
    return (
      <div className="px-1 py-2">
        {header}
        <p className="mt-6 text-[13px] text-[var(--muted)]">Loading your Dealer Accelerator…</p>
      </div>
    );
  }

  return (
    <div className="px-1 py-2">
      {header}
      <p className="mb-6 max-w-[62ch] text-[13px] leading-[1.65] text-[var(--muted)]">
        Bring existing inventory to FairWatchTrade without rebuilding every
        listing by hand.
      </p>

      {roomNav}

      {readFailed && (
        <div className="mb-6">
          <Notice
            tone="warn"
            title="We couldn’t load your Dealer Accelerator just now."
            body="Nothing was changed. Reload the page to try again — any run in progress continues on its own."
          />
        </div>
      )}

      {tab === "drafts" && (
        <div>
          <div className="relative mb-5 flex flex-wrap items-center gap-2">
            <Secondary onClick={() => setTab("start")}>Back to Dealer Accelerator</Secondary>
            <span className="inline-flex sm:relative">
              <HelpBubble
                label="How to review imported drafts"
                historyKey="fwtImportedDraftsReviewHelp"
                title="Review Imported Drafts"
                bubbleClassName="left-3 right-3 top-[calc(100%+10px)] rounded-2xl sm:left-[-14px] sm:right-auto sm:w-[340px]"
                caretTracksTrigger
              >
                <p className="text-[13px] leading-[1.65] text-[var(--slate)]">
                  Choose a draft, confirm the facts only you can know, save your
                  corrections, then submit it for FairWatchTrade review. Imported
                  drafts stay private until reviewed and published.
                </p>
              </HelpBubble>
            </span>
          </div>
          {/* Said once, plainly, on small screens. This workspace was built
              desktop-first and still is; confirming six facts and replacing
              photographs is genuinely easier on a large screen. Saying so is
              better than either hiding the room from a phone or pretending
              the experience is identical. */}
          <p className="mb-4 border border-[var(--border-subtle)] bg-[var(--surface-2)] px-4 py-3 text-[12px] leading-[1.6] text-[var(--muted)] md:hidden">
            This workspace is designed for a larger screen. You can review your
            drafts here, but confirming and submitting is more comfortable on
            desktop.
          </p>
          <ImportedDraftsWorkspace />
        </div>
      )}

      {tab === "batches" && (
        <BatchHistory state={state} onStart={() => setTab("start")} />
      )}

      {tab === "start" && (
        <>
          {/* ── Connected-source status. Never hidden by the intro
                preference: the order is explicit that the preference hides
                the teaching panel and nothing else. ── */}
          {state?.source && step !== "connect" && (
            <div className="mb-6 border border-[var(--border-mid)] bg-[var(--surface)] p-5">
              <Kicker>Your connected inventory source</Kicker>
              <p className="mt-2 text-[15px] text-[var(--platinum)]">{state.source.locator}</p>
              <p className="mt-1 text-[12px] leading-[1.6] text-[var(--muted)]">
                Connected{" "}
                {new Date(state.source.connectedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
                {state.run ? ` · latest inventory version ${state.run.snapshotKey}` : ""}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Secondary
                  onClick={() => {
                    setWebsite(state.source?.locator ?? "");
                    setProbe(null);
                    setFailure(null);
                    setStep("connect");
                  }}
                >
                  Check for new inventory
                </Secondary>
                {state.importedDraftCount > 0 && (
                  <Secondary onClick={() => setTab("drafts")}>Review imported drafts</Secondary>
                )}
              </div>
            </div>
          )}

          {step === "intro" && (
            <IntroPanel
              hidden={introHidden}
              onHide={introPreference.setHidden}
              hasDrafts={(state?.importedDraftCount ?? 0) > 0}
              onConnect={() => {
                setWebsite(state?.source?.locator ?? "");
                setProbe(null);
                setFailure(null);
                setStep("connect");
              }}
              onDrafts={() => setTab("drafts")}
            />
          )}

          {step === "connect" && (
            <ConnectPanel
              website={website}
              setWebsite={setWebsite}
              busy={busy}
              failure={failure}
              manifestDetail={manifestDetail}
              onCheck={checkWebsite}
              onBack={() => {
                setFailure(null);
                setStep("intro");
              }}
            />
          )}

          {step === "recognized" && probe && (
            <RecognizedPanel
              probe={probe}
              attested={attested}
              setAttested={setAttested}
              busy={busy}
              failure={failure}
              onContinue={connect}
              onBack={() => setStep("connect")}
            />
          )}

          {step === "confirm" && probe && (
            <ConfirmPanel
              probe={probe}
              busy={busy}
              failure={failure}
              onStart={startPreparing}
              onBack={() => setStep("recognized")}
            />
          )}

          {step === "running" && (
            <ProgressPanel
              state={state}
              onAttention={() => setStep("attention")}
              onDrafts={() => setTab("drafts")}
            />
          )}

          {step === "attention" && (
            <AttentionPanel
              state={state}
              onDrafts={() => setTab("drafts")}
              onBack={() => setStep(state?.run?.advanceable ? "running" : "ready")}
              onStateRefresh={loadState}
            />
          )}

          {step === "ready" && (
            <ReadyPanel
              state={state}
              onDrafts={() => setTab("drafts")}
              onAttention={() => setStep("attention")}
              onCheckAgain={() => {
                setWebsite(state?.source?.locator ?? "");
                setProbe(null);
                setFailure(null);
                setStep("connect");
              }}
            />
          )}

          <div className="mt-8 border-t border-[var(--border-subtle)] pt-5">
            <Secondary onClick={onBackToOverview}>Back to Overview</Secondary>
          </div>
        </>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Screens
   ════════════════════════════════════════════════════════════════════════ */

function IntroPanel({
  hidden,
  onHide,
  hasDrafts,
  onConnect,
  onDrafts,
}: {
  hidden: boolean;
  onHide: (next: boolean) => void;
  hasDrafts: boolean;
  onConnect: () => void;
  onDrafts: () => void;
}) {
  return (
    <section className="border border-[var(--border-mid)] bg-[var(--surface)] p-6">
      {!hidden && (
        <>
          <Kicker>We do the repetitive work. You stay in control.</Kicker>
          <h2 className="mb-3 mt-2 max-w-[46ch] font-display text-[24px] font-light leading-[1.15] text-[var(--platinum)] sm:text-[27px]">
            Your inventory already exists. Start there.
          </h2>
          <p className="max-w-[64ch] text-[13px] leading-[1.65] text-[var(--muted)]">
            Connect the public website where your current watch inventory
            lives. FairWatchTrade prepares dealer-owned private drafts from the
            work you have already done, preserving where every detail and
            photograph came from.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              ["1 · Connect", "Give FairWatchTrade the website where your current inventory is published."],
              ["2 · Confirm", "Review price, condition, availability, reference, description and photographs."],
              ["3 · Submit", "FairWatchTrade reviews each watch before anything is published."],
            ].map(([t, b]) => (
              <div key={t} className="border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4">
                <div className="text-[12px] font-semibold text-[var(--gold-subtle)]">{t}</div>
                <p className="mt-1.5 text-[12px] leading-[1.6] text-[var(--muted)]">{b}</p>
              </div>
            ))}
          </div>

          <div className="mt-5">
            <Notice
              title="Nothing is published automatically."
              body="Connecting a website creates no public listing. Prepared watches stay private drafts until you confirm the required details and submit them for FairWatchTrade review."
            />
          </div>

          <label className="mt-5 flex cursor-pointer items-center gap-2.5 text-[12px] text-[var(--muted)]">
            <input
              type="checkbox"
              checked={hidden}
              onChange={(e) => onHide(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-[var(--gold)]"
            />
            Don’t show this introduction again
          </label>
        </>
      )}

      {hidden && (
        <label className="flex cursor-pointer items-center gap-2.5 text-[12px] text-[var(--muted)]">
          <input
            type="checkbox"
            checked={hidden}
            onChange={(e) => onHide(e.target.checked)}
            className="h-4 w-4 cursor-pointer accent-[var(--gold)]"
          />
          Don’t show this introduction again
        </label>
      )}

      <div className="mt-6 flex flex-wrap gap-2.5">
        <Primary onClick={onConnect}>Connect Inventory Source</Primary>
        {hasDrafts && <Secondary onClick={onDrafts}>Review Imported Drafts</Secondary>}
      </div>
    </section>
  );
}

function ConnectPanel({
  website,
  setWebsite,
  busy,
  failure,
  manifestDetail,
  onCheck,
  onBack,
}: {
  website: string;
  setWebsite: (v: string) => void;
  busy: boolean;
  failure: string | null;
  manifestDetail: string | null;
  onCheck: () => void;
  onBack: () => void;
}) {
  const copy = failure ? sourceFailureCopy(failure) : null;
  return (
    <section className="border border-[var(--border-mid)] bg-[var(--surface)] p-6">
      <Kicker>Dealer Accelerator / Connect</Kicker>
      <h2 className="mb-2 mt-2 font-display text-[24px] font-light leading-[1.15] text-[var(--platinum)]">
        Connect your inventory source
      </h2>
      <p className="max-w-[60ch] text-[13px] leading-[1.65] text-[var(--muted)]">
        Paste the public website where your current watch inventory is listed.
      </p>

      <div className="mt-5 max-w-[520px]">
        <div className="relative mb-2 flex items-center gap-1.5">
          <label
            htmlFor="fwt-dealer-website"
            className="text-[12px] font-semibold text-[var(--platinum)]"
          >
            Dealer website
          </label>
          <span className="inline-flex sm:relative">
            <HelpBubble
              label="About the dealer website field"
              historyKey="fwtDealerWebsiteHelp"
              title="Dealer website"
              bubbleClassName="left-3 right-3 top-[calc(100%+10px)] rounded-2xl sm:left-[-14px] sm:right-auto sm:w-[330px]"
              caretTracksTrigger
            >
              <p className="text-[13px] leading-[1.65] text-[var(--slate)]">
                Enter the dealer website that publishes the inventory you want
                FairWatchTrade to prepare. Do not paste a FairWatchTrade page.
                FairWatchTrade checks only for the supported inventory source
                connected to this website.
              </p>
            </HelpBubble>
          </span>
        </div>
        <input
          id="fwt-dealer-website"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://yourdealer.com"
          className="fw-input w-full border border-[var(--border-mid)] bg-[var(--surface-2)] px-3.5 py-3 text-[14px] text-[var(--platinum)] placeholder:text-[var(--ghost)] focus:border-[var(--gold-subtle)] focus:outline-none"
        />
        <p className="mt-2 text-[12px] leading-[1.6] text-[var(--muted)]">
          FairWatchTrade checks this website for a supported inventory source
          and shows exactly what it found before any preparation starts.
        </p>
      </div>

      {copy && (
        <div className="mt-5 max-w-[560px]">
          <Notice tone="warn" title={copy.title} body={copy.body} />
          {manifestDetail && (
            <p className="mt-2 text-[12px] leading-[1.6] text-[var(--muted)]">
              Reported by the check: {manifestDetail}
            </p>
          )}
          {failure === "discovery_document_absent" && <DiscoveryInstructions />}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2.5">
        <Primary onClick={onCheck} busy={busy} disabled={website.trim() === ""}>
          Check Website
        </Primary>
        <Secondary onClick={onBack}>Back</Secondary>
      </div>
    </section>
  );
}

/** Shown only when the document is genuinely absent. Telling a dealer their
    site is not connected without telling them how to connect it would leave
    them with nothing to do. */
function DiscoveryInstructions() {
  return (
    <div className="mt-4 border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4">
      <p className="text-[12px] font-semibold text-[var(--platinum)]">
        What your website needs to publish
      </p>
      <p className="mt-1.5 text-[12px] leading-[1.6] text-[var(--muted)]">
        One small file at this exact address on your own website:
      </p>
      <p className="mt-2 break-all font-mono text-[12px] text-[var(--gold-subtle)]">
        /.well-known/fairwatchtrade-inventory.json
      </p>
      <p className="mt-3 text-[12px] leading-[1.6] text-[var(--muted)]">
        It tells FairWatchTrade where your inventory file is, and publishing it
        is also how FairWatchTrade knows the website is yours.
      </p>
      <pre className="mt-2.5 overflow-x-auto border border-[var(--border-subtle)] bg-[var(--surface)] p-3 font-mono text-[12px] leading-[1.6] text-[var(--slate)]">
{`{
  "fairwatchtrade_inventory": 1,
  "inventory": {
    "format": "ndjson",
    "url": "/inventory/current.ndjson",
    "version": "2026-08-17",
    "photographs_path": "/photographs"
  }
}`}
      </pre>
      <p className="mt-2.5 text-[12px] leading-[1.6] text-[var(--muted)]">
        Change <span className="font-mono">version</span> whenever your
        inventory changes. That is how FairWatchTrade tells a new snapshot from
        one it has already prepared, so nothing is ever prepared twice.
      </p>
    </div>
  );
}

function RecognizedPanel({
  probe,
  attested,
  setAttested,
  busy,
  failure,
  onContinue,
  onBack,
}: {
  probe: Probe;
  attested: boolean;
  setAttested: (v: boolean) => void;
  busy: boolean;
  failure: string | null;
  onContinue: () => void;
  onBack: () => void;
}) {
  const copy = failure ? sourceFailureCopy(failure) : null;
  return (
    <section className="border border-[var(--border-mid)] bg-[var(--surface)] p-6">
      <Kicker>Dealer Accelerator / Source</Kicker>
      <h2 className="mb-2 mt-2 font-display text-[24px] font-light leading-[1.15] text-[var(--platinum)]">
        Inventory source found
      </h2>
      <p className="max-w-[60ch] text-[13px] leading-[1.65] text-[var(--muted)]">
        FairWatchTrade recognized a supported inventory source on this website.
        Nothing has been retrieved or imported yet.
      </p>

      <div className="mt-5 border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4">
        <p className="text-[13px] text-[var(--platinum)]">{probe.locator}</p>
        <p className="mt-1 text-[12px] leading-[1.6] text-[var(--muted)]">
          Inventory version {probe.snapshot} · photographs published on{" "}
          {probe.hostname}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat value={probe.forecast.found} label="Watches found" />
        <Stat value={probe.photographCount} label="Photographs found" />
        <Stat value={probe.forecast.alreadyPrepared} label="Already prepared" />
      </div>

      <label className="mt-5 flex cursor-pointer items-start gap-3 border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4">
        <input
          type="checkbox"
          checked={attested}
          onChange={(e) => setAttested(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--gold)]"
        />
        <span>
          <span className="text-[13px] font-semibold leading-[1.55] text-[var(--platinum)]">
            I confirm that I own, manage, or am authorized to use this inventory
            and its photographs, and I authorize FairWatchTrade to retrieve them
            for the purpose of preparing private draft listings.
          </span>
          <span className="mt-2 block text-[12px] leading-[1.6] text-[var(--muted)]">
            Nothing is published automatically. This authorization is recorded
            with your dealer account and this source.
          </span>
        </span>
      </label>

      {copy && (
        <div className="mt-4 max-w-[560px]">
          <Notice tone="warn" title={copy.title} body={copy.body} />
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2.5">
        <Primary onClick={onContinue} busy={busy} disabled={!attested}>
          Continue
        </Primary>
        <Secondary onClick={onBack}>Back</Secondary>
      </div>
    </section>
  );
}

function ConfirmPanel({
  probe,
  busy,
  failure,
  onStart,
  onBack,
}: {
  probe: Probe;
  busy: boolean;
  failure: string | null;
  onStart: () => void;
  onBack: () => void;
}) {
  const copy = failure ? sourceFailureCopy(failure) : null;
  const nothingToDo = probe.forecast.toPrepare === 0;
  return (
    <section className="border border-[var(--border-mid)] bg-[var(--surface)] p-6">
      <Kicker>Dealer Accelerator / Confirm</Kicker>
      <h2 className="mb-2 mt-2 font-display text-[24px] font-light leading-[1.15] text-[var(--platinum)]">
        Prepare this inventory?
      </h2>
      <p className="max-w-[62ch] text-[13px] leading-[1.65] text-[var(--muted)]">
        {probe.locator} · inventory version {probe.snapshot}
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat value={probe.forecast.found} label="Watches found" />
        <Stat value={probe.forecast.alreadyPrepared} label="Already prepared" />
        <Stat value={probe.forecast.toPrepare} label="To prepare now" />
      </div>

      <div className="mt-5 flex flex-col gap-3">
        <Notice
          title="Starting preparation creates no public listing."
          body="FairWatchTrade captures your source and its authorized photographs, prepares each eligible watch as a private draft you own, and sets aside any watch that needs your attention."
        />
        {probe.forecast.alreadyPrepared > 0 && (
          <Notice
            title="Watches you have already prepared will not be prepared twice."
            body="FairWatchTrade recognizes them from your source and returns them as existing work, so re-checking your inventory never creates a duplicate listing."
          />
        )}
        {nothingToDo && (
          <Notice
            tone="warn"
            title="Every watch in this inventory version is already prepared."
            body="There is nothing new to prepare. Update your inventory and its version on your website, then check again."
          />
        )}
      </div>

      {copy && (
        <div className="mt-4 max-w-[560px]">
          <Notice tone="warn" title={copy.title} body={copy.body} />
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2.5">
        <Primary onClick={onStart} busy={busy} disabled={nothingToDo}>
          Start Preparing Drafts
        </Primary>
        <Secondary onClick={onBack}>Back</Secondary>
      </div>
    </section>
  );
}

function ProgressPanel({
  state,
  onAttention,
  onDrafts,
}: {
  state: RoomState | null;
  onAttention: () => void;
  onDrafts: () => void;
}) {
  const run = state?.run;
  return (
    <section className="border border-[var(--border-mid)] bg-[var(--surface)] p-6">
      <Kicker>Dealer Accelerator / Preparing</Kicker>
      <h2 className="mb-2 mt-2 font-display text-[24px] font-light leading-[1.15] text-[var(--platinum)]">
        Preparing your draft listings…
      </h2>
      <p className="max-w-[62ch] text-[13px] leading-[1.65] text-[var(--muted)]">
        FairWatchTrade is doing the repetitive work. You do not need to stay on
        this page.
      </p>

      {/* Real durable counts only. No percentage is shown against a total
          that is still being discovered — a bar that guesses is worse than
          a number that is true. */}
      <dl className="mt-5 divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-2)]">
        {[
          ["Watches found in your inventory", run ? String(run.itemsTotal) : "—"],
          ["Private drafts prepared", run ? String(run.prepared) : "—"],
          ["Still processing", run ? String(run.stillProcessing) : "—"],
          ["Needing your attention", run ? String(run.needsAttention) : "—"],
        ].map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-[12px] leading-[1.5] text-[var(--muted)]">{label}</dt>
            <dd className="text-[14px] font-semibold text-[var(--platinum)]">{value}</dd>
          </div>
        ))}
      </dl>

      {/* This claim is load-bearing and it is now literally true: a scheduled
          worker advances the run independently of this browser, so closing the
          tab genuinely does not stop it. It was deliberately worded weaker
          until that worker existed. If the schedule is ever removed, weaken
          this sentence in the same change — do not leave a promise standing
          that the system no longer keeps. */}
      <div className="mt-5">
        <Notice
          title="You can leave this page."
          body="The run continues and FairWatchTrade will tell you when your drafts are ready, or if anything needs your attention."
        />
      </div>

      <div className="mt-6 flex flex-wrap gap-2.5">
        {run && run.prepared > 0 && (
          <Secondary onClick={onDrafts}>Review ready drafts</Secondary>
        )}
        {run && run.needsAttention > 0 && (
          <Secondary onClick={onAttention}>Review {run.needsAttention} needing attention</Secondary>
        )}
      </div>
    </section>
  );
}

function AttentionPanel({
  state,
  onDrafts,
  onBack,
  onStateRefresh,
}: {
  state: RoomState | null;
  onDrafts: () => void;
  onBack: () => void;
  /** Re-reads durable state after a retry so the list reflects what really
      happened, rather than this panel editing its own copy of the truth. */
  onStateRefresh: () => Promise<RoomState | null>;
}) {
  const items = state?.needsAttention ?? [];
  const [retryingId, setRetryingId] = useState<string | null>(null);
  /** Per-item outcome sentence from the LAST retry — kept when the item
      stays in the list (still failing) and rendered as success when it has
      just left it. */
  const [retryNotes, setRetryNotes] = useState<Record<string, { ok: boolean; text: string }>>({});

  /* ── TRY AGAIN ──────────────────────────────────────────────────────────
     Supported now, so shown now: the engine re-arms this item's failed
     photographs (an explicit governed act, recorded append-only), fetches
     them under the same laws a worker fetch runs under, and — if the
     evidence is complete — materializes through the normal path. One item,
     one click, nothing else restarted. */
  const retryItem = async (i: AttentionItem) => {
    setRetryingId(i.batchItemId);
    try {
      const res = await fetch("/api/dealer-accelerator/retry-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchItemId: i.batchItemId }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        message?: string;
        outcome?: string;
        retry?: { retrieved: number; stillFailing: number; failureSample: string | null };
        blockedReason?: string | null;
      };
      if (!data.ok) {
        setRetryNotes((n) => ({
          ...n,
          [i.batchItemId]: {
            ok: false,
            text: data.message ?? "The retry could not start. Nothing was changed.",
          },
        }));
        return;
      }
      if (data.outcome === "DRAFT_CREATED" || data.outcome === "ALREADY_MATERIALIZED") {
        setRetryNotes((n) => ({
          ...n,
          [i.batchItemId]: {
            ok: true,
            text: "Prepared. This watch is now in your imported drafts.",
          },
        }));
      } else {
        const still = data.retry?.stillFailing ?? 0;
        setRetryNotes((n) => ({
          ...n,
          [i.batchItemId]: {
            ok: false,
            text:
              still > 0
                ? `FairWatchTrade still could not retrieve ${still === 1 ? "one photograph" : `${still} photographs`} from your website. The new attempt is recorded — correct the source and try again.`
                : `The photographs arrived, but this watch still could not be prepared${data.blockedReason ? ` (${data.blockedReason})` : ""}.`,
          },
        }));
      }
      await onStateRefresh();
    } catch {
      setRetryNotes((n) => ({
        ...n,
        [i.batchItemId]: {
          ok: false,
          text: "The retry did not complete. Reload the page to see the current state before trying again.",
        },
      }));
    } finally {
      setRetryingId(null);
    }
  };
  return (
    <section className="border border-[var(--border-mid)] bg-[var(--surface)] p-6">
      <div className="relative mb-2 flex items-start gap-2">
        <div>
          <Kicker>Dealer Accelerator / Needs Attention</Kicker>
          <h2 className="mt-2 font-display text-[24px] font-light leading-[1.15] text-[var(--platinum)]">
            {items.length === 1
              ? "1 watch needs attention"
              : `${items.length} watches need attention`}
          </h2>
        </div>
        <span className="inline-flex sm:relative">
          <HelpBubble
            label="What Needs Attention means"
            historyKey="fwtDealerAttentionHelp"
            title="Needs Attention"
            bubbleClassName="left-3 right-3 top-[calc(100%+10px)] rounded-2xl sm:left-[-14px] sm:right-auto sm:w-[340px]"
            caretTracksTrigger
          >
            <p className="text-[13px] leading-[1.65] text-[var(--slate)]">
              Needs Attention means FairWatchTrade could not safely prepare this
              watch from your source as it currently stands. It is not a
              rejection, and it does not affect the drafts that were prepared
              successfully.
            </p>
          </HelpBubble>
        </span>
      </div>
      <p className="max-w-[64ch] text-[13px] leading-[1.65] text-[var(--muted)]">
        These watches were not guessed into drafts. Correct your source where
        appropriate and check your inventory again, or leave them for later.
      </p>

      <ul className="mt-5 flex flex-col gap-2.5">
        {items.map((i) => {
          const note = retryNotes[i.batchItemId];
          return (
            <li
              key={i.batchItemId}
              className="border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[12px] text-[var(--gold-subtle)]">{i.sourceItemKey}</p>
                  <p className="mt-1.5 text-[13px] leading-[1.6] text-[var(--platinum)]">
                    {blockedCopy(i.reasonCode)}
                  </p>
                </div>
                <Secondary
                  onClick={() => retryItem(i)}
                  disabled={retryingId !== null}
                >
                  {retryingId === i.batchItemId ? "Trying again…" : "Try again"}
                </Secondary>
              </div>
              {note && (
                <p
                  className={`mt-2.5 border-t border-[var(--border-subtle)] pt-2.5 text-[12px] leading-[1.6] ${
                    note.ok ? "text-[var(--gold-subtle)]" : "text-[var(--muted)]"
                  }`}
                >
                  {note.text}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {/* A retry that succeeded removes its item from the list above; its
          success sentence would vanish with it. Rendered here instead, from
          the notes of items no longer present. */}
      {Object.entries(retryNotes)
        .filter(([id, n]) => n.ok && !items.some((i) => i.batchItemId === id))
        .map(([id, n]) => (
          <div key={id} className="mt-3">
            <Notice title="Watch prepared." body={n.text} />
          </div>
        ))}

      {items.length > 0 && (
        <div className="mt-5">
          <Notice
            title="The watches that succeeded are safe."
            body="Some watches needing attention never means the preparation failed. Every draft that was prepared stays exactly as it is."
          />
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2.5">
        {(state?.importedDraftCount ?? 0) > 0 && (
          <Primary onClick={onDrafts}>Continue to imported drafts</Primary>
        )}
        <Secondary onClick={onBack}>Back</Secondary>
      </div>
    </section>
  );
}

function ReadyPanel({
  state,
  onDrafts,
  onAttention,
  onCheckAgain,
}: {
  state: RoomState | null;
  onDrafts: () => void;
  onAttention: () => void;
  onCheckAgain: () => void;
}) {
  const run = state?.run;
  const prepared = run?.prepared ?? 0;
  return (
    <section className="border border-[var(--border-mid)] bg-[var(--surface)] p-6">
      <Kicker>Dealer Accelerator / Ready</Kicker>
      <h2 className="mb-2 mt-2 font-display text-[24px] font-light leading-[1.15] text-[var(--platinum)]">
        {prepared === 1 ? "1 draft listing is ready." : `${prepared} draft listings are ready.`}
      </h2>
      <p className="max-w-[62ch] text-[13px] leading-[1.65] text-[var(--muted)]">
        Nothing has been published. Review the prepared drafts whenever you are
        ready.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat value={prepared} label="Private drafts prepared" />
        <Stat value={run?.needsAttention ?? 0} label="Needing attention" />
        <Stat value={state?.importedDraftCount ?? 0} label="Imported drafts in total" />
      </div>

      {run?.fatalErrorCode && (
        <div className="mt-5">
          <Notice
            tone="warn"
            title="This run stopped before it finished."
            body={`FairWatchTrade stopped rather than guessing (${run.fatalErrorCode}). Any draft already prepared is safe and nothing was published.`}
          />
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2.5">
        {(state?.importedDraftCount ?? 0) > 0 && (
          <Primary onClick={onDrafts}>Review Imported Drafts</Primary>
        )}
        {(run?.needsAttention ?? 0) > 0 && (
          <Secondary onClick={onAttention}>
            Review {run?.needsAttention} needing attention
          </Secondary>
        )}
        <Secondary onClick={onCheckAgain}>Check for new inventory</Secondary>
      </div>
    </section>
  );
}

function BatchHistory({
  state,
  onStart,
}: {
  state: RoomState | null;
  onStart: () => void;
}) {
  const run = state?.run;
  return (
    <section className="border border-[var(--border-mid)] bg-[var(--surface)] p-6">
      <Kicker>Dealer Accelerator / Batches</Kicker>
      <h2 className="mb-2 mt-2 font-display text-[24px] font-light leading-[1.15] text-[var(--platinum)]">
        Your preparation history
      </h2>
      <p className="max-w-[60ch] text-[13px] leading-[1.65] text-[var(--muted)]">
        Every preparation run keeps a durable record.
      </p>

      {!run && (
        <p className="mt-5 text-[13px] leading-[1.65] text-[var(--muted)]">
          No preparation run yet. Connect your inventory source to begin.
        </p>
      )}

      {run && (
        <div className="mt-5 border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4">
          <p className="text-[13px] text-[var(--platinum)]">
            Inventory version {run.snapshotKey}
          </p>
          <p className="mt-1 text-[12px] leading-[1.6] text-[var(--muted)]">
            {run.startedAt
              ? `Started ${new Date(run.startedAt).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}`
              : "Not yet started"}
            {run.completedAt
              ? ` · finished ${new Date(run.completedAt).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}`
              : ""}
          </p>
          <p className="mt-2.5 text-[13px] text-[var(--platinum)]">
            {run.itemsTotal} watches · {run.prepared} prepared
            {run.needsAttention > 0 ? ` · ${run.needsAttention} needing attention` : ""}
          </p>
        </div>
      )}

      <div className="mt-6">
        <Secondary onClick={onStart}>Back to Dealer Accelerator</Secondary>
      </div>
    </section>
  );
}
