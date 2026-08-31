/* ────────────────────────────────────────────────────────────────────────
   OPERATIONAL THREAD — pure timing helpers (no runtime dependencies)

   Split out of lib/assistantThread.ts for the same reason
   lib/listingDraftShared.ts exists: this logic decides whether the Assistant
   treats a resumed thread as temporally continuous with right now, and that
   decision deserves tests that do not need a Supabase client to run.

   THE RULE THESE ENCODE:

     A long-paused thread resumes as a REORIENTATION EVENT. The Assistant
     must not conversationally behave as though work last touched days ago is
     continuous with the present moment — it says when the thread was last
     worked and that it is re-reading, rather than carrying old facts forward
     as if they were current.

   Unparseable input fails toward reorientation, never away from it: if we
   cannot tell how old the work is, the safe answer is to re-orient.
   ──────────────────────────────────────────────────────────────────────── */

export const REORIENT_AFTER_HOURS = 12;

export function hoursSince(iso: string, now = Date.now()): number {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return (now - t) / 3_600_000;
}

export function needsReorientation(
  thread: { last_activity_at: string },
  now = Date.now()
): boolean {
  return hoursSince(thread.last_activity_at, now) >= REORIENT_AFTER_HOURS;
}

export function reorientationSentence(
  thread: { last_activity_at: string },
  now = Date.now()
): string {
  const h = hoursSince(thread.last_activity_at, now);
  const when = !Number.isFinite(h)
    ? "at a time I could not establish"
    : h >= 48
      ? `${Math.floor(h / 24)} days ago`
      : h >= 2
        ? `${Math.floor(h)} hours ago`
        : "recently";
  return (
    `This thread was last worked ${when}. I have not carried anything forward as current — ` +
    "I am re-reading FairWatchTrade now and will say what has changed since."
  );
}
