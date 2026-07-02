"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

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

type Notification = {
  id: string;
  type: string;
  message: string;
  listing_id: string | null;
  read: boolean;
  created_at: string;
};

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
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.notifications)) setNotifications(data.notifications);
      if (typeof data.unread_count === "number") setUnreadCount(data.unread_count);
    } catch {
      // A failed poll just means we try again in 30s.
    }
  }, []);

  // Populate the list on mount, then poll every 30s. The badge starts from the
  // server prop, so the mount fetch corrects rather than flashes.
  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
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
    setNotifications((prev) =>
      prev.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n))
    );
    setUnreadCount((c) => Math.max(0, c - ids.length));
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
    } catch {
      // Optimistic — the next poll reconciles.
    }
  }

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
    } catch {
      // Optimistic — the next poll reconciles.
    }
  }

  const hasUnread = unreadCount > 0;
  const badge = unreadCount > 9 ? "9+" : String(unreadCount);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={hasUnread ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="relative flex items-center transition-colors"
        style={{ color: hasUnread ? "#C9A84C" : "var(--ghost)" }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {hasUnread && (
          <span
            className="absolute -right-1.5 -top-1.5 flex items-center justify-center rounded-full px-1 text-[9px] font-medium leading-none"
            style={{ background: "#C9A84C", color: "var(--ink)", minWidth: 16, height: 16 }}
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden border border-[var(--border-subtle)] bg-[var(--surface)]">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
            <span className="text-[8px] uppercase tracking-[2.5px] text-[var(--ghost)]">
              Notifications
            </span>
            {hasUnread && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-[9px] uppercase tracking-[2px] text-[var(--gold-subtle)] transition-colors hover:text-[var(--gold)]"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[360px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-6 text-center font-display text-[13px] italic text-[var(--ghost)]">
                No notifications yet.
              </div>
            ) : (
              notifications.map((n) => {
                const inner = (
                  <div className="flex items-start gap-2.5 px-4 py-3">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: n.read ? "transparent" : "#C9A84C" }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <div
                        className={`truncate text-[12px] ${
                          n.read ? "text-[var(--muted)]" : "text-[var(--platinum)]"
                        }`}
                      >
                        {n.message}
                      </div>
                      <div className="mt-0.5 text-[10px] text-[var(--ghost)]">
                        {formatRelativeTime(n.created_at)}
                      </div>
                    </div>
                  </div>
                );

                return n.listing_id ? (
                  <Link
                    key={n.id}
                    href={`/listings/${n.listing_id}`}
                    onClick={() => {
                      if (!n.read) markRead([n.id]);
                      setOpen(false);
                    }}
                    className="block border-b border-[var(--border-faint)] transition-colors last:border-b-0 hover:bg-[rgba(255,255,255,0.02)]"
                  >
                    {inner}
                  </Link>
                ) : (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      if (!n.read) markRead([n.id]);
                    }}
                    className="block w-full border-b border-[var(--border-faint)] text-left transition-colors last:border-b-0 hover:bg-[rgba(255,255,255,0.02)]"
                  >
                    {inner}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
