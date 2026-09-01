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

/* ── Saved listings — the recoverable pool ───────────────────────────────
   A draft is recoverable when the seller can legitimately reopen and keep
   editing it through the Sell Flow. That is exactly 'active' and
   'abandoned' (set aside): both carry unfinished seller work and both are
   editable on return.

   'published' is NOT recoverable. It has a listing_id and a listing
   lifecycle of its own — submitted, rejected, removed and public listings
   are governed elsewhere and must never appear as an editable Sell draft
   merely because they share this table. The allowlist is stated once, here,
   so no surface can widen it locally. */
export const RECOVERABLE_DRAFT_STATUSES = ["active", "abandoned"] as const;
export type RecoverableStatus = (typeof RECOVERABLE_DRAFT_STATUSES)[number];

export type RecoverableDraft = {
  id: string;
  content: Record<string, unknown>;
  revision: number;
  active_editor: ActiveEditor;
  handoff_status: HandoffStatus;
  status: DraftLifecycle;
  updated_at: string;
  /* Set when this draft is CORRECTING an existing listing the founder handed
     back, rather than composing a new one. The authoritative fact lives in
     this column and is never copied into `content`, so it cannot drift from
     the binding that also decides whether resubmission updates that listing
     or creates a second watch. */
  listing_id: string | null;
  /* The bound listing's collector-facing code, when this draft is correcting
     one. Listing Code Law: the number is visible wherever the watch goes, and
     a returned listing is exactly the watch someone messages you about. A
     draft that never became a listing has none, and shows none.

     Both shapes are declared because PostgREST types an embedded select as an
     ARRAY even when the relationship is to-one. Read it through
     boundListingCode() rather than indexing it at a call site. */
  listings?:
    | { public_code: string | null }
    | { public_code: string | null }[]
    | null;
};

/** The bound listing's code, from either shape PostgREST may return, or null
    when this draft is not correcting a listing. Never guesses. */
export function boundListingCode(d: {
  listings?: { public_code: string | null } | { public_code: string | null }[] | null;
}): string | null {
  const l = d.listings;
  if (!l) return null;
  const row = Array.isArray(l) ? l[0] : l;
  const code = row?.public_code;
  return typeof code === "string" && code.trim() !== "" ? code : null;
}

export type ResumeResult = {
  state: "RESUMED" | "ALREADY_PUBLISHED" | "DENIED" | "AUTH_REQUIRED" | "ERROR";
  revision?: number;
  listing_id?: string;
};

/** Shown when a draft carries no identity yet. Never a guess at one. */
export const UNTITLED_DRAFT_LABEL = "Untitled watch listing";

export type DraftIdentity = {
  title: string;
  /** Where the title came from, so a reference is never printed twice. */
  titleSource: "identity" | "reference" | "none";
  reference: string | null;
  photoCount: number;
  thumbnailUrl: string | null;
};

function trimmed(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function firstPhotoUrl(p: unknown): string {
  if (!p || typeof p !== "object") return "";
  const photo = (p as Record<string, unknown>).photo;
  if (!photo || typeof photo !== "object") return "";
  return trimmed((photo as Record<string, unknown>).url);
}

/* The strongest TRUTHFUL identity a stored draft can supply, and nothing
   more. Missing stays missing: no inferred model, no guessed reference, no
   completion state, and no derived step — the step a seller reached is not
   persisted on the row, so claiming one would be invention. Photo COUNT is
   a fact about stored data and is safe; progress is not.

   Content shape is `{ draft: ListingDraft }`. Everything here is defensive
   because the column is jsonb a future writer could shape differently. */
export function draftIdentity(content: unknown): DraftIdentity {
  const outer = content && typeof content === "object" ? (content as Record<string, unknown>) : {};
  const inner = outer.draft;
  const d = inner && typeof inner === "object" ? (inner as Record<string, unknown>) : {};

  const brand = trimmed(d.brand);
  const model = trimmed(d.model);
  const reference = trimmed(d.reference);

  const identity = [brand, model].filter(Boolean).join(" ");
  const photos = Array.isArray(d.photos) ? d.photos : [];

  /* Prefer the Dial shot, exactly as the account's own listing rows do: at
     56px a dial identifies a watch and a clasp does not. Falls back to the
     first photograph carrying a usable url — untagged uploads are real
     photographs and must not be skipped just because tagging is a later act. */
  let thumbnailUrl: string | null = null;
  for (const p of photos) {
    const category = p && typeof p === "object" ? trimmed((p as Record<string, unknown>).category) : "";
    if (category !== "Dial") continue;
    const url = firstPhotoUrl(p);
    if (url) { thumbnailUrl = url; break; }
  }
  if (!thumbnailUrl) {
    for (const p of photos) {
      const url = firstPhotoUrl(p);
      if (url) { thumbnailUrl = url; break; }
    }
  }

  return {
    title: identity || reference || UNTITLED_DRAFT_LABEL,
    titleSource: identity ? "identity" : reference ? "reference" : "none",
    reference: reference || null,
    photoCount: photos.length,
    thumbnailUrl,
  };
}

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
