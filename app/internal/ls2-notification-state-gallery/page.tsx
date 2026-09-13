import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import NotificationBellButton from "@/components/NotificationBellButton";
import NotificationRowPresentation from "@/components/NotificationRowPresentation";
import { notificationHref, type NotificationRow } from "@/lib/communications";
import { NOTIFICATION_READ_STATES } from "@/lib/notificationPresentation";
import { createClient } from "@/lib/supabase/server";

/* Founder-only deterministic review surface. Apart from the route-level
   identity check, it has no loader, action, fetch, PATCH, timer, database
   read, optimistic update, or mutation. Every row is an in-memory object
   rendered by the same presentation component mounted by the live bell. */

const ADMIN_EMAIL = "jmynatt74@gmail.com";

export const metadata: Metadata = {
  title: "LS-2 Notification State Gallery",
  robots: { index: false, follow: false, nocache: true },
};

type NotificationScenario = {
  key: string;
  title: string;
  unreadCount: number;
  rows: readonly NotificationRow[];
  note: string;
  mismatch?: boolean;
};

function notification(
  id: string,
  overrides: Partial<NotificationRow> = {}
): NotificationRow {
  return {
    id,
    type: "listing_published",
    message: "A watch in your catalogue has new activity.",
    listing_id: "878bd4d5-7956-4d40-94b8-1058a8a86a45",
    purchase_request_id: null,
    transaction_id: null,
    read: false,
    created_at: "2026-09-13T14:00:00.000Z",
    ...overrides,
  };
}

const nineUnread = Array.from({ length: 9 }, (_, index) =>
  notification(`nine-${index + 1}`, {
    message: `Unread notification ${index + 1} of 9`,
    created_at: `2026-09-13T${String(13 - index).padStart(2, "0")}:00:00.000Z`,
  })
);

const tenPlusUnread = Array.from({ length: 10 }, (_, index) =>
  notification(`ten-${index + 1}`, {
    message: `Unread notification ${index + 1} of 10`,
    created_at: `2026-09-13T${String(13 - index).padStart(2, "0")}:30:00.000Z`,
  })
);

const transitionRows = NOTIFICATION_READ_STATES.map((state) =>
  notification(`transition-${state}`, {
    message: state === "unread" ? "Before activation" : "After activation",
    read: state === "read",
  })
);

const COUNT_CUE_MISMATCH = {
  aggregate: 3,
  visibleUnreadRows: 2,
  disposition: "The aggregate counts every unread row while the panel renders only the 20 most recent notifications. An older unread row can therefore be truthful in the count without having a visible cue in the current panel window.",
} as const;

const NOTIFICATION_GALLERY_SCENARIOS: readonly NotificationScenario[] = [
  {
    key: "empty-zero",
    title: "Empty history · zero unread",
    unreadCount: 0,
    rows: [],
    note: "The zero-count bell remains an enabled doorway; the empty history keeps its existing copy.",
  },
  {
    key: "history-zero",
    title: "History present · zero unread",
    unreadCount: 0,
    rows: [
      notification("history-1", { message: "A previous notification remains available.", read: true }),
      notification("history-2", { message: "A second read notification remains available.", read: true }),
    ],
    note: "Read rows become quiet history and carry no false UNREAD cue.",
  },
  {
    key: "one-unread",
    title: "One unread",
    unreadCount: 1,
    rows: [notification("one-unread", { type: "purchase_request", message: "A collector sent a purchase request." })],
    note: "The literal cue, dot, and stronger message all agree.",
  },
  {
    key: "nine-unread",
    title: "Nine unread",
    unreadCount: 9,
    rows: nineUnread,
    note: "Nine is shown exactly in both the visual badge and accessible name.",
  },
  {
    key: "ten-plus",
    title: "Ten unread · visual cap",
    unreadCount: 10,
    rows: tenPlusUnread,
    note: "The visible badge says 9+; the accessible name says exactly 10 unread.",
  },
  {
    key: "mixed-read-unread",
    title: "Mixed read + unread",
    unreadCount: 2,
    rows: [
      notification("mixed-unread-1", { message: "Unread purchase request", type: "purchase_request", purchase_request_id: "fixture-request-1" }),
      notification("mixed-read", { message: "Read listing update", read: true }),
      notification("mixed-unread-2", { message: "Unread purchase acceptance", type: "purchase_accepted", transaction_id: "fixture-transaction-1" }),
    ],
    note: "Unread registers in language before color must be decoded.",
  },
  {
    key: "long-message",
    title: "Long message",
    unreadCount: 1,
    rows: [notification("long-message", { message: "A collector sent a deliberately long purchase request notification that proves the message truncates without colliding with its visible unread state cue or timestamp." })],
    note: "Long sender/context is not applicable: the current NotificationRow data supports message and timestamp only.",
  },
  {
    key: "routable",
    title: "Routable notification",
    unreadCount: 1,
    rows: [notification("routable", { type: "purchase_request", message: "Purchase request opens its exact correspondence object.", purchase_request_id: "fixture-request-routable" })],
    note: "The gallery resolves this through the real notificationHref owner.",
  },
  {
    key: "non-routable",
    title: "Non-routable notification",
    unreadCount: 1,
    rows: [notification("non-routable", { type: "system_notice", message: "A safe notification without a destination.", listing_id: null })],
    note: "No destination is invented; the row still renders safely.",
  },
  {
    key: "unknown-type",
    title: "Unknown type",
    unreadCount: 1,
    rows: [notification("unknown-type", { type: "future_unrecognized_type", message: "An unknown future notification type still renders its supplied message.", listing_id: null })],
    note: "Type is an open string and does not change read/unread presentation.",
  },
  {
    key: "unread-to-read",
    title: "Unread → read presentation reference",
    unreadCount: 1,
    rows: transitionRows,
    note: "Static in-memory before/after reference: activation behavior remains solely in the live bell.",
  },
  {
    key: "count-cue-mismatch",
    title: "Aggregate count / row cue mismatch",
    unreadCount: COUNT_CUE_MISMATCH.aggregate,
    rows: [
      notification("mismatch-unread-1", { message: "Unread row one" }),
      notification("mismatch-unread-2", { message: "Unread row two" }),
      notification("mismatch-read", { message: "Read row", read: true }),
    ],
    note: COUNT_CUE_MISMATCH.disposition,
    mismatch: true,
  },
] as const;

