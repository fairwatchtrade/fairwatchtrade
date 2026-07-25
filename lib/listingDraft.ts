import { createClient } from "@/lib/supabase/client";
import type {
  ActiveEditor, SaveResult, IssueResult, RedeemResult, ReturnResult, StatusResult, PublishCloseResult,
} from "@/lib/listingDraftShared";

export * from "@/lib/listingDraftShared";

/* ────────────────────────────────────────────────────────────────────────
   LISTING DRAFT — client seam over the server-controlled RPCs
   (List From Phone Handoff, migration 20260724250000)

   Thin, typed wrappers around the SECURITY DEFINER RPCs. Every consequential
   transition (create, save, issue/redeem/revoke handoff, transfer/return
   authority, publish-close) goes through these — never a direct table write.
   Ownership + baton + optimistic revision are enforced server-side via
   auth.uid(); this layer only shapes calls and results. Pure URL/poll helpers
   live in lib/listingDraftShared.ts (re-exported above) so they stay testable.
   ──────────────────────────────────────────────────────────────────────── */

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { state: "ERROR", detail: error.message } as unknown as T;
  return (data ?? { state: "ERROR" }) as T;
}

/** Create (or initialize) a server draft for the authenticated seller. */
export async function createDraft(content: unknown = {}): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("listing_draft_create", { p_content: content });
  return error ? null : (data as string);
}

/** Save content — only the active editor, guarded by the expected revision. */
export function saveContent(draftId: string, content: unknown, expectedRevision: number, editor: ActiveEditor): Promise<SaveResult> {
  return call<SaveResult>("listing_draft_save_content", {
    p_draft_id: draftId, p_content: content, p_expected_revision: expectedRevision, p_editor: editor,
  });
}

/** Issue a scoped, expiring handoff token (re-issuing revokes any prior one). */
export function issueHandoff(draftId: string, captureSessionId?: string | null): Promise<IssueResult> {
  return call<IssueResult>("listing_draft_issue_handoff", {
    p_draft_id: draftId, p_capture_session_id: captureSessionId ?? null,
  });
}

/** Cancel an outstanding handoff and return authority to desktop. */
export function revokeHandoff(draftId: string): Promise<{ state: string }> {
  return call("listing_draft_revoke_handoff", { p_draft_id: draftId });
}

/** Redeem a handoff on the phone — transfers active editing authority. */
export function redeemHandoff(token: string): Promise<RedeemResult> {
  return call<RedeemResult>("listing_draft_redeem_handoff", { p_token: token });
}

/** Hand editing authority back to desktop (optionally saving final content). */
export function returnAuthority(draftId: string, content?: unknown, expectedRevision?: number): Promise<ReturnResult> {
  return call<ReturnResult>("listing_draft_return_authority", {
    p_draft_id: draftId, p_content: content ?? null, p_expected_revision: expectedRevision ?? null,
  });
}

/** Lightweight status for the desktop poll (no draft content). */
export function draftStatus(draftId: string): Promise<StatusResult> {
  return call<StatusResult>("listing_draft_status", { p_draft_id: draftId });
}

/** Close the draft at publish, idempotently (called after the listing exists). */
export function markPublished(draftId: string, listingId: string): Promise<PublishCloseResult> {
  return call<PublishCloseResult>("listing_draft_mark_published", { p_draft_id: draftId, p_listing_id: listingId });
}

/* ── Reads (RLS listing_drafts_select_own scopes these to the owner) ────── */

export type DraftRow = {
  id: string;
  content: Record<string, unknown>;
  revision: number;
  active_editor: "desktop" | "phone";
  handoff_status: string;
  status: string;
};

const ROW_COLS = "id, content, revision, active_editor, handoff_status, status";

/** Fetch one draft row by id (null when missing or not owned). */
export async function fetchDraftRow(draftId: string): Promise<DraftRow | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("listing_drafts")
    .select(ROW_COLS)
    .eq("id", draftId)
    .maybeSingle();
  return error ? null : ((data as DraftRow | null) ?? null);
}

/** Newest active draft for the signed-in seller — the resume target. */
export async function fetchNewestActiveDraft(): Promise<DraftRow | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("listing_drafts")
    .select(ROW_COLS)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return error ? null : ((data as DraftRow | null) ?? null);
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
