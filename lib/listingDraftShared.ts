/* ────────────────────────────────────────────────────────────────────────
   LISTING DRAFT — shared types + pure helpers (no runtime deps)

   Split out from lib/listingDraft.ts so the URL/poll logic is unit-testable
   without pulling in the Supabase client. The handoff URL carries ONLY the
   opaque token — never a draft id, seller id, or storage path.
   ──────────────────────────────────────────────────────────────────────── */

export type ActiveEditor = "desktop" | "phone";
export type HandoffStatus = "none" | "issued" | "redeemed" | "expired" | "revoked" | "returned";
export type DraftLifecycle = "active" | "published" | "abandoned";

export type SaveResult = { state: "SAVED" | "STALE" | "NOT_ACTIVE_EDITOR" | "NOT_ACTIVE" | "DENIED" | "AUTH_REQUIRED" | "ERROR"; revision?: number; active_editor?: ActiveEditor; status?: string };
export type IssueResult = { state: "ISSUED" | "DENIED" | "NOT_ACTIVE" | "AUTH_REQUIRED" | "ERROR"; token?: string; expires_at?: string };
export type RedeemResult = { state: "REDEEMED" | "WRONG_ACCOUNT" | "EXPIRED" | "INVALID" | "NOT_ACTIVE" | "AUTH_REQUIRED" | "ERROR"; draft_id?: string; content?: unknown; revision?: number };
export type ReturnResult = { state: "RETURNED" | "STALE" | "DENIED" | "AUTH_REQUIRED" | "ERROR"; revision?: number };
export type StatusResult = { state: "OK" | "DENIED" | "AUTH_REQUIRED" | "ERROR"; active_editor?: ActiveEditor; handoff_status?: HandoffStatus; revision?: number; status?: DraftLifecycle; listing_id?: string | null; handoff_expires_at?: string | null };
export type PublishCloseResult = { state: "PUBLISHED" | "ALREADY_PUBLISHED" | "DENIED" | "AUTH_REQUIRED" | "ERROR"; listing_id?: string };

/** The one place the handoff route is built — token only, never an id. */
export function handoffPath(token: string): string {
  return `/sell/continue/${encodeURIComponent(token)}`;
}

/** Absolute URL for the QR / copy-link (origin supplied by the caller). */
export function handoffUrl(token: string, origin: string): string {
  return `${origin.replace(/\/+$/, "")}${handoffPath(token)}`;
}

/** Desktop polls only while a handoff is live; this decides when to stop. */
export function handoffIsLive(status: StatusResult): boolean {
  return status.state === "OK" && (status.handoff_status === "issued" || status.handoff_status === "redeemed") && status.status === "active";
}

/** The desktop is paused (read-only) exactly when the phone holds the baton. */
export function desktopIsPaused(status: StatusResult): boolean {
  return status.state === "OK" && status.active_editor === "phone" && status.status === "active";
}
