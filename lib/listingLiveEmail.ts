/* ════════════════════════════════════════════════════════════════════════
   lib/listingLiveEmail.ts — the ONE "your listing is live" seller email

   Template and sending machinery lifted verbatim from app/api/listings
   (v2.24), where it lived while submission and publication were the same
   act. The governed lifecycle (v3.53) separated them: publication now
   happens only at founder approval, so the email has to be reachable from
   the adjudication route too. Extracted rather than copied — one template,
   one subject, one place to change them.

   TRUTH RULE: this says the listing is LIVE. Call it only after a real
   transition into 'published' has actually landed. Never on submission,
   never on a failed or stale approval, never on a re-save of a listing that
   was already public.

   Non-fatal by construction: a mail failure must never fail the transition
   that already succeeded.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export async function sendListingLiveEmail(params: {
  to: string | null | undefined;
  brand?: string;
  model?: string | null;
  reference?: string;
  /** Money Truth Stage B: currency-aware text (US$…, CHF …), never a bare $. */
  priceText: string;
  listingId: string;
}): Promise<void> {
  const { to, brand, model, reference, priceText, listingId } = params;
  if (!to) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "FairWatchTrade <hello@fairwatchtrade.com>",
      to,
      subject: "Your listing is live on FairWatchTrade",
      html: `
        <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; background: #0D0F14; color: #E8E4DC; padding: 2rem;">
          <h1 style="font-family: Georgia, serif; font-weight: 300; color: #C9A84C; font-size: 1.8rem; margin-bottom: 0.5rem;">
            FairWatchTrade
          </h1>
          <p style="color: #B7BAC4; font-size: 0.9rem; margin-bottom: 1.5rem;">
            Your listing is now live on the marketplace.
          </p>
          <div style="border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem;">
            <p style="color: #C9A84C; font-size: 1rem; font-weight: 500; margin: 0 0 0.25rem;">
              ${brand ?? ""}${model ? " " + model : ""}
            </p>
            <p style="color: #8A8F9E; font-size: 0.8rem; margin: 0 0 0.25rem;">
              Ref. ${reference ?? ""}
            </p>
            <p style="color: #E8E4DC; font-size: 1rem; font-weight: 600; margin: 0.5rem 0 0;">
              ${priceText}
            </p>
          </div>
          <a href="https://fairwatchtrade.com/listings/${listingId}"
             style="display: inline-block; background: #C9A84C; color: #0D0F14; padding: 0.75rem 1.5rem; border-radius: 6px; text-decoration: none; font-size: 0.85rem; font-weight: 500;">
            View Your Listing
          </a>
          <p style="color: #8A8F9E; font-size: 0.75rem; margin-top: 2rem;">
            FairWatchTrade · Independent &amp; boutique watchmakers only · 5% flat fee
          </p>
        </div>
      `,
    }),
  }).catch(() => {
    // Email failure is non-fatal — the listing is already live.
  });
}
