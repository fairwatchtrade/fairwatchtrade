"use client";

import { useEffect, useId, useRef, useState } from "react";

/* ────────────────────────────────────────────────────────────────────────
   CONTACT COMPOSER — the in-FairWatchTrade way to send us a message

   A visitor who activates a contact doorway stays on the page they were
   reading, gets a Subject and a Message, and never has an external mail
   client opened for them. No mailto anywhere in this file.

   Reply identity is conditional, decided by the mounting server page:
     · signed in  → Subject + Message. FairWatchTrade already knows who is
                     writing; the server derives the reply address from the
                     session and ignores anything the browser might send.
     · signed out → Your email address + Subject + Message. Asked for once,
                     only because nobody could otherwise answer.
   There is no Name, no Reply-to, no To, no recipient line.

   Send truth: "Message sent." appears only after /api/contact reports that
   the transport accepted the message. A failed send keeps every typed value
   on screen with the governed sentence and no external fallback.

   Dialog semantics: role=dialog, aria-modal, named by its title, initial
   focus on the first relevant field, Tab contained inside, Escape closes,
   and the mounting page returns focus to the doorway that opened it.
   ──────────────────────────────────────────────────────────────────────── */

export const COMPOSER_COPY = Object.freeze({
  title: "Send us a message",
  intro: "Stay right here. We’ll get your message to the right place.",
  emailLabel: "Your email address",
  subjectLabel: "Subject",
  messageLabel: "Message",
  send: "Send message",
  sent: "Message sent.",
  failed: "We couldn’t send your message. Nothing you wrote was lost. Try again.",
  close: "Close",
});

const LABEL = "block text-[12px] uppercase tracking-[0.08em] text-[var(--slate)]";
const FIELD =
  "mt-1.5 w-full border border-[var(--border-mid)] bg-[var(--ink)] px-3 py-2.5 text-[14px] leading-[22px] text-[var(--platinum)] outline-none focus-visible:border-[var(--gold)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--gold)]";

type Phase = "idle" | "sending" | "sent" | "failed";

export default function ContactComposer({
  open,
  signedIn,
  onClose,
}: {
  open: boolean;
  /** Decided by the mounting SERVER page from the session, never here. */
  signedIn: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const introId = useId();
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [phase, setPhase] = useState<Phase>("idle");
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  /* Initial focus: the first field the visitor actually has to fill. */
  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => firstFieldRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  /* After a confirmed send the form is gone, so the field that held focus is
     gone with it. Focus moves to the Close control, keeping keyboard focus
     (and Escape) inside the dialog instead of letting it fall to the page. */
  useEffect(() => {
    if (open && phase === "sent") closeRef.current?.focus();
  }, [open, phase]);

  if (!open) return null;

  const sending = phase === "sending";

  function close() {
    if (sending) return;
    if (phase === "sent") {
      setEmail("");
      setSubject("");
      setMessage("");
      setPhase("idle");
    }
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true");
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    setPhase("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        /* A signed-in visitor sends no email: the server derives it from the
           session and would ignore one anyway. */
        body: JSON.stringify(
          signedIn ? { subject, message, website } : { email, subject, message, website }
        ),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
      /* Only the server's own accepted-send answer is success. Anything
         else, including a detail sentence it may carry, is the governed
         failure state with everything typed still on screen. */
      setPhase(res.ok && data.ok === true ? "sent" : "failed");
    } catch {
      setPhase("failed");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(7,8,12,0.72)] px-4 py-6"
      onClick={close}
      onKeyDown={onKeyDown}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={introId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full w-full max-w-[520px] overflow-y-auto border border-[var(--border-mid)] bg-[var(--surface)] px-5 py-6 sm:px-7"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="font-display text-[24px] font-normal leading-[30px] text-[var(--platinum)]">
            {COMPOSER_COPY.title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            disabled={sending}
            aria-label={COMPOSER_COPY.close}
            className="-mr-2 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center text-[22px] leading-none text-[var(--muted)] transition-colors hover:text-[var(--platinum)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)] disabled:opacity-50"
          >
            ×
          </button>
        </div>
        <p id={introId} className="mt-2 text-[14px] leading-[22px] text-[var(--slate)]">
          {COMPOSER_COPY.intro}
        </p>

        {phase === "sent" ? (
          <p role="status" className="mt-6 text-[14px] leading-[22px] text-[var(--platinum)]">
            {COMPOSER_COPY.sent}
          </p>
        ) : (
          <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
            {phase === "failed" && (
              <p
                role="alert"
                className="border-l-2 border-[var(--gold)] pl-3 text-[14px] leading-[22px] text-[var(--platinum)]"
              >
                {COMPOSER_COPY.failed}
              </p>
            )}

            {!signedIn && (
              <label className={LABEL}>
                {COMPOSER_COPY.emailLabel}
                <input
                  ref={firstFieldRef}
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={sending}
                  className={FIELD}
                />
              </label>
            )}

            <label className={LABEL}>
              {COMPOSER_COPY.subjectLabel}
              <input
                ref={signedIn ? firstFieldRef : undefined}
                type="text"
                name="subject"
                required
                maxLength={200}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={sending}
                className={FIELD}
              />
            </label>

            <label className={LABEL}>
              {COMPOSER_COPY.messageLabel}
              <textarea
                name="message"
                required
                maxLength={4000}
                rows={7}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={sending}
                className={`${FIELD} min-h-[160px] resize-y`}
              />
            </label>

            {/* Honeypot: never shown, never focusable, never filled by a person. */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden"
            />

            <div className="mt-2 flex justify-end">
              <button
                type="submit"
                disabled={sending}
                className="flex min-h-[46px] cursor-pointer items-center justify-center border border-[var(--gold)] bg-[var(--cta-fill)] px-5 text-[12px] font-semibold text-[var(--on-cta)] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)] disabled:cursor-default disabled:opacity-60"
              >
                {COMPOSER_COPY.send}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
