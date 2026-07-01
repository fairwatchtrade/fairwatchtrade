import { NextResponse } from "next/server";

/* ════════════════════════════════════════════════════════════════════════
   PROVENANCE FINAL REVIEW  (Step 3 — Details → Continue)

   A SOFT AI pass over the seller's provenance note. It looks only for
   near-certain spelling / grammar / punctuation / typo mistakes — never
   rewrites, style edits, or marketing "improvements" — and preserves the
   seller's voice, watch terminology, brand names, reference numbers, accents,
   calibres, and model names.

   Returns exactly one of two shapes:
     { hasSuggestions: false }
     { hasSuggestions: true, corrected: "<full note>", issues: ["<what changed>"] }
   `corrected` is ALWAYS the full corrected note — never a partial correction.

   Fail-open: any model/parse error returns { hasSuggestions: false } so an
   infra hiccup never traps a seller on the Details step. The client fails open
   too (network throw / non-ok → proceed), so the seller is protected twice.

   This is a NEW job on a NEW route. It does not touch /api/evaluate (canary
   PFC274 = 62) or /api/validate-description (load-bearing, strike system).
   ════════════════════════════════════════════════════════════════════════ */

const MODEL = "claude-sonnet-4-6"; // match /api/validate-description

export async function POST(req: Request) {
  let provenanceNote = "";
  try {
    const body = await req.json();
    provenanceNote =
      typeof body.provenanceNote === "string" ? body.provenanceNote : "";
  } catch {
    // Unreadable body — nothing to review; let the seller proceed.
    return NextResponse.json({ hasSuggestions: false });
  }

  // Empty note — nothing to review. (The client already skips the call in this
  // case; this is the defensive server-side mirror.)
  if (!provenanceNote.trim()) {
    return NextResponse.json({ hasSuggestions: false });
  }

  const system = `Review this provenance note for obvious spelling, grammar, punctuation, and
readability issues while preserving watch terminology, brand names, reference
numbers, and the seller's writing style. Return only high-confidence suggestions.
Preserve the seller's voice. Preserve watch terminology, brand names, reference
numbers, accents, calibres, and model names. Only suggest obvious spelling,
grammar, punctuation, or typo corrections. Not rewrites. Not style edits. Not
marketing improvements. Just near-certain mistakes.

Respond with ONLY a JSON object — no prose, no markdown fences.
If you find one or more near-certain mistakes, respond exactly:
{"hasSuggestions": true, "corrected": "The full corrected note as a single string.", "issues": ["Plain-language description of what changed."]}
If you find no issues, respond exactly:
{"hasSuggestions": false}
Always return the full corrected note or nothing — never a partial correction. Omit "corrected" and "issues" when hasSuggestions is false.`;

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
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content: provenanceNote }],
      }),
    });

    if (!res.ok) {
      // Fail-open — never block a seller on our infra problem.
      return NextResponse.json({ hasSuggestions: false });
    }

    const data = await res.json();
    const text: string = (data.content ?? [])
      .map((b: { type: string; text?: string }) => (b.type === "text" ? b.text ?? "" : ""))
      .join("")
      .trim();

    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean) as {
      hasSuggestions?: boolean;
      corrected?: string;
      issues?: unknown;
    };

    const issues = Array.isArray(parsed.issues)
      ? parsed.issues.filter((x): x is string => typeof x === "string")
      : [];

    // Only surface a review when it is genuinely actionable: flagged, a full
    // corrected string present, at least one plain-language issue, AND the
    // correction actually differs from what the seller wrote. Otherwise the
    // seller proceeds silently — no empty "One last look".
    if (
      parsed.hasSuggestions === true &&
      typeof parsed.corrected === "string" &&
      parsed.corrected.trim().length > 0 &&
      parsed.corrected.trim() !== provenanceNote.trim() &&
      issues.length > 0
    ) {
      return NextResponse.json({
        hasSuggestions: true,
        corrected: parsed.corrected,
        issues,
      });
    }

    return NextResponse.json({ hasSuggestions: false });
  } catch {
    // Parse or network failure — fail open.
    return NextResponse.json({ hasSuggestions: false });
  }
}
