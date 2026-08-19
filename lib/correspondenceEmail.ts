import { createServiceClient } from "@/lib/supabase/service";

/* ────────────────────────────────────────────────────────────────────────
   CORRESPONDENCE EMAIL — lib/correspondenceEmail.ts  (v5.93)

   The one home for the correspondence notification email. Until now two
   identical copies lived in /api/messages/route.ts and
   /api/messages/[threadId]/route.ts; consolidating them here removes the
   drift risk and gives the v5.93 fixes a single seam:

   · RECIPIENT LOOKUP WAS SILENTLY DEAD. Both routes read the recipient's
     email/notify_email from `profiles` under the SENDER's session — and
     profiles is select-own, so the read returned nothing and no
     correspondence email has been deliverable under that policy. The
     lookup now uses the trusted service client for exactly one narrow
     read (email + notify_email of an id the route has ALREADY authorized
     as the other participant of the caller's own thread). Authorization
     stays with RLS on the thread; the service read only fetches the
     doorbell address.

   · LINK TARGET IS ROLE-AWARE. "Open Conversation" lands where the
     recipient's conversation actually lives: the listing page for a
     buyer, the seller workspace Communications room for a seller. The
     old hard-coded /listings/{id} sent sellers to their own public
     listing — a page that renders owners no correspondence at all.

   One-way notifications only, permanently: no inbound parsing, no
   reply-by-email. The email is the doorbell; the room is where the
   conversation lives.

   PFC274 = 62 — the evaluate route is untouched.
   ──────────────────────────────────────────────────────────────────────── */

export const SITE_URL = "https://fairwatchtrade.com";

/* v2.6a — sender is correspondence@fairwatchtrade.com in production (the
   address itself says what it is; display name carries the brand), with
   Resend's default test sender in development. */
const EMAIL_FROM =
  process.env.NODE_ENV === "production"
    ? "FairWatchTrade <correspondence@fairwatchtrade.com>"
    : "FairWatchTrade <onboarding@resend.dev>";

/** Escape user text before it's interpolated into email HTML. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The recipient's doorbell address and preference. Trusted-server read of
    two columns for one id the caller's route has already authorized as the
    counterpart of the caller's own thread/request. Returns null on any
    failure — email is non-fatal by design and must never block a send. */
export async function getRecipientEmailPrefs(
  userId: string
): Promise<{ email: string; notify: boolean } | null> {
  try {
    const service = createServiceClient();
    const { data } = await service
      .from("profiles")
      .select("email, notify_email")
      .eq("id", userId)
      .maybeSingle();
    if (!data?.email) return null;
    return { email: data.email, notify: data.notify_email === true };
  } catch {
    return null;
  }
}

/** Trigger-1/2 email. Non-fatal by design — messaging already succeeded. */
export async function sendCorrespondenceEmail(opts: {
  to: string;
  subject: string;
  senderName: string;
  preview: string;
  /** Where "Open Conversation" lands — role-aware, see the header note. */
  linkUrl: string;
  listingTitle: string;
}) {
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: opts.to,
      subject: opts.subject,
      html: `
        <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; background: #0D0F14; color: #E8E4DC; padding: 2rem;">
          <h1 style="font-family: Georgia, serif; font-weight: 300; color: #C9A84C; font-size: 1.8rem; margin-bottom: 0.5rem;">
            FairWatchTrade
          </h1>
          <p style="color: #B7BAC4; font-size: 0.9rem; margin-bottom: 1rem;">
            You have a new message about ${opts.listingTitle}.
          </p>
          <p style="color: #8A8F9E; font-size: 0.85rem; margin-bottom: 0.75rem;">
            ${opts.senderName} wrote:
          </p>
          <div style="border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem;">
            <p style="color: #E8E4DC; font-size: 0.9rem; line-height: 1.7; margin: 0; font-style: italic;">
              &ldquo;${opts.preview}&rdquo;
            </p>
          </div>
          <p style="color: #B7BAC4; font-size: 0.85rem; margin-bottom: 1rem;">
            Continue the conversation on FairWatchTrade
          </p>
          <a href="${opts.linkUrl}"
             style="display: inline-block; background: #C9A84C; color: #0D0F14; padding: 0.75rem 1.5rem; border-radius: 6px; text-decoration: none; font-size: 0.85rem; font-weight: 500;">
            Open Conversation &rarr;
          </a>
        </div>
      `,
    }),
  }).catch(() => {
    /* email failure is non-fatal — the message is already delivered in-app */
  });
}
