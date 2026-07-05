import { NextResponse } from "next/server";

/* ════════════════════════════════════════════════════════════════════════
   WIZARD PHOTO REVIEW — app/api/wizard-photo-review/route.ts   (v2.2 · Phase 5)

   Lightweight per-photo quality verdict for the mobile wizard:
     passed    → advance
     soft_fail → advance, badge forfeited, admin review
     hard_fail → block, plain-language message, retake

   Pattern-faithful to /api/validate-description: same model, same headers,
   same fence-stripping, same fail-open law — an infra failure NEVER blocks
   an honest seller. All three fail-open branches return safe defaults.

   v2.2 sends the photo URL as TEXT (locked ruling — vision wiring is Phase
   5b). Until 5b, the model cannot see pixels, so verdicts here are advisory
   context checks; the code is structured so 5b is a one-block swap to an
   image content part. Flagged in delivery notes — not a surprise.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

const MODEL = "claude-sonnet-4-6"; // match /api/validate-description

const SYSTEM_PROMPT = `You are a photo quality reviewer for a curated watch marketplace.
Your job is to determine whether a seller's photo is usable for the
declared category. Be fair and generous — a slightly imperfect photo
that shows the watch clearly PASSES. Only flag genuine problems.

Hard fail (block, retake required):
- No watch visible — empty frame, hand only, background only, blur so
  severe the watch is unrecognizable
- Completely wrong subject — not a watch at all
- Exact same photo submitted twice for different categories (duplicate)

Soft fail (allow submission, withhold badge, route to admin):
- Watch is present but significantly obscured, cut off, or at an angle
  that makes the category unverifiable
- Severe glare or reflection covering more than half the watch face

Pass: watch is clearly present and the category is reasonably verifiable.
When in doubt, pass. A borderline photo is always better reviewed by a
human than blocked by AI.

Respond with ONLY a JSON object, no prose, no markdown fences:
{"result": "passed" | "soft_fail" | "hard_fail", "reason": string}
If passed, reason may be empty. If failed, reason must be plain English
the seller can understand — never technical jargon.`;

type Verdict = "passed" | "soft_fail" | "hard_fail";
const VERDICTS: Verdict[] = ["passed", "soft_fail", "hard_fail"];

export async function POST(req: Request) {
  let photoUrl = "";
  let category = "";

  try {
    const body = await req.json();
    photoUrl = typeof body.photoUrl === "string" ? body.photoUrl.trim() : "";
    category = typeof body.category === "string" ? body.category.slice(0, 64) : "";
  } catch {
    // Unreadable body → nothing to review; soft_fail keeps the badge honest
    // without blocking the seller.
    return NextResponse.json({
      result: "soft_fail",
      reason: "Photo could not be reviewed.",
    });
  }

  if (!photoUrl) {
    return NextResponse.json({
      result: "soft_fail",
      reason: "Photo could not be reviewed.",
    });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            // v2.2: URL as text per the locked ruling. Phase 5b swaps this
            // single content string for an image block — nothing else changes.
            content: `Category: ${category}\nPhoto URL: ${photoUrl}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    const rawText = (data.content ?? [])
      .map((block: { type: string; text?: string }) =>
        block.type === "text" ? block.text ?? "" : ""
      )
      .join("");

    // Strip any markdown fences if present (pattern from validate-description).
    const clean = rawText.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean) as { result?: unknown; reason?: unknown };

    const result: Verdict = VERDICTS.includes(parsed.result as Verdict)
      ? (parsed.result as Verdict)
      : "passed"; // unrecognized verdict → fail open
    const reason =
      typeof parsed.reason === "string" ? parsed.reason.slice(0, 400) : "";

    return NextResponse.json({ result, reason: result === "passed" ? "" : reason });
  } catch {
    // Fail-open is law: model down, parse broken, network gone — the seller
    // is never blocked by our infrastructure.
    return NextResponse.json({ result: "passed", reason: "" });
  }
}
