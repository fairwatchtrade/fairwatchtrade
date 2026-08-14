"use client";

/* ════════════════════════════════════════════════════════════════════════
   GENERATE COLLECTOR DOSSIER — button

   Requests the PDF from the admin-gated endpoint and hands the reader a
   real download. Page chrome, not part of the dossier composition, so it
   uses the ordinary app styling rather than the dossier stylesheet.
   ──────────────────────────────────────────────────────────────────────── */

import { useState } from "react";

export default function GenerateCollectorDossierButton({
  endpoint,
  filename,
}: {
  endpoint: string;
  filename: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);

    let objectUrl: string | null = null;
    try {
      const res = await fetch(endpoint, { method: "GET" });

      if (!res.ok) {
        // The endpoint answers 404 to non-admins rather than hinting that it
        // exists, so don't dress the failure up as something more specific.
        throw new Error(`Dossier could not be generated (${res.status}).`);
      }

      const blob = await res.blob();
      objectUrl = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dossier could not be generated.");
    } finally {
      // Revoke on the next tick — revoking synchronously can cancel the
      // download in some browsers before it has been handed to the shell.
      if (objectUrl) {
        const url = objectUrl;
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={generate}
        disabled={busy}
        className="border border-[var(--border-gold)] bg-[var(--gold-whisper)] px-5 py-3 text-[11px] uppercase tracking-[2.6px] text-[var(--gold)] transition-colors hover:border-[var(--border-gold-strong)] disabled:cursor-not-allowed disabled:text-[var(--ghost)]"
      >
        {busy ? "Generating…" : "Generate Collector Dossier"}
      </button>

      {error && (
        <p className="text-[11px] text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
