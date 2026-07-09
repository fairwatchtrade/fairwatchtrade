import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* ════════════════════════════════════════════════════════════════════════
   /api/messages  — Correspondence System v1.0  (v2.6)

   GET  — all threads for the authenticated user, enriched with listing
          identity, the other participant's display name, last message,
          and unread count. Sorted updated_at desc (the trigger bumps it).
   POST — send a message about a listing. Finds-or-creates the thread
          (listing_id + buyer + seller), rate-limits, inserts, and fires
          the seller email notification (Trigger 1) if notify_email.

   Conventions honored:
   • Auth read from the session, never the body (same as /api/listings).
   • Resend called via raw fetch with the branded from-address and a
     non-fatal catch — pattern-matched to /api/listings/route.ts (the
     newer of the two existing Resend styles; /api/waitlist still uses
     onboarding@resend.dev and predates the branded domain).
   • RLS does the row-security heavy lifting; explicit checks exist for
     clean status codes, not as the security boundary.
   • No FK-constraint-name join syntax anywhere — related rows are batch-
     fetched by id, so nothing depends on guessed constraint names.

   Rate limit: max 10 messages per thread per hour per sender → 429.

   Governing rule: conversations belong where the subject lives. This API
   serves the listing page (the home), the seller workspace, and the
   buyer catalogue (tables of contents).

   Canary: PFC274 = 62 — /api/evaluate is untouched.
   ════════════════════════════════════════════════════════════════════════ */

const MAX_BODY_CHARS = 2000;
const RATE_LIMIT_PER_HOUR = 10;
const SITE_URL = "https://fairwatchtrade.com";

type ListingLite = {
  id: string;
  brand: string;
  model: string | null;
  reference: string;
  photos: { photo: { url: string }; category: string }[] | null;
};

function dialThumb(photos: ListingLite["photos"]): string | null {
  if (!Array.isArray(photos) || photos.length === 0) return null;
  const dial = photos.find((p) => p?.category === "Dial");
  return (dial ?? photos[0])?.photo?.url ?? null;
}

/** Trigger-1/2 email. Non-fatal by design — messaging already succeeded.
    v2.6a — sender is correspondence@fairwatchtrade.com in production (the
    address itself says what it is; display name carries the brand), with
    Resend's default test sender in development per the updated brief. The
    domain (not the mailbox) is what Resend verifies — hello@ already sends
    from this domain in the listings route, so correspondence@ needs no new
    setup if those deliver. ONE-WAY notifications only, permanently: no
    inbound parsing, no reply-by-email — the email is the doorbell; the
    listing is the room where the conversation lives. */
const EMAIL_FROM =
  process.env.NODE_ENV === "production"
    ? "FairWatchTrade <correspondence@fairwatchtrade.com>"
    : "FairWatchTrade <onboarding@resend.dev>";

async function sendCorrespondenceEmail(opts: {
  to: string;
  subject: string;
  senderName: string;
  preview: string;
  listingId: string;
  listingTitle: string;
}) {
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: opts.to,
      subject: opts.subject,
      html: `
        <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; background: #0D0F14; color: #E8E4DC; padding: 2rem;">
          <h1 style="font-family: Georgia, serif; font-weight: 300; color: #C9A84C; font-size: 1.8rem; margin-bottom: 0.5rem;">
            FairWatchTrade
          </h1>
          <p style="color: #B7BAC4; font-size: 0.9rem; margin-bottom: 1rem;">
            You have a new message about ${opts.listingTitle}.
          </p>
          <p style="color: #8A8F9E; font-size: 0.85rem; margin-bottom: 0.75rem;">
            ${opts.senderName} wrote:
          </p>
          <div style="border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem;">
            <p style="color: #E8E4DC; font-size: 0.9rem; line-height: 1.7; margin: 0; font-style: italic;">
              &ldquo;${opts.preview}&rdquo;
            </p>
          </div>
          <p style="color: #B7BAC4; font-size: 0.85rem; margin-bottom: 1rem;">
            Continue the conversation on FairWatchTrade
          </p>
          <a href="${SITE_URL}/listings/${opts.listingId}"
             style="display: inline-block; background: #C9A84C; color: #0D0F14; padding: 0.75rem 1.5rem; border-radius: 6px; text-decoration: none; font-size: 0.85rem; font-weight: 500;">
            Open Conversation &rarr;
          </a>
        </div>
      `,
    }),
  }).catch(() => {
    /* email failure is non-fatal — the message is already delivered in-app */
  });
}

