"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/* ────────────────────────────────────────────────────────────────────────
   LISTING CORRESPONDENCE — components/ListingCorrespondence.tsx  (v2.7)

   Surface 1 of Correspondence v1.0, built per the final ruling: the
   original brief's placement is superseded; the page's own designed
   architecture is used instead —

     • The fixed bottom "Message Seller…" bar (previously a disabled shell
       marked "do not wire without a messaging brief") is the buyer's ENTRY
       POINT. It stays visible while the collector studies the listing.
     • The reserved Section 5 area is the CANONICAL HOME: thread history +
       composer live there, attached to the listing permanently.

   Behavior per ruling:
     • Bar tap → the Section 5 home opens and scrolls into view, composer
       focused. Text typed in the bar rides along into the composer.
     • Existing thread → home is visible on load with history + composer
       (viewing marks the seller's messages read, server-side).
     • No thread → composer appears on first bar tap.
     • The listing's own seller never sees any of this (gated by isOwner
       server-side prop; the component renders nothing for owners).
     • Only authenticated non-owners see the bar (per the original brief's
       gating, unchanged by the ruling).

   One component owns BOTH pieces (the bar is position:fixed, so it can be
   rendered from the in-flow section's position) — this keeps entry point
   and home in one state scope with no cross-component wiring.

   No chat bubbles: sender name, timestamp, body. Collector correspondence.
   Emails are one-way notifications handled entirely by the API routes.

   v2.7a — THE BAR RETIRES AT THE END OF THE LISTING. The fixed bar was
   pinned to bottom-0 unconditionally, so scrolling to the page footer left it
   sitting ON TOP of the footer, covering "Built for collectors. 5% flat fee.
   No ads. Ever." The listing page's <main> already carries pb-32 to reserve
   room for the bar — but the FOOTER lives outside <main>, in the layout, so
   that reserve never protected it.

   Fix: the bar measures its own content container (the nearest <main>, found
   from an in-flow anchor) and retires once that container's bottom edge
   reaches the viewport — i.e. the collector has reached the end of the
   listing and the footer is next. No dependency on the footer's markup, which
   this component cannot see and should not assume.

   This also settles, structurally, the concern that the guest bar competes
   with the gold "Start Purchase Request": by the time that CTA is on screen,
   the bar has retired. There is no moment where a messaging control and the
   purchase control fight for the same decision. That required no relabeling —
   and relabeling would have been a lie: this bar's guest CTA leads to sign-in
   and then to THIS bar (a message composer), not to the purchase flow.
   Correspondence stays truthful about what it is.

   Canary: PFC274 = 62 — /api/evaluate untouched.
   ──────────────────────────────────────────────────────────────────────── */

type ThreadMessage = {
  id: string;
  senderName: string;
  isMine: boolean;
  body: string;
  createdAt: string;
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!isFinite(ms) || ms < 0) return "";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ListingCorrespondence({
  listingId,
  brand,
  model,
  reference,
  priceText,
  heroUrl,
  authed,
  isOwner,
}: {
  listingId: string;
  brand: string;
  model: string | null;
  reference: string;
  priceText: string;
  heroUrl: string | null;
  authed: boolean;
  isOwner: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sectionRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // v2.7a — a zero-size in-flow anchor. The bar itself is position:fixed and
  // therefore has no place in the document flow to measure from; this anchor
  // does, and it lets the bar find its own content container.
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [barRetired, setBarRetired] = useState(false);

  const title = model ? `${brand} ${model}` : brand;
  const eligible = authed && !isOwner;

  // On load: find this listing's existing thread (if any) and open the home
  // with its history — an existing conversation is visible without a tap.
  useEffect(() => {
    if (!eligible) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/messages");
        if (!cancelled && res.ok) {
          const data = await res.json();
          const mine = Array.isArray(data.threads)
            ? data.threads.find(
                (t: { listing?: { id?: string } | null }) => t.listing?.id === listingId
              )
            : null;
          if (mine) {
            setThreadId(mine.id);
            setOpen(true);
            const tRes = await fetch(`/api/messages/${mine.id}`);
            if (!cancelled && tRes.ok) {
              const tData = await tRes.json();
              setMessages(Array.isArray(tData.messages) ? tData.messages : []);
            }
          }
        }
      } catch {
        /* quiet — the composer still works without history */
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [eligible, listingId]);

  // v2.7a — retire the bar once the listing content ends, so it can never
  // overlap the footer (which lives outside <main> and outside this
  // component's knowledge).
  useEffect(() => {
    const main = anchorRef.current?.closest("main");
    // Fail safe: if there's no <main> to measure, behave exactly as before
    // rather than hiding the bar on a page we don't understand.
    if (!main) return;

    let frame = 0;
    const measure = () => {
      frame = 0;
      // main's bottom edge has entered the viewport → end of the listing.
      setBarRetired(main.getBoundingClientRect().bottom <= window.innerHeight);
    };
    const onScroll = () => {
      if (frame) return; // coalesce to one measurement per frame
      frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  function openHome(prefill?: string) {
    setOpen(true);
    if (prefill) setBody((prev) => (prev ? prev : prefill));
    // Wait a frame so the section exists before scrolling to it.
    requestAnimationFrame(() => {
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      textareaRef.current?.focus();
    });
  }

  async function send() {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    setConfirmation(null);
    try {
      let res: Response;
      if (threadId) {
        res = await fetch(`/api/messages/${threadId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: text }),
        });
      } else {
        res = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listingId, body: text }),
        });
      }

      if (res.ok) {
        const data = await res.json();
        const tid = threadId ?? (data.threadId as string | null);
        if (tid) {
          setThreadId(tid);
          const refreshed = await fetch(`/api/messages/${tid}`);
          if (refreshed.ok) {
            const tData = await refreshed.json();
            setMessages(Array.isArray(tData.messages) ? tData.messages : []);
          }
        }
        setBody("");
        setConfirmation("Your message has been sent. The seller will reply here.");
      } else {
        const err = await res.json().catch(() => null);
        setError(err?.detail ?? "Your message could not be sent. Please try again.");
      }
    } catch {
      setError("Your message could not be sent. Please try again.");
    }
    setSending(false);
  }

  // The listing's own seller sees nothing — no bar, no section (ruling).
  if (isOwner) return null;

  return (
    <>
      {/* v2.7a — in-flow anchor for the fixed bar's measurement. Zero-size,
          decorative, never affects layout. */}
      <span ref={anchorRef} aria-hidden="true" className="block h-0 w-0" />

      {/* ── SECTION 5 HOME — thread history + composer. Renders when a
             thread exists or after the bar opens it. ── */}
      {eligible && open && (
        <section ref={sectionRef} className="mt-8">
          <div className="border-t border-[var(--border-faint)] pt-6 text-[8px] uppercase tracking-[3px] text-[var(--gold-subtle)]">
            Correspondence
          </div>

          {/* Regarding block — per the original brief's composer header */}
          <div className="mt-4 border border-[var(--border-subtle)] bg-[var(--surface)] px-4 py-3">
            <div className="text-[8px] uppercase tracking-[2px] text-[var(--muted)]">
              Regarding
            </div>
            <div className="mt-1 font-display text-[14px] font-light text-[var(--platinum)]">
              {title}
            </div>
            <div className="text-[10px] tracking-[0.3px] text-[var(--ghost)]">
              Reference {reference}
            </div>
          </div>

          {/* History — chronological, no bubbles */}
          {loading ? (
            <div className="py-6 text-center font-display text-[12px] italic text-[var(--ghost)]">
              Opening correspondence…
            </div>
          ) : (
            messages.length > 0 && (
              <div className="mt-5 space-y-5">
                {messages.map((m) => (
                  <div key={m.id} className="border-b border-[rgba(255,255,255,0.03)] pb-4">
                    <div className="mb-1 flex items-baseline justify-between">
                      <span
                        className={`text-[10px] uppercase tracking-[1.5px] ${
                          m.isMine ? "text-[var(--gold-subtle)]" : "text-[var(--slate)]"
                        }`}
                      >
                        {m.isMine ? "You" : m.senderName}
                      </span>
                      <span className="text-[9px] text-[var(--ghost)]">
                        {timeAgo(m.createdAt)}
                      </span>
                    </div>
                    <p className="whitespace-pre-line text-[13px] leading-[1.7] text-[var(--platinum-dim)]">
                      {m.body}
                    </p>
                  </div>
                ))}
              </div>
            )
          )}

          {/* Composer */}
          <div className="mt-5">
            <textarea
              ref={textareaRef}
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, 2000))}
              placeholder="Ask about condition, provenance, or request additional photos..."
              rows={3}
              className="w-full border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-[13px] text-[var(--platinum)] placeholder:text-[var(--ghost)] focus:border-[var(--border-gold)] focus:outline-none"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[9px] text-[var(--ghost)]">{body.length}/2000</span>
              <div className="flex items-center gap-3">
                {confirmation && (
                  <span className="font-display text-[12px] italic text-[var(--success)]">
                    {confirmation}
                  </span>
                )}
                {error && <span className="text-[11px] text-[var(--danger)]">{error}</span>}
                <button
                  type="button"
                  onClick={send}
                  disabled={sending || body.trim().length === 0}
                  className={`fw-btn-secondary ${
                    sending || body.trim().length === 0 ? "cursor-not-allowed opacity-40" : ""
                  }`}
                >
                  {sending ? "Sending…" : "Send Message"}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── FIXED BOTTOM BAR — the entry point. Replaces the disabled shell.
             Anchored snapshot left (unchanged from the shell), live entry
             affordance right. Tap → home opens/scrolls, composer focused. ── */}
      {eligible && !barRetired && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border-subtle)] bg-[var(--ink)]">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-6 py-3 sm:px-8">
            <div className="flex min-w-0 items-center gap-3">
              {heroUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={heroUrl}
                  alt=""
                  className="h-10 w-10 shrink-0 border border-[var(--border-subtle)] object-cover"
                />
              )}
              <div className="min-w-0">
                <p className="truncate text-[12px] font-medium text-[var(--platinum)]">{brand}</p>
                <p className="truncate text-[11px] text-[var(--muted)]">
                  Ref. {reference} · {priceText}
                </p>
              </div>
            </div>

            <div className="flex flex-1 items-center gap-2">
              <input
                type="text"
                value={body && !open ? body : ""}
                onChange={(e) => setBody(e.target.value.slice(0, 2000))}
                onFocus={() => openHome()}
                placeholder={threadId ? "Continue the conversation…" : "Message seller…"}
                className="min-w-0 flex-1 border-b border-[var(--border-mid)] bg-transparent px-0 py-2 text-[14px] text-[var(--platinum)] placeholder:text-[var(--ghost)] focus:border-[var(--border-gold)] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => openHome()}
                className="shrink-0 border border-[var(--border-gold)] px-4 py-2 font-[Inter] text-[11px] uppercase tracking-[2px] text-[var(--gold)] transition hover:bg-[rgba(201,168,76,0.06)]"
              >
                {threadId ? "Open" : "Message Seller"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logged-out viewers keep the bar as a doorway to sign in — routed
          through the callbackUrl flow so login returns them right here. */}
      {!authed && !barRetired && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border-subtle)] bg-[var(--ink)]">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-6 py-3 sm:px-8">
            <div className="flex min-w-0 items-center gap-3">
              {heroUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={heroUrl}
                  alt=""
                  className="h-10 w-10 shrink-0 border border-[var(--border-subtle)] object-cover"
                />
              )}
              <div className="min-w-0">
                <p className="truncate text-[12px] font-medium text-[var(--platinum)]">{brand}</p>
                <p className="truncate text-[11px] text-[var(--muted)]">
                  Ref. {reference} · {priceText}
                </p>
              </div>
            </div>
            <div className="flex flex-1 items-center justify-end">
              <Link
                href={`/login?callbackUrl=/listings/${listingId}`}
                className="shrink-0 border border-[var(--border-gold)] px-4 py-2 font-[Inter] text-[11px] uppercase tracking-[2px] text-[var(--gold)] transition hover:bg-[rgba(201,168,76,0.06)]"
              >
                Sign in to Message Seller
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
