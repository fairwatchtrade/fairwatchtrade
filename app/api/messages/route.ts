import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  SITE_URL,
  escapeHtml,
  getRecipientEmailPrefs,
  sendCorrespondenceEmail,
} from "@/lib/correspondenceEmail";

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

/* Email machinery lives in lib/correspondenceEmail.ts since v5.93 — one
   home instead of two drifting copies, a working recipient lookup, and
   role-aware link targets. */

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

  // Counterpart names come from public_seller_profiles, the sanctioned
  // public-name path. Reading `profiles` directly here silently degraded to
  // "FairWatchTrade Member" for every counterpart once profiles tightened to
  // select-own — the view is what display names are shared through.
  const [{ data: listings }, { data: profiles }, { data: allMessages }] = await Promise.all([
    listingIds.length > 0
      ? supabase.from("listings").select("id, brand, model, reference, photos").in("id", listingIds)
      : Promise.resolve({ data: [] as ListingLite[] }),
    otherIds.length > 0
      ? supabase.from("public_seller_profiles").select("id, display_name").in("id", otherIds)
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
      /* v5.93 — the Communications room pairs a purchase request with its
         correspondence thread by (listing, counterpart). otherId is data the
         participant can already see on the thread row itself; it is never
         rendered in UI. */
      otherId: otherId ?? null,
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

  let payload: { listingId?: string; purchaseRequestId?: string; body?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const listingId = typeof payload.listingId === "string" ? payload.listingId.trim() : "";
  const purchaseRequestId =
    typeof payload.purchaseRequestId === "string" ? payload.purchaseRequestId.trim() : "";
  const body = typeof payload.body === "string" ? payload.body.trim() : "";

  if ((!listingId && !purchaseRequestId) || !body) {
    return NextResponse.json(
      { error: "missing_fields", detail: "listingId or purchaseRequestId, and body, are required." },
      { status: 400 }
    );
  }
  if (body.length > MAX_BODY_CHARS) {
    return NextResponse.json(
      { error: "too_long", detail: `Messages are limited to ${MAX_BODY_CHARS} characters.` },
      { status: 400 }
    );
  }

  /* ── v5.93 · SELLER REPLY TO A PURCHASE REQUEST ─────────────────────────
     The Communications room lets a seller answer a purchase request in
     words (not only Accept/Decline). The buyer-initiated path below can't
     carry this: it hard-rejects sellers on their own listing, and it
     requires status='published' — but the moment a seller ACCEPTS an offer
     the listing turns reserved, which is exactly when they most need to
     write to the buyer. This path keys off the REQUEST instead: the caller
     must be that request's seller, and the thread is the same
     (listing, buyer→a, seller→b) home the buyer's own message would have
     created. One thread either way — never a parallel channel. */
  if (purchaseRequestId) {
    const { data: pr } = await supabase
      .from("purchase_requests")
      .select("id, listing_id, buyer_id, seller_id, listing_brand, listing_model")
      .eq("id", purchaseRequestId)
      .maybeSingle();

    // Not found and not-yours are the same answer — existence stays private.
    if (!pr || pr.seller_id !== user.id) {
      return NextResponse.json({ error: "request_not_found" }, { status: 404 });
    }
    if (!pr.listing_id || !pr.buyer_id) {
      // Stage 5 can null the listing FK on terminal requests; a thread needs
      // the listing home to exist. Honest refusal, not a guessed thread.
      return NextResponse.json(
        {
          error: "conversation_unavailable",
          detail: "This request's listing is no longer available for correspondence.",
        },
        { status: 409 }
      );
    }

    // Live listing enriches the title; the snapshot answers when it's gone.
    const { data: liveListing } = await supabase
      .from("listings")
      .select("id, brand, model")
      .eq("id", pr.listing_id)
      .maybeSingle();
    const listingTitle = liveListing
      ? liveListing.model
        ? `${liveListing.brand} ${liveListing.model}`
        : liveListing.brand
      : (pr.listing_brand
          ? `${pr.listing_brand}${pr.listing_model ? " " + pr.listing_model : ""}`
          : "your watch");

    // Find-or-create with the SAME participant convention as the buyer path:
    // participant_a = buyer, participant_b = seller. The unique constraint
    // backstops a race identically.
    let threadId: string | null = null;
    const { data: existing } = await supabase
      .from("message_threads")
      .select("id")
      .eq("listing_id", pr.listing_id)
      .eq("participant_a_id", pr.buyer_id)
      .eq("participant_b_id", pr.seller_id)
      .maybeSingle();

    if (existing) {
      threadId = existing.id;
    } else {
      const { data: created, error: createError } = await supabase
        .from("message_threads")
        .insert({
          listing_id: pr.listing_id,
          participant_a_id: pr.buyer_id,
          participant_b_id: pr.seller_id,
          subject: `${listingTitle} · Purchase Request`,
        })
        .select("id")
        .single();

      if (createError) {
        if ((createError as { code?: string }).code === "23505") {
          const { data: winner } = await supabase
            .from("message_threads")
            .select("id")
            .eq("listing_id", pr.listing_id)
            .eq("participant_a_id", pr.buyer_id)
            .eq("participant_b_id", pr.seller_id)
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

    // Same rate limit as every other send.
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

    // Email the BUYER (their home for this conversation is the listing).
    // Recipient prefs via the trusted lookup — see lib/correspondenceEmail.
    const [buyerPrefs, { data: senderProfile }] = await Promise.all([
      getRecipientEmailPrefs(pr.buyer_id),
      supabase
        .from("public_seller_profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

    if (buyerPrefs?.notify === true) {
      const senderName = senderProfile?.display_name || "The seller";
      await sendCorrespondenceEmail({
        to: buyerPrefs.email,
        subject: `${senderName} replied about ${listingTitle}`,
        senderName: escapeHtml(senderName),
        preview: escapeHtml(body.slice(0, 200)),
        linkUrl: `${SITE_URL}/listings/${pr.listing_id}`,
        listingTitle: escapeHtml(listingTitle),
      });
    }

    return NextResponse.json(
      { threadId, messageId: message.id, createdAt: message.created_at },
      { status: 201 }
    );
  }

  const { data: listing } = await supabase
    .from("listings")
    .select("id, brand, model, reference, seller_id, status, private_buyer_id")
    .eq("id", listingId)
    .maybeSingle();

  // Private Listing V1 (v5.98): the one authorized buyer may open
  // correspondence on their private listing exactly like a public buyer
  // would — same thread home, same machinery. Anyone else keeps 404.
  const privateForMe =
    !!listing &&
    listing.status === "private_active" &&
    (listing as { private_buyer_id?: string | null }).private_buyer_id === user.id;
  if (!listing || (listing.status !== "published" && !privateForMe)) {
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
  // v5.93: recipient prefs via the trusted lookup (the session read was
  // silently empty under select-own profiles), sender name via the public
  // view, and the link lands in the seller's Communications room on THIS
  // thread — never their own public listing.
  const [sellerPrefs, { data: senderProfile }] = await Promise.all([
    getRecipientEmailPrefs(listing.seller_id),
    supabase
      .from("public_seller_profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  if (sellerPrefs?.notify === true) {
    const senderName = senderProfile?.display_name || "A collector";
    await sendCorrespondenceEmail({
      to: sellerPrefs.email,
      subject: `New message about your ${listingTitle}`,
      senderName: escapeHtml(senderName),
      preview: escapeHtml(body.slice(0, 200)),
      linkUrl: `${SITE_URL}/account?module=messages&thread=${threadId}`,
      listingTitle: escapeHtml(listingTitle),
    });
  }

  return NextResponse.json(
    { threadId, messageId: message.id, createdAt: message.created_at },
    { status: 201 }
  );
}