function ScenarioCard({ scenario }: { scenario: NotificationScenario }) {
  return (
    <article
      className="min-w-0 border border-[var(--border-subtle)] bg-[var(--ink)] p-4"
      data-notification-scenario={scenario.key}
      data-count-cue-mismatch={scenario.mismatch ? "true" : "false"}
      data-visible-unread-rows={scenario.mismatch ? COUNT_CUE_MISMATCH.visibleUnreadRows : undefined}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[21px] font-light">{scenario.title}</h2>
          <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-[var(--muted)]">{scenario.note}</p>
        </div>
        <NotificationBellButton unreadCount={scenario.unreadCount} expanded />
      </div>

      <div className="w-full max-w-80 overflow-hidden border border-[var(--border-subtle)] bg-[var(--surface)]" data-notification-panel="">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3" data-mark-all-visible={scenario.unreadCount > 0 ? "true" : "false"}>
          <span className="fw-compact-control uppercase text-[var(--muted)]">Notifications</span>
          {scenario.unreadCount > 0 && (
            <span className="text-[11px] uppercase tracking-[2px] text-[var(--muted)]">Mark all read</span>
          )}
        </div>
        <div className="max-h-[360px] overflow-y-auto">
          {scenario.rows.length === 0 ? (
            <div className="px-4 py-6 text-center fw-functional-copy text-[var(--muted)]">No notifications yet.</div>
          ) : (
            scenario.rows.map((item) => {
              const href = notificationHref(item);
              const content = <NotificationRowPresentation notification={item} timeLabel="12m ago" />;
              return href ? (
                <Link key={item.id} href={href} className="block border-b border-[var(--border-faint)] transition-colors last:border-b-0 hover:bg-[var(--hover-wash)] focus:bg-[var(--hover-wash)] focus:outline-none">{content}</Link>
              ) : (
                <div key={item.id} className="block border-b border-[var(--border-faint)] last:border-b-0" data-notification-non-link-row="">{content}</div>
              );
            })
          )}
        </div>
      </div>
    </article>
  );
}

export default async function NotificationStateGalleryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const localDevelopment = process.env.NODE_ENV === "development";
  if (!localDevelopment && (!user || user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase())) {
    redirect("/");
  }

  return (
    <main className="min-h-screen bg-[var(--ink)] px-4 py-8 text-[var(--platinum)] sm:px-8" data-fixture-gallery="ls2-notification-state">
      <div className="mx-auto max-w-6xl">
        <header className="border-b border-[var(--border-gold)] pb-6">
          <div className="fw-lifecycle-label uppercase text-[var(--gold-dim)]">Internal founder fixture · read only</div>
          <h1 className="mt-2 font-display text-[30px] font-light sm:text-[38px]">Notification state gallery</h1>
          <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-[var(--platinum-dim)]">
            IN-MEMORY FIXTURES ONLY. No notification history is read or changed. Count truth uses the live count projector; every row uses the live row presentation owner.
          </p>
          <p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-[var(--muted)]">
            The aggregate count covers every unread notification, while the panel shows only its 20 most recent rows. The deliberate mismatch card proves that older unread truth can sit outside that visible window without becoming a contradiction. Use <Link className="underline underline-offset-2 hover:text-[var(--platinum)]" href="/account/settings">Account Settings</Link> for Light/Dark inspection and this URL on the physical XCover for narrow proof.
          </p>
          <p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-[var(--muted)]">
            LS-4-ADJACENT / NO DISTINCT USER STATE: fetch and Mark-all failures are currently swallowed and reconciled by polling. This LS-2 gallery invents no error copy or color.
          </p>
        </header>

        <section className="mt-8 grid gap-4 lg:grid-cols-2" aria-label="Notification state matrix">
          {NOTIFICATION_GALLERY_SCENARIOS.map((scenario) => (
            <ScenarioCard key={scenario.key} scenario={scenario} />
          ))}
        </section>
      </div>
    </main>
  );
}
