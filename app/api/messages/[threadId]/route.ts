import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* ════════════════════════════════════════════════════════════════════════
   /api/messages/[threadId]  — Correspondence System v1.0  (v2.6)

   GET  — full message history for one thread (chronological), the thread's
          listing identity, and both participants' display names. Viewing
          marks the OTHER party's unread messages read (read_at = now()).
   POST — reply to the thread. Rate-limited (10/hr/sender/thread), fires
          the appropriate email trigger to the other participant if their
          notify_email is on. Trigger 2 wording when the sender is the
          listing's seller; Trigger 1 wording otherwise.

   Same conventions as /api/messages/route.ts: session auth, RLS as the
   security boundary, batch fetches (no FK-name join syntax), branded
   Resend from-address with non-fatal catch (pattern: /api/listings).

   Canary: PFC274 = 62 — /api/evaluate is untouched.
   ════════════════════════════════════════════════════════════════════════ */

const MAX_BODY_CHARS = 2000;
const RATE_LIMIT_PER_HOUR = 10;
const SITE_URL = "https://fairwatchtrade.com";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* v2.6a — sender: correspondence@fairwatchtrade.com in production,
   Resend test sender in development. One-way notifications, permanently —
   no reply-by-email, no inbound parsing. See /api/messages/route.ts. */
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
    /* non-fatal */
  });
}

/** Shared: load the thread and confirm the current user is a participant.
    RLS already guarantees invisibility to outsiders; this exists to return
    clean 404s instead of empty-data edge cases. */
async function loadThreadForUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  threadId: string,
  userId: string
) {
  const { data: thread } = await supabase
    .from("message_threads")
    .select(
      "id, listing_id, participant_a_id, participant_b_id, subject, updated_at, archived_by_a, archived_by_b"
    )
    .eq("id", threadId)
    .maybeSingle();

  if (!thread) return null;
  if (thread.participant_a_id !== userId && thread.participant_b_id !== userId) return null;
  return thread;
}

/* ── GET — thread + messages, mark other party's messages read ─────────── */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const thread = await loadThreadForUser(supabase, threadId, user.id);
  if (!thread) {
    return NextResponse.json({ error: "thread_not_found" }, { status: 404 });
  }

  const otherId =
    thread.participant_a_id === user.id ? thread.participant_b_id : thread.participant_a_id;

  const [{ data: messages }, { data: listing }, { data: profiles }] = await Promise.all([
    supabase
      .from("messages")
      .select("id, sender_id, body, created_at, read_at")
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: true }),
    thread.listing_id
      ? supabase
          .from("listings")
          .select("id, brand, model, reference, photos")
          .eq("id", thread.listing_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", [user.id, otherId].filter(Boolean) as string[]),
  ]);

  // Viewing the thread marks the other party's unread messages read.
  await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("thread_id", thread.id)
    .neq("sender_id", user.id)
    .is("read_at", null);

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

  const dial =
    listing && Array.isArray(listing.photos)
      ? ((listing.photos.find((p: { category?: string }) => p?.category === "Dial") ??
          listing.photos[0]) as { photo?: { url?: string } } | undefined)
      : undefined;

  return NextResponse.json({
    thread: {
      id: thread.id,
      subject: thread.subject,
      myRole: thread.participant_a_id === user.id ? "a" : "b",
      otherName: (otherId && nameById.get(otherId)) || "FairWatchTrade Member",
      listing: listing
        ? {
            id: listing.id,
            brand: listing.brand,
            model: listing.model,
            reference: listing.reference,
            thumbUrl: dial?.photo?.url ?? null,
          }
        : null,
    },
    messages: (messages ?? []).map((m) => ({
      id: m.id,
      senderId: m.sender_id,
      senderName:
        m.sender_id === user.id
          ? nameById.get(user.id) || "You"
          : nameById.get(m.sender_id) || "FairWatchTrade Member",
      isMine: m.sender_id === user.id,
      body: m.body,
      createdAt: m.created_at,
      readAt: m.read_at,
    })),
  });
}

/* ── POST — reply ───────────────────────────────────────────────────────── */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  let payload: { body?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  if (!body) {
    return NextResponse.json({ error: "missing_fields", detail: "body is required." }, { status: 400 });
  }
  if (body.length > MAX_BODY_CHARS) {
    return NextResponse.json(
      { error: "too_long", detail: `Messages are limited to ${MAX_BODY_CHARS} characters.` },
      { status: 400 }
    );
  }

  const thread = await loadThreadForUser(supabase, threadId, user.id);
  if (!thread) {
    return NextResponse.json({ error: "thread_not_found" }, { status: 404 });
  }

  // Rate limit — max 10 per thread per hour per sender.
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentCount } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("thread_id", thread.id)
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
    .insert({ thread_id: thread.id, sender_id: user.id, body })
    .select("id, created_at")
    .single();

  if (insertError) {
    return NextResponse.json(
      { error: "send_failed", detail: insertError.message },
      { status: 500 }
    );
  }

  // Email the OTHER participant (if notify_email). Trigger wording depends
  // on whether the sender is the listing's seller.
  const otherId =
    thread.participant_a_id === user.id ? thread.participant_b_id : thread.participant_a_id;

  const [{ data: recipient }, { data: senderProfile }, { data: listing }] = await Promise.all([
    otherId
      ? supabase.from("profiles").select("email, notify_email").eq("id", otherId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    thread.listing_id
      ? supabase
          .from("listings")
          .select("id, brand, model, seller_id")
          .eq("id", thread.listing_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (recipient?.notify_email === true && recipient.email && listing) {
    const senderName = senderProfile?.display_name || "A FairWatchTrade member";
    const listingTitle = listing.model ? `${listing.brand} ${listing.model}` : listing.brand;
    const senderIsSeller = listing.seller_id === user.id;
    const subject = senderIsSeller
      ? `${senderName} replied about ${listingTitle}`
      : `New message about your ${listingTitle}`;
    await sendCorrespondenceEmail({
      to: recipient.email,
      subject,
      senderName: escapeHtml(senderName),
      preview: escapeHtml(body.slice(0, 200)),
      listingId: listing.id,
      listingTitle: escapeHtml(listingTitle),
    });
  }

  return NextResponse.json(
    { messageId: message.id, createdAt: message.created_at },
    { status: 201 }
  );
}
