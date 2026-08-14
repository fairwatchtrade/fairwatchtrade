"use client";

import { useState } from "react";

/* ════════════════════════════════════════════════════════════════════════
   CONTACT FORM — components/ContactForm.tsx

   The in-site replacement for the old mailto: link. The visitor writes here
   and stays here; nothing opens a mail client.

   Truthfulness rule, inherited from lib/sellerEmail.ts: this form says
   "received" only when the server says the send actually succeeded. A
   rejected send shows the reason and keeps the visitor's words in the box so
   nothing they wrote is lost.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

const INPUT =
  "w-full border border-[var(--border-subtle)] bg-transparent px-3 py-2.5 text-[14px] text-[var(--platinum)] placeholder:text-[var(--muted)] focus:border-[var(--border-gold)] focus:outline-none disabled:opacity-60";
const LABEL = "mb-1.5 block text-[11px] uppercase tracking-[1.5px] text-[var(--muted)]";

export default function ContactForm({
  initialEmail = "",
  initialName = "",
}: {
  initialEmail?: string;
  initialName?: string;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [name, setName] = useState(initialName);
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    setError(null);

    if (message.trim() === "") {
      setError("Please write your message.");
      return;
    }
    if (email.trim() === "") {
      setError("Please give us an email address we can reply to.");
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, message, website }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; detail?: string };
      if (res.ok && data.ok) {
        setSent(true);
      } else {
        setError(data.detail ?? "We could not send your message just now. Please try again.");
      }
    } catch {
      setError("We could not reach FairWatchTrade just now. Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div
        role="status"
        className="border border-[var(--border-gold)] bg-[var(--gold-whisper)] px-6 py-8"
      >
        <h2 className="font-display text-[22px] font-normal leading-[28px] text-[var(--platinum)]">
          Message received.
        </h2>
        <p className="mt-2 max-w-[560px] text-[14px] leading-[22px] text-[var(--platinum-dim)]">
          Thank you — it is with us, and we will reply to{" "}
          <span className="text-[var(--platinum)]">{email}</span>.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="max-w-[560px]">
      <div className="mb-4">
        <label htmlFor="contact-email" className={LABEL}>
          Your email
        </label>
        <input
          id="contact-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={sending}
          placeholder="so we can reply"
          className={INPUT}
        />
      </div>

      <div className="mb-4">
        <label htmlFor="contact-name" className={LABEL}>
          Your name <span className="normal-case tracking-normal">(optional)</span>
        </label>
        <input
          id="contact-name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={sending}
          className={INPUT}
        />
      </div>

      <div className="mb-4">
        <label htmlFor="contact-message" className={LABEL}>
          Message
        </label>
        <textarea
          id="contact-message"
          required
          rows={7}
          maxLength={4000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={sending}
          placeholder="What can we help with?"
          className={`${INPUT} leading-[22px]`}
        />
        <div className="mt-1 text-right text-[10px] text-[var(--muted)]">
          {message.length} / 4000
        </div>
      </div>

      {/* Honeypot — hidden from people, tempting to bots. Not display:none, so
          it stays in the form data; aria-hidden and off-tab for assistive tech. */}
      <div className="absolute left-[-9999px] top-[-9999px]" aria-hidden="true">
        <label htmlFor="contact-website">Website</label>
        <input
          id="contact-website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="mb-3 text-[13px] leading-[20px] text-[var(--danger)]">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={sending}
        className="min-h-[44px] border border-[var(--border-gold)] bg-[var(--gold-whisper)] px-[22px] py-[12px] text-[12px] uppercase tracking-[1.6px] text-[var(--gold)] transition hover:bg-[rgba(201,168,76,0.1)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {sending ? "Sending…" : "Send Message"}
      </button>
    </form>
  );
}
