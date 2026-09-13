import type { NotificationRow } from "@/lib/communications";

/* Notification presentation has two — and only two — row states. Type and
   destination do not change this visual truth: an unknown future type still
   renders safely, and routing remains owned by notificationHref(). */
export const NOTIFICATION_READ_STATES = ["unread", "read"] as const;
export type NotificationReadState = (typeof NOTIFICATION_READ_STATES)[number];

export function notificationReadState(
  notification: Pick<NotificationRow, "read">
): NotificationReadState {
  return notification.read ? "read" : "unread";
}

export type NotificationCountPresentation = {
  hasUnread: boolean;
  visibleBadge: string | null;
  ariaLabel: string;
};

/* One count projection for the live bell and the fixture gallery. The visual
   cap is not the accessible truth: ariaLabel always carries the exact count. */
export function notificationCountPresentation(
  unreadCount: number
): NotificationCountPresentation {
  const hasUnread = unreadCount > 0;
  return {
    hasUnread,
    visibleBadge: hasUnread ? (unreadCount > 9 ? "9+" : String(unreadCount)) : null,
    ariaLabel: hasUnread ? `Notifications, ${unreadCount} unread` : "Notifications",
  };
}
