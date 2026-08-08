import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendSellerEmail, escapeHtml } from "@/lib/sellerEmail";

/* ════════════════════════════════════════════════════════════════════════
   POST /api/contact — the in-site contact action

   Replaces the mailto: link that used to hand the visitor off to Outlook or
   Gmail. A message written here is sent from FairWatchTrade, and the visitor
   never leaves the site.

   REUSED, NOT REBUILT: lib/sellerEmail.ts is already the one hardened email
   transport in this repo. It sends from the verified hello@fairwatchtrade.com
   sender, and — the reason it exists — it READS a non-2xx answer from Resend
   and reports the reason instead of resolving silently. A contact form that
   said "received" while the send was rejected would be the same lie that file
   was written to end, so this route only reports success when the transport
   reports success.

   No ticket system, no CRM, no new table. One route, one email, one truthful
   answer to the person who wrote it.

   Open to unauthenticated visitors by design — a FAQ's contact ending is for
   people who do not have an account yet. Bounded against abuse by length
   caps, a shape check on the reply address, and a honeypot; deliberately not
   by an enterprise anti-spam stack.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTACT_INBOX = "hello@fairwatchtrade.com";

const MAX_MESSAGE = 4000;
const MAX_EMAIL = 254;
const MAX_NAME = 120;

/* Deliberately permissive: this checks the address is shaped like an address,
   not that it exists. Rejecting a real person's unusual-but-valid address is
   worse than accepting one that bounces. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ContactBody {
  email?: unknown;
  name?: unknown;
  message?: unknown;
  /** Honeypot — a real person never fills a field they cannot see. */
  website?: unknown;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(request: NextRequest) {
  let body: ContactBody;
  try {
    body = (await request.json()) as ContactBody;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // Honeypot: answer exactly like a success so a bot learns nothing, but
  // send nothing.
  if (str(body.website) !== "") {
    return NextResponse.json({ ok: true });
  }

  const email = str(body.email);
  const name = str(body.name).slice(0, MAX_NAME);
  const message = str(body.message);

  if (message === "") {
    return NextResponse.json(
      { error: "message_required", detail: "Please write your message." },
      { status: 400 }
    );
  }
  if (message.length > MAX_MESSAGE) {
    return NextResponse.json(
      { error: "message_too_long", detail: `Please keep it under ${MAX_MESSAGE} characters.` },
      { status: 400 }
    );
  }
  if (email === "" || email.length > MAX_EMAIL || !EMAIL_SHAPE.test(email)) {
    return NextResponse.json(
      { error: "email_required", detail: "Please give us an email address we can reply to." },
      { status: 400 }
    );
  }

  /* If they happen to be signed in, say so — it tells the reader whether this
     is a customer with a history or a first-time visitor. Never required, and
     never trusted over what they typed. */
  let signedInAs: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedInAs = user?.email ?? null;
  } catch {
    /* a contact form must work for signed-out visitors — silence is fine */
  }

  const html = `
    <div style="font-family: Inter, sans-serif; max-width: 560px; margin: 0 auto; background: #0D0F14; color: #E8E4DC; padding: 2rem;">
      <h1 style="font-family: Georgia, serif; font-weight: 300; color: #C9A84C; font-size: 1.5rem; margin: 0 0 1.25rem;">
        Contact form
      </h1>
      <p style="color: #8A8F9E; font-size: 0.78rem; letter-spacing: .06em; text-transform: uppercase; margin: 0 0 .35rem;">
        Reply to
      </p>
      <p style="color: #E8E4DC; font-size: 0.95rem; margin: 0 0 1rem;">
        ${escapeHtml(email)}${name ? ` &middot; ${escapeHtml(name)}` : ""}
      </p>
      ${
        signedInAs
          ? `<p style="color: #8A8F9E; font-size: 0.8rem; margin: 0 0 1rem;">Signed in as ${escapeHtml(signedInAs)}</p>`
          : `<p style="color: #8A8F9E; font-size: 0.8rem; margin: 0 0 1rem;">Not signed in</p>`
      }
      <div style="border-left: 3px solid #C9A84C; padding: .25rem 0 .25rem .9rem;">
        <p style="color: #E8E4DC; font-size: 0.95rem; line-height: 1.65; margin: 0; white-space: pre-wrap;">${escapeHtml(message)}</p>
      </div>
      <p style="color: #8A8F9E; font-size: 0.72rem; margin-top: 2rem;">
        Sent from the FairWatchTrade contact form.
      </p>
    </div>
  `;

  const sent = await sendSellerEmail({
    to: CONTACT_INBOX,
    subject: `Contact form — ${email}`,
    html,
    kind: "contact",
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
