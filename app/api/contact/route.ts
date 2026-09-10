import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendSellerEmail, escapeHtml } from "@/lib/sellerEmail";
import { resolveContact, type ContactInput } from "@/lib/contact/composeContact";

/* ════════════════════════════════════════════════════════════════════════
   POST /api/contact — the in-site contact action

   Replaces the mailto: link that used to hand the visitor off to Outlook or
   Gmail. A message written here is sent from FairWatchTrade, and the visitor
   never leaves the site.

   WHO IT IS FROM (in-FWT contact composer, 2026-09-10). The reply identity
   is decided by lib/contact/composeContact.ts from one fact this route
   supplies: the authenticated session's email, or null. Signed in, the
   account email is the reply address and any `email` in the body is
   ignored. Signed out, one valid guest email is required. Subject is the
   visitor's own, bounded; only the legacy /contact form, which has no
   subject field, gets the generated "Contact form — <address>" line.

   REUSED, NOT REBUILT: lib/sellerEmail.ts is already the one hardened email
   transport in this repo. It sends from the verified hello@fairwatchtrade.com
   sender, and — the reason it exists — it READS a non-2xx answer from Resend
   and reports the reason instead of resolving silently. This route only
   reports success when the transport reports success, and it sets the
   provider Reply-To to the resolved reply identity so the human reading the
   inbox answers the right person by replying.

   No ticket system, no CRM, no new table. One route, one email, one truthful
   answer to the person who wrote it.

   Open to unauthenticated visitors by design. Bounded against abuse by
   length caps, a shape check on the guest address, and a honeypot;
   deliberately not by an enterprise anti-spam stack.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTACT_INBOX = "hello@fairwatchtrade.com";

/* Contact mail is sent FROM a second address on the same verified domain.
   Sent from hello@ and addressed to hello@, Resend accepted every message and
   none reached the inbox, while ordinary external mail to hello@ arrives: the
   self-addressed shape was the one difference (2026-09-10). contact@ is a
   transport sender only; the public contact identity stays hello@, and the
   Reply-To stays the person who wrote. */
const CONTACT_SENDER = "FairWatchTrade <contact@fairwatchtrade.com>";

export async function POST(request: NextRequest) {
  let body: ContactInput;
  try {
    body = (await request.json()) as ContactInput;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  /* The only source of a signed-in visitor's identity: the session, read on
     the server. Never the body. A read failure simply means "not signed
     in", so a signed-out visitor is asked for an address as usual. */
  let sessionEmail: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    sessionEmail = user?.email ?? null;
  } catch {
    sessionEmail = null;
  }

  const resolved = resolveContact(body, sessionEmail);

  // Honeypot: answer exactly like a success so a bot learns nothing, but
  // send nothing.
  if (resolved.ok && resolved.honeypot) {
    return NextResponse.json({ ok: true });
  }
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error, detail: resolved.detail }, { status: 400 });
  }

  const { replyTo, identity, subject, message, name } = resolved;

  const html = `
    <div style="font-family: Inter, sans-serif; max-width: 560px; margin: 0 auto; background: #0D0F14; color: #E8E4DC; padding: 2rem;">
      <h1 style="font-family: Georgia, serif; font-weight: 300; color: #C9A84C; font-size: 1.5rem; margin: 0 0 1.25rem;">
        ${escapeHtml(subject)}
      </h1>
      <p style="color: #8A8F9E; font-size: 0.78rem; letter-spacing: .06em; text-transform: uppercase; margin: 0 0 .35rem;">
        Reply to
      </p>
      <p style="color: #E8E4DC; font-size: 0.95rem; margin: 0 0 1rem;">
        ${escapeHtml(replyTo)}${name ? ` &middot; ${escapeHtml(name)}` : ""}
      </p>
      <p style="color: #8A8F9E; font-size: 0.8rem; margin: 0 0 1rem;">
        ${identity === "account" ? "Signed-in account" : "Not signed in"}
      </p>
      <div style="border-left: 3px solid #C9A84C; padding: .25rem 0 .25rem .9rem;">
        <p style="color: #E8E4DC; font-size: 0.95rem; line-height: 1.65; margin: 0; white-space: pre-wrap;">${escapeHtml(message)}</p>
      </div>
      <p style="color: #8A8F9E; font-size: 0.72rem; margin-top: 2rem;">
        Sent from the FairWatchTrade contact composer.
      </p>
    </div>
  `;

  const sent = await sendSellerEmail({
    to: CONTACT_INBOX,
    subject,
    html,
    kind: "contact",
    replyTo,
    from: CONTACT_SENDER,
  });

  if (!sent.ok) {
    // Never tell someone their message was received when it was not.
    return NextResponse.json(
      {
        error: "send_failed",
        reason: sent.reason ?? "unknown",
        detail:
          "We could not send your message just now. Please try again, or write to hello@fairwatchtrade.com directly.",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
