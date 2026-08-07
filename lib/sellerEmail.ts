/* ════════════════════════════════════════════════════════════════════════
   lib/sellerEmail.ts — the one seller-email transport

   WHY THIS EXISTS. The previous sender did this:

       await fetch("https://api.resend.com/emails", {...}).catch(() => {});

   fetch RESOLVES on a 401 or 422, and that .catch only sees network errors —
   so a rejected send was indistinguishable from a delivered one. Production
   held a stale Resend key for roughly a month and every "your listing is
   live" email in that window failed in total silence. The listing was live,
   the seller was never told, and nothing anywhere said so.

   Every seller email now goes through here, and a non-2xx answer is read,
   logged with Resend's own reason, and reported to the caller. Sending stays
   NON-FATAL — a mail outage must never undo a transition that already
   succeeded — but it is no longer invisible.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

const FROM = "FairWatchTrade <hello@fairwatchtrade.com>";

export type SellerEmailResult = { ok: boolean; reason?: string };

export async function sendSellerEmail(params: {
  to: string | null | undefined;
  subject: string;
  html: string;
  /** Short tag for the log line, e.g. "listing-live" or "decision:rejected". */
  kind: string;
}): Promise<SellerEmailResult> {
  const { to, subject, html, kind } = params;
  if (!to) {
    console.error(`[seller-email:${kind}] no recipient address — not sent`);
    return { ok: false, reason: "no_recipient" };
  }
  if (!process.env.RESEND_API_KEY) {
    console.error(`[seller-email:${kind}] RESEND_API_KEY missing — not sent`);
    return { ok: false, reason: "no_api_key" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    });
    if (!res.ok) {
      // Read Resend's own words rather than guessing — a bad key and an
      // unverified domain fail differently and want different fixes.
      const detail = await res.text().catch(() => "");
      console.error(
        `[seller-email:${kind}] Resend rejected the send: ${res.status} ${detail.slice(0, 300)}`
      );
      return { ok: false, reason: `http_${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error(`[seller-email:${kind}] send failed:`, e);
    return { ok: false, reason: "network_error" };
  }
}

/* Shared chrome so every seller email is recognisably the same voice. The
   caller supplies only the sentence that is true for its own decision. */
export function sellerEmailShell(params: {
  lead: string;
  listingLine: string;
  referenceLine: string;
  /** Optional seller-facing reason block — the persisted decision message. */
  reason?: string | null;
  reasonLabel?: string;
  nextAction: string;
  ctaHref: string;
  ctaLabel: string;
}): string {
  const { lead, listingLine, referenceLine, reason, reasonLabel, nextAction, ctaHref, ctaLabel } =
    params;
  return `
    <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; background: #0D0F14; color: #E8E4DC; padding: 2rem;">
      <h1 style="font-family: Georgia, serif; font-weight: 300; color: #C9A84C; font-size: 1.8rem; margin-bottom: 0.5rem;">
        FairWatchTrade
      </h1>
      <p style="color: #B7BAC4; font-size: 0.9rem; margin-bottom: 1.5rem;">
        ${lead}
      </p>
      <div style="border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem;">
        <p style="color: #C9A84C; font-size: 1rem; font-weight: 500; margin: 0 0 0.25rem;">
          ${listingLine}
        </p>
        <p style="color: #8A8F9E; font-size: 0.8rem; margin: 0;">
          ${referenceLine}
        </p>
      </div>
      ${
        reason
          ? `<div style="border-left: 3px solid #C9A84C; padding: 0.25rem 0 0.25rem 0.9rem; margin-bottom: 1.5rem;">
               <p style="color: #8A8F9E; font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; margin: 0 0 0.4rem;">
                 ${reasonLabel ?? "From the review"}
               </p>
               <p style="color: #E8E4DC; font-size: 0.9rem; line-height: 1.6; margin: 0; white-space: pre-wrap;">${reason}</p>
             </div>`
          : ""
      }
      <p style="color: #B7BAC4; font-size: 0.85rem; line-height: 1.6; margin-bottom: 1.5rem;">
        ${nextAction}
      </p>
      <a href="${ctaHref}"
         style="display: inline-block; background: #C9A84C; color: #0D0F14; padding: 0.75rem 1.5rem; border-radius: 6px; text-decoration: none; font-size: 0.85rem; font-weight: 500;">
        ${ctaLabel}
      </a>
      <p style="color: #8A8F9E; font-size: 0.75rem; margin-top: 2rem;">
        FairWatchTrade &middot; Independent &amp; boutique watchmakers &middot; 5% flat fee
      </p>
    </div>
  `;
}

/** Seller-supplied and founder-supplied text both land in HTML — escape it. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
