"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { issueHandoff, revokeHandoff, handoffUrl } from "@/lib/listingDraft";

/* ────────────────────────────────────────────────────────────────────────
   LIST FROM PHONE — cross-device handoff surface (DD3 Revision 2)

   A quiet transfer tool inside the listing room. Given the server draft id, it
   issues a scoped, expiring handoff token and shows the two approved paths —
   QR code and Copy link — both pointing at /sell/continue/<token> (token only;
   never a raw draft id). The token is non-authoritative: the phone must sign in
   as the same seller to redeem. No SMS, no phone-number collection, no
   marketing language.

   Approved copy is preserved verbatim: "Pay a flat 5% only when your watch
   sells." Visual composition follows DD3 Revision 2; Jason retains final
   real-device visual closure.

   The desktop's paused/read-only "Continuing on your phone" state and the
   status poll are owned by the SellFlow host, not this surface — this component
   only mints and presents the handoff.
   ──────────────────────────────────────────────────────────────────────── */

export default function ListFromPhoneHandoff({
  draftId,
  onClose,
}: {
  draftId: string;
  onClose?: () => void;
}) {
  const [phase, setPhase] = useState<"issuing" | "ready" | "error">("issuing");
  const [url, setUrl] = useState("");
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await issueHandoff(draftId);
      if (cancelled) return;
      if (res.state === "ISSUED" && res.token) {
        const u = handoffUrl(res.token, window.location.origin);
        setUrl(u);
        try {
          const dataUrl = await QRCode.toDataURL(u, {
            margin: 1,
            width: 208,
            color: { dark: "#0b0d12", light: "#e8e2d6" },
          });
          if (!cancelled) setQr(dataUrl);
        } catch {
          /* QR render failure still leaves the copy link usable */
        }
        if (!cancelled) setPhase("ready");
      } else if (!cancelled) {
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [draftId]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the link is still visible to select manually */
    }
  }

  async function close() {
    // Cancelling the surface releases the outstanding handoff (authority stays
    // on desktop). Best-effort; never blocks the close.
    try {
      await revokeHandoff(draftId);
    } catch {
      /* ignore */
    }
    onClose?.();
  }

  return (
    <section
      aria-label="List from phone"
      className="relative mx-auto w-full max-w-[380px] border border-[var(--border-subtle)] bg-[color:light-dark(#FFFDF8,#0d1118)] p-6 text-center"
    >
      {/* Universal close — device-run founder ruling: the ×
          is THE dismissal, with a real accessible name. Closing cancels the
          outstanding handoff (revokes the QR token — authority stays on
          desktop) and the host returns focus to the control that opened the
          panel. The former "Keep editing here" action was product language
          doing window chrome's job, and is removed. */}
      {onClose && (
        <button
          type="button"
          aria-label="Close phone handoff"
          title="Close phone handoff"
          onClick={close}
          className="group absolute right-2 top-2 flex h-11 w-11 items-center justify-center focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]"
        >
          {/* FairWatchTrade control language (final): the thin
              aged-gold frame hugs the × itself (~30px), while the button's
              invisible hit target stays a generous 44×44. Platinum glyph,
              faint gold glow on hover/focus — precise control, not a boxed
              button. */}
          <span
            aria-hidden="true"
            className="flex h-[30px] w-[30px] items-center justify-center border border-[var(--border-gold)] text-[22px] font-light leading-none text-[var(--platinum)] transition-all group-hover:border-[color:light-dark(rgba(122,95,32,0.55),rgba(201,168,76,0.55))] group-hover:shadow-[0_0_10px_rgba(201,168,76,0.25)] group-focus-visible:shadow-[0_0_10px_rgba(201,168,76,0.25)]"
          >
            ×
          </span>
        </button>
      )}
      <div className="text-[8px] uppercase tracking-[3px] text-[var(--gold-subtle)]">
        List from phone
      </div>
      <h2 className="mt-2 font-display text-[19px] font-light text-[var(--platinum)]">
        Continue on your phone
      </h2>
      <p className="mt-1 text-[12px] leading-[1.5] text-[var(--muted)]">
        Secure handoff — sign in on your phone as yourself to keep the same
        listing.
      </p>

      <div className="mt-5 flex min-h-[208px] items-center justify-center">
        {phase === "issuing" && (
          <div className="text-[11px] uppercase tracking-[2px] text-[var(--muted)]">
            Preparing…
          </div>
        )}
        {phase === "error" && (
          <div className="text-[12px] leading-[1.5] text-[var(--danger)]">
            Couldn’t start the handoff. Please try again.
          </div>
        )}
        {phase === "ready" && qr && (
          <img
            src={qr}
            alt="Scan to continue this listing on your phone"
            width={208}
            height={208}
            className="border border-[var(--border-faint)]"
          />
        )}
      </div>

      {phase === "ready" && (
        <>
          <button
            type="button"
            onClick={copy}
            className="mt-4 w-full border border-[var(--border-gold)] bg-[var(--gold-whisper)] px-4 py-2.5 text-[11px] uppercase tracking-[1.6px] text-[var(--gold)] transition-colors hover:bg-[color:light-dark(rgba(122,95,32,0.12),rgba(201,168,76,0.1))]"
          >
            {copied ? "Link copied" : "Copy link"}
          </button>
          <p className="mt-2 break-all text-[10px] leading-[1.4] text-[var(--muted)]">
            {url}
          </p>
        </>
      )}

      <p className="mt-5 border-t border-[var(--border-faint)] pt-4 text-[12px] text-[var(--platinum-dim)]">
        Pay a flat 5% only when your watch sells.
      </p>
    </section>
  );
}
