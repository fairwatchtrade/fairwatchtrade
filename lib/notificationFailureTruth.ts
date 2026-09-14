export type NotificationLoadState = "loading" | "ready" | "failed_initial" | "stale";

type ReadState = { id: string; read: boolean };

export type NotificationLoadResolution<T> =
  | { ok: true; notifications: T[]; unreadCount: number }
  | { ok: false; error: "notifications_unavailable" };

/* A list and its aggregate count form one displayed truth. If either query is
   unconfirmed, the API must not manufacture an authoritative empty/zero. */
export function resolveNotificationLoad<T>(
  notifications: T[] | null,
  unreadCount: number | null,
  notificationError: unknown,
  unreadCountError: unknown,
): NotificationLoadResolution<T> {
  if (
    notificationError ||
    unreadCountError ||
    !Array.isArray(notifications) ||
    typeof unreadCount !== "number"
  ) {
    return { ok: false, error: "notifications_unavailable" };
  }
  return { ok: true, notifications, unreadCount };
}

export function notificationLoadFailureState(
  hasConfirmedLoad: boolean,
): Extract<NotificationLoadState, "failed_initial" | "stale"> {
  return hasConfirmedLoad ? "stale" : "failed_initial";
}

/* This projector is called only after PATCH success. Keeping the projection
   pure makes it impossible for transport optimism to masquerade as truth. */
export function applyConfirmedNotificationRead<T extends ReadState>(
  notifications: T[],
  unreadCount: number,
  selection: readonly string[] | "all",
): { notifications: T[]; unreadCount: number } {
  if (selection === "all") {
    return {
      notifications: notifications.map((notification) => ({
        ...notification,
        read: true,
      })),
      unreadCount: 0,
    };
  }

  const ids = new Set(selection);
  const confirmedVisibleChanges = notifications.filter(
    (notification) => !notification.read && ids.has(notification.id),
  ).length;
  return {
    notifications: notifications.map((notification) =>
      ids.has(notification.id) ? { ...notification, read: true } : notification,
    ),
    unreadCount: Math.max(0, unreadCount - confirmedVisibleChanges),
  };
}
