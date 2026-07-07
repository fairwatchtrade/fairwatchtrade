import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeSourceUrl } from "@/lib/auctions";

/* ════════════════════════════════════════════════════════════════════════
   ADMIN · SAVE AUCTION EVENT — app/api/admin/auctions/save/route.ts

   Step two of paste-to-parse: the admin reviewed/corrected the draft and
   explicitly saves. Nothing reaches auction_events any other way.

   ── THE DEDUPE LAW (deterministic, documented, not improvised) ──────────
   Identity of an auction event, checked in this order:
   1. PRIMARY — normalized source_url match. Normalization (applied to
      both the incoming and stored values via source_url_normalized):
        · lowercase scheme + host
        · strip fragment (#…)
        · strip known tracking params (utm_*, fbclid, gclid, mc_cid, mc_eid)
        · strip trailing slash on the path
   2. FALLBACK — composite identity when source_url is absent or unmatched:
        auction_house + auction_title (case-insensitive exact)
        + starts_at on the SAME calendar day (UTC) + location
        (case-insensitive; null locations only match null)
   (normalizeSourceUrl lives in @/lib/auctions — ONE implementation,
   shared with /api/auctions merge-time identity.)
   A match returns 409 with the existing row — the client shows a diff and
   the admin explicitly confirms the update (confirm_update_id). No silent
   overwrite, no silent duplicate. Ever.

   No status column exists to write — status is computed at read time in
   /api/auctions from the dates. A stored status is a lie waiting for its
   birthday.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

const ADMIN_EMAIL = "jmynatt74@gmail.com"; // same gate as /admin/vault-review

type SaveBody = {
  auction_house?: string;
  auction_title?: string;
  location?: string | null;
  starts_at?: string;
  ends_at?: string | null;
  preview_url?: string | null;
  catalog_url?: string | null;
  source_url?: string | null;
  online_only?: boolean | null;
  confirm_update_id?: string; // present only on the explicit update path
};

const s = (v: unknown, max = 300) =>
  typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, max) : null;
const iso = (v: unknown) => {
  if (typeof v !== "string" || v.trim() === "") return null;
  const t = Date.parse(v);
  return isNaN(t) ? null : new Date(t).toISOString();
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 }); // no hint
  }

  let body: SaveBody;
  try {
    body = (await req.json()) as SaveBody;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const auction_house = s(body.auction_house, 120);
  const auction_title = s(body.auction_title, 200);
  const starts_at = iso(body.starts_at);
  if (!auction_house || !auction_title || !starts_at) {
    return NextResponse.json(
      {
        error: "missing_fields",
        detail: "House, title, and a valid start date are required.",
      },
      { status: 400 }
    );
  }
  const ends_at = iso(body.ends_at);
  if (ends_at && Date.parse(ends_at) <= Date.parse(starts_at)) {
    return NextResponse.json(
      { error: "bad_dates", detail: "End must be after start." },
      { status: 400 }
    );
  }

  const location = s(body.location, 120);
  const source_url = s(body.source_url, 500);
  const source_url_normalized = source_url ? normalizeSourceUrl(source_url) : null;

  const row = {
    auction_house,
    auction_title,
    location,
    starts_at,
    ends_at,
    preview_url: s(body.preview_url, 500),
    catalog_url: s(body.catalog_url, 500),
    source_url,
    source_url_normalized,
    online_only: body.online_only === true ? true : null,
    source_updated_at: new Date().toISOString(),
    last_checked_at: new Date().toISOString(),
  };

  /* ── explicit update path — the admin saw the diff and confirmed ── */
  if (typeof body.confirm_update_id === "string" && body.confirm_update_id) {
    const { data: updated, error } = await supabase
      .from("auction_events")
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq("id", body.confirm_update_id)
      .select("id")
      .maybeSingle();
    if (error || !updated) {
      return NextResponse.json(
        { error: "update_failed", detail: error?.message ?? "Row not found." },
        { status: 500 }
      );
    }
    return NextResponse.json({ id: updated.id, updated: true });
  }

  /* ── dedupe check, in the documented order ── */
  let existing: Record<string, unknown> | null = null;

  if (source_url_normalized) {
    const { data } = await supabase
      .from("auction_events")
      .select("*")
      .eq("source_url_normalized", source_url_normalized)
      .maybeSingle();
    if (data) existing = data;
  }
  if (!existing) {
    // composite fallback — same house+title (ci), same UTC day, same location
    const day = starts_at.slice(0, 10);
    const { data } = await supabase
      .from("auction_events")
      .select("*")
      .ilike("auction_house", auction_house)
      .ilike("auction_title", auction_title)
      .gte("starts_at", `${day}T00:00:00Z`)
      .lte("starts_at", `${day}T23:59:59Z`);
    const match = (data ?? []).find((r: { location: string | null }) =>
      (r.location ?? "").toLowerCase() === (location ?? "").toLowerCase()
    );
    if (match) existing = match;
  }

  if (existing) {
    // The diff path: nothing written; the client shows existing vs draft
    // and only an explicit confirm_update_id resubmission changes the row.
    return NextResponse.json(
      { conflict: true, existing, draft: row },
      { status: 409 }
    );
  }

  const { data: inserted, error } = await supabase
    .from("auction_events")
    .insert(row)
    .select("id")
    .single();
  if (error) {
    return NextResponse.json(
      { error: "insert_failed", detail: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ id: inserted.id, created: true }, { status: 201 });
}