/** Escape user text before it's interpolated into email HTML. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ── GET — thread list for the current user ────────────────────────────── */

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { data: threads, error } = await supabase
    .from("message_threads")
    .select(
      "id, listing_id, participant_a_id, participant_b_id, subject, updated_at, archived_by_a, archived_by_b"
    )
    .or(`participant_a_id.eq.${user.id},participant_b_id.eq.${user.id}`)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "fetch_failed", detail: error.message }, { status: 500 });
  }

  const threadList = threads ?? [];
  if (threadList.length === 0) {
    return NextResponse.json({ threads: [] });
  }

  // Batch enrichment — no per-thread queries, no FK-name join syntax.
  const threadIds = threadList.map((t) => t.id);
  const listingIds = [...new Set(threadList.map((t) => t.listing_id).filter(Boolean))] as string[];
  const otherIds = [
    ...new Set(
      threadList.map((t) =>
        t.participant_a_id === user.id ? t.participant_b_id : t.participant_a_id
      )
    ),
  ].filter(Boolean) as string[];

  const [{ data: listings }, { data: profiles }, { data: allMessages }] = await Promise.all([
    listingIds.length > 0
      ? supabase.from("listings").select("id, brand, model, reference, photos").in("id", listingIds)
      : Promise.resolve({ data: [] as ListingLite[] }),
    otherIds.length > 0
      ? supabase.from("profiles").select("id, display_name").in("id", otherIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string | null }[] }),
    supabase
      .from("messages")
      .select("thread_id, sender_id, body, created_at, read_at")
      .in("thread_id", threadIds)
      .order("created_at", { ascending: false }),
  ]);

  const listingById = new Map((listings ?? []).map((l) => [l.id, l as ListingLite]));
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

  const lastByThread = new Map<string, { body: string; created_at: string; sender_id: string }>();
  const unreadByThread = new Map<string, number>();
  for (const m of allMessages ?? []) {
    if (!lastByThread.has(m.thread_id)) {
      lastByThread.set(m.thread_id, {
        body: m.body,
        created_at: m.created_at,
        sender_id: m.sender_id,
      });
    }
    if (m.sender_id !== user.id && m.read_at === null) {
      unreadByThread.set(m.thread_id, (unreadByThread.get(m.thread_id) ?? 0) + 1);
    }
  }

  const enriched = threadList.map((t) => {
    const myRole = t.participant_a_id === user.id ? "a" : "b";
    const otherId = myRole === "a" ? t.participant_b_id : t.participant_a_id;
    const listing = t.listing_id ? (listingById.get(t.listing_id) ?? null) : null;
    return {
      id: t.id,
      listing: listing
        ? {
            id: listing.id,
            brand: listing.brand,
            model: listing.model,
            reference: listing.reference,
            thumbUrl: dialThumb(listing.photos),
          }
        : null,
      subject: t.subject,
      otherName: (otherId && nameById.get(otherId)) || "FairWatchTrade Member",
      lastMessage: lastByThread.get(t.id) ?? null,
      unreadCount: unreadByThread.get(t.id) ?? 0,
      updatedAt: t.updated_at,
      myRole,
      archivedByMe: myRole === "a" ? t.archived_by_a === true : t.archived_by_b === true,
    };
  });

  return NextResponse.json({ threads: enriched });
}

