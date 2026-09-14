"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function DealerRoomPublicationControl({ sellerId, enabled }: { sellerId: string; enabled: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const action = enabled ? "Make Dealer Room Private" : "Publish Dealer Room";

  async function publish() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/dealers/publication", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sellerId, enabled: !enabled }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status >= 500) throw new Error("unconfirmed");
        setMessage(response.status === 404 ? "Dealer not found. Reload this room to confirm current identity." : "Publication change was refused. Your previous state is shown.");
        return;
      }
      if (result.dealer?.seller_id !== sellerId || result.dealer?.public_room_enabled !== !enabled) throw new Error("unconfirmed");
      setConfirming(false);
      startTransition(() => router.refresh());
    } catch {
      setUnconfirmed(true);
      setConfirming(false);
      setMessage("Publication outcome is unconfirmed. Reload publication state before trying again.");
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 text-sm text-[var(--slate)]">
      <p>Dealer Room: <strong className="font-medium text-[var(--platinum)]">{enabled ? "Public" : "Private"}</strong></p>
      {message && <p role="alert" className="mt-3">{message}</p>}
      {unconfirmed ? (
        <button type="button" onClick={() => window.location.reload()} className="mt-3 min-h-11 rounded border border-[var(--border-subtle)] px-4 text-[var(--platinum)]">Reload publication state</button>
      ) : confirming ? (
        <div className="mt-3 border-l-2 border-[var(--border-subtle)] pl-4">
          <p>{enabled
            ? "This removes public Dealer Room access and search discovery. Dealer admission, dealer workspace access, and listings remain unchanged."
            : "Publishing makes this Dealer Room publicly readable, eligible for search indexing, and eligible for the sitemap."}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" disabled={busy || refreshing} onClick={publish} className="min-h-11 rounded border border-[var(--gold)] px-4 text-[var(--gold)] disabled:opacity-50">{busy || refreshing ? "Confirming…" : action}</button>
            <button type="button" disabled={busy || refreshing} onClick={() => setConfirming(false)} className="min-h-11 px-4 text-[var(--slate)]">Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={busy || refreshing} onClick={() => setConfirming(true)} className="mt-3 min-h-11 rounded border border-[var(--border-subtle)] px-4 text-[var(--platinum)] disabled:opacity-50">{refreshing ? "Refreshing publication state…" : action}</button>
      )}
    </div>
  );
}
