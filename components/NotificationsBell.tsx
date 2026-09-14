"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { notificationHref, type NotificationRow } from "@/lib/communications";
import {
  applyConfirmedNotificationRead,
  notificationLoadFailureState,
  resolveNotificationLoad,
  type NotificationLoadState,
} from "@/lib/notificationFailureTruth";
import NotificationBellButton from "@/components/NotificationBellButton";
import NotificationRowPresentation from "@/components/NotificationRowPresentation";

/* ────────────────────────────────────────────────────────────────────────
   NOTIFICATIONS BELL — components/NotificationsBell.tsx  (v1.92)

   Quiet until there's something to say. The badge count is seeded server-side
   (initialUnreadCount prop) so it never flashes on mount. The list loads on
   mount and re-polls every 30s (a bell, not a chat — no WebSockets, no
   Realtime, no sound, no browser push). The dropdown appears and disappears;
   it does not animate — architecture responding, never software reacting.

   Handles unknown notification `type` values gracefully (renders the message
   regardless) — future types won't break this, but no other type is built.
   ──────────────────────────────────────────────────────────────────────── */

/* v5.93 — the row shape and its routing law live in lib/communications:
   a bell stamped with purchase_request_id lands on the exact request in
   the seller Communications room; an unstamped row keeps the listing
   route. The bell renders; the library decides where clicks go. */
type Notification = NotificationRow;

interface NotificationsBellProps {
  initialUnreadCount: number; // server-fetched — avoids a flash on mount
}

const POLL_MS = 30_000;

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

export default function NotificationsBell({
  initialUnreadCount,
}: NotificationsBellProps) {
  const [inbox, setInbox] = useState<{
    notifications: Notification[];
    unreadCount: number;
  }>({ notifications: [], unreadCount: initialUnreadCount });
  const [loadState, setLoadState] = useState<NotificationLoadState>("loading");
  const [mutationNotice, setMutationNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasConfirmedLoad = useRef(false);
  const loadSequence = useRef(0);
  const notificationMutationGeneration = useRef(0);
  const notificationMutationInFlight = useRef(false);
  const { notifications, unreadCount } = inbox;

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    const mutationGeneration = notificationMutationGeneration.current;
    const isCurrentTruthRequest = () =>
      sequence === loadSequence.current &&
      mutationGeneration === notificationMutationGeneration.current;
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) throw new Error("notifications_unavailable");
      const data = await res.json();
      const result = resolveNotificationLoad<Notification>(
        Array.isArray(data.notifications) ? data.notifications : null,
        typeof data.unread_count === "number" ? data.unread_count : null,
        null,
        null,
      );
      if (!result.ok) throw new Error(result.error);
      if (!isCurrentTruthRequest()) return;
      setInbox({
        notifications: result.notifications,
        unreadCount: result.unreadCount,
      });
      hasConfirmedLoad.current = true;
      setLoadState("ready");
      setMutationNotice(null);
    } catch {
      if (!isCurrentTruthRequest()) return;
      setLoadState(notificationLoadFailureState(hasConfirmedLoad.current));
    }
  }, []);

  // Populate the list on mount, then poll every 30s. The badge starts from the
  // server prop, so the mount fetch corrects rather than flashes.
  useEffect(() => {
    const initialId = window.setTimeout(load, 0);
    const id = setInterval(load, POLL_MS);
    return () => {
      window.clearTimeout(initialId);
      clearInterval(id);
    };
  }, [load]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function markRead(ids: string[]) {
    if (ids.length === 0) return;
    if (notificationMutationInFlight.current) return;
    notificationMutationInFlight.current = true;
    notificationMutationGeneration.current += 1;
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error("notification_update_unconfirmed");
      notificationMutationGeneration.current += 1;
      setInbox((current) =>
        applyConfirmedNotificationRead(
          current.notifications,
          current.unreadCount,
          ids,
        ),
      );
    } catch {
      notificationMutationGeneration.current += 1;
      setMutationNotice("Couldn't confirm that change. Notifications will refresh.");
    } finally {
      notificationMutationInFlight.current = false;
    }
  }

  async function markAllRead() {
    if (notificationMutationInFlight.current) return;
    notificationMutationInFlight.current = true;
    notificationMutationGeneration.current += 1;
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (!res.ok) throw new Error("notification_update_unconfirmed");
      notificationMutationGeneration.current += 1;
      setInbox((current) =>
        applyConfirmedNotificationRead(
          current.notifications,
          current.unreadCount,
          "all",
        ),
      );
    } catch {
      notificationMutationGeneration.current += 1;
      setMutationNotice("Couldn't confirm that change. Notifications will refresh.");
    } finally {
      notificationMutationInFlight.current = false;
    }
  }

  const hasUnread = unreadCount > 0;

  return (
    <div ref={containerRef} className="relative">
      <NotificationBellButton unreadCount={unreadCount} expanded={open} onToggle={() => setOpen((o) => !o)} />

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden border border-[var(--border-subtle)] bg-[var(--surface)]">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
            <span className="fw-compact-control uppercase text-[var(--muted)]">
              Notifications
            </span>
            {hasUnread && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-[11px] uppercase tracking-[2px] text-[var(--muted)] transition-colors hover:text-[var(--gold)]"
              >
                Mark all read
              </button>
            )}
          </div>

          {loadState === "stale" && (
            <div className="border-b border-[var(--border-faint)] px-4 py-3" role="status">
              <p className="fw-functional-copy text-[var(--platinum-dim)]">
                Couldn&apos;t refresh notifications. Showing the last loaded list.
              </p>
              <button
                type="button"
                onClick={load}
                className="mt-2 fw-compact-control uppercase text-[var(--gold)]"
              >
                Retry
              </button>
            </div>
          )}

          {mutationNotice && (
            <div className="border-b border-[var(--border-faint)] px-4 py-3 fw-functional-copy text-[var(--platinum-dim)]" role="status">
              {mutationNotice}
            </div>
          )}

          <div className="max-h-[360px] overflow-y-auto">
            {loadState === "loading" ? (
              <div className="px-4 py-6 text-center fw-functional-copy text-[var(--muted)]">
                Loading notifications…
              </div>
            ) : loadState === "failed_initial" ? (
              <div className="px-4 py-6 text-center" role="alert">
                <p className="fw-functional-copy text-[var(--platinum-dim)]">
                  Notifications couldn&apos;t be loaded right now.
                </p>
                <button
                  type="button"
                  onClick={load}
                  className="mt-3 fw-compact-control uppercase text-[var(--gold)]"
                >
                  Retry
                </button>
              </div>
            ) : loadState === "ready" && notifications.length === 0 ? (
              <div className="px-4 py-6 text-center fw-functional-copy text-[var(--muted)]">
                No notifications yet.
              </div>
            ) : notifications.length > 0 ? (
              notifications.map((n) => {
                const inner = (
                  <NotificationRowPresentation notification={n} timeLabel={formatRelativeTime(n.created_at)} />
                );

                const href = notificationHref(n);
                return href ? (
                  <Link
                    key={n.id}
                    href={href}
                    onClick={() => {
                      if (!n.read) void markRead([n.id]);
                      setOpen(false);
                    }}
                    className="block border-b border-[var(--border-faint)] transition-colors last:border-b-0 hover:bg-[var(--hover-wash)]"
                  >
                    {inner}
                  </Link>
                ) : (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      if (!n.read) void markRead([n.id]);
                    }}
                    className="block w-full border-b border-[var(--border-faint)] text-left transition-colors last:border-b-0 hover:bg-[var(--hover-wash)]"
                  >
                    {inner}
                  </button>
                );
              })
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
