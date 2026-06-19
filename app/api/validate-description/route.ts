import { NextResponse } from "next/server";

/* ════════════════════════════════════════════════════════════════════════
   DESCRIPTION VALIDATION (Step 4)

   Uses the existing ANTHROPIC_API_KEY to judge whether a seller-written
   description is genuine first-hand writing vs. (1) copy-pasted manufacturer/
   retailer text, (2) padded filler to hit the word count, or (3) generic
   boilerplate. Returns { passed, reason } where `reason` is specific and
   courteous so the seller knows exactly what to fix.

   Dispute-ready: pass `disputeExplanation` to have the model re-review the
   original description in light of the seller's explanation. The future
   dispute handler (account-level) will call this same route, then email the
   outcome to William via Resend.

   Fail-open: if the model call itself errors, we return passed:true so an
   infra hiccup never blocks an honest seller. Comment flags this tradeoff.
   ════════════════════════════════════════════════════════════════════════ */

const MODEL = "claude-sonnet-4-6"; // match /api/evaluate; Haiku also fine to cut cost

export async function POST(req: Request) {
  let description = "";
  let watchContext = "";
  let disputeExplanation = "";
  try {
    const body = await req.json();
    description = typeof body.description === "string" ? body.description : "";
    watchContext = typeof body.watchContext === "string" ? body.watchContext : "";
    disputeExplanation =
      typeof body.disputeExplanation === "string" ? body.disputeExplanation : "";
  } catch {
    return NextResponse.json(
      { passed: false, reason: "Could not read the request." },
      { status: 400 }
    );
  }

  if (!description.trim()) {
    return NextResponse.json(
      { passed: false, reason: "No description was provided." },
      { status: 400 }
    );
  }

  const system = `You review seller-written watch descriptions for a curated marketplace that prizes authenticity. A GOOD description has specific, first-hand detail only the owner would know: how the watch wears, why they bought or are selling it, quirks, ownership history, service notes, honest condition observations. FLAG a description only when there is a clear problem:
1. Copy-pasted marketing or spec text from a manufacturer or retailer.
2. Padding — filler sentences, repeated words, or extra spaces clearly added to reach a word count.
3. Generic boilerplate that could describe any watch and contains no first-hand detail.
Be fair: a plainly written but honest, specific description PASSES even if it is simple. Do not flag for grammar, brevity of style, or tone.${
    disputeExplanation
      ? "\n\nThe seller has DISPUTED a previous flag. Re-review the original description in light of their explanation below, and pass it if the explanation reasonably accounts for the concern."
      : ""
  }

Respond with ONLY a JSON object — no prose, no markdown fences:
{"passed": boolean, "reason": string}
If passed is true, reason may be a short affirmation. If false, reason must name the specific problem and what to change.`;

  const userContent = [
    watchContext ? `Watch: ${watchContext}` : "",
    `Description:\n${description}`,
    disputeExplanation ? `Seller's dispute explanation:\n${disputeExplanation}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

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
      // Fail-open — never block a seller on our infra problem.
      return NextResponse.json({ passed: true, reason: "" });
    }

    const data = await res.json();
    const text: string = (data.content ?? [])
      .map((b: { type: string; text?: string }) => (b.type === "text" ? b.text ?? "" : ""))
      .join("")
      .trim();

    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean) as { passed?: boolean; reason?: string };

    return NextResponse.json({
      passed: parsed.passed === true,
      reason: typeof parsed.reason === "string" ? parsed.reason : "",
    });
  } catch {
    // Parse or network failure — fail open.
    return NextResponse.json({ passed: true, reason: "" });
  }
}