/* ── POST — new message about a listing (find-or-create thread) ────────── */

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  let payload: { listingId?: string; body?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const listingId = typeof payload.listingId === "string" ? payload.listingId.trim() : "";
  const body = typeof payload.body === "string" ? payload.body.trim() : "";

  if (!listingId || !body) {
    return NextResponse.json(
      { error: "missing_fields", detail: "listingId and body are required." },
      { status: 400 }
    );
  }
  if (body.length > MAX_BODY_CHARS) {
    return NextResponse.json(
      { error: "too_long", detail: `Messages are limited to ${MAX_BODY_CHARS} characters.` },
      { status: 400 }
    );
  }

  const { data: listing } = await supabase
    .from("listings")
    .select("id, brand, model, reference, seller_id, status")
    .eq("id", listingId)
    .maybeSingle();

  if (!listing || listing.status !== "published") {
    return NextResponse.json({ error: "listing_not_found" }, { status: 404 });
  }
  if (listing.seller_id === user.id) {
    return NextResponse.json(
      { error: "own_listing", detail: "You can't message yourself about your own listing." },
      { status: 400 }
    );
  }

  const listingTitle = listing.model ? `${listing.brand} ${listing.model}` : listing.brand;

  // Find-or-create the thread. Convention: participant_a = buyer (initiator),
  // participant_b = seller. The unique(listing_id, a, b) constraint backstops
  // a race — a concurrent duplicate insert 23505s and we re-fetch the winner.
  let threadId: string | null = null;
  const { data: existing } = await supabase
    .from("message_threads")
    .select("id")
    .eq("listing_id", listing.id)
    .eq("participant_a_id", user.id)
    .eq("participant_b_id", listing.seller_id)
    .maybeSingle();

  if (existing) {
    threadId = existing.id;
  } else {
    const { data: created, error: createError } = await supabase
      .from("message_threads")
      .insert({
        listing_id: listing.id,
        participant_a_id: user.id,
        participant_b_id: listing.seller_id,
        subject: `${listingTitle} · Ref. ${listing.reference}`,
      })
      .select("id")
      .single();

    if (createError) {
      if ((createError as { code?: string }).code === "23505") {
        const { data: winner } = await supabase
          .from("message_threads")
          .select("id")
          .eq("listing_id", listing.id)
          .eq("participant_a_id", user.id)
          .eq("participant_b_id", listing.seller_id)
          .maybeSingle();
        threadId = winner?.id ?? null;
      }
      if (!threadId) {
        return NextResponse.json(
          { error: "thread_create_failed", detail: createError.message },
          { status: 500 }
        );
      }
    } else {
      threadId = created.id;
    }
  }

  // Rate limit — max 10 per thread per hour per sender.
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentCount } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("thread_id", threadId)
    .eq("sender_id", user.id)
    .gte("created_at", hourAgo);

  if ((recentCount ?? 0) >= RATE_LIMIT_PER_HOUR) {
    return NextResponse.json(
      {
        error: "rate_limited",
        detail: "You've sent several messages recently. Please wait before sending another.",
      },
      { status: 429 }
    );
  }

  const { data: message, error: insertError } = await supabase
    .from("messages")
    .insert({ thread_id: threadId, sender_id: user.id, body })
    .select("id, created_at")
    .single();

  if (insertError) {
    return NextResponse.json(
      { error: "send_failed", detail: insertError.message },
      { status: 500 }
    );
  }

  // Trigger 1 — email the seller, only if their notify_email is on.
  const [{ data: sellerProfile }, { data: senderProfile }] = await Promise.all([
    supabase
      .from("profiles")
      .select("email, notify_email")
      .eq("id", listing.seller_id)
      .maybeSingle(),
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
  ]);

  if (sellerProfile?.notify_email === true && sellerProfile.email) {
    const senderName = senderProfile?.display_name || "A collector";
    await sendCorrespondenceEmail({
      to: sellerProfile.email,
      subject: `New message about your ${listingTitle}`,
      senderName: escapeHtml(senderName),
      preview: escapeHtml(body.slice(0, 200)),
      listingId: listing.id,
      listingTitle: escapeHtml(listingTitle),
    });
  }

  return NextResponse.json(
    { threadId, messageId: message.id, createdAt: message.created_at },
    { status: 201 }
  );
}
