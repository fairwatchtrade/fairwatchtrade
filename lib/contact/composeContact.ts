/* ════════════════════════════════════════════════════════════════════════
   CONTACT — the one rule for who a message is from and what it says
   (In-FWT contact composer, 2026-09-10)

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "The contact form needs the visitor's email."

   Only when FairWatchTrade does not already know it. A signed-in visitor's
   reply identity is the authenticated account email, decided on the server
   from the session; anything the browser sends as `email` is ignored for
   them. A signed-out visitor is asked for one reply address, because
   without it nobody can answer. Known identity stays quiet; unknown reply
   identity is asked for once, only when it is actually needed.

   Subject is the visitor's own words, trimmed and bounded. It is never
   replaced with a generated line. The legacy /contact form sends no
   subject; for it alone the old "Contact form — <address>" line is kept so
   that page keeps working unchanged.

   Pure. The route feeds it the parsed body and the session email; the tests
   feed it in-memory values. No I/O here.
   ════════════════════════════════════════════════════════════════════════ */

export const CONTACT_LIMITS = Object.freeze({
  subject: 200,
  message: 4000,
  email: 254,
  name: 120,
});

/* Deliberately permissive: shaped like an address, not proven to exist. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ContactInput = {
  subject?: unknown;
  message?: unknown;
  email?: unknown;
  /** Legacy /contact field. Optional, never required. */
  name?: unknown;
  /** Honeypot: a real person never fills a field they cannot see. */
  website?: unknown;
};

export type ContactRefusal =
  | "message_required"
  | "message_too_long"
  | "subject_too_long"
  | "email_required"
  | "email_too_long";

export type ContactResolution =
  | { ok: true; honeypot: true }
  | {
      ok: true;
      honeypot: false;
      /** Where a human answers. */
      replyTo: string;
      /** How the reply identity was established. */
      identity: "account" | "guest";
      subject: string;
      message: string;
      name: string;
    }
  | { ok: false; error: ContactRefusal; detail: string };

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Decide the message FairWatchTrade will send on the visitor's behalf.
 * `sessionEmail` is the authenticated account's email, or null when there is
 * no session. It is the only source of a signed-in visitor's reply identity.
 */
export function resolveContact(input: ContactInput, sessionEmail: string | null | undefined): ContactResolution {
  if (str(input.website) !== "") return { ok: true, honeypot: true };

  const message = str(input.message);
  if (message === "") {
    return { ok: false, error: "message_required", detail: "Please write your message." };
  }
  if (message.length > CONTACT_LIMITS.message) {
    return {
      ok: false,
      error: "message_too_long",
      detail: `Please keep it under ${CONTACT_LIMITS.message} characters.`,
    };
  }

  const subjectRaw = str(input.subject);
  if (subjectRaw.length > CONTACT_LIMITS.subject) {
    return {
      ok: false,
      error: "subject_too_long",
      detail: `Please keep the subject under ${CONTACT_LIMITS.subject} characters.`,
    };
  }

  const name = str(input.name).slice(0, CONTACT_LIMITS.name);

  const account = str(sessionEmail);
  let replyTo: string;
  let identity: "account" | "guest";
  if (account !== "") {
    replyTo = account;
    identity = "account";
  } else {
    const guest = str(input.email);
    if (guest === "" || !EMAIL_SHAPE.test(guest)) {
      return {
        ok: false,
        error: "email_required",
        detail: "Please give us an email address we can reply to.",
      };
    }
    if (guest.length > CONTACT_LIMITS.email) {
      return { ok: false, error: "email_too_long", detail: "That email address is too long." };
    }
    replyTo = guest;
    identity = "guest";
  }

  /* The visitor's subject is the subject. Only the legacy form, which has no
     subject field, gets the old generated line. */
  const subject = subjectRaw !== "" ? subjectRaw : `Contact form — ${replyTo}`;

  return { ok: true, honeypot: false, replyTo, identity, subject, message, name };
}
