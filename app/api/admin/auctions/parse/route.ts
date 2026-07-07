import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* ════════════════════════════════════════════════════════════════════════
   ADMIN · PARSE AUCTION TEXT — app/api/admin/auctions/parse/route.ts

   Step one of paste-to-parse: the admin pastes auction listing TEXT (v1 is
   text-only by explicit ruling — no URL fetching, no scraping; a pasted
   source_url is stored as provenance only and is never fetched).

   The model extracts a structured DRAFT. The draft is never saved here —
   it populates an editable review form, and only the admin's explicit
   save (separate endpoint) writes anything. Human in the loop for every
   row, always.

   Extraction law (same family as validate-description/-reference):
   BLANK OVER GUESS. A field the text doesn't explicitly state comes back
   null. No penalty for missing data; only for bad data. Fail-open: if the
   model or parse fails, the admin gets an empty draft and types it in —
   an infra failure never blocks the workflow, and never invents facts.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

const MODEL = "claude-sonnet-4-6"; // match validate-description / -reference
const ADMIN_EMAIL = "jmynatt74@gmail.com"; // same gate as /admin/vault-review

type Draft = {
  auction_house: string | null;
  auction_title: string | null;
  location: string | null;
  starts_at: string | null; // ISO 8601 or null
  ends_at: string | null;
  preview_url: string | null;
  catalog_url: string | null;
  online_only: boolean | null; // null = not stated — never assumed
};

const EMPTY_DRAFT: Draft = {
  auction_house: null,
  auction_title: null,
  location: null,
  starts_at: null,
  ends_at: null,
  preview_url: null,
  catalog_url: null,
  online_only: null,
};

const SYSTEM_PROMPT = `You extract structured auction-event data from pasted auction listing text for a watch marketplace's internal admin tool.

THE LAW: BLANK OVER GUESS. Return null for any field the text does not explicitly state. A missing field is fine — a human reviews and fills every draft. A confidently wrong field is not fine. Never infer, never assume, never complete from general knowledge of auction houses or seasons.

Fields:
- auction_house: the house name exactly as written (e.g. "Phillips", "Christie's")
- auction_title: the sale's name/title as written
- location: city (and country if written)
- starts_at: ISO 8601 with timezone if determinable from the text; date-only information becomes an ISO timestamp at 00:00:00Z of that date. null if no date is stated.
- ends_at: same rules; null if the text states no end
- preview_url / catalog_url: only if URLs literally appear in the text
- online_only: true ONLY if the text explicitly describes an online/internet-only sale; otherwise null (never false — absence of the word is not evidence of a live sale)

Respond with ONLY a JSON object, no prose, no markdown fences:
{"auction_house": string|null, "auction_title": string|null, "location": string|null, "starts_at": string|null, "ends_at": string|null, "preview_url": string|null, "catalog_url": string|null, "online_only": true|null}`;

function cleanIso(v: unknown): string | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const t = Date.parse(v);
  return isNaN(t) ? null : new Date(t).toISOString();
}
function cleanStr(v: unknown, max = 300): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, max) : null;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 }); // no hint
  }

  let text = "";
  try {
    const body = await req.json();
    text = typeof body.text === "string" ? body.text.trim().slice(0, 20000) : "";
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json(
      { error: "missing_text", detail: "Paste the auction listing text." },
      { status: 400 }
    );
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: text }],
      }),
    });
    if (!res.ok) throw new Error(String(res.status));

    const data = await res.json();
    const raw: string = (data.content ?? [])
      .map((b: { type: string; text?: string }) => (b.type === "text" ? b.text ?? "" : ""))
      .join("")
      .replace(/```json|```/g, "")
      .trim();
    const p = JSON.parse(raw) as Record<string, unknown>;

    const draft: Draft = {
      auction_house: cleanStr(p.auction_house, 120),
      auction_title: cleanStr(p.auction_title, 200),
      location: cleanStr(p.location, 120),
      starts_at: cleanIso(p.starts_at),
      ends_at: cleanIso(p.ends_at),
      preview_url: cleanStr(p.preview_url, 500),
      catalog_url: cleanStr(p.catalog_url, 500),
      online_only: p.online_only === true ? true : null, // never false from text
    };
    return NextResponse.json({ parsed: true, draft });
  } catch {
    // Fail-open, admin-tool flavor: an empty draft the admin fills by hand.
    // Infra failure never blocks the workflow and never fabricates a field.
    return NextResponse.json({ parsed: false, draft: EMPTY_DRAFT });
  }
}
