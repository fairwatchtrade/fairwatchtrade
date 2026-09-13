import { notificationCountPresentation } from "@/lib/notificationPresentation";

/* Shared count-and-doorway presentation only. The live owner supplies the
   toggle; the founder gallery supplies no behavior and cannot reach data. */
export default function NotificationBellButton({
  unreadCount,
  expanded,
  onToggle,
}: {
  unreadCount: number;
  expanded: boolean;
  onToggle?: () => void;
}) {
  const { hasUnread, visibleBadge, ariaLabel } = notificationCountPresentation(unreadCount);

  const visual = (
    <>
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
          className="fw-work-count absolute -right-1.5 -top-1.5 flex items-center justify-center rounded-full px-1"
          style={{ background: "#C9A84C", color: "var(--ink)", minWidth: 16, height: 16 }}
          data-notification-visible-count=""
        >
          {visibleBadge}
        </span>
      )}
    </>
  );

  /* The founder gallery receives the exact glyph/count presentation without
     gaining a dead button that falsely advertises collapse behavior. */
  if (!onToggle) {
    return (
      <span
        role="img"
        aria-label={ariaLabel}
        className="relative flex items-center transition-colors"
        style={{ color: hasUnread ? "#C9A84C" : "var(--muted)" }}
        data-notification-bell=""
      >
        {visual}
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-expanded={expanded}
      onClick={onToggle}
      className="relative flex items-center transition-colors"
      style={{ color: hasUnread ? "#C9A84C" : "var(--muted)" }}
      data-notification-bell=""
    >
      {visual}
    </button>
  );
}
