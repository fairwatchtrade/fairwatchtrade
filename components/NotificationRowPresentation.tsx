import type { NotificationRow } from "@/lib/communications";
import { notificationReadState } from "@/lib/notificationPresentation";

/* Presentational only. This shared row owns no fetch, polling, timer, PATCH,
   routing, click handler, or optimistic state. Those remain in the live bell;
   the founder gallery can therefore render the exact row semantics without a
   path to production notification state. */
export default function NotificationRowPresentation({
  notification,
  timeLabel,
}: {
  notification: NotificationRow;
  timeLabel: string;
}) {
  const state = notificationReadState(notification);

  return (
    <div
      className="flex items-start gap-2.5 px-4 py-3"
      data-notification-read-state={state}
    >
      <span
        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: state === "unread" ? "#C9A84C" : "transparent" }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div
          className={`truncate text-[12px] ${
            state === "read" ? "text-[var(--muted)]" : "text-[var(--platinum)]"
          }`}
          title={notification.message}
          data-notification-message=""
        >
          {notification.message}
        </div>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {state === "unread" && (
            <span
              className="fw-validity-state uppercase"
              style={{ color: "light-dark(var(--gold-dim), var(--gold))" }}
              data-notification-unread-cue=""
            >
              Unread
            </span>
          )}
          <span className="fw-transaction-fact text-[var(--muted)]" data-notification-time="">
            {timeLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
