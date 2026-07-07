import { NextResponse } from "next/server";

/* ════════════════════════════════════════════════════════════════════════
   REFERENCE PLAUSIBILITY CHECK (SellFlow · Step 1)

   Sibling to /api/validate-description — same pattern, same law: the
   client submits evidence, the server decides trust, and an infra failure
   NEVER blocks or alarms an honest seller.

   This is a LOOSE, advisory-only consistency check. The question is
   "does this reference appear plausibly consistent with this manufacturer
   (and model, if present)?" — NOT "is this a valid reference?" A reference
   can be syntactically perfect for some brand and still warrant a nudge if
   the seller selected an unrelated brand. Brand is required context; model
   is optional supporting context, and a model mismatch alone must never
   outweigh brand consistency.

   Verdict ceiling, by design: looks_consistent | uncertain |
   possible_mismatch. Never "valid", "invalid", "verified", or "fake" —
   those claim certainty this call cannot honestly support.

   Fail-open: any model/API/parse failure returns looks_consistent with
   confidence 0 — the client renders silence for that verdict, so our
   infra problems produce neither a false alarm nor false confidence
   (confidence 0 marks it unchecked). Comment flags this tradeoff, same
   as the description validator.

   PFC274 = 62 — the evaluate route is untouched; nothing here calls it.
   ════════════════════════════════════════════════════════════════════════ */

const MODEL = "claude-sonnet-4-6"; // match /api/validate-description

type Verdict = "looks_consistent" | "uncertain" | "possible_mismatch";
const VERDICTS: Verdict[] = ["looks_consistent", "uncertain", "possible_mismatch"];

const FAIL_OPEN = {
  verdict: "looks_consistent" as Verdict,
  confidence: 0,
  reason: "",
  normalized_reference: "",
};

export async function POST(req: Request) {
  let brand = "";
  let model = "";
  let reference = "";
  try {
    const body = await req.json();
    brand = typeof body.brand === "string" ? body.brand.trim().slice(0, 120) : "";
    model = typeof body.model === "string" ? body.model.trim().slice(0, 120) : "";
    reference =
      typeof body.reference === "string" ? body.reference.trim().slice(0, 120) : "";
  } catch {
    return NextResponse.json(
      { error: "bad_request", detail: "Could not read the request." },
      { status: 400 }
    );
  }

  if (!brand || !reference) {
    return NextResponse.json(
      { error: "missing_fields", detail: "Brand and reference are required." },
      { status: 400 }
    );
  }

  const system = `You assess watch reference numbers for a curated marketplace. The question is narrow: does the given reference appear PLAUSIBLY CONSISTENT with the given manufacturer${
    model ? " and model" : ""
  } context? You are NOT verifying that the reference exists or is "valid" — only whether its format and character are consistent with how that manufacturer typically structures references.

Rules:
- Brand consistency is the core question. Model naming is messy and collector-facing names don't always match manufacturer reference trees — a model-level mismatch alone must never produce a stronger verdict than brand-level assessment supports.
- Be generous. Manufacturers change formats across eras; vintage, boutique, and limited references are often irregular. When unsure, say "uncertain" rather than "possible_mismatch".
- "possible_mismatch" is reserved for references whose structure clearly suggests a DIFFERENT manufacturer's system, or that plainly don't resemble anything the given manufacturer uses.
- Never invent a corrected reference. normalized_reference may only tidy whitespace/case of what was given — if no tidying applies, return the input unchanged.

Respond with ONLY a JSON object — no prose, no markdown fences:
{"verdict": "looks_consistent" | "uncertain" | "possible_mismatch", "confidence": number between 0 and 1, "reason": string, "normalized_reference": string}
Keep reason to one courteous sentence.`;

  const userContent = [
    `Manufacturer: ${brand}`,
    model ? `Model context: ${model}` : "",
    `Reference: ${reference}`,
  ]
    .filter(Boolean)
    .join("\n");

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
        max_tokens: 300,
        system,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!res.ok) {
      // Fail-open — never block or alarm a seller on our infra problem.
      return NextResponse.json({ ...FAIL_OPEN, normalized_reference: reference });
    }

    const data = await res.json();
    const text: string = (data.content ?? [])
      .map((b: { type: string; text?: string }) => (b.type === "text" ? b.text ?? "" : ""))
      .join("")
      .trim();

    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean) as {
      verdict?: unknown;
      confidence?: unknown;
      reason?: unknown;
      normalized_reference?: unknown;
    };

    const verdict: Verdict = VERDICTS.includes(parsed.verdict as Verdict)
      ? (parsed.verdict as Verdict)
      : "looks_consistent"; // off-script model output fails open, silently
    const confidence =
      typeof parsed.confidence === "number" && isFinite(parsed.confidence)
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0;
    const reason =
      typeof parsed.reason === "string" ? parsed.reason.slice(0, 300) : "";
    const normalized =
      typeof parsed.normalized_reference === "string" &&
      parsed.normalized_reference.trim() !== ""
        ? parsed.normalized_reference.trim().slice(0, 120)
        : reference;

    return NextResponse.json({
      verdict,
      confidence,
      reason,
      normalized_reference: normalized,
    });
  } catch {
    // Parse or network failure — fail open, silently.
    return NextResponse.json({ ...FAIL_OPEN, normalized_reference: reference });
  }
}
