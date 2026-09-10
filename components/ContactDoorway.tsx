"use client";

/* ────────────────────────────────────────────────────────────────────────
   CONTACT DOORWAY — the visible FairWatchTrade contact identity

   The address is the doorway. It reads as contact identity and behaves as
   a button that opens the in-FairWatchTrade composer; it is never a mailto
   link and never launches Outlook, Gmail or Apple Mail. Quiet by design: a
   14 px gold line with an underline, no card, no pill, no badge, no icon,
   no new surface. The mounting page owns the composer and gets the button
   element back so it can return focus there on close.
   ──────────────────────────────────────────────────────────────────────── */

export const CONTACT_ADDRESS = "hello@fairwatchtrade.com";

export default function ContactDoorway({
  onOpen,
}: {
  /** Receives the doorway button so focus can be returned to it on close. */
  onOpen: (trigger: HTMLButtonElement) => void;
}) {
  return (
    <div className="px-[18px] pb-[26px] md:px-[34px]">
      <button
        type="button"
        onClick={(e) => onOpen(e.currentTarget)}
        className="cursor-pointer text-[14px] leading-[22px] text-[var(--gold)] underline decoration-[var(--gold-dim)] underline-offset-4 transition-colors hover:decoration-[var(--gold)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]"
      >
        {CONTACT_ADDRESS}
      </button>
    </div>
  );
}
