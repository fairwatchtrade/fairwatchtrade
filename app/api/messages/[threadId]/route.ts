import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  SITE_URL,
  escapeHtml,
  getRecipientEmailPrefs,
  sendCorrespondenceEmail,
} from "@/lib/correspondenceEmail";

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

/* Email machinery lives in lib/correspondenceEmail.ts since v5.93 — one
   home instead of two drifting copies, a working recipient lookup, and
   role-aware link targets. */

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

  const thread = await loadThreadForUser(supabase, threadId, user.id);
  if (!thread) {
    return NextResponse.json({ error: "thread_not_found" }, { status: 404 });
  }

  const otherId =
    thread.participant_a_id === user.id ? thread.participant_b_id : thread.participant_a_id;

  // Counterpart names via public_seller_profiles — see /api/messages GET.
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
      .from("public_seller_profiles")
      .select("id, display_name")
      .in("id", [user.id, otherId].filter(Boolean) as string[]),
  ]);

  /* Viewing the thread marks the other party's unread messages read —
     unless the caller asked only to PEEK (?peek=1). The Communications
     room auto-shows the first item of a folder the way the Design Gate
     does; auto-display is not the user opening the item, so it must not
     consume read state. An explicit click, and a notification landing,
     fetch without peek and mark read as ever. */
  const peek = request.nextUrl.searchParams.get("peek") === "1";
  if (!peek) {
    await supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("thread_id", thread.id)
      .neq("sender_id", user.id)
      .is("read_at", null);
  }

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

  // v5.93: recipient prefs via the trusted lookup (the session read was
  // silently empty under select-own profiles); sender name via the public
  // view; and the link is ROLE-AWARE — a seller recipient lands in their
  // Communications room on this exact thread, a buyer recipient lands on
  // the listing, each conversation's actual home.
  const [recipientPrefs, { data: senderProfile }, { data: listing }] = await Promise.all([
    otherId ? getRecipientEmailPrefs(otherId) : Promise.resolve(null),
    supabase
      .from("public_seller_profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle(),
    thread.listing_id
      ? supabase
          .from("listings")
          .select("id, brand, model, seller_id")
          .eq("id", thread.listing_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (recipientPrefs?.notify === true && listing) {
    const senderName = senderProfile?.display_name || "A FairWatchTrade member";
    const listingTitle = listing.model ? `${listing.brand} ${listing.model}` : listing.brand;
    const senderIsSeller = listing.seller_id === user.id;
    const subject = senderIsSeller
      ? `${senderName} replied about ${listingTitle}`
      : `New message about your ${listingTitle}`;
    const linkUrl = senderIsSeller
      ? `${SITE_URL}/listings/${listing.id}` // recipient is the buyer
      : `${SITE_URL}/account?module=messages&thread=${thread.id}`; // recipient is the seller
    await sendCorrespondenceEmail({
      to: recipientPrefs.email,
      subject,
      senderName: escapeHtml(senderName),
      preview: escapeHtml(body.slice(0, 200)),
      linkUrl,
      listingTitle: escapeHtml(listingTitle),
    });
  }

  return NextResponse.json(
    { messageId: message.id, createdAt: message.created_at },
    { status: 201 }
  );
}
/* ── PATCH — thread state: mark unread, archive, unarchive ──────────────
   v5.93, for the Communications room. Three writes about MY relationship
   to the thread; none of them touch message content or transactional
   state.

   · mark_unread — returns the thread to the unread pile by clearing
     read_at on the LATEST inbound message only. Minimal and truthful:
     the seller wants the bold row back, not a fabricated count of N
     unread messages they have in fact read.
   · archive / unarchive — sets MY side's archived flag (archived_by_a
     or _b per my role), the same RLS-scoped write the workspace has
     always used. Never the other participant's flag.

   Reading is not resolving. Reading is not archiving. This endpoint is
   how the reverse directions stay explicit actions. */

export async function PATCH(
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

  let payload: { action?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const action = payload.action;
  if (action !== "mark_unread" && action !== "archive" && action !== "unarchive") {
    return NextResponse.json(
      { error: "invalid_action", detail: "action must be mark_unread, archive, or unarchive." },
      { status: 400 }
    );
  }

  const thread = await loadThreadForUser(supabase, threadId, user.id);
  if (!thread) {
    return NextResponse.json({ error: "thread_not_found" }, { status: 404 });
  }

  if (action === "mark_unread") {
    const { data: latestInbound } = await supabase
      .from("messages")
      .select("id")
      .eq("thread_id", thread.id)
      .neq("sender_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestInbound) {
      // Nothing inbound to un-read — a thread of only my own messages
      // cannot be unread. Honest no-op, not an error.
      return NextResponse.json({ ok: true, changed: false });
    }

    const { error } = await supabase
      .from("messages")
      .update({ read_at: null })
      .eq("id", latestInbound.id);

    if (error) {
      return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, changed: true });
  }

  // archive / unarchive — my flag only.
  const myFlag = thread.participant_a_id === user.id ? "archived_by_a" : "archived_by_b";
  const { error } = await supabase
    .from("message_threads")
    .update({ [myFlag]: action === "archive" })
    .eq("id", thread.id);

  if (error) {
    return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, changed: true });
}
